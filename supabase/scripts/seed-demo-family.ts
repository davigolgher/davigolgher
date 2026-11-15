/**
 * Create (or top up) the App Review demo accounts for Flow Family.
 *
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… DEMO_PASSWORD=… \
 *     node supabase/scripts/seed-demo-family.ts
 *
 * Optional: DEMO_GUARDIAN_EMAIL, DEMO_DEPENDENT_EMAIL (defaults below, on the
 * reserved example.com domain, which receives no mail — the accounts are
 * created already confirmed).
 *
 * Run it against a project you own, after migrations 0011–0015. It prints the
 * two user ids: put the dependent's in PLUGGY_SANDBOX_USER_IDS so a reviewer
 * signed in as them can also connect one of Pluggy's test banks. Nothing here
 * is a real person or a real bank. The keys are read from the environment and
 * never written anywhere.
 */
import { createClient } from "@supabase/supabase-js";
import { seedDemoFamily } from "./demoFamily.ts";

const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (!v) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return v;
};

const url = env("SUPABASE_URL");
const anon = env("SUPABASE_ANON_KEY");
const service = env("SUPABASE_SERVICE_ROLE_KEY");
const password = env("DEMO_PASSWORD");
const emails = {
  guardian: env("DEMO_GUARDIAN_EMAIL", "flow.review.guardian@example.com"),
  dependent: env("DEMO_DEPENDENT_EMAIL", "flow.review.dependent@example.com"),
};
if (password.length < 12) {
  console.error("DEMO_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const admin = createClient(url, service, { auth: NO_SESSION });

async function ensureUser(email: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error && created.data.user) return created.data.user.id;
  // Already there: find it, and reset the password to the one given.
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
      return found.id;
    }
    if (data.users.length < 200) break;
  }
  throw created.error ?? new Error(`Couldn't create ${email}`);
}

async function signedIn(email: string) {
  const c = createClient(url, anon, { auth: NO_SESSION });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error(`Couldn't sign in as ${email}`);
  return createClient(url, anon, { auth: NO_SESSION, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
}

const ids = { guardian: await ensureUser(emails.guardian), dependent: await ensureUser(emails.dependent) };
const clients = { guardian: await signedIn(emails.guardian), dependent: await signedIn(emails.dependent) };
const result = await seedDemoFamily({ admin, as: (id: string) => (id === ids.guardian ? clients.guardian : clients.dependent) }, ids);

console.log(JSON.stringify({ emails, ids, ...result }, null, 2));
console.log(`\nPLUGGY_SANDBOX_USER_IDS=${ids.dependent}`);
