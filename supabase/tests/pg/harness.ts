/**
 * A real Postgres, in memory, shaped like a Supabase project.
 *
 * Row Level Security and SQL functions can only be trusted once they've run
 * against Postgres itself, as each role. The live project isn't a place to do
 * that (it holds real accounts, and the free plan pauses it), so these tests
 * boot PGlite — Postgres compiled to WebAssembly — apply the repository's own
 * migration files to it, and talk to it the way the app and the Edge
 * Functions do: as `authenticated` with a user id in the JWT claims, as
 * `anon`, or as `service_role`.
 *
 * What is emulated is only what the migrations and policies touch: the three
 * API roles with Supabase's broad default grants (so a missing `revoke` shows
 * up here exactly as it would in production), `auth.users` and `auth.uid()`,
 * a minimal `storage` schema, the request GUCs PostgREST sets
 * (`request.jwt.claims`, `request.headers`), and the realtime publication.
 * It is not GoTrue, PostgREST or Realtime; anything that depends on those
 * services' own behaviour still needs a live project.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_DIR = path.resolve(HERE, "../..");

const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;

grant usage on schema public to anon, authenticated, service_role;
-- Supabase's defaults: every new table, function and sequence in public is
-- granted to all three API roles. Migrations have to take away what a role
-- shouldn't have.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);
grant all on auth.users to service_role, supabase_auth_admin;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

create publication supabase_realtime;
`;

export type Role = "anon" | "authenticated" | "service_role";

export interface Session {
  role: Role;
  /** The user id in the JWT (`auth.uid()`), for `authenticated`. */
  sub?: string;
  /** Request headers as PostgREST exposes them (`request.headers`). */
  headers?: Record<string, string>;
}

export interface PgError {
  message: string;
  code?: string;
  hint?: string;
}

export interface Result<T = unknown> {
  data: T | null;
  error: PgError | null;
  status: number;
}

export interface TestDb {
  pg: PGlite;
  /** Insert an `auth.users` row (firing the sign-up trigger) and return its id. */
  createUser(email: string): Promise<string>;
  /** A supabase-js–shaped client acting as this session. */
  client(session: Session): FakeSupabase;
  /** Shorthand: a signed-in user. */
  as(userId: string, headers?: Record<string, string>): FakeSupabase;
  anon(): FakeSupabase;
  service(): FakeSupabase;
  /** Run SQL as the database owner — for arranging and inspecting, not for what's under test. */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export interface CreateDbOptions {
  /** Prepared migrations to apply after supabase/migrations, by file name prefix. Default: all of them. */
  prepared?: string[] | "all" | "none";
}

function sqlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

export async function createDb(options: CreateDbOptions = {}): Promise<TestDb> {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.exec(SHIM);

  const prepared = options.prepared ?? "all";
  const files = [
    ...sqlFiles(path.join(SUPABASE_DIR, "migrations")),
    ...(prepared === "none"
      ? []
      : sqlFiles(path.join(SUPABASE_DIR, "prepared")).filter(
          (f) => prepared === "all" || prepared.some((p) => path.basename(f).startsWith(p)),
        )),
  ];
  for (const file of files) {
    try {
      await pg.exec(fs.readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`${path.basename(file)}: ${(e as Error).message}`);
    }
  }

  const db: TestDb = {
    pg,
    async createUser(email) {
      const res = await pg.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
      return res.rows[0].id;
    },
    client: (session) => new FakeSupabase(pg, session),
    as: (userId, headers) => new FakeSupabase(pg, { role: "authenticated", sub: userId, headers }),
    anon: () => new FakeSupabase(pg, { role: "anon" }),
    service: () => new FakeSupabase(pg, { role: "service_role" }),
    async admin<T>(sql: string, params: unknown[] = []) {
      return (await pg.query<T>(sql, params)).rows;
    },
    close: () => pg.close(),
  };
  return db;
}

/* ── acting as a role ─────────────────────────────────────────────────────── */

async function inSession<T>(pg: PGlite, session: Session, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true), set_config('request.headers', $2, true)", [
      JSON.stringify({ sub: session.sub ?? null, role: session.role }),
      JSON.stringify(session.headers ?? {}),
    ]);
    await tx.exec(`set local role ${session.role}`);
    return fn(tx);
  }) as Promise<T>;
}

/** HTTP status PostgREST would answer with for this SQLSTATE. */
function statusFor(code: string | undefined): number {
  if (!code) return 500;
  if (/^PT\d{3}$/.test(code)) return Number(code.slice(2));
  if (code === "42501") return 403;
  if (code === "23505" || code === "23503") return 409;
  if (code === "PGRST116") return 406;
  return 400;
}

