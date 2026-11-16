# Pesquisa — onboarding, ativação e retenção

Feita em 16/11/2026 com busca na web. **Todos os números abaixo são
benchmarks externos**, com fonte, contexto e data. **O Flow ainda não tem
nenhum dado próprio observado**: a medição foi criada agora (`eventos.md`) e
só começa a produzir números depois que a migration 0018 for aplicada e o
app for publicado.

Cuidados gerais:
- Quase todo benchmark de mercado vem de empresas que vendem ferramentas de
  analytics, push ou onboarding. Elas têm interesse comercial nos números.
- Definições variam: "retenção D7" pode ser "voltou exatamente no 7º dia" ou
  "voltou até o 7º dia". As fontes nem sempre dizem qual usam.
- Quase todos os estudos mostram correlação, não causa. Quem conecta o banco
  retém mais, mas pode ser porque já era mais engajado.

## 1. Retenção (D1, D7, D30)

| Dado | Fonte e data | Observação |
| --- | --- | --- |
| Apps de finanças: **12% D1, 6% D7, 2% D30** | Adjust, dados de 2025, citados em compilações de benchmarks | É o número mais citado para finanças. Inclui aquisição paga, que puxa a retenção para baixo |
| Média entre categorias: **~25–26% D1, 11–13% D7, 5–7% D30** | Compilação de Adjust, AppsFlyer, Statista e Business of Apps (2025–2026) | Base geral, não específica de finanças |
| Outras fontes de finanças: 26,8% D1 / 18,5% D7 / 8,0% D30, ou 34% / 18% / 12% | Blogs e guias de 2025–2026 | Metodologia não informada. Mostram como os números variam |
| CleverTap, relatório BFSI de retenção | CleverTap, nov/2025 | Relatório setorial de bancos, seguros e finanças, de fornecedor |

**O que isso significa para o Flow:** as fontes divergem muito. O primeiro
alvo honesto é medir o nosso próprio D1/D7/D30 por coorte
(`analytics_retention`) e comparar o Flow com ele mesmo ao longo do tempo,
não com a média do mercado.

## 2. Ativação como preditor de retenção

| Dado | Fonte e data | Observação |
| --- | --- | --- |
| Ativação inicial é o preditor mais confiável de retenção de longo prazo. Entre mais de 10.600 produtos, **69% dos melhores em ativação de 7 dias** também estavam entre os melhores em retenção de 3 meses | Amplitude, *Product Benchmark Report 2025* (blog da Amplitude) | Fornecedor. É consistência de ranking, não modelo preditivo |
| No 90º percentil, a ativação começa em ~21% no D1, cai para ~12% no D7 e ~9% no D14. Voltar no 7º dia (7%) já coloca o produto no quartil superior | Amplitude, *7% retention rule* | Mesma ressalva |
| Taxa de ativação média de **34%** e mediana de **25%** | Pesquisa com leitores da newsletter de Lenny Rachitsky | Depende muito de como cada produto define "ativação" |
| Quanto mais rápido o usuário chega ao valor (*time to value*), maior a retenção | Amplitude, *Time to value* | Conceitual; não traz número próprio |

**Decisão:** escolher um **Aha observável** e medir o tempo até ele
(`aha_reached`, `analytics_time_to_value`).

## 3. Tamanho do onboarding e telas antes do valor

| Dado | Fonte e data | Observação |
| --- | --- | --- |
| Tours de produto com 1–2 passos: mediana de **73%** de conclusão. Com 9 ou mais passos: **8%** | Análise de 464 produtos SaaS, citada no Indie Hackers | Fornecedor de tours. Mede tour dentro do app, não cadastro |
| Os fluxos de onboarding encolheram: média de **15,5 passos** (capturados em 2023) para **12,4** (2025) | Lazyweb, amostra de 129 fluxos | Descreve o que os apps fazem, não o que funciona melhor |
| "Mudamos o fluxo para ter menos passos e melhorou 20%" | Respondente da pesquisa de Lenny | Anedótico |
| Duolingo: deixar a pessoa usar o app antes de se cadastrar aumentou os usuários ativos diários em **~20%**; avisos de cadastro depois somaram **+8,2%** | Entrevista do líder de growth do Duolingo à First Round Review | Números de DAU numa entrevista, sem coortes publicadas |

