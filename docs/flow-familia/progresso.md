# Flow Família — progresso

Registro por fase: o que foi feito, como testar e o que ficou pendente.
Branch: `claude/flow-familia-lo7kuy`.

Comandos usados em todas as fases, a partir da raiz do repositório:

```bash
npm ci && npm test          # testes (Vitest), inclui os do banco em memória
npm run lint                # tipos: páginas públicas, lógica compartilhada, funções e testes do Supabase
cd mobile && npm ci && npx tsc --noEmit && npm run check:native
```

## Fase 0 — diagnóstico, branch, feature flag

**Feito**
- `diagnostico.md` e `arquitetura.md`.
- Feature flag de build: `EXPO_PUBLIC_FLOW_FAMILY=1`
  (`mobile/src/features/family/flag.ts`, documentada em `mobile/.env.example`).
  Sem ela, nada da feature é montado.
- Banco de testes: `supabase/tests/pg/harness.ts` sobe um Postgres em memória
  (PGlite), aplica as migrations do repositório e fala com ele como cada papel
  do Supabase (`anon`, `authenticated` com um usuário, `service_role`).
- `supabase/tests/pg/baseline.test.ts`: o esquema atual (0001–0008, mais 0009 e
  0010) conferido como cada papel. É o piso que as migrations da Família não
  podem baixar.
- `npm run lint` passou a checar também os tipos das Edge Functions e dos
  testes do banco (`supabase/tsconfig.json`).

**Como testar**
- `npm test` → inclui `supabase/tests/pg/baseline.test.ts` (8 testes).

**Pendências**
- Nenhuma de código. As decisões de produto e as contas externas estão no
  diagnóstico, seção 7.

## Fases 1 e 2 — infraestrutura, família, convites e consentimento (servidor)

**Feito**
- `supabase/prepared/0011_family_core.sql` (aditiva, nada existente muda):
  famílias, membros, convites, termo de consentimento versionado (com hash do
  texto), consentimentos, trilha de auditoria e limite de tentativas de código.
- Todo acesso passa por funções `SECURITY DEFINER` com `search_path` vazio; as
  tabelas não têm `insert/update/delete` para o app. Quem é o usuário vem do
  token (`auth.uid()`), nunca de um parâmetro.
- Convite por código de 8 caracteres (só o hash fica no banco), válido 7 dias,
  10 tentativas erradas por hora por pessoa.
- Consentimento grava data, versão do termo, IP (cabeçalhos repassados pelo
  PostgREST), user agent, duração (3/6/12 meses) e, para menor ou curatelado, a
  declaração do representante legal. Menor: o consentimento termina aos 18 anos.
- Revogar, sair, remover e expirar encerram o acesso do responsável na hora
  (`family_can_view` exige consentimento ativo).
- O texto do termo está em `src/lib/family/consentTerm.ts`; um teste confere que
  o hash do texto é o registrado no banco.

**Como testar**
- `npm test` → `supabase/tests/pg/family_core.test.ts` (35 testes): permissões
  por papel, convite, limite do plano grátis, consentimento com IP, revogação,
  expiração, menores e curatelados, maioridade, renovação e exclusões.

**Pendências**
- ~~Telas~~ — feitas (ver "App" abaixo).
- Aplicar no Supabase de produção: depende de você (projeto pausado; ver
  `relatorio-final.md` quando pronto).

## Fase 3 — conexão bancária e sincronização (servidor)

**Feito**
- `supabase/prepared/0012_bank_connections.sql`: conexões, contas (nascem **não
  compartilhadas**), lançamentos com deduplicação por `(conta, id externo)`,
  eventos de webhook e fila de conexões a encerrar. O dono lê o que é seu; o
  app não escreve nada direto.
- Lista fixa de categorias da Família, idêntica no banco, no servidor e no app
  (um teste garante): `supabase/functions/_shared/categories.ts`,
  `src/lib/family/categories.ts`.
