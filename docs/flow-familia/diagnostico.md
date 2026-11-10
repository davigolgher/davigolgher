# Flow Família — diagnóstico do Flow

Levantamento feito em 10/11/2026, antes de qualquer código da feature, sobre o
commit `5d9dd37` (branch `claude/expense-tracking-app-design-lo7kuy`, que reúne
as correções de segurança e o ajuste visual de outubro). A branch da feature,
`claude/flow-familia-lo7kuy`, parte desse commit.

Como ler: o que está marcado **[verificado]** foi conferido no código, nos
testes ou no painel do Supabase hoje. **[a confirmar]** depende de terceiros
(Pluggy, Apple, Google, advogado) e não pôde ser conferido daqui.

## Resumo

- O Flow é um app **iOS** em Expo/React Native, com Supabase no backend e
  RevenueCat na assinatura. A base está bem organizada e testada (179 testes
  passando) e boa parte dela serve à feature: autenticação, modelo de
  transação, cálculos, gráficos, componentes e o padrão das Edge Functions.
- A feature, porém, depende de **quatro coisas que o Flow não tem hoje**:
  conexão bancária, notificações push, tempo real e, principalmente, uma conta
  enxergar dados de outra. Toda a segurança atual parte da regra oposta
  ("cada conta só vê as próprias linhas").
- Há **conflitos de produto e jurídicos** a decidir antes de construir: os
  Termos dizem que o Flow é só para maiores de 18 anos, o app está todo em
  inglês e a assinatura é obrigatória para qualquer uso (o dependente pagaria?).
- **Produção não está pronta para receber a feature**: o projeto Supabase está
  pausado, as pendências de segurança de outubro continuam abertas e o
  Android nunca foi compilado.

---

## 1. Stack e arquitetura [verificado]

| Camada | O que é |
| --- | --- |
| App | `mobile/` — Expo SDK 57, React Native 0.86, React 19, TypeScript 6, New Architecture e React Compiler ligados |
| Navegação | Expo Router (rotas por arquivo), barra de abas nativa (`NativeTabs`) |
| Estilo | NativeWind 4 (Tailwind 3) com tokens em `mobile/tailwind.config.js` |
| Lógica compartilhada | `src/` — TypeScript puro (dinheiro, cálculos, relatórios, sequência, textos legais) mais os provedores de autenticação e de dados; o app importa como `@/…` |
| Backend | Supabase: Postgres 17, Auth, Row Level Security, Edge Functions (Deno), Storage. Região `us-east-1`, plano Free |
| Assinatura | Apple In-App Purchase via RevenueCat (`react-native-purchases`), direito de acesso `pro` |
| Notificações | `expo-notifications`, somente **locais** |
| Web | Vite + React 18, só para as páginas públicas de privacidade, termos e suporte (Vercel) |

Não existem hoje: analytics, relatório de falhas, biblioteca de tradução,
feature flags, CI, ambiente de homologação.

### Organização do código

```
mobile/src/app/            rotas (Expo Router)
  _layout.tsx              provedores + portão de entrada (login, intro, paywall)
  (tabs)/                  Home, Expenses, Subs, Reports, Settings
  add-expense, add-subscription, review, streak, legal   (modais)
mobile/src/components/     ui.tsx (kit), gráficos, linhas, ícones
mobile/src/features/       login, intro, paywall, tour, lembretes, sequência
mobile/src/lib/            compras, notificações, flags, movimento, vibração
src/data/                  tipos, store, fila de sincronização
src/lib/                   cálculos puros e src/lib/backend (Supabase)
supabase/migrations/       0001–0008 (aplicadas), supabase/prepared/ 0009–0010 (não aplicadas)
supabase/functions/        delete-account, revenuecat-webhook
supabase/tests/            sondas SQL de isolamento e de limites
```

### Navegação

`mobile/src/app/_layout.tsx` monta `SafeAreaProvider → AuthProvider →
StoreProvider → Gate`. O `Gate` decide, nesta ordem: configuração ausente →
carregando → login → intro → paywall → app. Dentro do app há uma pilha com as
abas e cinco modais.

A barra tem **cinco abas, que é o máximo que o iPhone mostra**. Uma sexta
("Família") faria o iOS trocar a última por "Mais". A entrada da feature
precisa ser outra coisa: um cartão na Home e uma linha em Ajustes que abrem
uma tela própria, ou a troca de uma aba existente (decisão de produto).

### Estado

- `StoreProvider` (`src/data/store.tsx`): Context + `useReducer` com todo o
  `AppData` da conta em memória. Sem Redux, Zustand ou React Query.
- **Local primeiro**: a tela muda na hora e a alteração entra numa fila
  (`src/data/outbox.ts`) guardada no aparelho até o servidor confirmar.
