# Auditoria de telas vazias ("Zero Moments")

Cada tela, em cada estado, precisa responder pelo menos uma destas perguntas:
o que estou vendo, por que importa, o que faço agora, o que desbloqueio
depois. Esta auditoria percorreu o app antes e depois das mudanças, na
prévia em navegador com dados fictícios e nos testes de tela.

**Legenda:** ✗ beco sem saída antes · ✓ resolvido · ◐ melhorou, com ressalva.

## Primeiros minutos

| Tela / estado | Antes | Depois |
| --- | --- | --- |
| Primeira abertura | ✗ formulário de cadastro, sem mostrar o produto | ✓ Boas-vindas com o que o Flow faz e "Explore with sample data" (o app inteiro preenchido, marcado "Sample data", nada salvo) |
| Cadastro | Só e-mail e senha, sem volta | ✓ Abre no modo certo (criar conta ou entrar), com "Back" |
| Onboarding | ◐ 2 telas de texto e orçamento para todos | ✓ 1 pergunta (o que você quer); orçamento só para quem escolhe; categorias iniciais criadas; moeda do celular |
| Paywall | Antes de qualquer valor | ◐ Continua antes do app (decisão baseada em dados, ver `pesquisa.md` §4), mas agora depois da amostra e da pergunta de objetivos |

## Home

| Estado | Antes | Depois |
| --- | --- | --- |
| Conta nova, sem nada | ✗ "$0.00", "Set a monthly budget in Settings" (texto, sem botão), "Income $0", "Savings $0", sequência de 0 dias, "No transactions yet" | ✓ Próximo passo no topo: "See your last 90 days in a minute" (com bancos) ou "Log your first expense"; "Set a budget" é botão; renda, economia e sequência só aparecem quando fazem sentido |
| Poucos dados | ✗ Números soltos | ✓ Próximo passo segue o estágio: assinaturas encontradas → orçamento → assinaturas → lembretes |
| Dados suficientes | Números sem leitura | ✓ Até 2 insights do próprio mês: ritmo contra o mês passado, categoria que lidera, cobranças da semana, maior compra; cada um com atalho |
| Volta após 3+ dias | Nada diferente | ✓ "Welcome back": quantos gastos entraram (quantos do banco) e quanto, desde a última visita |
| Banco pedindo reconexão | (não existia) | ✓ Cartão "Needs you · Reconnect …" acima de tudo |
| Banco inacessível (servidor não configurado) | (não existia) | ✓ Não oferece banco; cai em "Log your first expense" |
| Carregando os bancos | (não existia) | ✓ Não mostra sugestão errada enquanto não sabe |
| Explorando a amostra | (não existia) | ✓ Faixa "Sample data — Make it mine" em todas as abas |

## Gastos, Assinaturas, Relatórios, Ajustes

| Tela / estado | Antes | Depois |
| --- | --- | --- |
| Gastos vazio | ◐ Texto "Tap Add…" | ✓ Explica e oferece "Connect your bank" e "Add an expense" |
| Gasto importado | (não existia) | ✓ Marcado "From your bank", editável |
| Assinaturas vazio | ◐ "Nothing recurring yet. Tap Add" | ✓ Explica o ganho (total mensal e anual, aviso antes de cobrar), botão e "Or connect your bank and Flow finds them" |
| Assinaturas com cobranças repetidas | (não existia) | ✓ "Found in your spending", com "Track it" e "Not a subscription" (lembrado) |
| Relatórios vazio | ◐ "Log a few expenses…" | ✓ Diz o que vai aparecer e oferece banco ou gasto |
| Categorias vazias ao lançar | ✗ Só "+ New": era preciso criar categoria antes do primeiro gasto | ✓ "Use suggested categories", e o onboarding já as cria |
| Ajustes na amostra | (não existia) | ✓ Explica que é para a conta própria e oferece criar conta, entrar ou sair |
| Orçamento ausente | ✗ Apontava para Ajustes | ✓ Folha "Monthly budget" a um toque |

## Bancos

| Estado | Depois |
| --- | --- |
| Nenhum banco | Ganho em 3 pontos, promessas (somente leitura, senha nunca chega ao Flow, sair quando quiser), país e botão, mais "Not now — I'll add expenses myself" |
| Abrindo / lendo | Botão "Opening…"; janela "Reading your accounts…"; "Bringing in your last 90 days…" |
| Sucesso | "N purchases are now in Flow", assinaturas encontradas com total mensal, "See your month" |
| Sucesso sem compras ainda | "New purchases will appear here as your bank reports them" |
| Falha ao conectar | Mensagem, "you can try again, or keep adding expenses by hand" |
| Precisa de atenção / consentimento expirado / erro | Aviso com o que significa e "Reconnect" / "Try again" |
| Conta em outra moeda | Diz que o Flow soma uma moeda e permite trazer mesmo assim |
| Vários bancos | Lista e "Connect another bank" |
| Desconectar | Pergunta: manter os gastos importados ou apagá-los |
| Amostra | Explica e oferece criar conta |

## O que ainda fica

- **Paywall antes do app:** é decisão de negócio. Os dados de mercado (RevenueCat 2026) favorecem o paywall rígido. O valor agora vem antes dele, pela amostra.
- **Primeiro gasto ainda é manual sem banco:** inevitável sem conexão; o caminho é de 2 toques.
- **Sequência ("streak") em português num app em inglês**, quando o celular está em português: comportamento intencional já registrado em `docs/flow-familia/inconsistencias-design.md`.
