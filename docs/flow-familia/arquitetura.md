# Flow Família — arquitetura

Desenho da feature sobre o que o [diagnóstico](./diagnostico.md) encontrou.
Tudo aqui é aditivo: nenhuma tabela, tela ou regra existente muda, e com a
feature flag desligada o app é o mesmo de hoje.

## 1. Decisões de base

| Tema | Decisão | Por quê |
| --- | --- | --- |
| Feature flag | Variável de build `EXPO_PUBLIC_FLOW_FAMILY=1` | Uma build tem a feature inteira ou não tem nada. Ligar por servidor depois da revisão seria "funcionalidade oculta" para a Apple (2.5.19, 2.3.1) |
| Entrada na navegação | Cartão na Home (só para quem já está numa família), linha "Family" em Ajustes e link no paywall | A barra de abas já tem as cinco abas que o iPhone mostra |
| Plano grátis | Quem não assina entra numa área só da Família; o resto do Flow continua atrás do paywall | O Flow não tem plano grátis hoje, e o item 10 do escopo pede um |
| Transações do banco | Tabela própria `bank_transactions`, com o mesmo formato de `transactions` | Na tabela atual elas mudariam a Home do dependente, contariam em dobro com os lançamentos manuais e poderiam ser editadas por ele |
| Leitura pelo responsável | Só por funções do servidor que conferem o consentimento e gravam o acesso | Uma política de leitura direta deixaria o registro de acessos nas mãos do app |
| Categorias | Lista fixa da Família em `src/lib/family/categories.ts` | O Flow não tem lista padrão; as categorias de cada conta são texto livre |
| Regras de alerta | Avaliadas no banco, na mesma transação que grava o lançamento | Um só lugar, junto do dado e do consentimento, testável sem rede |
| Push | Texto genérico, sem valor nem estabelecimento | Apple 4.5.4: push não deve levar informação pessoal sensível |
| Idioma e moeda | Inglês, como o resto do app; valores na moeda da conta bancária | Requisito do escopo |
| Modo escuro | Não se aplica: o app inteiro é só claro | Registrado em `inconsistencias-design.md` em vez de criar um segundo padrão |
| Migrations | `supabase/prepared/0011…0015`, não aplicadas | Convenção do repositório para o que ainda não está em produção |
| Testes do banco | Postgres em memória (PGlite) dentro do Vitest | Produção está pausada e a regra é não testar nela |

## 2. Componentes

```
App (Expo)                         Supabase                           Terceiros
───────────                        ────────                           ─────────
mobile/src/app/family/*   ──RPC──▶ funções SQL (security definer)
  telas                            tabelas + RLS
mobile/src/features/family/        Realtime (family_sync_signals)
  FamilyProvider, bankLink, push
src/lib/backend/family.ts ─invoke▶ Edge Functions
src/lib/family/* (lógica pura)       bank-connect-token ───────────▶ Pluggy API
                                     bank-connection-sync ─────────▶ Pluggy API
                                     bank-connection-delete ───────▶ Pluggy API
Pluggy Connect (WebView) ◀─────────  pluggy-webhook ◀────────────── Pluggy (webhooks)
                                        └─ envia push ─────────────▶ Expo Push → APNs/FCM
                                     delete-account (estendida) ───▶ Pluggy API
```