- Ao entrar, `fetchAllData` carrega tudo da conta em páginas de 1.000 linhas.
- Preferências por aparelho (intro vista, lembretes) ficam no AsyncStorage,
  por conta; a sessão fica no Keychain do iOS.

### Padrões que a feature deve seguir

- Dinheiro sempre em **centavos inteiros** (`src/lib/money.ts`).
- Texto livre passa por `sanitizeText` antes de entrar no estado.
- Integrações atrás de uma interface única (ex.: `Purchases` em
  `mobile/src/lib/purchases.ts`), com uma implementação "indisponível" para o
  Expo Go.
- Edge Functions exportam `handle(req, env, make)`, o que permite testá-las
  sem rede; respostas genéricas ao cliente, detalhes só no log.
- Migrations numeradas e aditivas; o que ainda não foi aplicado fica em
  `supabase/prepared/` com o motivo e a ordem.
- Políticas RLS com `(select auth.uid())`, papel nomeado e sonda de duas
  contas (`supabase/tests/isolation_probe.sql`) rodada em transação desfeita.
- Comentários explicam o porquê; código e interface em inglês.

---

## 2. Como funciona hoje

### Autenticação [verificado]

- E-mail e senha pelo Supabase Auth, mínimo de 8 caracteres.
- **Sem verificação de e-mail e sem recuperação de senha**, por decisão
  registrada em `SETUP_STATUS.md`. Qualquer endereço bem formado cria conta.
- Sem login com Apple ou Google.
- `profiles` guarda só `id` e `e-mail`. Não há nome, data de nascimento, CPF
  nem papel.
- Excluir a conta passa pela função `delete-account`, que exige a senha e
  apaga linhas, arquivos e o usuário.

Impacto na feature: hoje não há como saber a idade de alguém, nem confirmar
que um e-mail pertence a quem o digitou, nem comprovar tutela ou curatela.

### Dados [verificado]

Oito tabelas, todas com RLS "só o dono": `profiles`, `transactions`,
`subscriptions`, `categories`, `budgets`, `preferences`, `billing`,
`activity_days`.

Pontos que afetam a feature:

- `transactions.source` só aceita `'manual'` (restrição no banco e no tipo).
- **Categoria é texto livre por conta.** `transactions.category` guarda o
  rótulo, e a lista de categorias de cada pessoa começa vazia. Não existe uma
  lista padrão do Flow, então não há hoje como reconhecer "apostas".
- `budgets` já aceita um orçamento por categoria no banco e no tipo
  (`scope`); a tela só usa o total.
- `AppData` tem `accounts` e `cards` como listas sempre vazias, reservadas.

### Assinatura e paywall [verificado]

- Assinatura **obrigatória**: depois da intro, sem plano ativo não se entra no
  app. Planos mensal (US$ 8,99) e anual (US$ 69,99), 14 dias de teste.
- Acesso liberado se a loja **ou** a linha `billing` disser que sim
  (`mobile/src/features/useEntitlement.ts`).
- Só iOS: em qualquer outra plataforma o módulo de compras devolve
  "indisponível".
- A trava é só no app. A migration `0010`, que faz o servidor recusar
  gravações sem assinatura, está preparada e não aplicada.

### Notificações [verificado]

- Apenas locais: lembretes de renovação agendados no próprio aparelho
  (`mobile/src/lib/notifications.ts`), desligados por padrão.
- Não existe token de push, tabela de aparelhos, envio pelo servidor, plugin
  de notificações no `app.json` nem tratamento do toque na notificação.

### Entrada de transações [verificado]

- Manual: modal `add-expense` (valor, descrição, categoria, gasto ou
  entrada), edição ao tocar, exclusão ao segurar.
- Assinaturas são cadastros recorrentes; não geram transações.
- Não há conexão bancária, importação nem arquivo.

### Produção hoje [verificado no painel, só leitura]

| Item | Estado |
| --- | --- |
| Projeto Supabase | **Pausado** (`INACTIVE`). Banco inacessível; não deu para listar migrations nem tabelas |
| `delete-account` | Versão de 23/09, anterior à que exige senha |
| `dynamic-task`, `super-endpoint` | Ainda ativas (deveriam ter sido apagadas) |
| `revenuecat-webhook` | **Não publicada** |
| Migrations 0009 e 0010 | Não aplicadas |
| Plano | Free: pausa sozinho após alguns dias sem uso e não tem backup |

Nada foi alterado em produção neste levantamento.

---

## 3. Design system [verificado]

**Identidade**: preto, branco e cinza. A cor não carrega significado (o sinal
`+`/`−` indica a direção do dinheiro). Só modo claro, só iPhone, fonte do
sistema.

**Tokens** (`mobile/tailwind.config.js`):