- Edge Functions (chaves do Pluggy só como segredos do servidor):
  - `bank-connect-token`: token do widget, só para quem compartilha com uma
    família e dentro do plano.
  - `bank-connection-sync`: lê uma conexão; confere no Pluggy que ela foi criada
    para quem chama (`clientUserId`).
  - `bank-connection-delete`: encerra no Pluggy e apaga tudo que foi lido.
  - `pluggy-webhook`: segredo no cabeçalho com comparação em tempo constante,
    falha fechada sem segredo configurado, deduplicação por `eventId`, relê tudo
    do Pluggy (o corpo só fornece IDs), responde 500 em falha para o Pluggy
    reenviar, entrega os pushes e tenta de novo conexões pendentes de
    encerramento.
  - `delete-account` (existente) agora encerra as conexões no Pluggy antes de
    apagar a conta; se o Pluggy estiver fora, a exclusão segue e a conexão vai
    para a fila. O arquivo continua autocontido.
- Push: texto genérico ("New alert about Ana. Open Flow to see it."), sem
  valor, loja ou categoria (diretriz 4.5.4); tokens que o Expo diz que não
  existem mais são apagados.
- `.env.example` (raiz) lista os nomes dos novos segredos, sem valores.

**Como testar**
- `npm test` → `supabase/functions/_shared/categories.test.ts` (8) e
  `supabase/tests/pg/family_sync.test.ts` (28): Pluggy e Expo simulados em
  memória contra o Postgres real das migrations. Cobre token, sincronização,
  paginação, categorias, limite do plano, status da conexão, webhook (segredo,
  duplicado, reentrega, eventos de lançamentos, conexão apagada), push,
  desconexão e exclusão de conta.
- Com sandbox real do Pluggy (depende de você): criar a aplicação sandbox,
  `supabase secrets set PLUGGY_CLIENT_ID=… PLUGGY_CLIENT_SECRET=…
  PLUGGY_WEBHOOK_SECRET=… PLUGGY_INCLUDE_SANDBOX=1`, publicar as quatro funções
  (`pluggy-webhook` com `--no-verify-jwt`) e criar o webhook no Pluggy com o
  cabeçalho `x-flow-webhook-secret`.

**Pendências**
- ~~Tela de conexão (widget do Pluggy) no app~~ — feita (`app/family/connect.tsx`).
- Não foi possível chamar o Pluggy nem o Expo daqui (o proxy bloqueia
  `api.pluggy.ai` e `exp.host`); os formatos seguem os tipos do `pluggy-sdk`
  0.94 e do `react-native-pluggy-connect` 1.6.

## Fases 4 e 5 — painel, orçamentos e alertas (servidor)

**Feito**
- `0013_family_dashboard.sql`: leitura do responsável só por funções que
  registram o acesso (`family_transactions`, `family_dependent_overview`), plano
  grátis vê só a primeira conta compartilhada, orçamentos mensais por categoria,
  sinal em tempo real (`family_sync_signals` na publicação do Realtime).
- `0014_family_alerts.sql`: regras (compra acima de X, categoria sensível,
  orçamento estourado, conexão expirada), alertas gerados no banco com
  deduplicação, tokens de push e a fila de entrega usada pelas funções.

**Como testar**
- `npm test` → `family_bank.test.ts` (34) e `family_alerts.test.ts` (22).

**Pendências**
- ~~Telas do painel, orçamentos e alertas; assinatura do Realtime no app~~ — feitas (ver "App" abaixo).

## Fase 6 — privacidade, retenção, exportação (servidor)

**Feito**
- `0015_family_privacy.sql`:
  - exportação dos dados do próprio titular (`family_export_my_data`), sem dados de terceiros;
  - retenção: lançamentos 13 meses, alertas 12, auditoria 24, convites não usados 30 dias após expirar;
  - conexões que ninguém mais compartilha: marcadas quando o último consentimento termina, nada novo é gravado, encerradas na Pluggy e excluídas após 30 dias (a tela mostra a data);
  - manutenção no máximo de hora em hora.
- Edge Function `family-maintenance` (só com a chave service role) para agendar uma vez por dia via `pg_cron` + `pg_net` (comando no cabeçalho do arquivo). O webhook também roda a manutenção.

