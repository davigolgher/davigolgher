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
- Telas (entram junto com as das fases 4–6).
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
- Tela de conexão (widget do Pluggy) no app — fase de telas.
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
- Telas do painel, orçamentos e alertas; assinatura do Realtime no app.
