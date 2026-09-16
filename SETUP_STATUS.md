# Flow — status da configuração

Onde paramos, e o que falta. (Nenhuma chave secreta neste arquivo.)

## Valores úteis

| O que | Valor |
| --- | --- |
| App publicado (URL fixa) | `https://davigolgher-lmhg.vercel.app` |
| Projeto Vercel | `davigolgher-lmhg` (team `golgher-org`) |
| Production Branch na Vercel | `claude/expense-tracking-app-design-lo7kuy` |
| Supabase project URL | `https://jlerplyropsbcyqvqlgj.supabase.co` |
| Callback URL (OAuth) | `https://jlerplyropsbcyqvqlgj.supabase.co/auth/v1/callback` |

> A `VITE_SUPABASE_ANON_KEY` já está nas Environment Variables da Vercel.
> Chaves secretas (Stripe secret, Google client secret) **nunca** entram no repositório —
> elas vão só no painel do Supabase / Vercel.

## Pronto ✅

- [x] Deploy na Vercel a partir do branch do app (`main` segue intocado, com o README do perfil)
- [x] `vercel.json` com build do Vite + rewrites de SPA (refresh não dá 404)
- [x] Env vars `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na Vercel
- [x] Supabase Auth → URL Configuration apontando pra URL da Vercel
- [x] Login por e-mail (magic link) testado e funcionando no app publicado
- [x] Isolamento de dados: RLS (`auth.uid() = user_id`) ativo nas 8 tabelas

## Em andamento 🔜 — Login com Google

O botão "Continue with Google" **já existe e já está wireado no código**
(`signInWithProvider("google")`). Falta só configuração — nenhuma mudança de código.

Feito:
- [x] Projeto `Flow` criado no Google Cloud Console
- [x] Tela de consentimento (External) + e-mail adicionado em **Test users**

Falta:
- [ ] **Google Cloud → Clients → Create client**: tipo **Web application**
  - Authorized JavaScript origins: `https://davigolgher-lmhg.vercel.app`
  - Authorized redirect URIs: `https://jlerplyropsbcyqvqlgj.supabase.co/auth/v1/callback`
- [ ] Copiar **Client ID** e **Client Secret**
- [ ] **Supabase → Authentication → Providers → Google**: ativar e colar as duas chaves
- [ ] Testar o botão no app publicado

## Depois do Google

1. **Stripe** — chave publicável na Vercel (`VITE_STRIPE_PUBLISHABLE_KEY`), secret + webhook
   secret no Supabase, e deploy das Edge Functions `create-checkout`, `stripe-webhook`,
   `create-portal`. O paywall só chama o checkout quando a chave existe, então nada quebra antes.
2. **Gmail** — OAuth client (tipo Web) + Gmail API ativada; functions `gmail-oauth` / `gmail-sync`.
3. **Apple** — por último: exige o Apple Developer Program (pago, ~US$ 99/ano).

## Notas

- Toda vez que o código muda e é enviado pro branch, **a Vercel publica sozinha** —
  não precisa mexer no painel de novo.
- Notificações push de verdade só no build nativo (passo da App Store).
  No navegador, a alternativa é lembrete por e-mail via função agendada.
