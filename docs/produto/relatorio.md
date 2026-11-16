# Experiência, conexão bancária e retenção — relatório

Data: 16/11/2026. Branch `claude/flow-familia-lo7kuy`.

Documentos desta entrega:
- `pesquisa.md`: números de mercado com fontes;
- `eventos.md`: medição, funil e retenção;
- `zero-moments.md`: auditoria tela a tela;
- `bancos.md`: conexão bancária pessoal.

**Nenhum número de resultado deste relatório foi observado no Flow.** O app
não tinha medição. Os números citados são benchmarks externos; a medição
começa quando as migrations 0017 e 0018 forem aplicadas e o app publicado.

## 1. Diagnóstico (antes)

| Área | Como era | Problema |
| --- | --- | --- |
| Primeira abertura | Tela de cadastro (e-mail e senha) | Nada do produto aparece antes de pedir dados |
| Onboarding | 2 telas de texto ("Log spending in seconds", "See where your money goes") e orçamento para todos | Promessas sem demonstração; uma pergunta que nem todos precisam |
| Paywall | Rígido, logo depois do onboarding, com teste grátis de 14 dias | Pede assinatura antes de qualquer valor visto |
| App após o paywall | Home com $0,00, renda $0, economia $0, sequência de 0 dias, "No transactions yet"; Relatórios e Assinaturas vazios | Várias telas sem conteúdo nem próximo passo |
| Primeiro gasto | Categorias começam vazias: só "+ New" | É preciso criar categoria antes de lançar |
| Orçamento | "Set a monthly budget in Settings" (texto, sem botão) | Beco sem saída |
| Bancos | Só na Flow Família; o Flow pessoal era 100% manual | O maior acelerador de valor (histórico importado) não existia para o uso principal |
| Assinaturas | Só as digitadas | As esquecidas, que são o maior "aha" do setor, ficavam invisíveis |
| Retenção | Lembretes de renovação (opcionais) e sequência | Nenhum motivo novo para voltar; nada sobre o próprio mês |
| Medição | Nenhuma ("We don't use analytics") | Impossível saber se algo funciona |
| Moeda | Toda conta nova começa em USD | Um brasileiro vê "$"; e, com bancos, nada seria importado |
| Design system | Tokens prontos, mas o kit de estados (carregando, vazio, erro, offline) só existia na Família | Telas principais com marcação avulsa |

## 2. Pesquisa (resumo; fontes em `pesquisa.md`)

- **Retenção em finanças:** 12% no D1, 6% no D7 e 2% no D30 (Adjust 2025). As fontes divergem muito; o alvo é medir o próprio Flow.
- **Ativação prevê retenção:** 69% dos melhores em ativação de 7 dias também estavam entre os melhores em retenção de 3 meses (Amplitude 2025, fornecedor).
- **Menos passos:** tours de 1–2 passos têm mediana de 73% de conclusão; com 9 ou mais, 8% (464 SaaS). No Duolingo, usar o app antes do cadastro deu ~+20% de usuários ativos diários.
- **Paywall rígido** converte 5x mais no D35 (10,7% contra 2,1%), com retenção anual equivalente (RevenueCat 2026). Por isso o paywall foi **mantido**.
- **Bancos:** casos da Plaid mostram retenção maior entre quem conecta (Stash, +15% em 6 meses), mas com viés de seleção. A Copilot começa pela conexão e mostra as cobranças recorrentes.
- **Assinaturas:** as pessoas estimam gastar US$ 86 por mês e gastam US$ 219; 42% já pagaram algo que esqueceram (C+R Research, 2022).

## 3. O Aha moment escolhido

**Ver o próprio mês:** a Home mostrando pelo menos 3 gastos da própria
pessoa dos últimos 30 dias, digitados ou trazidos do banco.

- **Evento:** `aha_reached` (uma vez por conta), com `via` = `bank`, `manual` ou `mixed`.
- **Caminho mais curto:** conectar o banco, que traz 90 dias de uma vez, categorizados.
- **Sem banco:** 3 gastos em 2 toques cada, com categorias já criadas.
- **Antes da conta:** a amostra mostra o mesmo "aha" com dados de exemplo rotulados.

## 4. Onboarding