**Como testar**
- `npm test` → `supabase/tests/pg/family_privacy.test.ts` (11).

## App — todas as telas e as entradas (fases 2 a 6, lado do app)

**Feito**
- Cliente de dados: `src/lib/backend/family.ts` — todas as RPCs e funções, erros do servidor traduzidos em frases.
- Lógica pura em `src/lib/family/`, reaproveitando `calc.ts` e `reports.ts` do Flow:
  - `summary.ts`: mês contra o anterior, categorias e orçamentos; "Internal" nunca conta como gasto;
  - `report.ts`: HTML do PDF, com escape de todo texto vindo do banco;
  - `copy.ts`: textos de estados e do histórico de acessos.
- Estado compartilhado: `mobile/src/features/family/FamilyProvider.tsx`.
  - Realtime em `family_sync_signals`; consulta a cada 30 s só com uma tela da Família aberta e o canal fora do ar; recarga ao voltar ao app.
  - Cópia offline por conta (`cache.ts`), apagada ao sair da conta; a cópia de um dependente que parou de compartilhar é descartada.
- Telas em `mobile/src/app/family/`: `index`, `create`, `invite`, `join`, `consent`, `connect`, `sharing`, `dependent/[id]`, `budgets`, `alerts`, `manage`, `account`.
- Entradas, todas atrás de `EXPO_PUBLIC_FLOW_FAMILY=1`:
  - cartão na Home (para o dependente aparece sempre enquanto compartilha e não pode ser dispensado);
  - linha "Family" em Ajustes;
  - "Here for Flow Family? Continue free" no paywall, que abre só a área da Família;
  - um link `flow://family/...` numa build sem a flag cai na Home.
- Push: permissão pedida ao ligar um alerta; o token sai do servidor antes de sair da conta ou excluí-la.
- PDF (plano pago) e exportação de dados entregues pela folha de compartilhar do sistema (`expo-print`, `expo-sharing`).
- Tokens de design centralizados em `mobile/src/theme/tokens.js` (lidos pelo Tailwind e pelo código). Escala tipográfica nomeada, três cores de sinal, nenhum valor existente alterado.
- Dependências novas no app, nas versões do SDK 57: `react-native-webview`, `react-native-pluggy-connect`, `expo-print`, `expo-sharing` (`npm run check:native` confere).

**Como testar**
- `npm test` → `src/lib/family/family.test.ts` (10), `mobile/src/features/family/screens.test.tsx` (11), `flagOff.test.tsx` (2).
- No aparelho: `EXPO_PUBLIC_FLOW_FAMILY=1 npx expo start` (Expo Go não tem o módulo da WebView do Pluggy em versão garantida; use uma development build).

## Fase 7 — polimento, E2E, conformidade

**Feito**
- Testes de tela cobrindo:
  - carregando, vazio, erro com nova tentativa e offline com a cópia salva;
  - consentimento que só grava com as duas caixas marcadas e recusa termo de outra versão;
  - parar de compartilhar;
  - painel com filtro por categoria e "compartilhamento encerrado";
  - cartão da Home;
  - build sem a flag.
- Fluxos E2E para aparelho (Maestro) em `mobile/e2e/family/`: convite → consentimento → conexão sandbox → responsável vê → dependente revoga → responsável perde o acesso.
- Conta de demonstração para revisão: `supabase/scripts/seed-demo-family.ts`, testada contra as migrations. Bancos de teste da Pluggy só para as contas em `PLUGGY_SANDBOX_USER_IDS`.
- Documento legal "Flow Family Privacy & Terms" no app e no site (`/family-privacy`). Termos e Política principais dizem onde entram os menores; o rótulo de privacidade lista o que a Família coleta.
- `app.config.js`: com a flag, adiciona o plugin de push e três tipos ao manifesto de privacidade; sem ela, devolve o `app.json` sem mudança (conferido).
- Documentos: `conformidade-lojas.md`, `textos-loja.md`, `notas-revisor.md`, `politica-privacidade-rascunho.md`, `termos-rascunho.md`, `screenshots.md`, `inconsistencias-design.md`, `mobile/e2e/family/README.md`.

