# SmartFlow

A clean, minimal tracker for **daily expenses** and **recurring subscriptions**.
Black-and-white, light theme, mobile-first. Starts empty — add expenses manually,
or import purchases from Gmail (demo).

> The repository root `README.md` is kept as the GitHub profile page. This file
> documents the app.

## Run

```bash
npm install
npm run dev       # dev server (Vite)
npm run build     # typecheck + production build
npm run preview   # serve the build
npm run test      # tests (Vitest)
```

Requires Node 18+. Stack: Vite + React 18 + TypeScript + Tailwind CSS · React
Router · Vitest.

## Screens (5-tab nav)

- **Home** — "This month" overview: 2×2 stat cards + Recent list.
- **Expenses** — full list; tap a row to edit or delete.
- **Subs** — subscriptions with monthly total; dashed empty state.
- **Reports** — monthly spending + **spending-by-category chart with %** +
  subscription costs.
- **Settings** — monthly budget, **currency picker**, custom categories, **Gmail
  import**, sign out.

Add/edit happens in centered modals (amount is the hero field).

## Notes

- Money is integer **cents** everywhere (`src/lib/money.ts`) — never floats.
- State is in-memory (`src/data/store.tsx`); the app runs fully offline/local.
- **Gmail import is a demo** — real access needs a backend (Gmail API + OAuth).
- A Supabase backend (auth + persistence) and Stripe are planned next.

## Structure

```
src/
  config/app.ts        product name/config (single source)
  lib/                 money, format, recurrence, calc, reports, useMoney, hooks
  data/                types, currencies, store, mock (empty seed + gmail sample)
  components/ui/       design system
  components/rows.tsx  expense/subscription list rows
  features/modals/     add/edit expense & subscription
  screens/             Home, Expenses, Subs, Reports, Settings
  layout/AppShell.tsx  centered column + bottom nav
```
