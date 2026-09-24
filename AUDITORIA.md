# Auditoria pré-submissão à App Store — Flow

**Data:** 24/09/2026 · **Versão auditada:** 0.2.0, commits `57c22b3` (início) → `469b316` (fim das correções), branch `claude/expense-tracking-app-design-lo7kuy`

## Parecer

**Com bloqueios.**

1. **B1. Não há compra funcionando no build de produção.** Num build Release, o app fecha tudo atrás de um paywall. A compra ainda não existe: `react-native-purchases` não está instalado, os produtos não existem no App Store Connect, e o "pular" só funciona em desenvolvimento. Resultado: o revisor não consegue usar o app. Isso fere as diretrizes 2.1(a), 2.1(b) e 3.1.1. A saída depende de uma decisão comercial sua: integrar o IAP ou lançar gratuito primeiro.
2. **B2. Faltam os materiais e o acesso do revisor.** Ainda não existem conta de demonstração, screenshots nem ficha no App Store Connect. As URLs públicas não foram verificadas daqui, porque a rede deste ambiente as bloqueia. Diretriz 2.1(a).
3. **R1. Os Termos têm texto provisório.** A cláusula de lei aplicável diz *"the state/country you designate for your business"*. A diretriz 2.1(a) veta "placeholder text". Quem preenche é você, com um advogado.

Fora esses pontos, os defeitos que achei no código foram corrigidos e testados no escopo possível. Há um limite importante: **nenhum teste rodou em iPhone nem em Xcode**. Sem Mac e sem aparelho, tudo que depende do binário assinado ficou como "Não verificado": build Release, assinatura, VoiceOver real, notificações, Keychain e StoreKit.

---

## Como foi feito

- **Ambiente:**
  - Contêiner Linux, Node 22.22.2, sem macOS, Xcode ou iPhone.
  - A rede de saída bloqueia `supabase.co`, `vercel.app` e `apple.com` via `curl` (HTTP 403 do proxy).
  - A documentação da Apple foi lida pela ferramenta de busca web.
  - O Supabase foi acessado pelo conector do projeto: SQL, advisors, migrações e funções.
