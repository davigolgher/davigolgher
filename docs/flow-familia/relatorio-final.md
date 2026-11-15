# Flow Família — relatório final

Branch `claude/flow-familia-lo7kuy`, 15/11/2026. Todas as fases (0 a 8) foram
executadas. Este relatório resume a revisão final, o estado de cada critério de
aceite e, no fim, **tudo o que depende de você** para publicar.

## 1. O que foi entregue

| Camada | Onde |
| --- | --- |
| Banco (aditivo, versionado, sem migrar dados existentes) | `supabase/prepared/0011` a `0015` |
| Edge Functions | `bank-connect-token`, `bank-connection-sync`, `bank-connection-delete`, `pluggy-webhook`, `family-maintenance`; `delete-account` estendida |
| Lógica compartilhada | `src/lib/backend/family.ts`, `src/lib/family/*` |
| App (atrás de `EXPO_PUBLIC_FLOW_FAMILY=1`) | `mobile/src/app/family/*`, `mobile/src/features/family/*`, entradas na Home, Ajustes e paywall |
| Testes | 351 no total (eram 179 no diagnóstico), 35 arquivos |
| E2E de aparelho | `mobile/e2e/family/*.yaml` (Maestro) |
| Documentos | `docs/flow-familia/*` |

## 2. Critérios de aceite

| Critério | Estado | Evidência |
| --- | --- | --- |
| Convite → consentimento → conexão sandbox | **OK no código e nos testes**; no aparelho depende das contas Pluggy | `family_core.test.ts`, `family_sync.test.ts`, `screens.test.tsx`; fluxos Maestro 01–02 |
| Nova transação em menos de 1 minuto + push numa regra | **OK** com webhook simulado (processa em milissegundos, push enviado com texto genérico). Em produção soma a latência do webhook da Pluggy | `family_sync.test.ts` ("a new purchase is stored and the guardian gets a push…") |
| Revogar encerra o acesso na hora | **OK** | `family_core.test.ts`, `family_bank.test.ts`; a tela descarta a cópia offline (`screens.test.tsx`) |
| Outra família não lê nada | **OK** | `family_bank.test.ts` (nenhuma política de leitura para o responsável; só funções que conferem o consentimento) |
| Excluir a conta remove dados pessoais e desconecta o agregador | **OK** (com fila de reenvio se a Pluggy estiver fora) | `family_sync.test.ts` ("delete-account with Flow Family") |
| Flag desligada = comportamento idêntico | **OK** | `app.config.js` devolve o `app.json` sem mudança (conferido); o bundle sem a flag não contém as telas da Família (1854 contra 1940 módulos, `metro.config.js`); `flagOff.test.tsx`; toda mudança em arquivo existente é condicionada à flag |
| Checklist 100% sem itens dependentes de código | **OK** | `conformidade-lojas.md`: os itens abertos são decisões, contas e consoles |
| Builds de produção iOS e Android | **Parcial**: os bundles JS de produção de iOS e Android fecham com a flag; os binários exigem EAS e credenciais | `npx expo export --platform ios|android` (seção 4) |

## 3. Revisão final

### Segurança (reteste)
- **Acesso no backend:** o responsável não tem política de leitura nas tabelas bancárias. Lê só por `family_transactions` / `family_dependent_overview`, que exigem consentimento ativo e gravam o acesso. Testado como `anon`, `authenticated` de outra família e `service_role`.
- **Chaves e credenciais:**
  - chaves da Pluggy só como segredos das funções;
  - o app recebe um token de conexão curto;
  - credenciais bancárias nunca passam pelo Flow;
  - nenhum segredo no repositório (varredura antes de cada commit); `.env.example` lista só os nomes.
- **Webhook:**
  - segredo comparado em tempo constante, falha fechada;
  - deduplicação por `eventId`;
  - o corpo só fornece IDs, os fatos são relidos da Pluggy;
  - conexão criada para outro usuário é recusada (`clientUserId`).
- **Funções:**
  - quem chama vem do token, nunca do corpo;
  - conexão de outra pessoa responde "não encontrada";
  - a manutenção só aceita a chave service role;
  - os bancos de teste da Pluggy só aparecem para as contas listadas.
- **Privacidade:**
  - push sem valores;
  - cópia offline por conta, apagada ao sair e quando o acesso termina;
  - exportação sem dados de terceiros;
  - retenção e encerramento de conexões órfãs (0015).

