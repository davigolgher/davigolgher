# Inconsistências de design encontradas no restante do app

Pedido: "Se encontrar inconsistências de design no restante do app, liste em /docs
em vez de corrigir". Nada abaixo foi alterado. O código da Flow Família usa só
tokens (`mobile/src/theme/tokens.js`).

Levantamento feito em 15/11/2026 sobre `mobile/src` (fora de `features/family` e
`app/family`).

## 1. Tamanhos de texto soltos em vez de tokens

O `tailwind.config.js` tinha só três tamanhos nomeados (`metric`, `metric-sm`,
`eyebrow`). As telas usam valores arbitrários:

| Classe | Ocorrências | Token equivalente criado |
| --- | --- | --- |
| `text-[15px]` | 43 | `text-body` |
| `text-[13px]` | 40 | `text-footnote` |
| `text-[12px]` | 20 | `text-caption` |
| `text-[14px]` | 17 | `text-subhead` |
| `text-[16px]` | 8 | `text-callout` |
| `text-[11px]` | 7 | `text-micro` |
| `text-[17px]` | 5 | `text-headline` |
| `text-[26px]` | 2 | `text-title` |
| `text-[28px]`, `[30px]`, `[44px]`, `[52px]`, `[22px]`, `[20px]`, `[18px]` | 1–3 cada | sem token (tamanhos únicos de tela) |
| `text-[12.5px]`, `text-[11.5px]` | 1 cada (paywall) | fora da escala; não arredondam para nenhum tamanho do resto do app |

Sugestão: trocar pelas classes nomeadas (mesmo valor, nenhuma mudança visual) e
decidir se os tamanhos únicos do paywall (12,5 e 11,5) devem ir para 12 e 11.

## 2. Cores escritas em hexadecimal no código

`#0A0A0A`, `#FFFFFF`, `#8A8A8F`, `#E5E5E7`, `#EEEEEF` aparecem direto em 18
arquivos (por exemplo `app/_layout.tsx`, `(tabs)/_layout.tsx`,
`(tabs)/settings.tsx`, `components/ui.tsx`, `PaywallScreen.tsx`,
`SignInScreen.tsx`, `StreakCard.tsx`, `Donut.tsx`, `LineChart.tsx`).

- A maioria corresponde a tokens (`chalk`, `ink-950`, `chalk-faint`).
- Duas não correspondem a nenhum token:
  - `#E5E5E7` é o trilho do switch em Ajustes; o token mais próximo é `ink-700` = `#E7E7E9`.
  - `#EEEEEF` é o trilho do controle segmentado; fica entre `ink-750` e `ink-700`.
- A separação de lista em `components/ui.tsx` usa `rgba(0,0,0,0.18)`, que não é
  nenhum dos `line-*` (0.06 / 0.10 / 0.16).

Sugestão: importar de `~/theme/tokens` (já disponível) e decidir se os dois
cinzas de trilho viram tokens ou se alinham aos existentes.

## 3. Medidas arbitrárias

- `h-[52px]` (campo de texto) e `w-[20rem]`.
- `rounded-[22px]`, `rounded-[16px]` e `rounded-[4px]` ao lado de
  `rounded-card` (24), `rounded-card-sm` (18) e `rounded-field` (16):
  `rounded-[16px]` é igual a `rounded-field` e `rounded-[22px]` não está na escala.

## 4. Tipografia dinâmica limitada

`StreakCard`, `streak.tsx`, `RollingCount` e `DayDot` limitam o aumento de fonte
(`maxFontSizeMultiplier` de 1.1 a 1.4). Faz sentido para números que precisam
caber num círculo, mas em `streak.tsx:90` e `StreakCard.tsx:126` o limite está em
texto corrido, que deveria crescer com o tamanho de texto do sistema (WCAG 1.4.4).

## 5. Modo escuro

O app inteiro é só claro (`userInterfaceStyle: "light"`, `StatusBar style="dark"`).
Não é um defeito em si, mas é uma decisão a registrar: a Flow Família segue o
mesmo padrão (decisão em `arquitetura.md`) para não criar um segundo tema só
para uma área. Se o app ganhar tema escuro, os tokens em `tokens.js` são o lugar
para as duas paletas.

## 6. Idioma

Interface só em inglês, com moeda escolhida pelo usuário. A Flow Família mostra
valores na moeda do banco (BRL, já que o Open Finance é brasileiro), formatados
como o resto do app formata BRL (`R$ 25,90`). Um público brasileiro deve
esperar a interface em português; fica como observação, não foi alterado.
