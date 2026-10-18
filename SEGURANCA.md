# Auditoria de segurança — Flow

**Data:** 27–28/09/2026 · **Versão auditada:** 0.2.0 · **Branch:** `claude/security-audit-lo7kuy`, de `cc4990c` (ponto de restauração) a `b906742`.

Cada correção está em um commit separado e pode ser desfeita sozinha com `git revert <hash>`, ou todas juntas voltando a `cc4990c`. A lista está em [§6](#6-alterações-realizadas).

---

## Parecer

O isolamento entre contas está sólido: nas 38 verificações com duas contas, o banco recusou todos os ataques menos um (gravar um arquivo na pasta de outra conta), que está corrigido na migração preparada. Os riscos que importam para o lançamento estão em outro lugar:

- a exclusão de conta sem confirmação;
- a falta de limites e de backups no servidor;
- a sessão guardada fora do Keychain.

A parte do app já foi corrigida. A parte do servidor está preparada e testada, e **cinco passos externos devem ser feitos antes do lançamento** ([§8](#8-parecer-o-que-bloqueia-o-lançamento)).

---

## 1. Resumo dos riscos mais importantes

1. **Sem backups e sem ambiente separado (Alta, operacional).**
   - O projeto está no plano Free do Supabase, que não tem backups diários acessíveis.
   - O mesmo banco serve para desenvolvimento e produção.
   - Um erro de migração, um script ou uma exclusão apagaria os registros financeiros de todos os usuários, sem restauração.
2. **Exclusão de conta só com a sessão (Média).**
   - A função publicada apaga a conta inteira com qualquer token válido, sem pedir a senha, até por um `GET` simples.
   - Há ainda **duas funções esquecidas** publicadas que fazem o mesmo.
   - Quem pegar o celular desbloqueado, ou copiar um token, apaga tudo. Somado ao item 1, é irreversível.
3. **Sem limites no servidor (Média).**
   - A API aceitava textos de megabytes, valores negativos, frequências inventadas, linhas sem limite e upload na pasta de outra conta.
   - Uma única conta gratuita consegue encher os 500 MB do plano e derrubar o serviço para todos os assinantes.
4. **Sessão fora do Keychain (Média).**
   - O refresh token ficava no AsyncStorage: um arquivo comum, que vai para os backups do iPhone.
   - Corrigido: agora fica no Keychain, preso ao aparelho.
5. **Senha trocada só com a sessão (Média).**
   - Quem tem a sessão podia trocar a senha e trancar o dono fora.
   - Corrigido no app. O servidor precisa passar a exigir a senha atual (ajuste no painel).
6. **Assinatura exigida só pela tela (Média, receita).**
   - O paywall é uma tela; o banco aceita escritas de qualquer conta.
   - Preparada uma trava no servidor para depois que o webhook estiver no ar.

---

## 2. Referências e método

| Referência | Versão | Data da versão | Consultada em | Como |
|---|---|---|---|---|
| OWASP MASVS | v2.1.0 | 18/01/2024 | 27/09/2026 | Releases no GitHub da OWASP (a rede bloqueia mas.owasp.org) |
| OWASP MASTG | v2.0.0 | 30/06/2026 | 27/09/2026 | Idem |
| OWASP ASVS | 5.0.0 | 30/05/2025 | 27/09/2026 | Idem |
| OWASP API Security Top 10 | 2023 | 2023 | 27/09/2026 | Idem |
| Apple — [Security](https://developer.apple.com/security/) | página viva | — | 27/09/2026 | Busca web |
| Apple — `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, `NSAllowsLocalNetworking`, *Preparing your UI to run in the background* | página viva | — | 28/09/2026 | API JSON da documentação da Apple (as páginas HTML dependem de JavaScript) |
| Supabase — *Password security*, *Database Backups* | página viva | — | 28/09/2026 | Busca na documentação pelo conector |

### Classificação das evidências

| Marca | Significado |
|---|---|
| **[C]** | Vulnerabilidade confirmada por análise de código. |
| **[R]** | Reproduzida em teste, com o comando e o resultado registrados. |
| **[S]** | Suspeita que precisa de confirmação. |
| **[V]** | Controle verificado, funcionando. |
| **[N]** | Não verificado, ou não aplicável ao app. |

### Ambiente e limites

- **Onde rodou:** contêiner Linux, sem macOS, Xcode ou iPhone.
- **Rede bloqueada:** a saída de rede bloqueia `supabase.co`, `vercel.app`, `revenuecat.com` e `apple.com` por HTTP. Nenhuma requisição HTTP foi feita à API real.
- **Como o banco foi testado:** pelo conector do Supabase, no próprio Postgres do projeto **flow** (Postgres 17.6, us-east-1). Os testes usaram os mesmos papéis (`authenticated`, `anon`) e as mesmas *claims* de JWT que a API usa. Por isso, o que a RLS e os grants permitem ali é o que a API REST permite.
- **Dados:** só contas fictícias (`audit-a@example.test`, `audit-b@example.test`), criadas dentro de transações que terminam em `RAISE EXCEPTION`. Nada persiste. Depois de cada teste, conferi que o banco seguia com os mesmos 7 lançamentos reais, sem usuários de teste nem objetos novos. Das tabelas reais, só li contagens. Dos logs, li as mensagens com e-mails e ids mascarados na própria consulta. Nenhum dado pessoal está neste relatório.

---

## 3. Arquitetura e ameaças

### Tecnologias

| Camada | O que é |
|---|---|
| App iOS | Expo SDK 57, React Native 0.86 (Hermes), expo-router, NativeWind. Sem WebView, sem clipboard, sem upload, sem importação/exportação, sem Face ID/PIN. |
| Autenticação | Supabase Auth, e-mail + senha, confirmação de e-mail **desligada** (decisão de produto). Sem OAuth, sem magic link no app (`detectSessionInUrl: false`). |
| Dados | Postgres do Supabase, via PostgREST. Com RLS nas 8 tabelas. Bucket `receipts` privado e vazio (o app não envia arquivos). |
| Funções | `delete-account` (publicada), `revenuecat-webhook` (**não publicada**), `dynamic-task` e `super-endpoint` (publicadas, **não usadas pelo app**). |
| Pagamentos | StoreKit (Apple) via RevenueCat (`react-native-purchases` 10.10.2). Entitlement `pro`. |
| Notificações | Somente locais, agendadas no próprio iPhone. Não há servidor de push. |
| Web | Site estático na Vercel, só com páginas legais e de suporte, sem login. |
| Terceiros | RevenueCat recebe o UUID da conta. Sem analytics, sem relatório de falhas, sem IA, sem integração bancária. |

### Fluxo de dados

| Dado | Entra por | Onde fica | Para onde vai | Quem acessa |
|---|---|---|---|---|
| E-mail e senha | Tela de login | Supabase Auth; senha com hash bcrypt, gerida pelo Supabase | — | O próprio usuário; administradores do projeto |
| Sessão (access e refresh token) | Supabase Auth | **Keychain** (antes: AsyncStorage) | Cada requisição, por HTTPS | O app |
| Lançamentos, assinaturas acompanhadas, categorias, orçamento, preferências | App | Memória, fila local de pendentes (AsyncStorage, por conta) e Postgres | Supabase | Dono (RLS); funções com service role; administradores |
| Dias da streak | Revisão diária | Postgres | — | Dono (só insere hoje ±1 dia) |
| Status da assinatura do Flow | Apple → RevenueCat → webhook | RevenueCat e tabela `billing` | — | Dono (só leitura); webhook (escrita) |
| UUID da conta | Supabase | RevenueCat (`app_user_id`) | RevenueCat | RevenueCat; Apple vê a compra |
| Lembretes | App | Agendados no iOS | Tela bloqueada | Quem estiver com o aparelho |

### Cenários priorizados e onde terminaram

| Cenário | Resultado |
|---|---|
| A lê ou altera dados de B trocando identificadores | **Bloqueado** [V] — [§5](#5-isolamento-entre-contas-a-e-b-prioridade-máxima) |
| Invasão de conta (sessão roubada, aparelho desbloqueado) | Sessão no Keychain; senha exigida para excluir e para trocar a senha; logout global [V] |
| Vazamento de informação financeira no aparelho | Prévia do seletor de apps, notificações e logs corrigidos |
| Alteração de proprietário ou de privilégios | Bloqueado pela RLS com `WITH CHECK` [V]; o usuário não consegue se dar assinatura [V] |
| Exposição de credenciais | Nenhuma encontrada no código, no histórico (84 commits) ou no bundle [V] |
| Abuso do serviço | Limites e teto por conta na 0009; assinatura no servidor na 0010 (preparadas) |
| Perda de dados | **Sem backup** — pendente |

---

## 4. Tabela de achados

Ordem: impacto × exposição × condições para explorar. Detalhes e comandos nas seções seguintes.

| ID | Severidade | Problema | Evidência | Componente | Cenário de exploração | Correção | Status |
|---|---|---|---|---|---|---|---|
| S-01 | **Alta** (operacional) | Sem backups acessíveis e sem ambiente separado | [V] organização no plano `free`; documentação do Supabase: backups diários só no Pro ou acima; um único projeto ativo | Infraestrutura Supabase | Um erro ou incidente apaga os dados de todos sem restauração; testes e scripts rodam no banco de produção | Backup diário e projeto de desenvolvimento | **Pendente externo** (P5, P6) |
| S-02 | Média | Exclusão da conta só com a sessão, inclusive por `GET` | [R] código publicado (v2) rodado com clientes simulados: `POST` sem senha → `200 {"deleted":true}`; `GET` → conta apagada | Edge Function `delete-account` | Celular desbloqueado ou token copiado → histórico inteiro apagado, sem volta (S-01) | Senha exigida e verificada no servidor antes de apagar; só `POST`; mensagens genéricas; painel com senha no app | Corrigido no código (`1560632`); **publicação pendente** (P1) |
| S-03 | Média | Duas funções esquecidas publicadas apagam contas só com a sessão | [C] código lido pela API do Supabase: `dynamic-task` v1 e `super-endpoint` v1, não chamadas pelo app; devolvem erros crus | Edge Functions | Contornam a senha exigida em S-02 depois que ela for publicada | Excluir as duas | **Pendente externo** (P2) |
| S-04 | Média | Sem limites no servidor (texto, valor, enums, quantidade de linhas, pasta de upload) | [R] como A: descrição de 5.000.000 caracteres, valor −500000, moeda `not-a-currency`, frequência `hourly` com intervalo 0, locale de 100.000 caracteres, 2.000 orçamentos, arquivo na pasta de B — tudo aceito | Postgres/PostgREST, Storage | Uma conta gratuita enche o banco (500 MB) e derruba o serviço (API4:2023); valores que o app não exibe | Migração 0009: CHECKs, teto por conta, grants mínimos, regras do bucket | Preparado e validado; **aplicação pendente** (P3) |
| S-05 | Média | Sessão (refresh token) em AsyncStorage | [C] `client.native.ts` usava `storage: AsyncStorage` | App iOS | Token extraído de backup sem criptografia ou de aparelho com jailbreak → acesso à conta até a revogação (MASVS-STORAGE-1) | Keychain `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, migração automática, sessão descartada na reinstalação | Corrigido (`068167b`) — chega no próximo build |
| S-06 | Média | Troca de senha só com a sessão | [C] `updateUser({ password })` sem a senha atual | App e Supabase Auth | Com a sessão, o invasor troca a senha e tranca o dono fora (ASVS V6) | App envia `current_password`; o servidor precisa exigir | Parcial: app corrigido (`87a6bcd`); **ajuste no painel** (P4) |
| S-07 | Média | Assinatura exigida só pelo paywall | [C] políticas só checam o dono; [R] conta sem `billing` grava normalmente | Postgres, app | Conta gratuita usa a API direto, ou app com o paywall removido num aparelho com jailbreak (API6:2023) | 0010: escritas sem assinatura recusadas com HTTP 402; app mantém o 402 na fila | Preparado e validado; aplicar depois do webhook (P7, P8) |
| S-08 | Baixa | Compra ou restauração sob id anônimo ou da conta anterior; acesso de uma conta liberado pela assinatura de outra no mesmo aparelho | [R] testes com loja simulada: **falham na versão anterior** e passam na nova | App (`purchases.ts`) | Troca de conta sem conexão no mesmo iPhone: B entra com a assinatura de A; a compra não chega à linha `billing` da conta | Compra e restauração só depois de a loja confirmar a conta; checagem compara o `app_user_id` | Corrigido (`4a43ecf`) |
| S-09 | Baixa | Webhook ignorava `TRANSFER`, repetia eventos de conta excluída para sempre e revelava a configuração | [C] lia só `app_user_id`; [S] formato do `TRANSFER` (`transferred_from/to`) segundo a documentação pública do RevenueCat, não visto num evento real | `revenuecat-webhook` (não publicado) | Duas contas usam uma assinatura até o fim do período | Trata `TRANSFER`, ignora conta excluída, responde 503 genérico, só `POST` | Corrigido no código (`d563f75`); publicação em P7 |
| S-10 | Baixa | Prévia no seletor de apps mostrava saldos e lançamentos | [C] nada escondia a tela; Apple: *"Your app's UI must not contain any sensitive user information… remove it from your views when entering the background"* | App iOS | Quem pega o aparelho vê valores sem Face ID (MASVS-PLATFORM-3) | Capa branca com o logo em `inactive`/`background` | Corrigido (`4a05856`); [R] validado no build web |
| S-11 | Baixa | Notificações com valores na tela bloqueada | [C] `"$15.99 is due"` no corpo | App iOS | Terceiros leem quanto e com o quê a pessoa gasta | Valor só com "Show amounts" ligado (padrão: desligado) | Corrigido (`1b86419`) |
| S-12 | Baixa | Senha mínima de 6 caracteres; proteção contra senhas vazadas desligada | [C] `MIN_PASSWORD_LENGTH = 6`; [V] advisor do Supabase: `auth_leaked_password_protection` | Supabase Auth | Senhas fracas ou vazadas facilitam *credential stuffing* | App exige 8 em senhas novas; mínimo 8 no servidor (P4); senhas vazadas exigem o plano Pro | Parcial |
| S-13 | Baixa | Enumeração de contas no cadastro | [R] log de auth: `422 user_already_exists`; [C] tela mostra "already has an account" | Supabase Auth | Descobrir se um e-mail usa o Flow | Consequência de a confirmação de e-mail estar desligada; CAPTCHA e limites de taxa recomendados | Risco aceito por ora (P9) |
| S-14 | Baixa | ATS permitia HTTP para a rede local em builds de loja | [C] template do Expo 57.0.27: `NSAllowsLocalNetworking = true` | App iOS (Info.plist) | Conexão sem TLS a um IP ou `.local` numa rede hostil | `app.config.js` desliga fora do perfil `development` | Corrigido (`ddfacb8`); [R] validado com `expo prebuild` |
| S-15 | Baixa | Avisos de sincronização no log do aparelho em release | [C] dois `console.warn` com erros do servidor | App iOS | Mensagens sobre registros financeiros no log do sistema (Console.app, sysdiagnose) | `devWarn`, só com `__DEV__` | Corrigido (`4461b0a`) |
| S-16 | Baixa | Site legal sem CSP, sem proteção contra *framing* e sem `nosniff` | [C] `vercel.json` sem headers | Site na Vercel | Clickjacking ou injeção em páginas públicas (impacto baixo: sem login nem dados) | Headers estritos (CSP só `'self'`) | Corrigido (`c276d9d`); [R] validado localmente; ao vivo **não verificado** |
| S-17 | Informativa | Privilégios além do necessário: `anon` com 56 privilégios de tabela; `TRUNCATE` para `authenticated`; perfil editável pelo dono | [R] B07–B09 | Postgres | Nenhum explorável hoje (a RLS bloqueia; a API não emite `TRUNCATE`); é a segunda tranca | Incluído na 0009 | Preparado |
| S-18 | Informativa | Dependências com avisos | [V] `npm audit` (detalhes em [§7.7](#77-segredos-e-dependências)) | Web, build, app | Nenhum caminho explorável encontrado | Plano de atualização; nada forçado | Monitorar |
| S-19 | Informativa | Não há recuperação de senha no app | [C] nenhuma chamada a `resetPasswordForEmail` | Autenticação | Quem esquece a senha depende do suporte, que não tem como provar identidade (risco de engenharia social) | Implementar reset por código OTP do Supabase (uso único, validade curta) | Recomendação |

---

## 5. Isolamento entre contas A e B (prioridade máxima)

Script: [`supabase/tests/isolation_probe.sql`](supabase/tests/isolation_probe.sql). Ele pode ser rodado de novo no SQL Editor a qualquer momento: sempre desfaz tudo. Resultado em 28/09/2026:

| # | Ataque de A contra B (ou anônimo) | Resultado |
|---|---|---|
| T01–T09 | Ler lançamentos, assinaturas, categorias, orçamento, preferências, cobrança, streak e perfil (e-mail) de B, por id e por `user_id`; `select` sem filtro | **Bloqueado** — 0 linhas |
| T10–T17 | Alterar ou excluir as mesmas linhas de B | **Bloqueado** — 0 linhas afetadas |
| T18–T19 | Inserir registros com `user_id` de B no corpo | **Bloqueado** — 42501 |
| T20–T22 | *Upsert* reaproveitando a chave primária de B (o que uma operação de sincronização adulterada enviaria) | **Bloqueado** — 42501 |
| T23–T24 | Transferir a própria linha para B; reescrever o próprio `id` | **Bloqueado** — 42501 |
| T25–T27 | Dar-se assinatura ativa; editar a própria cobrança; revogar a de B | **Bloqueado** |
| T28–T29 | Inserir dia de streak para B; reconstruir a própria streak 10 dias para trás | **Bloqueado** — 42501 |
| T31 | Listar ou ler o arquivo de B no bucket | **Bloqueado** |
| T32 | Gravar um arquivo **na pasta de B** | **Aceito** → corrigido na 0009 (A13: recusado com 42501) |
| T35–T36 | Anônimo (chave pública, sem sessão) lê ou insere em qualquer tabela | **Bloqueado** |
| T30, T33, T34 | Uso legítimo de A: registrar o dia, ler e editar o próprio lançamento | **Funciona** |
| T37–T38 | Dados de B intactos depois de tudo | **Confirmado** |

### Outros controles verificados [V]

- **O filtro no app não é o controle.** `data.ts` filtra por `user_id` só para usar o índice. T09 mostra que um `select` sem filtro também só devolve as linhas do próprio usuário.
- **Endpoints administrativos.** A única função privilegiada do banco é `handle_new_user` (`SECURITY DEFINER`). Ela está sem `EXECUTE` para `anon` e `authenticated` (migração 0008), então não é chamável pela API. Não há extensão GraphQL instalada.
- **Função de exclusão.** O id vem do token verificado, nunca do corpo: um `userId` de outra pessoa no corpo é ignorado (teste de `delete-account`).
- **Arquivos.** O bucket é privado; ler e excluir exige ser o dono. Não há links públicos nem URLs assinadas no app.

---

## 6. Alterações realizadas

Todas na branch `claude/security-audit-lo7kuy`. Para desfazer uma: `git revert <hash>`.

| Commit | O que muda | Onde |
|---|---|---|
| `068167b` | Sessão no Keychain (device-only), migrada do AsyncStorage; sessão órfã descartada na reinstalação | App |
| `4a05856` | Capa com o logo sobre o app no seletor de apps | App |
| `1b86419` | Valores fora das notificações por padrão ("Show amounts" nos lembretes) | App |
| `87a6bcd` | Troca de senha pede a senha atual; mínimo de 8 caracteres em senhas novas | App |
| `1560632` | Exclusão confirmada com senha, verificada pela função; só `POST`; erros genéricos | App e função (publicar) |
| `6b945f2` | Migração 0009 preparada, com os scripts de teste de isolamento e de limites | `supabase/prepared`, `supabase/tests` |
| `4a43ecf` | Compra, restauração e checagem de acesso só como a conta logada | App |
| `d563f75` | Webhook: `TRANSFER`, conta excluída, 503 genérico, só `POST` | Função (publicar) |
| `eb4318d` | Migração 0010 preparada (assinatura no servidor); fila do app mantém o 402 | `supabase/prepared`, app |
| `4461b0a` | Avisos de sincronização só em desenvolvimento | App |
| `ddfacb8` | ATS sem exceção de rede local em builds de loja | `mobile/app.config.js` |
| `c276d9d` | Headers de segurança no site legal | `vercel.json` |
| `b906742` | Painel de exclusão: botões empilhados (ajuste visual) | App |

A identidade visual foi mantida: branco predominante, preto e cinza, os mesmos componentes (`Button`, `Input`, cartões com borda). A capa do seletor de apps é branca com o logo preto.

### 6.1 Testes executados e resultados

| Verificação | Ambiente | Resultado |
|---|---|---|
| Testes automatizados (Vitest 2.1.9) | Contêiner Linux, jsdom | **171 testes em 22 arquivos, todos passando** (antes: 132 em 16). Os 39 novos: 11 de sessão/Keychain, 4 de troca de senha, 6 da função de exclusão, 5 de vínculo compra↔conta, 10 do webhook, 1 de notificação, 2 de log. Mais duas asserções em testes existentes: a fila mantém o 402 e a senha chega à chamada de exclusão |
| Os testes pegam o defeito? | Idem | Os de compra rodados contra o `purchases.ts` anterior: **2 falham** (compra anônima; conta B com a assinatura de A). A função de exclusão publicada, com os mesmos clientes simulados, **apaga sem senha e por `GET`** |
| Verificação de tipos (`tsc`) | Web e app | 0 erros nos dois projetos |
| Bundle iOS (`expo export`, Hermes) | Metro, SDK 57 | Gera o bundle (6,4 MB); as strings das correções estão nele |
| Info.plist (`expo prebuild`, template 57.0.27) | `EAS_BUILD_PROFILE` production / development | `NSAllowsLocalNetworking` **false** / **true**; `NSAllowsArbitraryLoads` false nos dois |
| Capa do seletor de apps | Build web do app + Chromium (Playwright), simulando segundo plano | Em segundo plano, Home e o modal de despesa mostram só o logo (0,21% de pixels escuros); na volta, conteúdo igual e o valor digitado (12,50) mantido |
| Configurações | Idem | Painel de exclusão com aviso, senha e botões; "Cancel" fecha; sem erros de script |
| Site legal com os headers | Build de produção servido localmente com o `vercel.json` | 6 rotas renderizam; **0 violações de CSP**; o site não abre dentro de `iframe` |
| Isolamento A/B | Banco do projeto, transação desfeita | 37 de 38 verificações OK (ataques recusados, uso legítimo funcionando); a que falhou (T32) está corrigida na 0009 |
| Limites antes da 0009 | Idem ([`limits_probe.sql`](supabase/tests/limits_probe.sql)) | 8 abusos aceitos, 56 privilégios do `anon`, `TRUNCATE` em 8 tabelas, bucket sem limite |
| 0009 aplicada dentro de uma transação desfeita | Idem | **24 verificações OK em 172 ms**: todo abuso recusado (23514 ou 42501); todas as escritas legítimas do app, nos limites, *upserts* e exclusões, passam; cadastro continua criando as linhas padrão; isolamento inalterado |
| Custo do teto de linhas | Idem | 20.000 linhas numa instrução: 321 ms; nova linha com 20.000 existentes: 5,5 ms; edição: 0,3 ms |
| 0010 aplicada dentro de uma transação desfeita | Idem | **14 verificações OK em 115 ms**: sem assinatura, escrever dá PT402 (HTTP 402); ler e excluir continuam; o usuário não se dá assinatura; trial e renovação atrasada passam; assinatura vencida é recusada; service role não é afetado |
| Depois de cada teste | Idem | 0 objetos novos, 0 usuários de teste, 7 lançamentos reais intactos |

**Incidente durante os testes.** A primeira medição de desempenho da 0009 usou a versão do teto de linhas que contava as linhas a cada linha inserida. Semear 20.000 linhas ficou quadrático: passou de 60 s, segurando travas nas tabelas do app por cerca de 90 s, até eu cancelar o processo.

- **Efeito:** a transação foi desfeita inteira. Conferi depois que não sobrou nenhum objeto, trava ou usuário de teste.
- **Tráfego:** não houve requisições do app no período; a última foi às 00:04 UTC.
- **O que mudou:** o defeito levou ao desenho por instrução, que é o que está na migração.
- **Lição:** testes com volume não devem rodar no banco de produção. É mais um motivo para P6.

---

## 7. Achados por área

### 7.1 Autenticação e sessões

| Item | Situação |
|---|---|
| Armazenamento de senhas | [V] Feito pelo Supabase Auth (bcrypt). O projeto não guarda senhas. |
| Cadastro e login | [V] O login responde a mesma mensagem para senha errada e para e-mail inexistente. [R] O cadastro revela e-mail já usado (S-13). |
| Recuperação de senha | [N] Não existe no app (S-19). Tokens de recuperação não se aplicam hoje. |
| Alteração de e-mail | [N] Não existe no app. |
| Tentativas excessivas | [N] Os limites de taxa do Supabase Auth ficam no painel e não foram visíveis por aqui. Sem CAPTCHA. |
| Validação dos tokens | [V] Pelo código e pela configuração: a API e as funções validam o JWT (`verify_jwt: true` na exclusão; `getUser()` confere no servidor de auth). [N] Não reproduzido por HTTP. |
| Logout | [V] O `signOut()` do supabase-js 2.116 usa `scope: 'global'`: revoga os refresh tokens de todos os aparelhos. O access token segue válido até expirar (JWT sem estado; padrão de 1 h). |
| Pós-logout no aparelho | [V] Sessão removida (Keychain e AsyncStorage); lembretes cancelados no iOS; tela zerada; a loja volta a anônimo. A fila de pendentes da conta fica, de propósito, para não perder o que não foi enviado; volta a ser enviada no próximo login dessa conta. |
| Pós-exclusão | [V] Função remove linhas, arquivos e o usuário; o app limpa a fila, as preferências de lembrete e as flags da conta. |
| Reautenticação proporcional | Corrigido: senha para excluir (verificada no servidor) e para trocar a senha (verificada pelo servidor após P4). |
| OAuth, PKCE, state, nonce | [N] Não há OAuth. |
| Face ID/PIN | [N] Não implementado. A capa do seletor de apps não depende disso, e a autorização é sempre do servidor. |

### 7.2 Dados no aparelho

| Onde | O que guarda | Proteção |
|---|---|---|
| Keychain | Sessão | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`. A Apple diz que esses itens *"do not migrate to a new device"*. Descartada se o app for reinstalado. |
| AsyncStorage (arquivo no contêiner) | Fila de alterações ainda não enviadas (por conta), preferências de lembrete e flags do primeiro uso | Proteção de dados padrão do iOS (criptografado com o aparelho bloqueado depois do boot). Pode ir para backups. A fila só tem conteúdo enquanto há alterações pendentes. |
| Notificações agendadas | Nome da assinatura e, se o usuário quiser, o valor | Canceladas no logout e na troca de conta. |
| Logs | Nada em release | `devWarn`. |
| Clipboard, arquivos temporários, exportações | — | [N] Não existem. |

**Criptografia adicional:** não recomendada agora. O único dado financeiro local fica na fila de pendentes, que é transitória e já coberta pela proteção de dados do iOS. Uma chave própria precisaria morar no Keychain de qualquer forma; o ganho não compensa a complexidade de gerir chaves e o risco de perder dados.

### 7.3 Comunicação e APIs

- **TLS e ATS** [V]: `NSAllowsArbitraryLoads = false`; exceção de rede local removida nos builds de loja (S-14). A URL do Supabase é `https`. Não há nenhuma desativação de validação de certificado no código.
- **Tokens e dados em URLs** [V]: nenhum token em URL. Os logs de borda do Supabase registram só caminhos com o UUID da conta (`user_id=eq.<uuid>`), um identificador pseudônimo. Valores e descrições vão no corpo, não na URL.
- **Campos retornados** [V]: o app lê `select=*` das próprias tabelas. Não há campos de outras pessoas nem segredos nessas tabelas.
- **CORS** [V]: `*` na função de exclusão, sem efeito na segurança. A autorização é o token, não a origem; o app nativo não usa CORS.
- **Mensagens de erro** [V]: as funções novas devolvem mensagens genéricas com código e etapa; os detalhes vão para o log da função. As funções antigas devolvem erros crus (S-03).
- **Certificate pinning** — não recomendado agora.
  - *Benefício:* protege contra interceptação por uma CA maliciosa ou por um perfil instalado no aparelho da vítima.
  - *Custo:* os certificados do Supabase são trocados pelo provedor, e um pin errado deixa todos os usuários sem acesso até sair um novo build.
  - *Avaliação:* para este modelo de ameaça (atacante precisaria instalar um perfil no iPhone da vítima), ATS e a cadeia de confiança do sistema bastam (MASVS-NETWORK-2 é controle de nível avançado).
- **App Attest e detecção de jailbreak** — não recomendados agora.
  - *Custo:* serviço de verificação no servidor.
  - *Benefício:* só aparece depois que a 0010 fizer o servidor decidir o acesso. É o complemento natural dela, numa segunda fase.

### 7.4 Entradas e abuso

- **Validação** [V]: no app (`sanitize.ts`, `amount.ts`). No servidor, só a partir da 0009 (S-04).
- **Injeção** [V]: consultas via PostgREST, parametrizadas. O único SQL dinâmico (gatilhos da 0009) usa `format('%I')` com argumentos fixos do gatilho, nunca com dados do usuário. React escapa o texto.
- **Atualização indevida de campos** [V]: `user_id` é regravado pela RLS; `billing` é somente leitura para o usuário.
- **Deep links** [V]: o esquema `flow://` só aceita `legal?doc=` (lista permitida) e `add-expense?id=`/`add-subscription?id=` (abre a edição de um registro do próprio usuário, sem ação automática). Não há Universal Links nem WebView.
- **Uploads e caminhos** [N]: o app não envia arquivos. Para o futuro: regras do bucket na 0009.
- **SSRF, CSV e conteúdo não confiável** [N]: nenhuma URL externa é buscada pelo servidor; não há importação nem exportação.
- **Limites** [R]: sem teto antes da 0009 (S-04). O limite de taxa por IP do Supabase não foi verificado.
- **Nenhum teste de carga ou indisponibilidade** foi feito contra o serviço. A medição de `decode-uri-component` rodou localmente, e a do teto de linhas dentro de uma transação desfeita.

### 7.5 Integridade financeira e assinatura

- **Valores** [V]: centavos inteiros (`bigint`), sem ponto flutuante. Cálculos auditados e testados na auditoria anterior ([AUDITORIA.md](AUDITORIA.md)).
- **Repetição e concorrência** [V]: IDs gerados no aparelho (UUID) e gravados por *upsert*. Reenviar a mesma operação é idempotente; a fila envia em ordem. O teto por conta tolera uma corrida no limite (documentado).
- **Troca de dono** [R]: bloqueada (T20, T23).
- **Liberação por variável local** [C]: o acesso ao app é decidido no aparelho, pela loja e pela linha `billing`. Mudar isso exige o servidor (0010). O usuário não consegue se dar assinatura no banco (T25, G08).
- **Webhook** [V]/[C]:
  - segredo comparado em tempo constante;
  - falha fechado sem segredo;
  - ignora eventos mais antigos que o último aplicado;
  - reembolso encerra o acesso na hora;
  - `TRANSFER` e conta excluída corrigidos (S-09).
- **Compra ↔ conta ↔ acesso** [R]: corrigido (S-08). O `app_user_id` do RevenueCat é o UUID da conta do Supabase.
- **Streak** [V]: não dá benefício pago, então adulterá-la não tem consequência financeira. O servidor ainda recusa reconstruir dias passados (T29).

### 7.6 Terceiros e IA

- **RevenueCat:** recebe o UUID da conta e os dados de compra. O e-mail e atributos não são enviados (nenhum `setEmail` ou `setAttributes`).
- **Chave do RevenueCat no app:** a chave `appl_…` é pública por desenho, como a chave anônima do Supabase.
- **Analytics e relatórios de falhas:** nenhum SDK instalado.
- **IA** [N]: o app não usa IA, e a "AI Disclosure" diz isso. Não há superfície de *prompt injection*.
- **Integrações bancárias** [N]: não existem.

### 7.7 Segredos e dependências

**Segredos** [V]. Varredura por padrões de chaves (JWT, `sb_secret_`, Stripe, AWS, chaves privadas, `appl_`, tokens do GitHub e do Slack) no código, nos 84 commits do histórico, nos `.env` versionados (só `.env.example`, sem valores) e no bundle iOS gerado.

- **Resultado:** nenhum segredo encontrado.
- **Falso positivo:** um `sb_secret_` no bundle é o prefixo literal que o SDK usa para reconhecer tipos de chave. Na tabela de strings do Hermes ele é seguido pela string seguinte, então não é uma chave.
- **Chaves privilegiadas:** a service role só existe no ambiente das funções.
- **Rotação:** não há credencial exposta para rotacionar.

**Dependências** (`npm audit` em 28/09/2026):

| Pacote | Onde roda | Aviso | Aplicável? |
|---|---|---|---|
| `react-router-dom` 6.x | Site legal (produção) | Moderado: *open redirect* com barra invertida em `<Link>`/`useNavigate`; injeção em hidratação SSR | **Não**: todas as rotas e destinos são fixos, sem SSR. Correção só no 7.x (versão maior) → planejar. |
| `vite` 5 / `vitest` 2 | Só desenvolvimento | Alto/crítico: leitura de arquivos pelo servidor de dev ou pela UI do Vitest | Só com esses servidores expostos na rede. Não vão para produção. Atualizar para as versões maiores com calma. |
| `@expo/config-plugins` → `xcode` → `uuid`; `@expo/cli` | Build | Moderado | Rodam no build, com entradas do próprio projeto. |
| `decode-uri-component` 0.2.2 (via `expo-router` → `query-string`) | App (runtime) | Moderado: DoS por decodificação exponencial | [R] Localmente, 1.536 caracteres de `%E0` travaram 4,6 s. **Não alcançável por deep link:** o expo-router trata links pelo próprio `fork/getStateFromPath` com `URLSearchParams`, e usa `query-string` só para montar caminhos. Correção só vem com uma versão maior do expo-router → acompanhar as atualizações do SDK. |

Nada foi atualizado à força: todas as correções disponíveis são versões maiores, e a instrução foi evitar mudanças importantes sem análise.

### 7.8 Infraestrutura e recuperação

| Item | Situação |
|---|---|
| Separação dev/homolog/prod | [V] **Não existe.** Há um projeto ativo (`flow`) e um pausado (`INACTIVE`) antigo. |
| Backups | [V] Plano Free: sem backups diários acessíveis (documentação do Supabase). **S-01.** Backups do banco também não incluem os arquivos do Storage. |
| Contas de serviço | [V] A service role é usada só nas funções. Não foi possível listar quem administra a organização e com qual MFA [N]. |
| Endpoints expostos | [V] REST, Auth, Storage e 3 funções publicadas (2 a remover, S-03). Sem GraphQL. |
| Credenciais no build | [V] Só variáveis `EXPO_PUBLIC_*` (públicas por natureza) nos ambientes do EAS. [N] O conteúdo dos ambientes do EAS não foi visto. |
| Registros de segurança | [V] Existem logs de auth (inclusive auditoria: login, `token_revoked`, `user_repeated_signup`), de borda e do Postgres. Sem senha ou token neles. A retenção do plano Free é curta. [N] Não há alertas. |
| Alertas de abuso | [N] Não configurados; o plano Free não oferece alertas próprios. |
| Revogar sessões e credenciais | [V] Possível pelo painel (Authentication → Users → sair ou excluir) e girando as chaves de API (Project Settings → API Keys). Roteiro em P10. |

---

## 8. Parecer: o que bloqueia o lançamento

### Bloqueia (fazer antes do público usar)

| # | Item | Por quê |
|---|---|---|
| 1 | **P1 + P2** — publicar a nova `delete-account` e excluir `dynamic-task` e `super-endpoint` | Hoje uma sessão sozinha apaga anos de registros, até por `GET`, por três caminhos. É o caminho mais curto de uma sessão comprometida para um dano irreversível. Leva minutos. O app atual funciona com a função nova e com a antiga. |
| 2 | **P3** — aplicar a 0009 | Uma conta gratuita pode derrubar o serviço de todos os assinantes. A migração está validada contra o esquema real, e os dados existentes já cumprem as regras. |
| 3 | **P5** — backup diário | Sem backup, qualquer incidente é perda total e definitiva dos registros financeiros de todos. Num produto pago, isso não é aceitável. |
| 4 | **P4** — exigir a senha atual na troca de senha e mínimo de 8 no Supabase Auth | Sem isso, a correção do app (S-06) não vale no servidor: quem tem a sessão chama a API direto. |
| 5 | **Gerar o build de lançamento a partir desta branch** | Keychain, capa do seletor, notificações, ATS e vínculo compra↔conta só chegam aos usuários num build novo. |

### Pode esperar (com prazo)

- **P6, projeto de desenvolvimento:** logo após o lançamento. É higiene de processo, e fortemente recomendado antes da próxima mudança no banco.
- **P7 + P8, webhook e 0010:** antes de investir em divulgação. É risco de receita, não de dados de usuários.
- **P9:** CAPTCHA e limites de taxa (enumeração, *credential stuffing*).
- **Plano Pro:** proteção contra senhas vazadas.
- **Recuperação de senha** (S-19): em breve, é uma lacuna funcional com risco de engenharia social.
- **Dependências:** atualizar as versões maiores (react-router 7, vite/vitest) numa janela própria.
- **Não recomendados agora:** certificate pinning, App Attest e detecção de jailbreak (justificativa em [§7.3](#73-comunicação-e-apis)).

---

## 9. Pendências externas — instruções

**P1. Publicar a nova `delete-account`.**
- Pelo CLI: `supabase functions deploy delete-account`, com verificação de JWT **ligada**, o padrão.
- Sem CLI: Dashboard → Edge Functions → `delete-account` → editar e colar `supabase/functions/delete-account/index.ts`.
- Teste: no app, Settings → Delete account com a senha errada deve dizer *"That password isn't right. Nothing was deleted."*

**P2. Excluir as funções soltas.**
- Dashboard → Edge Functions → `dynamic-task` → Delete; repetir para `super-endpoint`.
- Ou, pelo CLI: `supabase functions delete dynamic-task` e `supabase functions delete super-endpoint`.
- Não há ferramenta de exclusão no conector usado nesta auditoria.

**P3. Aplicar a 0009.**
1. Mova `supabase/prepared/0009_input_limits_and_least_privilege.sql` para `supabase/migrations/`.
2. Rode no SQL Editor ou com `supabase db push`.
3. Depois, rode [`supabase/tests/limits_probe.sql`](supabase/tests/limits_probe.sql): todas as linhas devem dizer *refused* ou PASS.
4. Rode também [`isolation_probe.sql`](supabase/tests/isolation_probe.sql): 38 PASS.

**P4. Supabase Auth**, em Dashboard → Authentication → Providers → Email (os nomes podem variar um pouco no painel):
- **Minimum password length**: `8`;
- **Require current password when changing password**: ligado. É o método que o app usa: ele envia a senha atual.
- **Require reauthentication when changing password**: deixe desligado. Esse é outro método, com um código enviado por e-mail, que o app não implementa; ligado, a troca de senha falharia para sessões com mais de 24 h.
- Depois, teste Settings → Password com a senha atual errada: deve recusar.

**P5. Backups.** Escolha uma opção:
- (a) **Plano Pro** (US$ 25/mês): backups diários de 7 dias, restauráveis no painel. Traz também a proteção contra senhas vazadas e evita a pausa por inatividade.
- (b) **Dump diário:** `supabase db dump --db-url "$DATABASE_URL" -f flow-$(date +%F).sql` (e `--data-only` num segundo arquivo). Rode por um agendador seguro, como um GitHub Actions com a URL guardada em *secrets*. Guarde o resultado criptografado fora do Supabase.

Nas duas opções, **teste uma restauração** num projeto separado antes de precisar dela.

**P6. Projeto de desenvolvimento.**
1. Crie um projeto `flow-dev` e aplique as migrações.
2. Aponte o ambiente `development` do EAS e o `.env` local para ele: `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Testes e scripts passam a rodar lá, não na produção.

**P7. Webhook do RevenueCat.**
1. Gere um segredo: `openssl rand -base64 32`.
2. Guarde-o: `supabase secrets set REVENUECAT_WEBHOOK_SECRET=<valor>`.
3. Publique: `supabase functions deploy revenuecat-webhook --no-verify-jwt`.
4. No RevenueCat, em Project settings → Integrations → Webhooks: URL `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`, com o **mesmo** valor no campo Authorization.
5. Envie o evento de teste e faça uma compra sandbox; confira a linha em `billing`.
6. Confirme o formato do `TRANSFER` (S-09 [S]): faça *Restore* numa segunda conta com o mesmo Apple ID sandbox. A primeira conta deve ficar `inactive`.

**P8. Aplicar a 0010** — só depois de P7 e de o build 1.0 (com a fila que mantém o 402) estar com os usuários. Siga os três passos no topo de `supabase/prepared/0010_paid_access_on_the_server.sql`, inclusive a linha de cortesia em `billing` para as suas contas de desenvolvimento.

**P9. Abuso na autenticação.**
- Revise Authentication → Rate Limits.
- Ative CAPTCHA (Turnstile ou hCaptcha) em Authentication → Attack Protection (em versões anteriores do painel, "Bot and Abuse Protection"). Isso exige passar `captchaToken` no cadastro e no login do app, uma mudança pequena para depois.

**P10. Resposta a incidente.**
- **Conta comprometida:** Dashboard → Authentication → Users → o usuário → *Sign out* (revoga os refresh tokens) ou excluir. O access token atual expira em até 1 h.
- **Chave vazada:** Project Settings → API Keys → gerar nova e revogar a antiga; atualizar os ambientes do EAS e os segredos das funções; publicar um build se a chave pública mudar.
- **Segredo do webhook:** gerar outro e atualizá-lo no Supabase e no RevenueCat ao mesmo tempo.
- **Contas dos serviços:** ative MFA nas contas de Supabase, Expo, Apple Developer, RevenueCat, GitHub e Vercel.

**P11. Vercel.** O próximo deploy aplica os headers. Confira com `curl -sI https://<seu-site>/support`: devem aparecer `content-security-policy`, `x-frame-options` e `strict-transport-security`.

---

## 10. O que não foi verificado

- **Nada rodou num iPhone.** Keychain real, capa do seletor de apps no iOS (validada no build web), notificações na tela bloqueada, ATS num binário assinado (validado no Info.plist gerado) e StoreKit/RevenueCat reais ficaram de fora.
- **Nenhum teste HTTP contra a API, as funções ou o site reais**, porque a rede bloqueia. Isso cobre a validação de JWT pelo gateway, CORS, limites de taxa, corpo de erros, TLS do `supabase.co` e os headers ao vivo da Vercel. O banco foi testado com os mesmos papéis e *claims*; as funções, com clientes simulados.
- **Configurações do painel do Supabase Auth**: validade do JWT, rotação e reuso de refresh token, limites de taxa, troca segura de senha, tamanho mínimo, CAPTCHA. Foram inferidas só por comportamento e logs; por exemplo, a confirmação de e-mail desligada aparece no cadastro que devolve sessão.
- **Painel do RevenueCat, produtos no App Store Connect e formato real dos eventos.** A documentação do RevenueCat está bloqueada; o formato do `TRANSFER` veio de busca na documentação pública.
- **Contas administrativas**: membros e MFA da organização no Supabase, Expo, Apple, GitHub e Vercel; conteúdo dos ambientes do EAS; configurações do repositório (proteção de branch, *secret scanning*).
- **Análise dinâmica do binário** no estilo MASTG-RESILIENCE (jailbreak, Frida, engenharia reversa) não foi feita.
- **Dependências nativas** (CocoaPods) não foram auditadas; não há SBOM.
- **Restauração de backup** — não há backup para testar.
- **Não se aplicam hoje:** recuperação de senha, troca de e-mail, OAuth/PKCE, Face ID/PIN, uploads, importação/exportação/CSV, IA, analytics, integrações bancárias e Universal Links.
- **Carga e indisponibilidade:** não testadas, por decisão, conforme as regras de execução.

---

## 11. Conclusão, confiança e escopo

**Escopo verificado:**
- o código do app, das funções e do site nesta branch;
- o banco real do projeto `flow` (políticas, grants, funções, bucket), testado com contas fictícias em transações desfeitas;
- o histórico Git, o bundle iOS gerado e o Info.plist gerado;
- as dependências do npm;
- os logs e advisors do Supabase.

**Confiança:**
- **Alta:** o isolamento entre contas no banco (38 verificações com os papéis da API, entre ataques e uso legítimo) e a ausência de segredos no repositório e no bundle.
- **Média:** as correções no app (testes, bundle e build web, sem aparelho) e nas funções (testes com clientes simulados; ainda não publicadas).
- **Baixa ou não avaliada:** as configurações de painel (Auth, RevenueCat, Vercel) e o comportamento em aparelho.

Esta auditoria reduz riscos conhecidos, mas **não prova que o app é seguro**: ferramentas e testes que não acham problemas só mostram que esses problemas não apareceram no que foi examinado. Refaça os dois scripts de `supabase/tests` a cada mudança no banco, e revise estes pontos quando o app ganhar recuperação de senha, anexos, importação ou IA.