| Grupo | Valores |
| --- | --- |
| Superfícies `ink` | 950/850 branco, 800 `#F5F5F6`, 750 `#F1F1F2`, 700 `#E7E7E9` |
| Texto `chalk` | padrão `#0A0A0A`, `soft` `#3F3F46`, `mute` `#6E6E73`, `faint` `#8A8A8F` (contraste AA conferido) |
| Linhas `line` | 10%, 6% (`soft`) e 16% (`strong`) de preto |
| Raios | cartão 24, cartão pequeno 18, campo e botão 16, folha 28, pílula |
| Tipos | título de tela 26 negrito; linhas 15/13; rótulo 11 em maiúsculas; número grande 44–52 |

**Componentes** (`mobile/src/components/ui.tsx`): `ScreenHeader`, `Card`,
`StatCard`, `Group`/`GroupRow` (lista agrupada), `Button` (3 variantes, 3
tamanhos), `Segmented`, `Input`, `Pill`, `Eyebrow`, `FitNumber`, `FadeIn`,
`PressableScale`. Fora do kit: `ExpenseRow`, `CategoryPicker`, `Donut`,
`LineChart`, `ChartPager`, `SyncNotice`, `PrivacyShield`, ícones de linha.

**Movimento e toque**: `mobile/src/lib/motion.ts` (curvas, Reduzir Movimento,
resposta ao toque) e `mobile/src/lib/haptics.ts`.

**Idioma**: toda a interface e os textos legais estão em **inglês**; não há
estrutura de tradução. Moeda padrão USD; BRL com formato `pt-BR` já existe na
lista.

---

## 4. Testes e como rodar [verificado]

| O quê | Como | Estado hoje |
| --- | --- | --- |
| Testes unitários e de componentes | `npm ci && npm test` na raiz (Vitest + jsdom) | 24 arquivos, **179 testes, todos passando** |
| Tipos do app | `cd mobile && npm ci && npx tsc --noEmit` | sem erros |
| Tipos das páginas públicas | `npm run lint` na raiz | sem erros |
| Versões nativas | `cd mobile && npm run check:native` | de acordo com o SDK |
| App no iPhone | `cd mobile && npx expo start -c` (Expo Go) com `mobile/.env` | funciona sem loja e sem push |
| Builds | EAS, perfis `development`, `preview`, `production` | nunca rodado daqui |

O que os testes cobrem: dinheiro, cálculos, relatórios, recorrência,
sequência, lembretes, saneamento, fila de sincronização, store, sessão,
compras, as duas Edge Functions e parte do kit de interface.

O que não existe: cobertura medida, teste em aparelho ou ponta a ponta, CI,
e teste automático das políticas do banco (as sondas SQL são rodadas à mão).

---

## 5. O que dá para reaproveitar

| Necessidade da feature | Já existe |
| --- | --- |
| Identidade e sessão | `AuthProvider`, sessão no Keychain, `delete-account` |
| Modelo de transação | Tipo `Transaction` e a tabela, com valor em centavos, direção, estabelecimento e moeda |
| Painel do responsável | Funções puras que recebem uma lista de transações: `totalBetween`, `totalThisMonth`, `totalPrevMonth`, `compare`, `sumByCategory`, `groupByDay`, `categoryBreakdown`, `monthlyTotals` |
| Orçamento por categoria | `Budget.scope`, `budgetProgress`, `spentForBudget` |
| Gráficos e listas | `Donut`, `LineChart`, `ChartPager`, padrão do `ExpenseRow` (precisa de uma versão só de leitura) |
| Valores em reais | `useMoney` e `formatCurrency` com `pt-BR` |
| Assinatura | Interface `Purchases`, tabela `billing`, `useEntitlement`, webhook do RevenueCat |
| Notificações | `expo-notifications` instalado, pedido de permissão e preferências por conta |
| Webhook seguro | Padrão do `revenuecat-webhook`: segredo comparado em tempo constante, falha fechada, eventos repetidos ou fora de ordem ignorados |
| Termos e consentimento | Estrutura de seções em `src/features/legal/content.ts`, tela `LegalDoc`, páginas públicas |
| Onboarding da feature | Padrão do `useFlowFlags` (visto ou não, por conta) e do `OnboardingScreen` |
| Teste de isolamento | Sonda de duas contas, a estender para "responsável, dependente e estranho" |

---

## 6. O que falta

### 6.1 Banco e segurança

1. **Tabelas novas** (aditivas): família, membros e papéis, convites,
   consentimentos (versão do termo, data, IP), conexões e contas bancárias,
   regras e eventos de alerta, tokens de push, registro de acessos,
   orçamentos do dependente.
2. **Leitura entre contas.** É a primeira vez que uma política deixará uma
   conta ler linhas de outra. Precisa valer só enquanto houver vínculo ativo e
   consentimento válido, e cair no instante da revogação. É o ponto de maior
   risco da feature e pede sonda própria.
