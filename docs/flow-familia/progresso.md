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