**Pendências (todas dependem de você; detalhes no relatório final)**
- Riscos de política: pessoa jurídica na Apple (R1), monitoramento de adultos no Google Play (R2), idade mínima (R3).
- Contas e consoles: Pluggy (aplicação sandbox e depois produção), `eas init` (projectId do push), APNs/FCM, rótulos de privacidade, Data safety, declaração financeira.
- Produção: reativar o projeto Supabase, aplicar 0009–0015, publicar as funções, configurar os segredos, criar o webhook na Pluggy, agendar a manutenção, criar as contas de demonstração.
- Builds iOS e Android de produção (não é possível gerar neste ambiente).

## Fase 8 — revisão final

**Feito**
- Reteste de segurança, regressão com a flag ligada e desligada, testes, UX (estados, fonte grande, leitor de tela), conformidade e bundles de produção iOS/Android: `relatorio-final.md`.
- Builds sem a flag deixam as telas da Família fora do bundle (`metro.config.js`), além do redirecionamento em tempo de execução: nenhum recurso dormente (Apple 2.3.1).
- Ajustes de revisão: o "✓" da caixa de seleção escondido do leitor de tela; quem é responsável e dependente vê os dois cartões na Home.

**Como testar**
- `npm test && npm run lint && (cd mobile && npx tsc --noEmit && npm run check:native)`.
- `cd mobile && EXPO_PUBLIC_FLOW_FAMILY=1 npx expo export --clear --platform ios` (e `android`; e sem a flag).

**Pendências**
- As da seção 5 do relatório final — todas dependem de decisões, contas ou consoles, nenhuma de código.

## Bancos do mundo inteiro (pedido de 15/11/2026)

**Feito**
- Três provedores, escolhidos pelo país do banco (`supabase/functions/_shared/regions.ts`):
  - Pluggy: Brasil;
  - Plaid: EUA, Canadá, Reino Unido e 17 países da UE/EEE;
  - Salt Edge: demais países.
- `0016_bank_worldwide.sql`:
  - provedor e país por conexão;
  - tabelas só do servidor: tokens da Plaid cifrados, "customer" da Salt Edge por pessoa, janelas de conexão;
  - moeda em orçamentos e no valor do alerta;
  - meses no fuso do dependente;
  - termo `2026-11.2`.
- Conectores:
  - `_shared/plaid.ts`, a partir do SDK oficial v51;
  - `_shared/saltedge.ts`, API v5, a confirmar;
  - `_shared/crypto.ts`: AES-GCM, JWT ES256 e RSA;
  - `_shared/providers.ts`.
- Funções: `plaid-webhook` e `saltedge-webhook`; as demais (token, sync, delete, manutenção, exclusão de conta) passaram a funcionar com os três provedores.
- App:
  - escolha do país;
  - páginas da Plaid e da Salt Edge no navegador seguro do sistema (`expo-web-browser`);
  - painel, orçamentos e alertas por moeda;
  - envio do fuso;
  - textos sem "só Brasil";
  - documento legal com provedores por região, transferências internacionais e GDPR.
- Documentos: `bancos-mundo.md` (novo), conformidade (R5, R6), textos de loja, notas ao revisor, rascunho da política, `.env.example`, relatório final.

**Como testar**
- `npm test` → `family_worldwide.test.ts` (9), `family_world_sync.test.ts` (23), `family.test.ts` (12), `screens.test.tsx` (12, incluindo a conexão no exterior).
- Sandbox real: Plaid ("First Platypus Bank", `user_good`/`pass_good`) e Salt Edge ("Fake Bank"), com as contas em `BANK_SANDBOX_USER_IDS`.

**Pendências (suas)**
- Contas e segredos da Plaid e da Salt Edge.
- Confirmar a API da Salt Edge.
- Aplicar a 0016.
- Representante GDPR antes de distribuir na UE/Reino Unido.