3. **Onde ficam as transações do banco.** `transactions` hoje só aceita
   lançamentos manuais e alimenta a Home de quem é dono. Colocar as do banco
   na mesma tabela muda o Flow do dependente; uma tabela separada não muda.
   A decisão vai para o documento de desenho.
4. **Exclusão e revogação em cascata**: `delete-account` tem uma lista fixa de
   tabelas e não fala com terceiros. Precisa apagar o que for novo e encerrar
   a conexão na Pluggy.
5. **Registro de IP** no aceite: só uma Edge Function enxerga o IP.

### 6.2 Open Finance

Não há nada. Falta: conta e contrato com a Pluggy, chaves guardadas só no
servidor, função que emite o token de conexão, tela de conexão (o widget da
Pluggy roda em WebView, o que traz dependências novas), função de webhook,
sincronização com deduplicação, tratamento de conexão expirada.

**[a confirmar com a Pluggy]** preço e requisitos para produção; prazo e
renovação do consentimento do Open Finance; e se **menores de idade
conseguem dar esse consentimento no banco**. Se não conseguirem, o caso
"filho menor conecta a própria conta" não se sustenta como descrito.

### 6.3 Categorias

O Flow não tem lista padrão. Para "usar as categorias do Flow" e alertar
"categoria sensível" será preciso criar uma lista fixa e o mapeamento das
categorias da Pluggy para ela.

### 6.4 Push e tempo real

- Push: chave APNs (exige conta Apple Developer), plugin no `app.json`,
  tabela de tokens, função de envio, preferências e rota ao tocar. Só dá para
  testar em build própria, não no Expo Go.
- Tempo real: ligar o Realtime do Supabase nas tabelas novas, com RLS.

### 6.5 Feature flag

Não existe mecanismo. O `useFlowFlags` guarda só "já viu a intro". Será
preciso criar um, simples: uma variável de build mais uma liberação por conta
no servidor.

### 6.6 Produto e jurídico

| Tema | Situação hoje | Por que trava |
| --- | --- | --- |
| Menores | Termos e Política dizem "18 anos ou mais" e que não coletamos dados de menores | A feature tem dependente menor. LGPD art. 14 pede consentimento específico do responsável legal e melhor interesse da criança |
| Idioma | App e termos em inglês | Open Finance é só Brasil; o termo de consentimento precisa ser claro para quem lê em português |
| Quem paga | Assinatura obrigatória para qualquer uso | O dependente bateria no paywall antes de aceitar o convite |
| Identidade | E-mail não verificado; sem idade; sem prova de tutela ou curatela | O vínculo ficaria apoiado só em autodeclaração |
| Política de privacidade | Não fala de compartilhamento com outro usuário, Pluggy, dados bancários nem IP | Precisa ser reescrita, junto com o manifesto de privacidade e os rótulos da App Store |
| Lojas | Classificação e textos atuais são de um app pessoal para adultos | **[a confirmar]** Apple e Google têm regras próprias para apps que acompanham outra pessoa e para dados de menores |
| Revisão | `APP.company` vazio; modelos legais marcados como rascunho | Vale revisão de advogado antes de publicar, ainda mais com dados de terceiros |

### 6.7 Android

`app.json` declara o pacote Android, mas o app **nunca foi compilado para
Android** e as compras só funcionam no iOS: uma build de produção para Android
hoje não passa do paywall. "Pronto para o Google Play" inclui chave do
RevenueCat para Android, produtos no Play Billing, FCM para push, formulário
de segurança de dados e teste em aparelho. É um projeto à parte.

### 6.8 Operação

- **Sair do plano Free antes de ligar webhooks**: projeto pausado não recebe
  as transações que o banco envia.
- Fechar as pendências de `SEGURANCA.md` (publicar `delete-account` e
  `revenuecat-webhook`, apagar as duas funções soltas, aplicar a 0009).
- Criar um projeto ou branch de desenvolvimento no Supabase. A regra em vigor
  é não testar em produção com dados reais.
- CI para testes e tipos; relatório de falhas.
- Tornar o repositório privado.

---

## 7. Decisões que precisam de você

1. O restante do escopo: a mensagem chegou cortada no item 10.
2. Idioma da feature: português, inglês ou os dois.
3. Quem paga: só o responsável, ou os dois; e se o dependente usa o Flow
   Família sem assinar.
4. Menores: a feature inclui menores já no lançamento, ou começa só com
   adultos (filho adulto, idoso, curatelado) enquanto o jurídico é fechado.
5. Contas externas: já existem conta na Pluggy, Apple Developer e Google Play?
6. Android: entra nesta entrega ou fica para depois do iOS.
7. Onde entra "Família": cartão na Home e linha em Ajustes, ou troca de uma aba.
8. Supabase: migrar para o plano pago e criar o ambiente de desenvolvimento.
