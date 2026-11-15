# Flow Família — screenshots para as lojas

Capturar numa build com `EXPO_PUBLIC_FLOW_FAMILY=1`, logado nas contas de
demonstração (`supabase/scripts/seed-demo-family.ts`), só com dados fictícios.

Tamanhos exigidos hoje: iPhone 6,9" (1320 × 2868 ou 1290 × 2796) — a Apple
reduz para os outros tamanhos; Google Play: mínimo 2 capturas, 320–3840 px,
proporção até 2:1. O app é só retrato e só iPhone (`supportsTablet: false`),
então não há capturas de iPad.

| # | Tela | Conta | Mensagem (legenda sugerida, EN / PT-BR) |
| --- | --- | --- | --- |
| 1 | Flow Family (início) sem família — os três pontos e os dois botões | qualquer conta nova | "Follow the spending of someone you look after" / "Acompanhe os gastos de quem você cuida" |
| 2 | Painel da Ana: total do mês, comparação, categorias | responsável demo | "This month, by category, against last month" / "O mês, por categoria, contra o anterior" |
| 3 | Painel da Ana: orçamentos e lista de compras | responsável demo | "Budgets to follow — never blocks" / "Orçamentos para acompanhar — nunca bloqueios" |
| 4 | Alertas: regras e alertas recebidos | responsável demo | "Alerts that matter: large purchases, betting, budgets" / "Alertas que importam: compras altas, apostas, orçamentos" |
| 5 | Termos de compartilhamento (tela de consentimento) | dependente, com um convite novo | "They choose what to share, and for how long" / "A pessoa escolhe o que compartilha e por quanto tempo" |
| 6 | Sharing do dependente: quem vê, o que vê, histórico de acessos | dependente demo | "They see what you see — and every time you looked" / "Ela vê o que você vê — e cada vez que você olhou" |
| 7 | Bank accounts: contas com os interruptores de compartilhar | dependente demo | "Open Finance, account by account" / "Open Finance, conta por conta" |
| 8 | Home do Flow com o cartão da Família (responsável assinante) | responsável demo | "Part of Flow" / "Parte do Flow" |

Cuidados:
- Não mostrar o código de convite real de uma conta de produção.
- Não usar dados de pessoas reais; a demo usa "Ana (demo)", "Maria (demo)" e o "Banco Demonstração (fictício)".
- A barra de status com hora e bateria neutras (simulador: `xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100`).