async function settle<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await work(), error: null, status: 200 };
  } catch (e) {
    const err = e as { message?: string; code?: string; hint?: string };
    return {
      data: null,
      error: { message: err.message ?? String(e), code: err.code, hint: err.hint },
      status: statusFor(err.code),
    };
  }
}

const ident = (name: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Not an identifier: ${name}`);
  return `"${name}"`;
};

const columns = (list: string) =>
  list.trim() === "*"
    ? "*"
    : list
        .split(",")
        .map((c) => ident(c.trim()))
        .join(", ");

/** A JS value as Postgres takes it for a parameter of `type`. */
function encode(value: unknown, type: string): unknown {
  if (value === null || value === undefined) return null;
  if (type === "json" || type === "jsonb") return JSON.stringify(value);
  if (type.endsWith("[]") && Array.isArray(value)) {
    return `{${value.map((v) => (v === null ? "NULL" : `"${String(v).replace(/(["\\])/g, "\\$1")}"`)).join(",")}}`;
  }
  return value;
}

interface Signature {
  names: string[];
  types: string[];
  returnsSet: boolean;
  returnsRecord: boolean;
}

const signatures = new WeakMap<PGlite, Map<string, Signature>>();

async function signatureOf(pg: PGlite, fn: string): Promise<Signature> {
  let cache = signatures.get(pg);
  if (!cache) signatures.set(pg, (cache = new Map()));
  const hit = cache.get(fn);
  if (hit) return hit;
  const res = await pg.query<{ names: string[] | null; types: string[]; retset: boolean; rettype: string; nargs: number }>(
    `select p.proargnames as names,
            array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality as u(t, i) order by i) as types,
            p.proretset as retset, p.prorettype::regtype::text as rettype, p.pronargs as nargs
       from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
    [fn],
  );
  if (res.rows.length !== 1) {
    const err = new Error(`Could not find the function public.${fn} in the schema cache`) as Error & { code: string };
    err.code = "PGRST202";
    throw err;
  }
  const row = res.rows[0];
  const sig: Signature = {
    names: (row.names ?? []).slice(0, row.nargs),
    types: row.types,
    returnsSet: row.retset,
    returnsRecord: row.rettype === "record",
  };
  cache.set(fn, sig);
  return sig;
}

/* ── the supabase-js surface the app and the functions use ────────────────── */

type Row = Record<string, unknown>;
type Filter = { sql: (n: number) => string; values: unknown[] };

export class FakeSupabase {
  constructor(
    private pg: PGlite,
    readonly session: Session,
  ) {}

  /** Same session with request headers — how a function sees the caller's IP. */
  withHeaders(headers: Record<string, string>): FakeSupabase {
    return new FakeSupabase(this.pg, { ...this.session, headers });
  }

  rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
    return settle(async () => {
      const sig = await signatureOf(this.pg, fn);
      const named = Object.keys(args).filter((k) => args[k] !== undefined);
      for (const k of named) {
        if (!sig.names.includes(k)) {
          const err = new Error(`Could not find the function public.${fn}(${named.join(", ")}) in the schema cache`) as Error & {
            code: string;
          };
          err.code = "PGRST202";
          throw err;
        }
      }
      const params = named.map((k) => encode(args[k], sig.types[sig.names.indexOf(k)]));
      const call = `public.${ident(fn)}(${named
        .map((k, i) => `${ident(k)} => $${i + 1}::${sig.types[sig.names.indexOf(k)]}`)
        .join(", ")})`;
      return inSession(this.pg, this.session, async (tx) => {
        if (sig.returnsSet || sig.returnsRecord) return (await tx.query(`select * from ${call}`, params)).rows as T;
        const res = await tx.query<{ result: T }>(`select ${call} as result`, params);
        return res.rows[0]?.result ?? (null as T);
      });
    });
  }

  from(table: string): Query {
    return new Query(this.pg, this.session, table);
  }
}

