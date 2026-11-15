# Flow Família — textos para as lojas

Os textos seguem o idioma do app (inglês), com versão em português para a
ficha brasileira. A divulgação do compartilhamento aparece na descrição, como
pedem a Apple (2.5.14) e o Google (apps de monitoramento devem divulgar a função
na descrição da loja).

## App Store

### Texto promocional (170 caracteres)

**EN** — New: Flow Family. Follow the spending of someone you look after, from the accounts they choose to share. They see what you see and can stop at any time.

**PT-BR** — Novo: Flow Família. Acompanhe os gastos de quem você cuida, nas contas que a pessoa escolhe compartilhar. Ela vê o mesmo que você e pode parar quando quiser.

### Descrição (trecho novo, acrescentado à descrição atual)

**EN**

> FLOW FAMILY
> Follow the spending of a child, a teenager or an older parent — read-only, from the bank accounts and cards they choose to share through Open Finance Brasil.
>
> • They choose. Nothing is shared without their consent (or a parent's, for under-18s). They pick the accounts, see exactly what you see, see every time you looked, and can stop sharing at any time.
> • See where money goes: this month against last month, by category, and every purchase as it arrives.
> • Alerts that matter: a purchase above an amount, betting sites, a monthly budget passed, a bank connection that stopped.
> • Monthly budgets to follow — numbers to compare, never blocks.
> • See, never touch: Flow Family can't move money, block purchases or see bank passwords. Bank connections are made through Pluggy, an authorised Open Finance partner.
>
> Free for one person and one account. A Flow subscription adds unlimited people and accounts, category and budget alerts, and a monthly PDF report.

**PT-BR**

> FLOW FAMÍLIA
> Acompanhe os gastos de um filho, um adolescente ou um pai ou mãe idosos — só leitura, nas contas e cartões que a pessoa escolhe compartilhar pelo Open Finance Brasil.
>
> • A pessoa escolhe. Nada é compartilhado sem o consentimento dela (ou do responsável, para menores de 18). Ela escolhe as contas, vê exatamente o que você vê, vê cada vez que você olhou e pode parar quando quiser.
> • Veja para onde vai o dinheiro: o mês contra o anterior, por categoria, e cada compra assim que chega.
> • Alertas que importam: compra acima de um valor, sites de apostas, orçamento do mês estourado, conexão com o banco interrompida.
> • Orçamentos mensais para acompanhar — números para comparar, nunca bloqueios.
> • Ver, nunca mexer: a Família não movimenta dinheiro, não bloqueia compras e não vê senhas do banco. A conexão é feita pela Pluggy, parceira autorizada do Open Finance.
>
> Grátis para uma pessoa e uma conta. A assinatura do Flow libera pessoas e contas ilimitadas, alertas de categoria e orçamento e o relatório mensal em PDF.

### Novidades da versão

**EN** — Flow Family: follow, read-only, the spending of someone you look after, from the accounts they choose to share. Consent, transparency and stopping are always in their hands.

**PT-BR** — Flow Família: acompanhe, só leitura, os gastos de quem você cuida, nas contas que a pessoa escolhe compartilhar. Consentimento, transparência e o botão de parar ficam sempre com ela.

### Palavras-chave (100 caracteres, EN)

`family,spending,parents,teen,allowance,budget,open finance,alerts,bank,expenses,kids money,elderly`

### Privacidade do app (App Store Connect) — o que acrescentar

Para cada tipo: **Linked to the user: Yes · Used for tracking: No · Purpose: App Functionality**.

| Tipo | Por quê |
| --- | --- |
| Contact Info → Name | Nome que cada pessoa usa na família |
| Financial Info → Other Financial Info | Lançamentos das contas compartilhadas (o Flow já declara esse tipo) |
| Identifiers → Device ID | Token de push dos alertas do responsável |
| Other Data | Data de nascimento de dependente menor; IP registrado com o consentimento |

## Google Play

### Descrição curta (80 caracteres)

**EN** — Track expenses and, with consent, follow the spending of someone you look after.

**PT-BR** — Controle gastos e, com consentimento, acompanhe os gastos de quem você cuida.

### Descrição completa

Usar a mesma seção "FLOW FAMILY" da App Store (acima), mais esta frase no fim:

**EN** — Flow Family shares bank transactions that the account holder chose to share, through Open Finance. It does not collect anything from their phone, and it is always visible to them in the app.

**PT-BR** — A Flow Família compartilha lançamentos bancários que o titular escolheu compartilhar, pelo Open Finance. Nada é coletado do celular dele, e o compartilhamento está sempre visível para ele no app.

### Data safety — respostas

| Pergunta | Resposta |
| --- | --- |
| Coleta ou compartilha dados? | Coleta: sim. Compartilha com terceiros: não (Supabase, Pluggy e Expo atuam como operadores — "service providers") |
| Criptografia em trânsito | Sim |
| Exclusão de dados | Sim: no app (Settings → Delete account; Family → Account → Delete account) e pelo link web de suporte |
| Personal info → Name, Email | Coletado, obrigatório, funcionalidade do app e gestão da conta |
| Financial info → Other financial info | Coletado, opcional (só quem usa a Família ou registra gastos), funcionalidade do app |
| Financial info → Purchase history | Coletado (assinatura), funcionalidade do app |
| Device or other IDs | Coletado, opcional (alertas por push), funcionalidade do app |
| Other → date of birth / IP de consentimento | "Other info": coletado, opcional, funcionalidade do app e conformidade legal |
| App activity → Other user-generated content | Coletado (anotações, categorias), funcionalidade do app |
| Location, contacts, photos, messages, browsing | Não |

### Declaração de recursos financeiros

Marcar **Other** e descrever:

> Read-only account aggregation through Open Finance Brasil, provided by Pluggy (an authorised connection provider). Users connect their own bank accounts and choose which to share, view-only, with a family member. The app does not offer loans, payments, transfers, trading or credit.

### Público-alvo

Ver o risco R3 em `conformidade-lojas.md`. Com piso de 13 anos: público 13–15, 16–17 e 18+, sem crianças. Sem piso: incluir menores de 13 e seguir a política Families.
