# Flow Família — checklist de conformidade (App Store e Google Play)

Revisado em 15/11/2026, sobre o app inteiro (não só a Família), com as
diretrizes consultadas nesta sessão: App Store Review Guidelines (versão
publicada em outubro de 2026) e as políticas do Google Play (Developer Program
Policy, Families, Stalkerware/monitoramento, User Data, Account deletion,
Financial features). As páginas `support.google.com` e `docs.pluggy.ai` são
bloqueadas pelo proxy deste ambiente; o conteúdo do Google veio de buscas, com as
fontes no fim.

Legenda:
- **OK** — feito no código ou nos documentos deste branch.
- **VOCÊ** — depende de uma ação sua (conta, console, contrato, decisão), sem código pendente.
- **RISCO** — ponto de política que pode levar a rejeição e precisa de decisão sua.

Nenhum item depende de código ainda não escrito.

## 1. Riscos que precisam de decisão antes de enviar

| # | Item | Status | O que fazer |
| --- | --- | --- | --- |
| R1 | **Apple 5.1.1(ix): serviços financeiros enviados por pessoa jurídica.** Apps em áreas altamente reguladas (bancos e serviços financeiros) "devem ser enviados por uma pessoa jurídica". O Flow está como desenvolvedor individual. Há relatos de agregadores rejeitados por isso. | RISCO | Publicar a versão com Família por uma conta de desenvolvedor **de empresa (CNPJ)** e preencher `APP.company` em `src/config/app.ts`. Anexar nas notas de revisão o contrato/declaração da Pluggy (instituição autorizada que faz a conexão). |
| R2 | **Google Play — apps de monitoramento.** A política só aceita monitoramento de **filhos por pais** ou de funcionários por empresa, e diz que não se pode monitorar outro adulto "mesmo com conhecimento e permissão". Dependentes adultos (filho adulto, idoso, curatelado) entram em conflito com a letra da política. Há o argumento de que a Família não é stalkerware (os dados vêm do banco com consentimento ativo do dependente, que instalou o app, vê tudo e revoga quando quiser; nada é coletado do aparelho), mas a decisão é do Google. | RISCO | Opções: (a) no Android, lançar só com dependentes menores e declarar `isMonitoringTool=child_monitoring` (exige build Android com essa meta-tag); (b) lançar com adultos e descrever na ficha e na declaração que é **compartilhamento consentido de gastos**, não monitoramento do aparelho, aceitando o risco de recusa; (c) lançar a Família só no iOS primeiro. Recomendo (c) e depois (a) ou (b) com base na resposta da revisão do Google. |
| R3 | **Idade mínima de dependentes menores.** Hoje qualquer idade abaixo de 18. Abaixo de 13 entra no escopo da política Families do Google e do COPPA (EUA), com exigências próprias (público-alvo, SDKs, revisão). | RISCO | Decidir um piso (recomendo **13 anos**: uma verificação de data de nascimento em `family_invite_create` e no aceite). Sem piso, declarar público-alvo com crianças no Play Console e cumprir a política Families. |
| R4 | **Apple 3.2.1(viii)**: apps de investimento ou "gestão de dinheiro" devem ser enviados pela instituição financeira. A Família só lê dados; não movimenta dinheiro. O Flow já é um app de orçamento publicado. | RISCO (baixo) | Explicar nas notas de revisão que não há movimentação, só leitura com consentimento via Open Finance (texto pronto em `notas-revisor.md`). |

### Bancos fora do Brasil (acréscimo de 15/11/2026, ver `bancos-mundo.md`)

| # | Item | Status | O que fazer |
| --- | --- | --- | --- |
| R5 | **Representante na UE (GDPR art. 27)**: oferecer o serviço a pessoas na UE sem ter estabelecimento lá exige um representante nomeado. Vale o mesmo para o Reino Unido. | RISCO | Nomear um representante (há empresas que fazem isso) antes de distribuir na UE/Reino Unido, ou limitar os países de distribuição. |
| R6 | **Salt Edge: confirmar a API** contra a documentação atual, que não abre neste ambiente. | VOCÊ | Primeiro teste com uma aplicação de teste da Salt Edge (`bancos-mundo.md`, seção 4). |
| — | Contratos de tratamento de dados com Plaid, Salt Edge e Pluggy; aprovação de produção da Plaid (Transactions, Hosted Link) | VOCÊ | `bancos-mundo.md`, seção 5. |
| — | Países de distribuição nas lojas | VOCÊ | Escolher onde distribuir conforme os provedores ligados e as obrigações acima. |

## 2. Privacidade e dados

