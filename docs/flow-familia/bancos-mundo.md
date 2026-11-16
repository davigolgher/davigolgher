# Flow Família — bancos do mundo inteiro

Pedido: "quero que os bancos que conectem no app sejam os bancos do mundo
inteiro, não só do Brasil".

## 1. Por que três provedores

Nenhum agregador conecta bancos do mundo todo. A cobertura pública consultada
em 15/11/2026:

| Provedor | Onde | Cobertura anunciada |
| --- | --- | --- |
| **Pluggy** | Brasil (Open Finance Brasil) | os bancos do Open Finance brasileiro |
| **Plaid** | EUA, Canadá, Reino Unido e 17 países da UE/EEE (AT, BE, DK, EE, FI, FR, DE, IE, IT, LV, LT, NL, NO, PL, PT, ES, SE) | ~12 mil instituições em 20 países |
| **Salt Edge** | demais países com open banking: Europa, Américas, Ásia-Pacífico, Oriente Médio | 5.000+ bancos segundo a própria Salt Edge; 73 países e ~1.600 instituições verificadas segundo o Open Banking Tracker |

Ficaram de fora:
- **GoCardless Bank Account Data** (antigo Nordigen): fechou para novos clientes.
- **Belvo** (México, Colômbia): pode entrar depois pela mesma interface.
- Redes nacionais que exigem licença local (Índia AA, Austrália CDR, Nova Zelândia Akahu): também podem entrar depois.

Países sem open banking (ou sem nenhum desses provedores) não têm como
conectar banco por API autorizada. O app diz isso com clareza
("Bank connections in this country aren't available yet").

## 2. Como funciona

1. **Escolha do país.** O dependente escolhe o país do banco.
   - O app mostra só os países cobertos pelos provedores ligados no servidor, com o país do celular primeiro.
   - "Another country" abre a lista da própria Salt Edge.
2. **Escolha do provedor.** O servidor escolhe (`supabase/functions/_shared/regions.ts`):
   - Brasil → Pluggy; países da Plaid → Plaid; resto → Salt Edge.
   - Se o preferido não estiver configurado, cai no próximo ligado (a Salt Edge cobre a maioria dos países da Plaid).
3. **Conexão.**
   - Brasil: o widget da Pluggy dentro do app, como antes.
   - Outros países: a página do provedor no **navegador seguro do sistema** (`expo-web-browser`). Os logins de open banking redirecionam para o app ou site do banco, o que uma WebView não faz de forma confiável.
4. **Ao voltar.** O app manda a "sessão" para `bank-connection-sync`. O servidor confere que a janela foi aberta por essa pessoa (`bank_link_sessions`) e só então grava e lê a conexão. Se o app não voltar, o webhook da Plaid termina a conexão sozinho.
5. **Leitura.**
   - Plaid: `/transactions/sync` com cursor.
   - Salt Edge: contas e transações paginadas.
   - Tudo passa pelas mesmas funções do banco: deduplicação, só contas compartilhadas, alertas, regra das conexões órfãs, retenção.
6. **Desconectar, manutenção e exclusão de conta** encerram a conexão no provedor certo. Se ele estiver fora do ar, a conexão vai para a fila (`bank_item_tombstones`), com o token ainda cifrado.

### Dinheiro e datas
- Cada lançamento guarda sua moeda.
- O painel soma uma moeda por vez, com seletor quando há mais de uma.
- Orçamentos e o valor do alerta de compra têm moeda; só contam lançamentos na mesma moeda.
- Os meses terminam à meia-noite do fuso do dependente, que o celular informa ao servidor.

## 3. Segurança

- Chaves dos provedores só como segredos das Edge Functions.
- Tokens de acesso da Plaid (um por conexão) cifrados com AES-256-GCM (`BANK_TOKEN_KEY`) antes de ir para o banco, numa tabela sem acesso para o app (`bank_credentials`).
- Webhook da Plaid: JWT ES256 no cabeçalho `Plaid-Verification`, conferido com a chave publicada pela Plaid, emitido há menos de 5 minutos e com o SHA-256 do corpo exato.
- Callback da Salt Edge: assinatura RSA-SHA256 sobre "URL|corpo"; sem a chave pública configurada, nada é aceito.
- Conexão Salt Edge só é aceita se pertencer ao "customer" da pessoa.
- Testado com os dois provedores simulados e assinaturas geradas a cada execução (`supabase/tests/pg/family_world_sync.test.ts`, 23 testes; `family_worldwide.test.ts`, 9).