**Decisões:**
- Exemplo do app **antes** de qualquer formulário (dados de exemplo).
- Onboarding pós-cadastro de 1 pergunta, mais 1 só para quem escolhe orçamento.
- Aceitar a recomendação das próprias fontes: confirmar com teste A/B quando
  houver volume, em vez de otimizar contagem de passos às cegas.

## 4. Paywall: onde cobrar

| Dado | Fonte e data | Observação |
| --- | --- | --- |
| Conversão mediana de download para pagante no D35: **10,7%** com paywall rígido contra **2,1%** freemium (5x) | RevenueCat, *State of Subscription Apps 2026* (115 mil+ apps) | Em 2025 era 12,1% contra 2,2% |
| Retenção de planos anuais após 1 ano: **27%** com paywall rígido, **28%** freemium (diferença desprezível) | RevenueCat 2026 | — |
| Receita mediana por instalação no D60: **US$ 3,09** contra **US$ 0,38** | RevenueCat (via resumos) | Conferir no relatório original antes de citar |
| Reembolsos: **5,8%** contra **3,4%** | Análise de terceiros sobre o SOSA 2025 | Fonte secundária |

**Decisão:** **manter** o paywall rígido do Flow (com teste grátis de 14 dias),
mas entregar valor antes dele: a amostra com dados de exemplo e a pergunta de
objetivos vêm antes do paywall.

## 5. Conectar conta bancária e retenção

| Dado | Fonte e data | Observação |
| --- | --- | --- |
| Stash: retenção em 6 meses **15% maior** para quem conecta pela Plaid do que por microdepósitos | Estudo de caso da Plaid | Fornecedor. Compara métodos de conexão, não conectar contra não conectar |
| Esusu: **35% menos** abandono após adotar a autenticação de contas da Plaid | Estudo de caso da Plaid | Fornecedor |
| SoFi: membros que conectaram conta externa têm mais engajamento e retenção (sem números) | Estudo de caso da Plaid | — |
| Copilot Money: começa pela conexão bancária; importa o histórico, sugere categorias, orçamento e identifica renda. Afirma achar em média **US$ 170** em cobranças recorrentes esquecidas | Central de ajuda e página comparativa da Copilot | O US$ 170 é número de marketing |
| Consumidores subestimam gastos com assinaturas: palpite médio de **US$ 86/mês**, contra **US$ 219** reais; **42%** já esqueceram que pagavam algo que não usavam | C+R Research, 2022 (1.000 pessoas, EUA), via CNBC | Pesquisa de 2022 |
| Brasil: **~154 milhões** de consentimentos ativos no Open Finance em dez/2025 (Dashboard do Cidadão). A série semanal do Banco Central mostra **254 milhões** em 28/08/2026 | Finsiders, Latam Fintech, Let's Money (série do BC) | Fontes diferem por data e metodologia |