| Item | Status | Onde |
| --- | --- | --- |
| Política de Privacidade cobre a Família (dados, finalidades, base legal, operadores, retenção, direitos, crianças) | OK | `src/features/legal/content.ts` (`FAMILY`, e ajustes em `PRIVACY`/`TERMS`); página pública `/family-privacy`; rascunho para revisão jurídica em `politica-privacidade-rascunho.md` |
| URL da política na ficha das lojas | VOCÊ | Publicar o site (Vercel) com a rota `/family-privacy` e usar `/privacy` como URL principal |
| Consentimento explícito antes de compartilhar (o quê, com quem, por quanto tempo), registrado com data, versão do termo e IP | OK | `app/family/consent.tsx`; `family_invite_accept` (0011); testes em `family_core.test.ts` |
| Consentimento específico do responsável para menores (LGPD art. 14) | OK | `app/family/invite.tsx` (declaração do representante); 0011 |
| Monitoramento sempre visível ao dependente (Apple 2.5.14; Google: divulgação clara) | OK | Cartão fixo na Home do dependente ("Shared with …"), tela Sharing com quem vê, o que vê e histórico de acessos |
| Exclusão de conta no app (Apple 5.1.1(v); Google: no app e por link na web) | OK no app | Ajustes → Delete account e Família → Account → Delete account; encerra conexões na Pluggy (`delete-account`) |
| Link web para pedir exclusão (Google Play, Data safety) | VOCÊ | Usar a página `/support` (já publicada) com o e-mail de suporte, ou criar uma página só de exclusão; informar o link no Play Console |
| Exportação dos dados (LGPD art. 18) | OK | Família → Sharing/Account → Download my data (`family_export_my_data`, 0015) |
| Minimização e retenção | OK | 0015: lançamentos 13 meses, alertas 12, auditoria 24, conexões sem compartilhamento encerradas em 30 dias |
| Manifesto de privacidade iOS (tipos coletados) | OK | `app.config.js` acrescenta Name, Other Data e Device ID quando a flag está ligada |
| Rótulos de privacidade no App Store Connect | VOCÊ | Acrescentar: Name, Financial Info (já existe), Device ID, Other Data — todos "linked", "app functionality", sem rastreamento. Texto pronto em `textos-loja.md` |
| Data safety no Play Console | VOCÊ | Respostas prontas em `textos-loja.md` |
| ATT (App Tracking Transparency) | OK — não se aplica | Nenhum rastreamento, nenhum SDK de anúncios ou analytics; `NSPrivacyTracking: false` |
| Push sem informação sensível (Apple 4.5.4) | OK | Texto genérico ("New alert about Ana"); testado em `family_sync.test.ts` |
| Pedido de permissão de notificação só no contexto | OK | Pedido ao ligar uma regra de alerta (`app/family/alerts.tsx`) |
| Credenciais bancárias nunca armazenadas | OK | Digitadas na página do provedor ou do banco (widget da Pluggy; página da Plaid ou da Salt Edge no navegador seguro); o app recebe só identificadores |
| Chaves dos agregadores só no servidor | OK | Segredos das Edge Functions; os tokens de acesso da Plaid ficam cifrados (AES-256-GCM) numa tabela sem acesso para o app |

## 3. Assinaturas e compras no app

| Item | Status | Onde |
| --- | --- | --- |
| Plano grátis da Família sem compra; recursos pagos usam a assinatura atual do Flow (IAP) | OK | Paywall: "Here for Flow Family? Continue free"; limites no servidor (0011–0014) |
| Divulgações de assinatura no paywall (preço, período, renovação, cancelamento, termos e privacidade) e restaurar compras | OK (já existiam) | `PaywallScreen.tsx` |
| Nenhum link ou botão de compra fora do IAP | OK | |
| Android: cobrança via Google Play Billing | VOCÊ | O app só configura RevenueCat no iOS (`purchases.ts`). Para Android: criar os produtos no Play Console, a chave Android no RevenueCat e definir `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (pede um ajuste pequeno em `purchases.ts`, descrito no relatório final) |

## 4. Regras de conteúdo e funcionamento

| Item | Status | Onde |
| --- | --- | --- |
| Sem funcionalidade oculta; a flag é de build, não remota (Apple 2.3.1, 2.5.19) | OK | `EXPO_PUBLIC_FLOW_FAMILY`; descrita nas notas de revisão |
| Sem placeholders ou telas vazias sem explicação | OK | Estados vazio, erro, carregando e offline em todas as telas (testes de tela) |
| Conta de demonstração com família e dependente (Apple 2.1) | OK no código, VOCÊ para criar | `supabase/scripts/seed-demo-family.ts` (testado em `family_demo.test.ts`); credenciais vão nas notas |
| Não usar a categoria Kids (Apple 1.3) | VOCÊ | Manter a categoria Finanças |
| Classificação etária | VOCÊ | Responder o questionário sem "conteúdo infantil"; a Família não muda a classificação de conteúdo |
| Sign in with Apple | OK — não se aplica | Só e-mail e senha; nenhum login de terceiros (4.8) |
| Acessibilidade (VoiceOver, tamanho dinâmico) | OK | Rótulos, papéis (botão, cabeçalho, caixa de seleção, barra de progresso), texto que cresce com o sistema, contraste AA dos tokens |
| Declaração de recursos financeiros (Google, obrigatória para todo app) | VOCÊ | Marcar "Other" (agregação de contas, só leitura, Pluggy/Plaid/Salt Edge) — texto em `textos-loja.md` |
| Política de dados do usuário do Google: divulgação proeminente antes do consentimento | OK | A tela de consentimento mostra o que é coletado antes do aceite |
| Builds de produção iOS e Android | VOCÊ | Não é possível gerar daqui (sem EAS/Xcode/credenciais). Comandos no relatório final |
| Android: ícones, `google-services.json` para push (FCM) | VOCÊ | Necessário para push no Android |

## 5. Fontes consultadas

- [App Review Guidelines (Apple)](https://developer.apple.com/app-store/review/guidelines/) e [App Review](https://developer.apple.com/distribute/app-review)
- [Apple Developer Forums — 5.1.1 e setores regulados](https://developer.apple.com/forums/thread/714841)
- [Apple Developer Forums — agregadores financeiros](https://developer.apple.com/forums/thread/740042)
- [Google Play — Stalkerware / monitoramento](https://support.google.com/googleplay/android-developer/answer/9888380)
- [Google Play — Público-alvo e conteúdo](https://support.google.com/googleplay/android-developer/answer/9867159)
- [Google Play — Families](https://support.google.com/googleplay/android-developer/answer/9893335)
- [Google Play — Declaração de recursos financeiros](https://support.google.com/googleplay/android-developer/answer/13849271)
- [Google Play — isMonitoringTool](https://support.google.com/googleplay/android-developer/answer/12955211)
- [TechCrunch sobre a proibição de stalkerware no Play](https://techcrunch.com/?p=2029764)