export class Query implements PromiseLike<Result<unknown>> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private cols = "*";
  private returning: string | null = null;
  private filters: Filter[] = [];
  private orders: string[] = [];
  private lim: number | null = null;
  private off: number | null = null;
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict: string | null = null;
  private ignoreDuplicates = false;
  private mode: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private pg: PGlite,
    private session: Session,
    private table: string,
  ) {}

  select(cols = "*"): this {
    if (this.op === "select") this.cols = cols;
    else this.returning = cols;
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}): this {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = opts.onConflict ?? null;
    this.ignoreDuplicates = Boolean(opts.ignoreDuplicates);
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }

  private cmp(col: string, operator: string, value: unknown): this {
    this.filters.push({ sql: (n) => `${ident(col)} ${operator} $${n}`, values: [value] });
    return this;
  }
  eq = (col: string, v: unknown) => this.cmp(col, "=", v);
  neq = (col: string, v: unknown) => this.cmp(col, "<>", v);
  gt = (col: string, v: unknown) => this.cmp(col, ">", v);
  gte = (col: string, v: unknown) => this.cmp(col, ">=", v);
  lt = (col: string, v: unknown) => this.cmp(col, "<", v);
  lte = (col: string, v: unknown) => this.cmp(col, "<=", v);
  is(col: string, v: null | boolean): this {
    this.filters.push({ sql: () => `${ident(col)} is ${v === null ? "null" : v ? "true" : "false"}`, values: [] });
    return this;
  }
  in(col: string, values: unknown[]): this {
    if (values.length === 0) {
      this.filters.push({ sql: () => "false", values: [] });
      return this;
    }
    this.filters.push({
      sql: (n) => `${ident(col)} in (${values.map((_, i) => `$${n + i}`).join(", ")})`,
      values,
    });
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}): this {
    this.orders.push(`${ident(col)} ${opts.ascending === false ? "desc" : "asc"}`);
    return this;
  }
  limit(n: number): this {
    this.lim = n;
    return this;
  }
  range(from: number, to: number): this {
    this.off = from;
    this.lim = to - from + 1;
    return this;
  }
  single(): this {
    this.mode = "single";
    return this;
  }
  maybeSingle(): this {
    this.mode = "maybeSingle";
    return this;
  }

  private where(start: number): { sql: string; values: unknown[] } {
    const values: unknown[] = [];
    const parts = this.filters.map((f) => {
      const text = f.sql(start + values.length);
      values.push(...f.values);
      return text;
    });
    return { sql: parts.length ? ` where ${parts.join(" and ")}` : "", values };
  }

  private build(): { sql: string; values: unknown[] } {
    const target = `public.${ident(this.table)}`;
    const ret = this.returning ? ` returning ${columns(this.returning)}` : "";
    if (this.op === "select") {
      const w = this.where(1);
      const tail =
        (this.orders.length ? ` order by ${this.orders.join(", ")}` : "") +
        (this.lim !== null ? ` limit ${this.lim}` : "") +
        (this.off !== null ? ` offset ${this.off}` : "");
      return { sql: `select ${columns(this.cols)} from ${target}${w.sql}${tail}`, values: w.values };
    }
    if (this.op === "insert" || this.op === "upsert") {
      const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r)))];
      const values: unknown[] = [];
      const tuples = this.payload.map(
        (r) =>
          `(${keys
            .map((k) => {
              const v = r[k];
              values.push(v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v) ? JSON.stringify(v) : (v ?? null));
              return `$${values.length}`;
            })
            .join(", ")})`,
      );
      let conflict = "";
      if (this.op === "upsert") {
        const on = this.conflict ? `(${columns(this.conflict)})` : "";
        const sets = keys.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ");
        conflict = this.ignoreDuplicates ? ` on conflict ${on} do nothing` : ` on conflict ${on} do update set ${sets}`;
      }
      return {
        sql: `insert into ${target} (${keys.map(ident).join(", ")}) values ${tuples.join(", ")}${conflict}${ret}`,
        values,
      };
    }
    if (this.op === "update") {
      const keys = Object.keys(this.patch);
      const values = keys.map((k) => this.patch[k] ?? null);
      const w = this.where(keys.length + 1);
      return {
        sql: `update ${target} set ${keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(", ")}${w.sql}${ret}`,
        values: [...values, ...w.values],
      };
    }
    const w = this.where(1);
    return { sql: `delete from ${target}${w.sql}${ret}`, values: w.values };
  }

  private run(): Promise<Result<unknown>> {
    return settle(async () => {
      const { sql, values } = this.build();
      const rows = await inSession(this.pg, this.session, async (tx) => (await tx.query(sql, values)).rows);
      const wantsRows = this.op === "select" || this.returning !== null;
      if (!wantsRows) return null;
      if (this.mode === "many") return rows;
      if (rows.length === 1) return rows[0];
      if (rows.length === 0 && this.mode === "maybeSingle") return null;
      const err = new Error("JSON object requested, multiple (or no) rows returned") as Error & { code: string };
      err.code = "PGRST116";
      throw err;
    });
  }

  then<A = Result<unknown>, B = never>(
    onfulfilled?: ((value: Result<unknown>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
}