**Decisões:**
- O valor da conexão é apresentado como resultado ("seus últimos 90 dias
  agora", "as assinaturas que você esqueceu"), não como tarefa.
- A detecção de assinaturas nos gastos é o "aha" mais forte e virou recurso.
- Alternativa sem conexão sempre visível ("Not now — I'll add expenses myself").

## 6. Notificações

| Dado | Fonte e data | Observação |
| --- | --- | --- |
| Opt-in de push em apps de finanças: **~55%** no iPhone e **~58%** no Android (mediana) | Airship 2025, reproduzido pela MobiLoud | Não conferido no PDF original |
| Média geral: **48,85%** no iPhone e **53,3%** no Android | Airship 2025 | — |

**Decisão:** nenhuma notificação nova de "engajamento". O Flow já tem
lembretes de renovação, úteis e opcionais. O próximo passo sugere ligá-los
depois que a pessoa tem assinaturas.

## 7. Estados vazios

Nielsen Norman Group (*Empty states in application design*): estados vazios
são oportunidades de comunicar o status do sistema, ensinar o produto e dar
caminho direto para tarefas-chave. Um erro comum é dizer "não há itens"
quando os dados ainda estão carregando. Base para a auditoria em
`zero-moments.md`.

## 8. Padrões copiados (sem copiar código ou marca)

| Padrão | Onde se vê | Como entrou no Flow |
| --- | --- | --- |
| Conexão bancária primeiro, histórico importado e categorizado | Copilot, Monarch | "See your last 90 days in a minute" como primeiro passo |
| Cobranças recorrentes encontradas no onboarding | Copilot | "Found in your spending" em Assinaturas e no próximo passo |
| Experimentar antes de criar conta | Duolingo | "Explore with sample data", rotulado em toda tela |
| Dados de exemplo quando não há banco | Monarch (segundo comparativos; não confirmado em fonte primária) | Mês de exemplo |
| Um próximo passo por vez, que some quando é feito | Checklists de ativação em geral | Cartão "Next step" na Home |

**Componentes reutilizados:** o kit de componentes da própria Flow Família
(seções, avisos, estados de carregando/vazio/erro/offline, interruptores)
virou o kit do app inteiro. **Nenhuma biblioteca nova** foi adicionada. As
bibliotecas de UI open source (React Native Reusables, Gluestack, Tamagui)
trariam outro sistema visual e dependências para o que o kit atual já cobre.

## Fontes

- Retenção: [Phiture](https://phiture.com/mobilegrowthstack/managing-retention-rate-benchmarks-and-expectations/) · [Stream — App retention guide](https://getstream.io/blog/app-retention-guide) · [Promodo — benchmarks 2026](https://www.promodo.com/blog/mobile-marketing-benchmarks) · [Enable3 — retention 2025](https://enable3.io/blog/app-retention-benchmarks-2025) · [CleverTap — BFSI Retention (PDF)](https://clevertap.com/wp-content/uploads/2025/11/BFSI-Benchmark-Report-Retention.pdf) · [Adjust — what makes a good retention rate](https://demo-1.adjust.com/blog/what-makes-a-good-retention-rate/)
- Ativação: [Amplitude — 7% retention rule](https://amplitude.com/blog/7-percent-retention-rule) · [Amplitude — time to value](https://amplitude.com/blog/time-to-value-drives-user-retention) · [Amplitude — financial services benchmarks](https://www.amplitude.com/blog/financial-services-product-benchmarks) · [Lenny's Newsletter — what is a good activation rate](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate)
- Onboarding: [Indie Hackers — 464 SaaS products](https://www.indiehackers.com/post/onboarding-benchmarks-from-real-data-across-464-saas-products-median-tour-completion-is-29-6288651c93) · [Lazyweb — onboarding flows getting shorter](https://labs.lazyweb.com/research/are-onboarding-flows-getting-shorter.md) · [First Round Review — Duolingo](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/) · [Taplytics — Duolingo delayed sign-up](https://taplytics.com/blog/duolingo-ab-test-onboarding)
- Paywall: [RevenueCat — benchmarks 2026](https://revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026) · [Airbridge — hard paywall vs freemium](https://www.airbridge.io/en/blog/hard-paywall-vs-freemium-2026) · [SaaStr — RevenueCat learnings](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)
- Bancos: [Plaid — Stash](https://plaid.com/blog/q-a-stash) · [Casestudies — Esusu](https://www.casestudies.com/company/plaid/case-study/how-esusu-helps-renters-build-credit) · [Plaid — SoFi](https://plaid.com/customer-stories/sofi/) · [Copilot — quick start](https://help.copilot.money/en/articles/11157550-quick-start-guide) · [Copilot — compare](https://www.copilot.money/compare/) · [CNBC — subscriptions underestimated](https://www.cnbc.com/2022/09/06/consumers-underestimate-monthly-subscription-costs-by-at-least-100.html) · [Plaid — Link conversion best practices](https://plaid.com/docs/link/best-practices/index.html.md)
- Open Finance Brasil: [Convergência Digital](https://convergenciadigital.com.br/mercado/open-finance-brasil-lidera-ranking-global-com-128-milhoes-de-consentimentos-ativos/) · [Latam Fintech](https://www.latamfintech.co/articles/fintech-lina-open-x-y-mastercard-sellan-alianza-estrategica-para-acelerar-el-open-finance-en-brasil) · [Let's Money — consentimentos ativos (série do BC)](https://www.letsmoney.com.br/dados/of-consentimentos-ativos/) · [DPL News](https://dplnews.com/?p=265102)
- Push: [MobiLoud — push statistics](https://www.mobiloud.com/blog/push-notification-statistics) · [Airship — benchmarks 2026](https://www.airship.com/mobile-app-push-notification-benchmarks-for-2026/)
- Estados vazios: [NN/g — empty state interface design](https://nngroup.com/articles/empty-state-interface-design) · [NN/g — vídeo](https://www.nngroup.com/videos/empty-states-in-application-design-guidelines/)
