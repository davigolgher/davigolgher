# Eventos, funil e retenção

O app registra **como é usado** para responder uma pergunta: as mudanças
fazem as pessoas chegarem mais rápido ao valor e voltarem? Nada disso existia
antes. **Nenhum resultado foi medido ainda.** A coleta começa quando a
migration 0018 for aplicada e o app publicado.

## Como funciona

- **Primário e mínimo:**
  - sem SDK de terceiros e sem identificador de publicidade;
  - os eventos ficam numa fila no celular (`mobile/src/lib/analytics.ts`) e vão para o banco do próprio Flow, só para uma conta logada.
- **O servidor confere tudo de novo** (`product_events_record`, migration 0018):
  - só nomes conhecidos;
  - só as propriedades da lista, com texto de até 40 caracteres;
  - no máximo 100 por chamada e 2.000 por conta por dia;
  - datas só dos últimos 30 dias.
- **Ninguém lê os eventos pela API**, nem o próprio usuário. Só a service role, pelas funções de leitura abaixo.
- **Retenção:** 13 meses (`product_events_purge`, chamado pela manutenção diária). Excluir a conta apaga os eventos.
- **Desligável:** em Ajustes → Legal & privacy → "Share usage statistics". Ao desligar, a fila no celular é apagada.
- **Nunca entram:** valores, estabelecimentos, nomes, notas ou qualquer coisa digitada.

## Taxonomia

| Evento | Quando | Propriedades |
| --- | --- | --- |
| `app_opened` | abertura, ou volta depois de 30 min em segundo plano | `days_away` ou `stage: first` |
| `welcome_viewed` | tela de boas-vindas | — |
| `sample_started` / `sample_exited` | entrar e sair dos dados de exemplo | `screen` (para onde foi) |
| `signup_started` / `signup_completed` / `signin_completed` | cadastro e login | — |
| `onboarding_started` | primeira tela do onboarding | — |
| `onboarding_step_viewed` / `onboarding_step_completed` | cada passo (`goals`, `budget`) | `step`, `goals` |
| `onboarding_skipped` / `onboarding_completed` | saída do onboarding | `step` (onde parou), `goals` |
| `paywall_viewed` / `paywall_converted` | paywall exibido / assinatura ou passagem | — |
| `family_only_chosen` | "Here for Flow Family?" | — |
| `home_viewed` | Home aberta | `screen` (`sample` ou `account`) |
| `first_expense_added` | primeiro gasto da conta, digitado ou importado (uma vez) | `source` (`manual`/`bank`) |
| `expense_added` | gasto digitado | `kind` (`expense`/`income`), `count` |
| `subscription_added` | assinatura digitada | `kind` (frequência), `source` |
| `budget_set` | orçamento definido | `source` (`onboarding`/`home`) |
| **`aha_reached`** | **primeira vez que a Home mostra 3+ gastos próprios dos últimos 30 dias (uma vez)** | `via` (`manual`/`bank`/`mixed`), `count` |
| `insight_viewed` | um insight aparece | `kind` (`pace`, `top_category`, `upcoming`, `biggest`) |
| `next_step_viewed` / `next_step_tapped` | cartão de próximo passo | `kind`, `via` (`main`/`alt`) |
| `returned_after_absence` | Home aberta 3+ dias depois da última | `days_away` |
| `bank_intro_viewed` | tela de bancos sem nenhum banco | — |
| `bank_connect_started` / `bank_connect_succeeded` / `bank_connect_failed` | conexão | `country`, `accounts`, `stage` |
| `bank_import_completed` | primeira leitura de 90 dias importada | `banks`, `entries` |
| `bank_sync_succeeded` / `bank_sync_failed` | atualização manual / falha | `entries`, `manual`, `stage` |
| `bank_account_import_set` | interruptor de uma conta | `on` |
| `bank_reconnect_started` / `bank_disconnected` | reconectar / desconectar | `kind` (estado), `kept` |
| `subscription_suggestion_viewed` / `_accepted` / `_dismissed` | assinaturas encontradas | `count`, `kind` |
| `weekly_summary_set` | reservado para um resumo semanal (não implementado) | `on` |

## Definições

- **Aha moment:** `aha_reached`, a primeira vez que a pessoa vê o próprio mês. Na prática, a Home com pelo menos 3 gastos dela dos últimos 30 dias, digitados ou importados do banco. Esse é o ponto em que o Flow deixa de ser promessa.
- **Primeiro valor (TTFV):** o primeiro de `first_expense_added` ou `bank_import_completed`.
- **Ativação:** chegar ao Aha.
- **Retorno:** `app_opened` em dias posteriores ao cadastro.

## Leituras prontas (SQL, service role)

```sql
-- Funil de quem se cadastrou em novembro:
-- cadastro → onboarding → assinatura → primeiro valor → aha → voltou na 1ª semana
select * from public.analytics_activation_funnel('2026-11-01', '2026-12-01');

-- Retenção por coorte semanal: % que abriu o app no dia 1, 7, 30 e 90
-- (null quando o dia ainda não chegou)
select * from public.analytics_retention(12);

-- Tempo até o primeiro valor e até o aha (mediana e p90, em segundos)
select * from public.analytics_time_to_value('2026-11-01', '2026-12-01');

-- Abandono por passo do onboarding
select props->>'step' as passo, count(*) as saiu_aqui
  from public.product_events where name = 'onboarding_skipped'
 group by 1 order by 2 desc;

-- Conexão bancária: início → sucesso → importação, por país
select props->>'country' as pais,
       count(*) filter (where name = 'bank_connect_started') as iniciou,
       count(*) filter (where name = 'bank_connect_succeeded') as conectou
  from public.product_events
 where name in ('bank_connect_started', 'bank_connect_succeeded')
 group by 1;

-- Quem viu os dados de exemplo e depois se cadastrou
select count(distinct user_id) from public.product_events where name = 'sample_started';
```

Testadas em `supabase/tests/pg/product_events.test.ts`.

## Como medir cada mudança

| Mudança | Métrica | Como comparar |
| --- | --- | --- |
| Dados de exemplo antes do cadastro | cadastros entre quem viu a amostra × quem não viu; `sample_started` → `signup_completed` | coorte e, com volume, teste A/B |
| Onboarding de 1 pergunta | `onboarding_completed` ÷ `onboarding_started`; abandono por `step` | antes e depois (sem histórico, a primeira coorte é a linha de base) |
| Próximo passo na Home | `next_step_tapped` ÷ `next_step_viewed` por `kind` | por tipo de passo |
| Conexão bancária | conversão `bank_connect_started` → `bank_import_completed`; Aha por `via` | quem conecta × quem digita, sabendo que há viés de seleção |
| Assinaturas encontradas | aceitas ÷ vistas | por coorte |
| Retenção | D1/D7/D30/D90 por coorte (`analytics_retention`) | evolução ao longo do tempo |

Nenhum número aqui é resultado. São as perguntas que os dados vão responder.

## O que falta conectar

1. Aplicar a migration 0018 (depois da 0017).
2. Agendar a manutenção diária, se ainda não estiver (o SQL está no cabeçalho de `family-maintenance/index.ts`); ela também apaga eventos antigos.
3. Escolher onde ver os números: o SQL acima no painel do Supabase, ou uma ferramenta de BI conectada como somente leitura.
4. Atualizar as declarações das lojas (ver `relatorio.md`, seção 10).