| Problema | Solução | Como medir |
| --- | --- | --- |
| Nada do produto antes do cadastro | Boas-vindas com "Explore with sample data": o app inteiro preenchido com um mês inventado, rotulado "Sample data" em toda tela, nada salvo, "Make it mine" leva ao cadastro | `sample_started` → `signup_completed`; cadastro de quem viu a amostra × quem não viu |
| Duas telas de texto | Removidas; quem explica agora é a amostra | `onboarding_completed` ÷ `onboarding_started` |
| Orçamento para todos | 1 pergunta (objetivos); o orçamento só para quem escolhe "budget" | abandono por `step` |
| Personalização zero | Objetivos ordenam os próximos passos da Home; moeda vem do celular | `next_step_tapped` por `kind` |
| Categorias vazias | Categorias iniciais criadas no fim do onboarding; botão "Use suggested categories" | tempo até `first_expense_added` |

## 5. Conexão bancária (`bancos.md`)

| Problema | Solução | Como medir |
| --- | --- | --- |
| Banco só na Família | Migration 0017: compras importadas viram gastos do próprio Flow, em categorias; correções do banco seguem; edições da pessoa ficam; desconectar mantém ou apaga | `bank_connect_started` → `bank_import_completed`; `aha_reached` com `via=bank` |
| Conectar parece tarefa técnica | Tela que mostra primeiro o ganho, depois as promessas, depois um botão; resultado dito em números ("128 purchases are now in Flow") | conversão do início até a importação |
| Estados | Abrindo, lendo 90 dias, conectado, precisa de atenção, consentimento expirado, erro, reconectar, várias instituições, conta por conta, desconectar | `bank_sync_failed` por `stage`; `bank_reconnect_started` |
| Quem não quer conectar | "Not now — I'll add expenses myself" em toda entrada; o app inteiro funciona sem banco | `next_step_tapped` com `via=alt` |
| Assinaturas esquecidas | Detecção de cobranças recorrentes (mesmo comerciante, ritmo mensal ou semanal, valor estável) com "Track it" e "Not a subscription" | aceitas ÷ vistas |
| Moeda | Primeiro banco de quem não tem gastos define a moeda | `bank_import_completed.entries` > 0 |

**Segurança:**
- chaves só no servidor;
- nenhuma senha bancária;
- somente leitura;
- RLS testado;
- consentimento como base legal;
- política de privacidade atualizada.

## 6. Design system

- O kit da Família (seções, avisos, carregando, vazio, erro, offline, interruptores, escolhas, selos, barras e `Point`) virou `components/kit.tsx`, usado pelo app inteiro.
- As telas novas usam só os tokens (`text-title`, `text-body`, `text-footnote`, `text-caption`, `bg-ink-*`, `text-chalk-*`, `signal-*`, `rounded-card*`, `iconSize`).
- Estados vazios das abas seguem um padrão: título, por que importa e o botão do próximo passo.
- Nenhuma biblioteca nova. Avaliei React Native Reusables, Gluestack e Tamagui; trariam outro sistema visual para o que o kit já cobre.
- As inconsistências antigas continuam listadas em `docs/flow-familia/inconsistencias-design.md` (tamanhos de fonte soltos nas telas antigas, idioma da sequência). As telas principais tocadas aqui ganharam os estados novos, mas não foram reescritas por inteiro.

## 7. Zero Moments

Auditoria completa em `zero-moments.md`. Principais mudanças:
- **Próximo passo:** a Home sempre tem um, conforme o estágio da pessoa (reconectar o banco, conectar, primeiro gasto, assinaturas encontradas, orçamento, assinaturas, lembretes).
- **Insights:** aparecem só quando há dados suficientes para dizer algo verdadeiro.
- **"Welcome back":** depois de 3 ou mais dias fora.
- **Nada de zeros sem sentido:** sequência de 0 dias, renda e economia em zero não aparecem para quem nunca registrou.
- **Orçamento a um toque:** a folha abre direto da Home.

## 8. Medição (`eventos.md`)

- **Migration 0018:** `product_events`, escrita só pela função que valida tudo, sem leitura pela API, retenção de 13 meses e opção de desligar.
- **Taxonomia:** 39 eventos (cadastro, onboarding, paywall, primeiro valor, aha, próximo passo, insights, retorno, bancos, sugestões).
- **Leituras prontas:**
  - funil de ativação;
  - retenção D1/D7/D30/D90 por coorte semanal;
  - tempo até o primeiro valor e até o aha (mediana e p90).