### Regressão
- Flag desligada: configuração idêntica, telas fora do bundle, rotas redirecionam para a Home, `useFamily` informa a feature como ausente. Os testes existentes passam sem alteração.
- Duas mudanças que valem para todos:
  - texto legal (Termos, cláusula 3; Política, seção "Children"; data "November 2026"; uma linha no rótulo de privacidade);
  - `delete-account` faz uma consulta a mais, que não faz nada sem as tabelas da Família.
- Os tokens de design foram centralizados sem mudar nenhum valor.

### Testes
- `npm test`: 351 passando.
- `npm run lint`: tipos do web, das funções, dos testes e dos scripts.
- `cd mobile && npx tsc --noEmit` e `npm run check:native` limpos.
- O `expo lint` não tem configuração no repositório, e o proxy bloqueia a instalação automática; não fazia parte do fluxo.

### UX e acessibilidade
- **Estados:** carregando, vazio, erro com nova tentativa e offline com a hora da cópia, em todas as telas (testados).
- **Leitor de tela:** papéis e rótulos (botões, cabeçalhos, caixas de seleção, rádios, barras de progresso com valor, alertas). Ícones escondidos do leitor; o "✓" da caixa também.
- **Tamanho de fonte:** nenhum limite de escala no código da Família; layouts com quebra de linha; números grandes encolhem para caber.
- **Contraste:** tokens AA (o texto pequeno nunca usa `chalk-faint`; as três cores de sinal passam AA sobre branco e sobre a própria cor de fundo).
- **Modo escuro:** não se aplica — o app inteiro é só claro (decisão em `arquitetura.md`, registrada em `inconsistencias-design.md`).

### Conformidade
Ver `conformidade-lojas.md`. Três riscos de política pedem decisão sua (seção 5).

## 4. Builds

Feito aqui:

```bash
cd mobile
EXPO_PUBLIC_FLOW_FAMILY=1 npx expo export --clear --platform ios      # bundle de produção iOS: OK (1940 módulos)
EXPO_PUBLIC_FLOW_FAMILY=1 npx expo export --clear --platform android  # bundle de produção Android: OK (2038 módulos)
npx expo export --clear --platform ios                                 # sem a flag: OK, sem as telas da Família
```

Atenção: a flag é embutida na transformação. Ao trocá-la localmente, use
`--clear` (`npx expo start --clear`); sem isso o Metro reaproveita o cache. Os
builds do EAS começam sempre limpos.

Não dá para fazer aqui (sem EAS, Xcode, credenciais e rede para a Expo):

```bash
eas env:create --name EXPO_PUBLIC_FLOW_FAMILY --value 1 --environment production
eas build --platform ios --profile production
eas build --platform android --profile production
```

## 4a. Bancos do mundo inteiro (acréscimo de 15/11/2026)

A conexão bancária deixou de ser só brasileira. Detalhes em `bancos-mundo.md`.

| Região | Provedor | Como abre |
| --- | --- | --- |
| Brasil | Pluggy | widget dentro do app (como antes) |
| EUA, Canadá, Reino Unido, 17 países da UE/EEE | Plaid | página da Plaid no navegador seguro do sistema |
| Demais países com open banking | Salt Edge | página da Salt Edge no navegador seguro do sistema |

- **Banco de dados:** migration `0016_bank_worldwide.sql`, só com acréscimos.
  - Provedor e país de cada conexão.
  - Tokens da Plaid cifrados.
  - Moeda em orçamentos e alertas.
  - Mês no fuso do dependente.
  - Nova versão do termo (`2026-11.2`) citando os provedores; quem consentiu na `2026-11` segue válido.
- **Funções:** `plaid-webhook` e `saltedge-webhook` novas; `bank-connect-token`, `bank-connection-sync`, `bank-connection-delete`, manutenção e `delete-account` passaram a funcionar com os três provedores.
- **App:**
  - "Where is your bank?" com o país do celular primeiro;
  - painel somando uma moeda por vez;
  - orçamentos e alertas com moeda;
  - nova dependência `expo-web-browser`, na versão do SDK 57.
- **Testes:** 387 no total. Plaid e Salt Edge simulados, com assinaturas reais geradas a cada execução.
- **Sem a flag:** o pacote do app continua idêntico (1854 módulos, nada da Família).

## 5. O que depende de você