- **Chaves da Pluggy** (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`) e o segredo
  do webhook existem só como segredos das Edge Functions. O app recebe apenas
  um token de conexão de curta duração.
- **Credenciais bancárias** nunca passam por nós: o dependente as digita no
  widget da Pluggy ou autoriza no app do banco.

## 3. Banco de dados

### Tabelas novas

| Tabela | Guarda | Quem lê | Quem grava |
| --- | --- | --- | --- |
| `families` | nome, criador | membros ativos | funções |
| `family_members` | papel (`guardian`/`dependent`), nome de exibição, tipo do dependente, nascimento (só menor) | membros da mesma família | funções |
| `family_invites` | hash do código, tipo, validade, declaração do representante | quem criou | funções |
| `family_consent_terms` | versões do termo e o hash do texto | autenticados | migration |
| `family_consents` | quem consente, para quem, versão, prazo, IP, estado | as duas partes | funções |
| `bank_connections` | item da Pluggy, instituição, estado, validade do consentimento no banco | dono | Edge Functions |
| `bank_accounts` | nome, tipo, 4 últimos dígitos, `shared` | dono | Edge Functions; `shared` por função |
| `bank_transactions` | valor em centavos, direção, descrição, estabelecimento, categoria, data | dono | Edge Functions |
| `family_budgets` | limite mensal por categoria para um dependente | responsável (com consentimento) e dependente | funções |
| `family_alert_rules` | tipo, limite, categorias | dono da regra e o dependente | funções |
| `family_alert_events` | alerta gerado, estado do push | responsável (com consentimento) e dependente | banco |
| `family_audit_log` | quem fez o quê sobre os dados de quem | o titular dos dados e o autor | funções |
| `family_sync_signals` | "há novidade para o dependente X" (sem dado financeiro) | responsável (com consentimento) e dependente | banco |
| `push_tokens` | token do aparelho | dono | função |
| `bank_webhook_events` | eventos recebidos da Pluggy (idempotência) | ninguém | Edge Function |

Nenhuma tabela nova dá `INSERT`, `UPDATE` ou `DELETE` ao papel
`authenticated`, e `anon` não tem acesso a nenhuma. Toda escrita do app passa
por uma função que confere quem chama.

O que **não** é guardado: saldo, limite do cartão, número completo da conta,
CPF, dados de pagador e recebedor de PIX, credenciais.

### A regra de acesso

Um responsável lê dados de um dependente quando, e só quando:

```
existe family_consents com
  guardian_id  = quem chama
  dependent_id = o titular
  status       = 'active'
  expires_at   > agora
e os dois são membros ativos da mesma família
```

Essa condição é a função `family_can_view(dependente)`. Revogar muda o
`status` e a leitura para na consulta seguinte. A revogação também apaga os
alertas já gerados para aquele responsável.

O responsável **não tem política de leitura** em `bank_transactions`. Ele lê
por `family_transactions(dependente, de, até)`, que confere a condição, devolve
só as contas marcadas como compartilhadas e grava uma linha em
`family_audit_log` (no máximo uma a cada 30 minutos por tipo de acesso).

### Consentimento

- **Adulto**: o próprio dependente aceita o termo e confirma ter 18 anos.
- **Menor ou pessoa sob curatela**: o responsável declara ser o representante
  legal e dá o consentimento ao criar o convite (com data, versão e IP). O
  dependente vê o mesmo termo e confirma ao entrar. O registro guarda os dois.
- **Prazo**: 3, 6 ou 12 meses. Para menor, termina no máximo no dia em que
  completa 18 anos; a partir daí só ele pode renovar.
- **Revogar**: qualquer dependente, a qualquer momento, sem depender do
  responsável.
- O termo é versionado. O banco só aceita uma versão que conheça, e um teste
  garante que o hash gravado bate com o texto do app.

### Plano grátis e pago

O plano é o de quem criou a família, lido de `billing` (a mesma regra da
migration 0010).

| | Grátis | Pago (assinatura do Flow) |
| --- | --- | --- |
| Dependentes | 1 | sem limite |
| Contas compartilhadas | 1 | sem limite |
| Alertas | compra acima de um valor; conexão expirada | mais categoria sensível e orçamento estourado |
| Relatório em PDF | não | sim |

Os limites são conferidos no servidor ao convidar, ao aceitar, ao compartilhar
uma conta e ao criar regra. Se a assinatura acabar com a família acima do
limite, nada é apagado: o responsável passa a ver só o primeiro dependente e a
primeira conta, e o restante aparece como bloqueado.

## 4. Fluxos

### Convite e consentimento
1. Responsável cria a família e um convite. Recebe um código de 8 caracteres e
   um link `https://…/join?code=…` (que abre `flow://family/join`). O banco
   guarda só o hash do código; ele vale 7 dias e uma vez.
2. Dependente entra no Flow, informa o código e vê quem convidou.
3. Tela de consentimento: o que é compartilhado, com quem, por quanto tempo, o
   que não é compartilhado, como revogar. O aceite grava versão, data e IP.

### Conexão e sincronização
1. `bank-connect-token` confere o plano e pede à Pluggy um token com
   `clientUserId` igual ao id do usuário.
2. O widget Pluggy Connect abre numa WebView. Ao terminar, o app envia o
   `itemId` para `bank-connection-sync`, que confirma na Pluggy que o item é
   daquele usuário, grava a conexão e as contas e faz a primeira carga.
3. O dependente escolhe quais contas compartilhar.
4. Daí em diante a Pluggy chama `pluggy-webhook`. A função confere o segredo,
   registra o evento (um `eventId` repetido é ignorado), busca as transações na
   Pluggy e chama `bank_ingest_transactions`, que grava sem duplicar
   (`unique (account_id, external_id)`), avalia as regras e devolve os alertas
   novos. A função então envia os pushes.

### Painel
O app chama `family_my_state()` para montar a tela e `family_transactions()`
para os lançamentos. Os totais, a divisão por categoria, a série mensal e a
comparação com o mês anterior saem das funções que o Flow já tem em
`src/lib/calc.ts` e `src/lib/reports.ts`. Novidades chegam pelo Realtime em
`family_sync_signals`; se o Realtime falhar, a tela consulta de novo a cada 30
segundos enquanto está aberta.

### Revogação e exclusão
- Dependente revoga: o consentimento vira `revoked`, os alertas daquele
  responsável são apagados, fica o registro na auditoria.
- Excluir conta: `delete-account` encerra os itens na Pluggy antes de apagar o
  usuário; as tabelas novas caem em cascata.

## 5. Telas

Todas em `mobile/src/app/family/`, com os componentes do kit existente.

| Rota | Para quem | Conteúdo |
| --- | --- | --- |
| `index` | todos | Sem família: explicação e as duas entradas (criar, tenho um código). Com família: painel do responsável e/ou situação do compartilhamento |
| `create` | responsável | Nome da família e o seu nome |
| `invite` | responsável | Tipo de dependente, nome, declaração; depois código e compartilhar |
| `join` | dependente | Código, prévia de quem convidou |
| `consent` | dependente | Termo, prazo, aceite |
| `connect` | dependente | Conectar banco, escolher contas |
| `sharing` | dependente | Quem vê o quê, contas, histórico de acessos, revogar |
| `dependent/[id]` | responsável | Feed, por categoria, por período, comparação, orçamentos |
| `budgets` | responsável | Limite mensal por categoria |
| `alerts` | responsável | Alertas recebidos e regras |
| `manage` | responsável | Membros, convites pendentes, excluir família |
| `account` | quem não assina | Sair, excluir conta, exportar dados, documentos |

Estados previstos em cada tela: carregando, vazio, erro com nova tentativa e
sem conexão (mostra o último dado guardado e a hora dele).

## 6. Dependências novas

| Pacote | Onde | Por que não há alternativa |
| --- | --- | --- |
| `react-native-webview` e `react-native-pluggy-connect` | app | O consentimento do Open Finance acontece no widget da Pluggy, que é uma página web |
| `expo-print` e `expo-sharing` | app | Gerar e entregar o PDF e o arquivo de exportação |
| `@electric-sql/pglite` | só testes | Testar RLS e funções SQL de verdade sem um banco no ar |

## 7. Fases

| Fase | Entrega | Como é verificada |
| --- | --- | --- |
| 0 | Diagnóstico, branch, flag, banco de testes | Testes existentes passam; flag desligada não muda nada |
| 1 | Migration 0011: famílias, membros, convites, consentimentos, auditoria, grants | Testes de acesso no Postgres em memória |
| 2 | Funções e telas de família, convite e consentimento | Fluxo completo entre dois usuários no banco de testes |
| 3 | Migration 0012, funções da Pluggy, tela de conexão | Webhook e sincronização com uma Pluggy simulada |
| 4 | Migration 0013, painel, orçamentos | Leitura registrada, revogação imediata, estranho não lê |
| 5 | Migration 0014, alertas e push | Regras e deduplicação no banco; envio com Expo simulado |
| 6 | Migration 0015, limites, PDF, transparência, exportação, exclusão | Limites no servidor; exclusão encerra a Pluggy |
| 7 | Acessibilidade, estados, E2E, Android, conformidade | Roteiro de telas; checklist das lojas |
| 8 | Revisão final | Relatório em `relatorio-final.md` |

## 8. O que não dá para verificar neste ambiente

Fica implementado e testado com simulações, e listado no relatório final como
pendente de verificação real:

- Chamadas à API real da Pluggy e o widget de conexão (sem credenciais; a rede
  daqui não alcança a Pluggy).
- Entrega de push em aparelho e o Realtime de um projeto Supabase no ar.
- Builds de produção de iOS e Android (exigem conta EAS, Xcode e Android SDK).
- As políticas do Google Play foram consultadas por busca, não página a
  página: o ambiente bloqueia `support.google.com`.