## 4. O que confirmar antes de produção

| Item | Por quê |
| --- | --- |
| **Salt Edge: API v5 contra a documentação atual** | `docs.saltedge.com` não abre neste ambiente. Caminhos, cabeçalhos e assinatura seguem o cliente da comunidade `saltedge-api` 0.0.22 (API v5). Se a Salt Edge exigir a v6, o ajuste fica em `_shared/saltedge.ts` (um arquivo). Conferir também o formato do callback e as credenciais do banco de teste ("Fake Bank"). |
| Plaid: Hosted Link habilitado e URI de retorno | O Hosted Link precisa estar ativo na conta Plaid. Confirmar que `flow://bank-return` é aceito como `completion_redirect_uri` (o app também aceita o antigo `flow://family/bank-return`); se não for, usar uma página https sua que redirecione para o app (`BANK_RETURN_URL`). |
| Plaid: acesso de produção ao produto Transactions | A Plaid aprova o caso de uso antes de liberar produção, especialmente na Europa. |
| Primeiro teste em sandbox de cada provedor | Os formatos da Plaid vêm do SDK oficial v51; os da Salt Edge, do cliente da comunidade. |

## 5. Configuração (o que você faz)

### Plaid
1. Criar conta em dashboard.plaid.com, pedir acesso a Transactions (e a Hosted Link) e aos países desejados.
2. Segredos:
   - `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox` (depois `production`);
   - `BANK_TOKEN_KEY`: 32 bytes aleatórios em base64, por exemplo `openssl rand -base64 32`. Guarde: sem ele os tokens salvos não abrem.
3. Para a revisão das lojas em produção: `PLAID_SANDBOX_SECRET` e o id da conta de demonstração em `BANK_SANDBOX_USER_IDS`. Essa conta conecta o banco de teste da Plaid ("First Platypus Bank", usuário `user_good`, senha `pass_good`).
4. Publicar `plaid-webhook` com `--no-verify-jwt`. A URL do webhook vai em cada link; não há nada a configurar no painel.

### Salt Edge
1. Criar conta em saltedge.com e pedir o acesso de produção. Na UE, a Salt Edge oferece usar a licença dela (programa de parceiros) se você não for uma instituição licenciada.
2. Segredos:
   - `SALTEDGE_APP_ID`, `SALTEDGE_SECRET`;
   - `SALTEDGE_PRIVATE_KEY`: chave RSA do app (PKCS#8 PEM), exigida pela Salt Edge em produção para assinar requisições;
   - `SALTEDGE_CALLBACK_PUBLIC_KEY`: chave pública da Salt Edge (PEM);
   - `SALTEDGE_CALLBACK_URL`: a URL exata configurada.
3. No painel, apontar os callbacks success, fail, notify e destroy para `https://<ref>.supabase.co/functions/v1/saltedge-webhook?type=<tipo>`.
4. Publicar `saltedge-webhook` com `--no-verify-jwt`.

### Banco de dados
- Aplicar `supabase/prepared/0016_bank_worldwide.sql` depois da 0015.

## 6. Leis e lojas fora do Brasil

| Tema | O que muda | Status |
| --- | --- | --- |
| GDPR (UE/EEE) e UK GDPR | Consentimento (art. 6(1)(a)); crianças abaixo da idade de consentimento digital do país, com consentimento do responsável (art. 8) | Texto pronto no documento legal da Família |
| Representante na UE (GDPR art. 27) | Quem oferece serviço a pessoas na UE sem estabelecimento lá precisa nomear um representante | **Você** |
| Contratos de tratamento de dados (DPA) | Com Plaid, Salt Edge e Pluggy; cláusulas-padrão para transferências | **Você** |
| EUA: COPPA (< 13 anos) | Reforça o risco R3 (idade mínima) | **Decisão sua** |
| Lojas: países de distribuição | O app pode ser oferecido onde houver provedor ligado; fora deles, a Família funciona só para quem conecta bancos em países cobertos | **Você** (escolher países no App Store Connect e no Play Console) |
| Idioma | A interface é em inglês, o que serve à maioria dos mercados novos | Observação |
