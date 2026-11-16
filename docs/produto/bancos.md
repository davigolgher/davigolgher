# Bancos no Flow (uso pessoal)

Conectar o próprio banco para que as compras virem gastos no Flow, sem
digitar. Antes, a conexão bancária só existia dentro da Flow Família, para
compartilhar com um responsável.

## Provedores

Os mesmos da Flow Família, escolhidos pelo país do banco (análise em
`docs/flow-familia/bancos-mundo.md`):

| Região | Provedor | Como abre |
| --- | --- | --- |
| Brasil | Pluggy (Open Finance Brasil) | widget dentro do app |
| EUA, Canadá, Reino Unido, 17 países da UE/EEE | Plaid | página da Plaid no navegador seguro do sistema |
| Demais países com open banking | Salt Edge | página da Salt Edge no navegador seguro |

No Brasil, o Open Finance tinha cerca de 154 milhões de consentimentos ativos
em dez/2025 e 254 milhões em ago/2026, segundo a série do Banco Central
(fontes em `pesquisa.md` §5).

## Fluxo

1. **Entrada:**
   - Home: "See your last 90 days in a minute", para quem ainda não tem gastos;
   - Ajustes → Bank accounts;
   - telas vazias de Gastos, Relatórios e Assinaturas.
2. **Tela "Bank accounts":**
   - primeiro o ganho, depois as promessas, depois o país e um botão;
   - "Not now" volta ao caminho manual.
3. **Login:** a pessoa entra no banco pela página do provedor. A senha nunca passa pelo Flow.
4. **Importação:**
   - ao voltar, o app liga a importação das contas na moeda do Flow (`bank_connection_import_defaults`) e lê os últimos 90 dias;
   - quem ainda não tem gastos assume a moeda do banco.
5. **Resultado:**
   - "N purchases are now in Flow" e as assinaturas encontradas;
   - "See your month" leva à Home, que já mostra o mês categorizado.
6. **Depois:** as compras novas chegam sozinhas pelos webhooks.

## Dados

- `bank_accounts.import_to_flow`:
  - o interruptor de cada conta, que só o dono muda;
  - uma conta é lida do banco se estiver compartilhada com a família **ou** importada.
- **Importação** (gatilhos da migration 0017):
  - cada compra vira um `transactions` com `source = 'bank'` e `bank_transaction_id`;
  - entra na categoria do banco, que é acrescentada às categorias da pessoa;
  - movimentações internas (pagar a fatura do cartão pela conta corrente) não entram, para não contar o mesmo dinheiro duas vezes.
- **Correções do banco:**
  - uma compra pendente que é lançada ou um valor alterado atualizam o gasto;
  - categoria, descrição e nota editadas pela pessoa não são sobrescritas;
  - se o banco retira a compra, ela sai do Flow;
  - se a pessoa apagou o gasto, ele não volta.
- **Retenção:** a cópia do banco é apagada em 13 meses; o gasto no Flow fica.
- **Desconectar:** a pessoa escolhe manter os gastos importados (que viram registros dela) ou apagá-los.
- **Quem pode conectar:** assinante do Flow (até 10 bancos) ou, como antes, dependente da Família dentro do plano.
- **Uso pessoal conta como "em uso":** a conexão não é encerrada pela regra de "ninguém compartilha" da Família.

## Segurança e privacidade

- As chaves dos provedores ficam só no servidor. Os tokens da Plaid são guardados cifrados (AES-256-GCM).
- O app nunca pede nem guarda senha bancária.
- Só leitura: o Flow não movimenta dinheiro.
- RLS: cada pessoa lê só as próprias conexões, contas e gastos. Testado em `supabase/tests/pg/bank_personal.test.ts`.
- A política de privacidade descreve os dados bancários, a base legal (consentimento), os provedores e a retenção.

## Para ver funcionando

1. Aplicar as migrations 0009 a 0018 num projeto Supabase de teste.
2. Publicar as funções:
   - `bank-connect-token`, `bank-connection-sync`, `bank-connection-delete`;
   - `pluggy-webhook`, `plaid-webhook` e `saltedge-webhook` com `--no-verify-jwt`.
3. Cadastrar as chaves de pelo menos um provedor. Comece pelo sandbox da Pluggy, que é gratuito, em `dashboard.pluggy.ai`.
4. No `mobile/.env`, pôr `EXPO_PUBLIC_FLOW_BANKS=1` e o endereço e a chave pública do projeto de teste.
5. Entrar com uma conta que tenha assinatura ativa (a tabela `billing`). No Expo Go, a passagem de desenvolvimento pelo paywall **não** cria assinatura, então o servidor recusa a conexão com "Connecting a bank comes with a Flow subscription".
6. Conectar o "Pluggy Bank" com `user-ok` / `password-ok`.

Sem a flag, o app não tem nenhuma tela de banco: o Metro deixa `app/banks` fora do pacote.