- **Documentação da Apple consultada** em 23/09/2026 e novamente em **24/09/2026**:
  - [Upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
  - [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), trechos citados abaixo
  - [Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
  - [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)
  - [User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/)
  - [Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)
  - [Subscriptions](https://developer.apple.com/app-store/subscriptions/)
  - [Submitting](https://developer.apple.com/app-store/submitting/)
- **Tipos de evidência:**
  - **[E] executado**: testes automatizados, consultas SQL com rollback, prévia web com Playwright, `expo export`, `expo prebuild`, varredura do bundle.
  - **[I] inspeção de código**: li a implementação, sem executá-la no aparelho.
- **Dados:** somente fictícios. As contas de teste do banco foram criadas dentro de transações desfeitas no final. O banco terminou com 0 usuários e 0 linhas.

### Requisitos da Apple: vigentes × futuros (página consultada em 24/09/2026)

| Requisito | Desde | Situação no Flow |
|---|---|---|
| Build com **Xcode 26 + SDK iOS 26** | 28/04/2026 (vigente) | **Não verificado.** O build é feito pelo EAS. Confira no log a versão do Xcode. |
| Apps devem ter **alvo iOS 13 ou superior** (isto é o mínimo suportado, não o SDK) | 09/09/2026 (vigente) | **Verificado [I].** O alvo é iOS 16.4 (template do Expo SDK 57). O mínimo do React Native 0.86 é 15.1. |
| Responder o **novo questionário de classificação etária** | 31/01/2026 (vigente) | **Pendente**, no App Store Connect. |
| **Required Reason APIs** declaradas | 01/05/2024 (vigente) | **Falha corrigida [E].** Faltava o manifesto; agora ele é gerado. |
| Manifesto e assinatura de **SDKs de terceiros** da lista da Apple (inclui Hermes) | vigente | **Não verificado.** Exige um archive do Xcode. Veja se o upload traz avisos ITMS-91061 ou ITMS-91065. |
| **Trader status (DSA)** para distribuir na UE | 17/02/2025 (vigente) | **Pendente** se você distribuir na UE. |
| Mudanças futuras | — | A página **não lista nenhuma exigência futura** em 24/09/2026. É provável que a Apple volte a exigir um SDK novo na primavera, como em anos anteriores. Isso é **expectativa, não requisito**: acompanhe a página. |

### O que o app realmente faz (inventário)

| Recurso | Existe? | Detalhe |
|---|---|---|
| Login | Sim | E-mail e senha (Supabase Auth), sem confirmação por e-mail. **Sem login social**: a diretriz 4.8 não se aplica. |
| Recuperação de senha | **Não** | Foi decisão sua deixar assim. Veja a recomendação M1. |
| Assinatura | Parcial | Paywall, "Restaurar compras", "Gerenciar assinatura" e webhook existem. **A compra em si, não** (B1). |
| Anúncios, analytics, crash reporting | Não | Nenhum SDK. **ATT não se aplica**: não há rastreamento. |
| IA | Não | O texto que dizia usar IA foi corrigido. |
| Sincronização | Sim | Supabase (Postgres com RLS). Agora conta com uma fila offline persistente. |
| Integração bancária, movimentação de dinheiro, crédito, investimento | **Não** | Todo lançamento é digitado pelo usuário. |
| Notificações | Sim, locais | Lembretes de renovação, desligados até o usuário ligar. |
| Streak | Sim | Conta os dias em que o usuário fez a revisão diária. Fica gravado no servidor, por conta. |
| Site público | Sim | `/privacy` e `/support` (site Vite na Vercel). |

---

## Checklist por área

Legenda: ✅ Verificado · ❌ Falha encontrada, com 🔧 quando foi corrigida · ❔ Não verificado, com o motivo · ➖ Não se aplica, com o motivo

### 1. Build e configuração de distribuição

- 🔧 **Release sem as variáveis do Supabase** rodava em "modo local" sem avisar: sem login, sem paywall, com dados perdidos a cada abertura. Motivo: o EAS compila a partir do repositório, onde o `mobile/.env` não existe.
  - Agora o build de produção abre numa tela que explica o problema. Foram adicionados o `eas.json` e os comandos `eas env:create` no README. **[I + E]**
- ✅ O "pular paywall" só existe em desenvolvimento (`canSkip = !available && __DEV__`). **[I]**
- ❔ **Xcode e SDK usados na compilação.** Exige o log do EAS.
- ✅ **Bundle ID** `com.davigolgher.flow` e versão 0.2.0. 🔧 O **número de build** não existia; o `eas.json` agora usa `appVersionSource: remote` com `autoIncrement`. **[I]**
- ❔ **Assinatura e provisioning.** Exigem a conta do Apple Developer; o EAS gerencia os dois.
- ✅ **Entitlements.** Só há `aps-environment`, que o `expo-notifications` adiciona. É desnecessário para notificações locais, mas inofensivo, e o EAS ativa a capability sozinho. **[E prebuild]**
- ✅ **Ícone** 1024×1024 em RGB sem alfa. ✅ **Splash** configurada. ✅ Somente iPhone (`supportsTablet: false`), retrato, modo claro. **[E/I]**
- 🔧 **Dependências nativas sem uso.** Havia quatro: `expo-image-picker`, `expo-auth-session`, `expo-web-browser` e `expo-image`. O image-picker colocava no Info.plist textos de permissão de **câmera, microfone e fotos** que o app nunca pede.
  - Foram removidas. Um prebuild limpo agora gera o Info.plist **sem nenhuma string de permissão**. **[E]**
- ✅ **APIs privadas.** Nenhuma: não há código nativo próprio. **[I]**
- ✅ **URLs de desenvolvimento e credenciais.** No bundle de produção, `localhost` e `127.0.0.1` aparecem só em textos internos de bibliotecas (padrões do Metro, Expo e GoTrue). `service_role` aparece 0 vezes. `sb_secret` aparece 1 vez, e é a verificação do próprio supabase-js que *impede* o uso de chave secreta no cliente. **[E varredura do bundle]**
- ✅ **Criptografia.** `ITSAppUsesNonExemptEncryption: false` corresponde ao comportamento real: só HTTPS/TLS do sistema. O `expo-crypto` serve apenas para gerar UUIDs, não para cifrar. **[I]**

### 2. Funcionamento completo

- ✅/❔ **Primeiro acesso.** A sequência cadastro → introdução → paywall → tour foi exercitada na prévia web **[E]**. No aparelho: ❔.
- ➖ **Atualização de uma versão anterior.** Não há versão publicada. As chaves antigas de armazenamento local (`flow.activity.v1` e `flow.reminders.v1`) são descartadas de forma segura. **[I]**
- 🔧 **Sem conexão, servidor fora ou erro.** As gravações eram "dispare e esqueça" e **ignoravam o `error` do supabase-js**. Uma despesa lançada offline sumia no próximo início, sem nenhum registro.
  - Agora há uma fila persistente por conta, com novas tentativas (2 s até 60 s) e aviso na Home.
  - O teste de integração cobre: lançamento offline → reiniciar offline → reiniciar online → enviado e limpo. **[E]**
- ✅ **Sessão expirada.** O token é renovado automaticamente, e o erro 401 entra como "tentar de novo" na fila **[I + E unit]**. No aparelho: ❔.
- ✅ **Permissão de notificação negada.** O interruptor continua desligado e a tela mostra o estado. O app funciona sem notificações. **[I]**
- ✅ **Listas vazias** **[E prévia]**. 🔧 **Muitos dados**: a leitura parava em 1.000 linhas, o limite padrão do Supabase. Agora lê por páginas **[I]** (não executado contra o servidor, que está bloqueado aqui).
- 🔧 **Toque duplo em "Add expense"** gravava a despesa duas vezes: **$25,00 por um lançamento de $12,50 [E]**. Corrigido nas duas telas de lançamento; depois da correção, $12,50 **[E]**.
- 🔧 **Campo de valor sem limite.** Colar "99999999999999999999" virava 1e20, que o banco recusa. Agora aceita no máximo 10 dígitos inteiros. **[E]**
- ✅ **Interrupção durante o salvamento.** A mudança é gravada no aparelho antes do envio. **[E]**
- ✅ **Crashes.** Zero erros de página nas prévias. A checagem de assinatura tem timeout de 6 s, então não há carregamento infinito. **[E/I]**
- ❌ **Texto provisório** nos Termos (R1). ❌ O aviso "Prices and purchasing come from the App Store, which this build can't reach." aparece em Release enquanto não houver IAP (faz parte do B1).

### 3. Integridade dos dados financeiros

Os cálculos foram conferidos com exemplos calculados à parte, rodados em **vários fusos horários**, de UTC−11 a UTC+14 **[E]**.

- ✅ **Valores em centavos inteiros.** A soma nunca usa ponto flutuante. As porcentagens do gráfico somam exatamente 100.
- ✅ **Viradas de mês.** Um lançamento às 23:59 de 28/02 conta em fevereiro; um às 00:00 de 01/03 conta em março. Receita, despesa, saldo e "disponível" batem.
- ✅ **Editar e excluir** atualiza todos os totais.
- 🔧 **As assinaturas nunca avançavam de data.** Depois da primeira cobrança, o app mostrava "Today" para sempre, a assinatura saía de "Coming up" e **os lembretes paravam**. Agora a próxima cobrança é calculada a partir da data âncora. **[E]**
- 🔧 **31/01 + 1 mês = 03/03**, com 3 dias de atraso daí em diante. Agora o dia é mantido e ajustado ao tamanho do mês (28/02, depois 31/03). Assinaturas anuais em 29/02 caem em 28/02 nos anos não bissextos. **[E]**
- 🔧 **"Este mês" congelava** se o app ficasse aberto por dias, porque a data era fixada na abertura. Agora é conferida a cada 30 s. **[I]**
- ✅ **Duplicidades.** Cada registro tem UUID gerado no cliente e a gravação é idempotente (upsert), então repetir o envio é inofensivo. Toque duplo corrigido. Na streak, a chave primária impede dias repetidos. **[E]**
- ✅ **Persistência depois de reiniciar.** Os dados vêm do servidor, e o que estiver pendente é sobreposto a eles. **[E]**
- ⚠️ **Dois aparelhos.** Vale a última gravação por registro, e os dados só são recarregados ao abrir o app ou entrar na conta. Um segundo aparelho mostra dados antigos até ser reaberto. Recomendação M3.
- ➖ **Estornos, transferências e parcelas.** O app não tem esses recursos. Cada valor é guardado sem sinal, com a direção (receita ou despesa) à parte.
- ➖ **Exportar, backup e restaurar.** Esses recursos não existem no app. Os textos que prometiam exportação foram corrigidos.
- ✅ **Migrações.** A 0008 foi aplicada e verificada. ⚠️ As migrações 0001 a 0005 foram aplicadas à mão e não aparecem no histórico (opcional: `supabase migration repair`).

### 4. Login e exclusão de conta

- ✅ **Login.** E-mail e senha. ➖ **4.8**: não há login social.
- ⚠️ **Recuperação de senha.** Não existe (foi decisão sua). Quem esquecer a senha perde o acesso e não consegue excluir a conta pelo app. Recomendação M1.
- 🔧 **Sair e trocar de conta.** Os dados eram limpos, mas **os lembretes da conta anterior continuavam chegando** com nome e valor, inclusive depois de excluir a conta. Agora são cancelados ao sair, excluir, trocar de conta ou abrir o app sem ninguém logado. A preferência de lembretes passou a ser por conta. **[I]**
- ✅ **Exclusão dentro do app** (Settings → Delete account):
  - Uma função no servidor apaga as linhas e o usuário de autenticação.
  - Teste real no seu iPhone (sessão anterior): HTTP 200, usuários 9 → 8, nenhuma linha órfã.
  - Hoje o banco tem **0 sessões e 0 refresh tokens**, ou seja, os tokens são revogados junto.
  - O app avisa para cancelar antes a assinatura da App Store, e o link `apps.apple.com/account/subscriptions` está em Settings.
  - A fila local e os lembretes são apagados.
  - **[E/I]**

### 5. Privacidade e permissões

Inventário do que o app trata:

| Dado | Onde fica | Finalidade | Vinculado à pessoa | Retenção | Terceiros |
|---|---|---|---|---|---|
| E-mail | Supabase Auth | Conta | Sim | Até excluir a conta | Supabase (operador) |
| ID da conta | Supabase | Conta, isolamento | Sim | Até excluir a conta | Supabase |
| Despesas, receitas, assinaturas, orçamento | Supabase; no aparelho só enquanto a mudança está pendente | O app | Sim | Até excluir a conta | Supabase |
| Descrições, notas, categorias | Supabase | O app | Sim | Até excluir a conta | Supabase |
| Dias de revisão (streak) | Supabase | Streak | Sim | Até excluir a conta | Supabase |
| Logs de requisição (IP, horário, ID do token) | Supabase (logs) | Segurança, diagnóstico | Sim | Retenção de logs do Supabase | Supabase |
| Flags de onboarding e preferência de lembrete | Somente no aparelho | Interface | — | Local | — (não é "coletado") |
| Assinatura (quando houver IAP) | Apple, RevenueCat, tabela `billing` | Liberar acesso | Sim | Enquanto houver conta | Apple, RevenueCat |

- 🔧 **Política e rótulo contradiziam o app.** Diziam que o app usa IA para categorizar e resumir (não usa), declaravam "Diagnostics" sem SDK, prometiam exportação que não existe e citavam e-mails `legal@flow.app` e `ai@flow.app` que ninguém lê.
  - Tudo foi corrigido. A divulgação de IA agora diz que **não há IA** e que, antes de qualquer envio a uma IA de terceiros, o app perguntará (5.1.2(i)). **[I]**
- 🔧 **Manifesto de privacidade:**
  - Tracking: não.
  - Dados declarados: Email Address, User ID, Other Financial Info, Other User Content, Product Interaction e Other Diagnostic Data, todos vinculados e com finalidade App Functionality.
  - APIs: UserDefaults `CA92.1`, FileTimestamp `C617.1`, SystemBootTime `35F9.1` e DiskSpace `E174.1`.
  - Gerado no prebuild. **[E]**
- ✅ **Permissões.** O app só usa notificação, que dispensa texto no Info.plist. O pedido só aparece quando o usuário liga o recurso. **[I]**
- ➖ **ATT.** Não há rastreamento, anúncios nem data broker.
- ➖ **IA externa.** Não existe.
- ❔ **URLs públicas** `/privacy` e `/support`. A rede daqui está bloqueada. **É preciso publicar o site de novo** para que o texto novo apareça lá.
- ❔ **App Privacy no App Store Connect.** Preenchido por você; use a tabela acima.

### 6. Segurança

- ✅ **Isolamento entre contas** com duas contas fictícias, em SQL com rollback: **22 de 22 verificações passaram**. Uma conta não lê, altera, apaga nem insere dados da outra; não dá para inventar dias passados na streak; não dá para se dar assinatura; o anônimo não acessa nada. **[E]**
- 🔧 **`handle_new_user()` podia ser chamada via API** por anônimos e usuários logados. Como é função de trigger, não vazava dados, mas agora está fechada. Um teste com rollback confirmou que o cadastro continua funcionando. **[E, aplicado ao projeto]**
- 🔧 **Políticas RLS** reescritas com `(select auth.uid())`, por desempenho. Resultado: os **advisors de segurança e de desempenho estão zerados**. **[E]**
- ✅ **Nenhuma chave privilegiada no app.** Só a anon key, via variável de ambiente. **[E]**
- ✅ **Funções do servidor.**
  - `delete-account` pega o usuário do JWT, nunca do corpo da requisição.
  - O webhook do RevenueCat confere o segredo em tempo constante. 🔧 Ele também passou a tratar reembolso, eventos fora de ordem e período vencido (ainda não publicado). **[E unit]**
- ✅ **Logs.** Só `console.warn` de erros; nenhum valor financeiro é registrado. **[I]**
- ⚠️ **O lembrete mostra o valor na tela bloqueada.** Recomendação S5.
- ⚠️ **A sessão fica no AsyncStorage** (sandbox do app, com a proteção de dados do iOS), não no Keychain. Recomendação S4.
- ❌ **Duas funções antigas publicadas**: `dynamic-task` e `super-endpoint`. São cópias da função de exclusão; só apagam a conta de quem as chama, mas aumentam a superfície de ataque. Apague no painel (S3).
- ❔ **Proteção contra senhas vazadas e tamanho mínimo de senha** (hoje 6). Configurações do painel do Supabase.

### 7. Compras e assinaturas

- ❌ **B1.** O IAP não está integrado; não há produtos no App Store Connect nem teste em Sandbox ou StoreKit.
- ✅ **Já pronto (inspeção):**
  - Paywall com o texto exigido pela 3.1.2: preço vindo da loja, período, renovação automática, como cancelar, Termos e Privacidade.
  - Nenhum preço digitado no código. O plano anual mostra **o valor efetivamente cobrado por período**, sem um "equivalente mensal" em destaque.
  - "Restaurar compras" e "Gerenciar assinatura".
  - Liberação de acesso: loja **ou** servidor. 🔧 Uma linha `billing` vencida não libera mais acesso.
- ➖ **Pagamento externo e exceções regionais.** O app não tem outro meio de pagamento; mantenha só o IAP.
- ❔ **Compra pendente (Ask to Buy), expiração e renovação reais.** Dependem do Sandbox e do TestFlight.

### 8. Interface, acessibilidade e streak

- 🔧 **Contraste dos cinzas.** O `chalk-mute` #8E8E93 tinha **3,3:1** e o `chalk-faint` #AEAEB4 tinha **2,2:1**; texto pequeno pede 4,5:1.
  - Agora são #6E6E73 (**5,1:1**) e #8A8A8F (3,4:1, usado só em texto grande, ícones e placeholders).
  - O visual continua branco, preto e cinza, um tom mais escuro. **Se não gostar, reverta só o commit `9acf8e0`.** **[E]**
- 🔧 **VoiceOver.**
  - "Segurar para apagar" não era acessível. Virou ação do VoiceOver em despesas, assinaturas e categorias (os chips de categoria não tinham nenhuma).
  - As linhas agora leem como um botão com rótulo, por exemplo "Lunch, expense $18.50, Food · Today".
  - **[I]**. Testado com VoiceOver real: ❔.
- 🔧 **Links de Termos e Privacidade no paywall** tinham cerca de 14 pt de altura. Viraram botões com área de toque maior. **[I]**
- ✅ **Telas pequenas** (320×568 e 375×667): nenhuma rolagem horizontal nas 5 abas. **[E prévia]**
- ✅ **Movimento reduzido** respeitado na streak. **[E prévia]**
- ✅ **Safe areas** usadas em todas as telas. **[I]**
- ❔ **Texto ampliado (Dynamic Type)** no aparelho. Alguns números da streak limitam a ampliação de propósito (`maxFontSizeMultiplier` de 1.1 a 1.4).
- ✅ **Streak:**
  - Mudança de dia: o app observa a volta ao primeiro plano e a meia-noite.
  - Fuso horário: teste de regressão com Tóquio.
  - Conclusão duplicada: bloqueio de toque único, chave primária e upsert.
  - Retomada depois de uma quebra: estado "resume".
  - Persistência: servidor.
  - **Não bloqueia nenhuma função financeira** e **não exige notificações**.
  - Continua funcionando depois das correções (marco de 7 dias e movimento reduzido). **[E prévia + testes]**
- ⚠️ **Acessibilidade na App Store (Accessibility Nutrition Labels).** Não declare VoiceOver ou Texto Maior como suportados antes de testar no aparelho.
- ✅ **Utilidade e acabamento.** App nativo com identidade própria. A streak é um anel que fecha, sem chama, então não imita outros apps. Registra despesas, receitas, assinaturas com lembretes, orçamento e relatórios. Risco baixo de ser visto como template (4.2/4.3).

### 9. Enquadramento do app e direitos de uso

**O que o Flow faz com dinheiro e dados.** É um caderno digital: a pessoa **digita** despesas, receitas e assinaturas, e o app soma e mostra relatórios. Ele **não se conecta a bancos**, não importa extratos, não guarda nem movimenta dinheiro, não empresta, não investe e não dá recomendação financeira. O único pagamento é a assinatura do próprio app, pela Apple.

- **3.2.1(viii)**: *"Apps used for financial trading, investing, or money management should be submitted by the financial institution performing such services…"*
  - O Flow não presta serviço de gestão de dinheiro: não custodia, não movimenta e não investe.
  - **Risco baixo a moderado**, porque a expressão "money management" é ampla. Mitigação: deixar isso explícito nas notas de revisão.
- **5.1.1(ix)**: *"Apps that provide services in highly regulated fields (such as banking and financial services…) or that require sensitive user information should be submitted by a legal entity…"*
  - O app não presta serviço financeiro regulado, mas trata dados financeiros, que podem ser lidos como "sensitive user information".
  - **Risco moderado** para uma conta de pessoa física. Decisão sua: conta de organização (exige CNPJ e D-U-N-S) ou conta individual com notas claras.
  - Hoje `APP.company` está vazio.
- ✅ **Licenças:**
  - As 28 dependências diretas do app são MIT.
  - Os ícones são desenhados no próprio código, o logo é gerado por script e a fonte é a do sistema.
  - Os serviços usados (Supabase, e depois Apple e RevenueCat) estão declarados na política.
- ⚠️ **Nome "Flow".** É genérico e pode já estar em uso no App Store Connect. Vale uma busca de marca.
- ➖ **Conteúdo público ou UGC compartilhado:** cada pessoa vê só os próprios dados. ➖ **Público infantil:** os Termos exigem 18 anos ou mais. Responda a classificação etária coerente com isso.

### 10. App Store Connect e acesso do revisor

- ❔ **Ficha do app:** nome, subtítulo, descrição (mencionando a assinatura), categoria Finanças, classificação etária e países. Nada disso está no repositório.
- ❔ **Screenshots.** Não existem. Tire no iPhone, com dados fictícios, da versão que for enviada.
- ❔ **URLs de suporte e privacidade.** Publique o site de novo e confira que abrem sem login.
- ✅ **Contato de suporte:** golgherbusiness@gmail.com.
- ❌ **Conta de demonstração.** Pendente (texto das notas abaixo). Barreiras para o revisor: **nenhuma**. Não há SMS, aprovação manual nem conta bancária, e a confirmação por e-mail está desligada.

---

## Tabela de achados

Tipos: **B** = bloqueio · **R** = risco de rejeição · **D** = defeito funcional · **S** = segurança · **A** = acessibilidade · **M** = melhoria opcional

| Prio. | Problema | Evidência | Onde | Requisito | Correção | Status |
|---|---|---|---|---|---|---|
| B1 | Paywall obrigatório sem compra funcionando em Release | [I] `canSkip` só em `__DEV__`; sem `react-native-purchases` | `features/useEntitlement.ts:91`, `lib/purchases.ts`, `app/_layout.tsx` | 2.1(a)(b), 3.1.1 | Integrar IAP ou lançar gratuito | **Pendente (decisão sua)** |
| B2 | Build de produção sem variáveis do Supabase rodava sem conta, sem avisar | [I] + `expo export` | `app/_layout.tsx`, `mobile/eas.json` | 2.1(a) | Tela de erro, `eas.json` e README | Corrigido (falta criar as variáveis no EAS) |
| B3 | Sem conta demo, ficha, screenshots; URLs não verificadas | — | App Store Connect | 2.1(a), 5.1.1(i) | Criar e conferir | **Pendente** |
| R1 | Texto provisório na lei aplicável; arbitragem AAA para consumidor brasileiro | [I] | `features/legal/content.ts` (Termos §12–13) | 2.1(a) | Definir com advogado | **Pendente** |
| R2 | Divulgação de IA descrevia IA inexistente | [I] | `content.ts` | 5.1.2(i), 5.1.1(i) | Reescrita | Corrigido |
| R3 | E-mails legais inexistentes (`legal@flow.app`, `ai@flow.app`) | [I] | `content.ts` | 5.1.1(i) | E-mail de suporte | Corrigido |
| R4 | Sem manifesto de privacidade no app | [E] prebuild | `mobile/app.json` | Required Reason APIs | `ios.privacyManifests` | Corrigido |
| R5 | Strings de câmera, microfone e fotos sem uso | [E] prebuild | `mobile/package.json` | 5.1.1 | Dependências removidas | Corrigido |
| R6 | Política e rótulo declaravam "Diagnostics" sem SDK e prometiam exportação | [I] | `content.ts` | 5.1.1(i), App Privacy | Texto real + logs do servidor declarados | Corrigido |
| R7 | App financeiro publicado por pessoa física | [I] `APP.company` vazio | `src/config/app.ts` | 5.1.1(ix), 3.2.1(viii) | Notas de revisão; avaliar conta de organização | **Pendente (decisão)** |
| D1 | Dados perdidos offline; erros do Supabase ignorados | [E] teste de integração | `src/data/store.tsx`, `outbox.ts`, `backend/data.ts` | 2.1 | Fila persistente e retries | Corrigido |
| D2 | Toque duplo gravava duas vezes ($25 × $12,50) | [E] prévia | `app/add-expense.tsx`, `add-subscription.tsx` | 2.1 | Um salvamento por tela | Corrigido [E] |
| D3 | Valor sem limite (1e20 recusado pelo banco) | [E] | `mobile/src/lib/amount.ts` | — | Máximo de 10 dígitos | Corrigido [E] |
| D4 | Data de cobrança nunca avançava; lembretes paravam | [E] | `src/lib/recurrence.ts`, `reminders.ts`, `subs.tsx`, `review.tsx` | 2.1 | Próxima cobrança derivada | Corrigido [E] |
| D5 | 31/01 + 1 mês = 03/03 | [E] | `recurrence.ts` | — | Dia ajustado ao mês | Corrigido [E] |
| D6 | "Este mês" congelado com o app aberto por dias | [I] | `store.tsx` | — | Data conferida a cada 30 s | Corrigido |
| D7 | Leitura limitada a 1.000 linhas | [I] | `backend/data.ts` | — | Leitura paginada | Corrigido (não testado contra o servidor) |
| D8 | Lembretes da conta anterior continuavam após sair ou excluir | [I] | `lib/notifications.ts`, `app/_layout.tsx` | 5.1.1(v) | Cancelamento ao trocar de conta | Corrigido |
| D9 | Reembolso não tirava o acesso; evento antigo reativava; `billing` "active" para sempre | [E] unit | `supabase/functions/revenuecat-webhook/`, `backend/billing.ts` | 3.1.1 | Lógica testável | Corrigido (webhook não publicado) |
| S1 | `handle_new_user` exposta via RPC | [E] advisor | Banco | Segurança | `revoke execute` | Corrigido e aplicado [E] |
| S2 | RLS reavaliava `auth.uid()` a cada linha | [E] advisor | Banco | Desempenho | `(select auth.uid())` | Corrigido e aplicado [E] |
| S3 | Funções antigas `dynamic-task` e `super-endpoint` publicadas | [E] lista | Supabase | Superfície | Apagar no painel | **Pendente** |
| S4 | Sessão no AsyncStorage, não no Keychain | [I] | `backend/client.native.ts` | Recomendação (OWASP MASVS) | `expo-secure-store` | Opcional |
| S5 | Valor da assinatura na tela bloqueada | [I] | `lib/reminders.ts` | Privacidade | Opção de ocultar | Opcional |
| A1 | Cinzas com contraste de 3,3:1 e 2,2:1 | [E] cálculo | `mobile/tailwind.config.js` e telas | WCAG 1.4.3 | Tons ajustados | Corrigido |
| A2 | Ações de "segurar" inacessíveis ao VoiceOver | [I] | `rows.tsx`, `subs.tsx`, `settings.tsx` | Acessibilidade | Ações do VoiceOver | Corrigido (não testado em VoiceOver) |
| A3 | Links do paywall com cerca de 14 pt de altura | [I] | `PaywallScreen.tsx` | HIG, 44 pt | Botões maiores | Corrigido |
| M1 | Sem "Esqueci minha senha" | [I] | `SignInScreen.tsx` | Qualidade | Fluxo de redefinição | Opcional (sua decisão anterior) |
| M2 | Sem exportação de dados | [I] | — | Qualidade | CSV | Opcional |
| M3 | Segundo aparelho só atualiza ao reabrir | [I] | `store.tsx` | Qualidade | Recarregar ao voltar ao app | Opcional |
| M4 | Migrações 0001–0005 fora do histórico | [E] | Supabase | Manutenção | `migration repair` | Opcional |
| M5 | Manifesto e assinatura do Hermes | — | Build | SDKs de terceiros | Ver avisos do upload | Não verificado |

---

## Alterações realizadas (15 commits, um por assunto; cada um pode ser revertido sozinho)

| Commit | O que muda |
|---|---|
| `f191fb1` | Um salvamento por toque; valor máximo de 10 dígitos |
| `b06752f` | Fila offline persistente: nada se perde sem conexão; aviso na Home; leitura paginada |
| `155de97` | Próxima cobrança de assinatura calculada corretamente; lembretes continuam |
| `44a1f04` | "Este mês" atualiza se o app ficar aberto por dias |
| `8b5bb0c` | Lembretes cancelados ao sair, excluir ou trocar de conta; preferência por conta |
| `d4b3c99` | `eas.json` e tela de erro em Release sem configuração |
| `ee9c683` | Módulos nativos sem uso removidos (e as permissões de câmera, microfone e fotos) |
| `49c8262` | Manifesto de privacidade |
| `08809df` | Textos legais conforme o app real (sem IA, e-mails reais, sem exportação) |
| `9acf8e0` | Contraste dos cinzas, ações do VoiceOver, links maiores (**reverta só este** se não gostar dos tons) |
| `7f6201e` | Banco: função de cadastro fechada à API e RLS otimizada (**já aplicado ao projeto Supabase**) |
| `52f04ba` | Assinaturas: reembolso, eventos fora de ordem e período vencido |
| `48d573a` | Logs do servidor declarados como diagnóstico (manifesto e rótulo) |
| `469b316` | Testes de lembretes comparam a data local (passam em qualquer fuso) |
| (este) | Este relatório |

Para desfazer a mudança do banco (`7f6201e`), aplique:

```sql
grant execute on function public.handle_new_user() to public;
```

e volte as políticas para `auth.uid()`. Na prática, não é necessário.

### Validação executada (versão final `469b316`)

| Comando | Resultado |
|---|---|
| `npx vitest run`, em 8 fusos (UTC−11 Pago Pago, Los Angeles, São Paulo, UTC, Londres, Tóquio, UTC+14 Kiritimati) | 15 arquivos, **126 testes passando** em cada fuso |
| `npx tsc --noEmit` (raiz) e `cd mobile && npx tsc --noEmit` | 0 erros nos dois |
| `npm run build` (site legal) | OK |
| `cd mobile && npm run check:native` | Versões nativas batem com o SDK 57 |
| `cd mobile && npx expo export --platform ios` | 1 bundle Hermes gerado; varredura sem segredos |
| `npx expo prebuild --platform ios --no-install --clean` (cópia descartável) | Info.plist sem strings de permissão; `PrivacyInfo.xcprivacy` gerado com os tipos e as APIs |
| Prévia web com Playwright, sem backend | Toque duplo = $12,50 · valor máximo 9.999.999.999 · 320×568 e 375×667 sem rolagem horizontal · streak (marco, movimento reduzido, sem repetir a animação) · 0 erros de página |
| Supabase, SQL com rollback | Cadastro + RPC negada · isolamento 22/22 · advisors 0/0 · banco final com 0 usuários e 0 linhas |

**Não executado** (sem Mac, iPhone ou rede): build Release assinado, TestFlight, VoiceOver e Dynamic Type reais, notificações reais, compra em Sandbox, fluxos contra o Supabase real a partir do app, URLs públicas.

Os testes de lembretes comparavam datas em UTC e por isso falhavam em UTC+14 (Kiritimati). Três deles eram antigos e já falhavam antes das mudanças. Agora comparam a data local e passam de UTC−11 a UTC+14.

---

## Pendências que dependem de você (em ordem)

1. **Decidir a monetização (B1).**
   - (A) **IAP agora:**
     - Entrar no Apple Developer Program e aceitar o contrato de apps pagos (dados fiscais e bancários).
     - Criar 2 assinaturas num grupo, com período de teste gratuito.
     - Configurar o RevenueCat (projeto, entitlement `pro`, offering).
     - Me passar a chave pública do iOS para eu integrar o `react-native-purchases`.
     - Publicar o `revenuecat-webhook` com o segredo.
   - (B) **Lançar gratuito primeiro:** me peça e eu tiro o paywall do fluxo.
2. **Conta de desenvolvedor:** pessoa física ou organização (R7). Trader status, se for distribuir na UE.
3. **EAS:**
   - Rode `eas env:create` com a URL e a anon key (comandos no `mobile/README.md`).
   - Rode `eas build --profile production`. Confira no log que o Xcode é o 26 e o SDK é o iOS 26.
   - Veja se o upload traz avisos ITMS.
4. **Jurídico:**
   - Lei e foro aplicáveis (R1).
   - Revisar a arbitragem para consumidores brasileiros (CDC).
   - Nome do vendedor ou da empresa (`APP.company`).
   - Idade mínima coerente com a classificação etária.
5. **Publicar o site de novo** (`/privacy` e `/support`) com os textos novos e confirmar que abrem sem login.
6. **App Store Connect:**
   - Nome (verifique se "Flow" está disponível), subtítulo, descrição mencionando a assinatura, categoria Finanças.
   - Questionário de classificação etária.
   - App Privacy (tabela da seção 5).
   - URLs.
   - Screenshots com dados fictícios.
   - Contato para a revisão.
7. **Conta de demonstração** com dados fictícios, e as notas de revisão abaixo preenchidas.
8. **Supabase:**
   - Apagar `dynamic-task` e `super-endpoint`.
   - Opcional: proteção contra senhas vazadas e senha mínima de 8 caracteres; apagar o bucket `receipts`, que não é usado; `migration repair`.
9. **Recomendações** para decidir: "esqueci a senha" (M1), sessão no Keychain (S4), ocultar valores na tela bloqueada (S5), exportação (M2), atualizar ao voltar ao app (M3).

## Roteiro curto para o TestFlight

1. **Primeiro uso.** Instale limpo e crie uma conta com e-mail fictício. Passe pela introdução, depois pelo paywall (compra em Sandbox, ou nada se for gratuito) e pelo tour.
2. **Lançamentos.** Adicione $12,50 com **toque duplo** em salvar: deve surgir **um** lançamento. Adicione uma receita e defina um orçamento. Confira na Home: gasto, receita, economia e disponível.
3. **Sem conexão.** Ative o **modo avião** e adicione uma despesa: aparece o aviso "1 change not saved yet". **Feche o app à força** e reabra: a despesa continua lá. Desative o modo avião: o aviso some. Reinstale ou use outro aparelho: a despesa está lá.
4. **Assinaturas e lembretes.** Crie uma assinatura mensal "Today", ligue os lembretes e **negue** a permissão: o interruptor deve continuar desligado. Permita e use "enviar lembrete de teste".
5. **Streak.** Toque em **Revisar meu dia**: a streak vai para 1, com animação. Feche e reabra: continua 1. O botão não permite uma segunda revisão no mesmo dia.
6. **Acessibilidade.**
   - **VoiceOver:** numa despesa, "Ações → Delete".
   - **Texto maior** no máximo: Home, Settings e Paywall legíveis.
   - **Reduzir movimento** ligado.
7. **Troca de conta.** **Saia**: nenhum lembrete deve continuar agendado. Entre com outra conta: nenhum dado da primeira aparece.
8. **Exclusão.** **Exclua a conta**: o app volta ao login, e entrar com a mesma senha falha.
9. **Compras (se houver IAP).** Restaurar compras, Gerenciar assinatura, cancelar no Sandbox e esperar expirar: o acesso é removido.
10. **Pós-upload.** Leia os e-mails do App Store Connect atrás de avisos ITMS.

## App Review Notes (rascunho, em inglês)

```
Flow is a personal expense tracker. Users type in their own expenses, income,
recurring subscriptions and a monthly budget; the app adds them up and shows
monthly reports.

What Flow does not do: it does not connect to banks or any financial
institution, does not import transactions, does not hold, move, transfer,
invest or lend money, and gives no financial advice. The only payment in the
app is Flow's own auto-renewable subscription, sold with Apple In-App Purchase.

SIGN-IN
Email and password (no third-party login). Demo account with sample data:
  Email:    [DEMO_EMAIL]
  Password: [DEMO_PASSWORD]
Email confirmation is off, so a new account can also be created in the app.

SUBSCRIPTION
After sign-in and a two-screen introduction, a paywall offers
[MONTHLY_PRODUCT_ID] and [YEARLY_PRODUCT_ID] ([TRIAL_LENGTH] free trial).
Prices come from StoreKit. "Restore purchases" is on the same screen;
"Manage subscription" is in Settings.
[IF LAUNCHING FREE: replace this section with "There are no in-app purchases."]

ACCOUNT DELETION
Settings > Delete account. It deletes the account and all of its data at once,
on our server. Users with an App Store subscription are told to cancel it first
(Settings also links to apps.apple.com/account/subscriptions).

STREAK
The streak counts days on which the user completes a short daily review
("Review my day" on Home). It never asks the user to spend, log a minimum or
save, and it does not depend on notifications.

NOTIFICATIONS
Optional local reminders before a tracked subscription renews. Off until the
user turns them on in Settings; the app works fully without them.

DATA
Stored in our Supabase database and isolated per account with row-level
security. No ads, no analytics SDKs, no tracking, no AI.

Contact: [YOUR_NAME] · [PHONE] · golgherbusiness@gmail.com
Seller / legal entity: [SELLER_NAME]
```