## 9. Testes e problemas encontrados

**Testes:** 440 no total, todos passando, mais os tipos do app e do projeto.

| Arquivo | Testes | O que cobre |
| --- | --- | --- |
| `bank_personal.test.ts` (banco de dados) | 13 | importação, categorias, correções, retiradas, "apaguei e não volta", manter/apagar ao desconectar, retenção, compartilhar e importar ao mesmo tempo, permissões |
| `product_events.test.ts` | 5 | validação, limites, ninguém lê, exclusão, leituras de funil, TTFV e retenção |
| `growth.test.tsx` (telas) | 14 | boas-vindas e amostra, onboarding, moeda, Home por estágio, aha, assinaturas encontradas, todos os estados da tela de bancos |
| `detectSubscriptions`, `growth.test.ts`, `analytics.test.ts` | — | detecção, insights, próximos passos, amostra e eventos no celular |
| `family_sync.test.ts` (ponta a ponta) | 1 | assinante conecta, importa 90 dias e desconecta apagando |

**Montagem do app para iOS:**
- com bancos e Família: 1978 módulos;
- sem as flags: 1883 módulos, sem nenhuma tela de banco.

**Percorrido como pessoas diferentes,** na prévia web, em 375×667, 393×852 e 430×932:
- visitante;
- quem só quer experimentar;
- conta nova;
- quem volta depois de 5 dias;
- quem tem banco pedindo reconexão;
- quem está no onboarding.

**Problemas encontrados e corrigidos:**
- **Moeda inicial:** toda conta nova começava em USD. Um brasileiro conectando o banco importaria **nada**. Agora a moeda vem do celular, e do primeiro banco para quem ainda não tem gastos.
- **Lockfile:** o package-lock da atualização para o SDK 58 estava incompleto e quebraria o `npm ci`. Corrigido.
- **Texto da Família:** a tela "Sharing" dizia "a partir do dia em que você compartilhou", mas o servidor lê 90 dias para trás. O texto agora é verdadeiro.
- **Família e importação juntas:** parar de compartilhar apagava compras também importadas para o Flow pessoal. Corrigido na 0017.
- **Função duplicada:** duas versões de `bank_remove_connection` deixavam a chamada ambígua. A antiga foi substituída.
- **Sugestão errada:** a Home piscava a sugestão errada enquanto os bancos carregavam. Agora espera, e cai no gasto manual se os bancos não respondem.

**Limitações da prévia web:**
- na web alguns botões aparecem sem fundo, a barra de abas fica no topo e a fonte não é a do iPhone;
- não é o app real: a confirmação visual final é no Expo Go ou no TestFlight.

## 10. O que depende de você

1. **Aplicar as migrations 0017 e 0018** (depois da 0009 até a 0016), num projeto de teste primeiro.
2. **Publicar as funções bancárias** e cadastrar as chaves de um provedor (sandbox da Pluggy primeiro). O passo a passo está em `bancos.md`.
3. **Ligar `EXPO_PUBLIC_FLOW_BANKS=1`** no build quando o servidor estiver pronto.
4. **Lojas:**
   - App Store Connect → App Privacy: em Usage Data → Product Interaction, acrescentar o propósito **Analytics** (vinculado à conta, sem rastreamento). O manifesto do iOS já foi atualizado.
   - Google Play → Data safety: em App activity → App interactions, marcar "Analytics" (coletado, sem compartilhamento, pode ser desligado).
   - Contas bancárias: Financial info já está declarado.
5. **Revisão jurídica** do texto novo da política: estatísticas de uso por legítimo interesse com opção de desligar; dados bancários por consentimento. Decidir também se o responsável na Família deve ver os 90 dias anteriores ao compartilhamento (hoje vê, e o texto agora diz isso) ou só a partir do compartilhamento. É uma decisão de transparência com implicação legal.
6. **Onde ver os números:** usar o SQL de `eventos.md` no Supabase ou conectar uma ferramenta de BI somente leitura.
7. **Testes A/B:** com volume, comparar amostra × sem amostra e conectar banco primeiro × gasto manual primeiro, antes de tirar conclusões.
8. **Paywall:** mantido rígido com base nos dados de mercado. Se quiser testar um paywall depois do primeiro aha, a medição já permite comparar.