### Decisões (antes de enviar)
1. **R1 — Apple 5.1.1(ix):** enviar por conta de desenvolvedor de **pessoa jurídica** e preencher `APP.company` em `src/config/app.ts`.
2. **R2 — Google Play, monitoramento de adultos:** escolher entre lançar a Família só no iOS primeiro (recomendado), só com menores no Android, ou com adultos assumindo o risco (opções em `conformidade-lojas.md`).
3. **R3 — idade mínima de dependentes menores:** recomendo 13 anos. É uma verificação pequena em `family_invite_create` e no aceite; não implementei sem a sua decisão porque restringe o escopo pedido.
4. **Revisão jurídica** de `politica-privacidade-rascunho.md` e `termos-rascunho.md`. Inclui o ponto em aberto sobre manter a prova de consentimento depois da exclusão da conta.

### Contas e serviços
5. **Pluggy:** criar a aplicação (sandbox primeiro, produção depois) e assinar o contrato. Criar o webhook `all` apontando para `https://<ref>.supabase.co/functions/v1/pluggy-webhook`, com o cabeçalho `x-flow-webhook-secret`.
6. **Supabase** (o projeto está pausado):
   - reativar;
   - aplicar `0009` a `0016` em ordem;
   - publicar as funções: `supabase functions deploy bank-connect-token bank-connection-sync bank-connection-delete family-maintenance delete-account`, e `pluggy-webhook`, `plaid-webhook` e `saltedge-webhook` com `--no-verify-jwt`;
   - definir os segredos: `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET` e, para a revisão, `PLUGGY_SANDBOX_USER_IDS`;
   - agendar a manutenção diária (SQL no cabeçalho de `family-maintenance/index.ts`).
7. **Push:**
   - `eas init` (grava o `projectId` que o push exige);
   - chave APNs nas credenciais do EAS;
   - `google-services.json` (FCM) para Android.
8. **Contas de demonstração:** `SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… DEMO_PASSWORD=… node supabase/scripts/seed-demo-family.ts`, e colar as credenciais em `notas-revisor.md`.
9. **Android, plano pago:** o app só configura o RevenueCat no iOS (`mobile/src/lib/purchases.ts`). Para vender no Android é preciso:
   - produtos no Play Console;
   - chave Android no RevenueCat;
   - usar essa chave em `purchases.ts` quando `Platform.OS === "android"`.
   O plano grátis da Família já funciona no Android sem isso.

### Bancos fora do Brasil
- **Plaid:** conta, acesso a Transactions e Hosted Link, segredos (`PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `BANK_TOKEN_KEY`), publicar `plaid-webhook` com `--no-verify-jwt`.
- **Salt Edge:**
  - conta e acesso de produção;
  - segredos: `SALTEDGE_APP_ID`, `SALTEDGE_SECRET`, `SALTEDGE_PRIVATE_KEY`, `SALTEDGE_CALLBACK_PUBLIC_KEY`, `SALTEDGE_CALLBACK_URL`;
  - callbacks no painel;
  - publicar `saltedge-webhook` com `--no-verify-jwt`;
  - **confirmar a API v5** contra a documentação atual (não acessível daqui).
- **Aplicar `0016_bank_worldwide.sql`.**
- **Para distribuir na UE/Reino Unido:** representante pelo art. 27 da GDPR (R5) e contratos de tratamento de dados com os provedores.

### Lojas
10. **App Store Connect:**
    - rótulos de privacidade (acréscimos em `textos-loja.md`);
    - textos e screenshots (`screenshots.md`);
    - notas de revisão (`notas-revisor.md`);
    - categoria Finanças, não Kids.
11. **Play Console:**
    - Data safety, declaração de recursos financeiros e público-alvo (`textos-loja.md`);
    - link web de exclusão de conta.
12. **Site:** publicar o deploy do Vercel, para que `/privacy`, `/terms` e `/family-privacy` fiquem no ar com o texto novo.
13. **Testes em aparelho:** rodar os fluxos Maestro (`mobile/e2e/family/README.md`) contra um projeto de homologação com o sandbox da Pluggy.

### Observações
- A interface é em inglês, como o resto do app; para o público brasileiro, a tradução seria um projeto à parte (ver `inconsistencias-design.md`).
- Os formatos da API da Pluggy seguem os tipos oficiais do `pluggy-sdk` 0.94 e do `react-native-pluggy-connect` 1.6. A documentação e a API ficaram inacessíveis daqui, então o primeiro teste em sandbox é a confirmação final.
