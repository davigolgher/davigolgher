"""Banco de dados, com minimizacao de dado pessoal levada a serio.

A regra que rege este arquivo: **o que nao esta guardado nao vaza, nao e
intimado e nao gera multa.** Entao:

  - Nenhum e-mail, nome ou CPF e persistido. O identificador do usuario chega
    a cada chamada e vira um HMAC antes de tocar o disco. A empresa cliente ja
    sabe quem e o usuario dela; nos nao precisamos saber.
  - Nenhum dado biometrico, em lugar nenhum. A digital nunca sai do celular.
  - Da passkey guardamos so a chave PUBLICA, que sozinha nao autentica ninguem.
  - Chaves de API sao guardadas como hash.

Se este banco inteiro vazar, o atacante ganha: uma lista de identificadores
opacos e chaves publicas. Nao da pra se passar por ninguem, nem pra saber quem
sao as pessoas.
"""

import hashlib
import hmac
import os
import secrets
import sqlite3
import time
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.environ.get("HUMANKEY_DB", BASE / "humankey.db"))
SECRET_PATH = Path(os.environ.get("HUMANKEY_SECRET", BASE / "server_secret.bin"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL
);

-- Sem e-mail, sem nome. `ref` e HMAC(segredo_do_servidor, tenant + id_externo).
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  ref        TEXT NOT NULL,
  enrollment TEXT NOT NULL DEFAULT 'self_asserted',
  created_at INTEGER NOT NULL,
  UNIQUE (tenant_id, ref)
);

CREATE TABLE IF NOT EXISTS credentials (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  credential_id TEXT NOT NULL UNIQUE,
  public_key    BLOB NOT NULL,
  sign_count    INTEGER NOT NULL DEFAULT 0,
  device_type   TEXT,
  backed_up     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);

CREATE TABLE IF NOT EXISTS challenges (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  challenge   BLOB NOT NULL,
  action      TEXT,
  context     TEXT,
  secret_hash TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);

-- Log encadeado por hash: alterar uma linha antiga quebra todas as seguintes.
CREATE TABLE IF NOT EXISTS audit (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id   TEXT,
  event     TEXT NOT NULL,
  detail    TEXT,
  at        INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,
  hash      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate (
  bucket       TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- ------------------------------------------------ prova de humanidade

CREATE TABLE IF NOT EXISTS personhood_keys (
  epoch      INTEGER PRIMARY KEY,
  n          TEXT NOT NULL,
  e          INTEGER NOT NULL,
  d          TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personhood_issued (
  user_id TEXT NOT NULL,
  epoch   INTEGER NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, epoch)
);

-- Livro de crachas gastos. Guarda o HASH do cracha, nunca o cracha.
-- Nada aqui liga a um usuario - e essa a razao de existir do modulo.
--
-- A chave primaria e SO o spend_id, sem o escopo, e isso e deliberado: se o
-- mesmo cracha pudesse ser gasto em dois sites, os dois poderiam comparar o
-- valor e concluir "e a mesma pessoa". Uso unico global fecha essa porta.
-- O preco e que cada site consome um cracha - por isso o limite por epoca
-- e, na pratica, quantos cadastros a pessoa consegue fazer no periodo.
CREATE TABLE IF NOT EXISTS personhood_spent (
  spend_id   TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  epoch      INTEGER NOT NULL,
  spent_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chal_exp  ON challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_ten ON audit(tenant_id, seq DESC);
"""


def _server_secret() -> bytes:
    """Segredo do servidor, usado pra derivar os identificadores opacos.

    Se este segredo for perdido, os usuarios ficam inalcancaveis (nao da pra
    recalcular o `ref`). Em producao ele vive num gerenciador de segredos,
    nunca no disco da aplicacao.
    """
    if not SECRET_PATH.exists():
        SECRET_PATH.write_bytes(secrets.token_bytes(32))
        SECRET_PATH.chmod(0o600)
    return SECRET_PATH.read_bytes()


def user_ref(tenant_id: str, external_id: str) -> str:
    """HMAC, nao hash simples: sem o segredo do servidor ninguem consegue
    testar 'sera que fulano@empresa.com esta nessa base?'."""
    return hmac.new(_server_secret(),
                    ("%s|%s" % (tenant_id, external_id)).encode(),
                    hashlib.sha256).hexdigest()


def connect():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


def init():
    with connect() as con:
        con.executescript(SCHEMA)


def now():
    return int(time.time())


def uid(prefix):
    return "%s_%s" % (prefix, secrets.token_hex(12))


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# --------------------------------------------------------------- tenants

def create_tenant(name):
    api_key = "hk_live_" + secrets.token_urlsafe(24)
    tid = uid("ten")
    with connect() as con:
        con.execute(
            "INSERT INTO tenants (id, name, api_key_hash, created_at) VALUES (?,?,?,?)",
            (tid, name, hash_secret(api_key), now()))
    return tid, api_key


def tenant_by_key(api_key):
    with connect() as con:
        return con.execute("SELECT * FROM tenants WHERE api_key_hash = ?",
                           (hash_secret(api_key),)).fetchone()


# ----------------------------------------------------------------- users

def upsert_user(tenant_id, external_id, enrollment=None):
    ref = user_ref(tenant_id, external_id)
    with connect() as con:
        row = con.execute("SELECT * FROM users WHERE tenant_id = ? AND ref = ?",
                          (tenant_id, ref)).fetchone()
        if row:
            if enrollment and enrollment != row["enrollment"]:
                con.execute("UPDATE users SET enrollment = ? WHERE id = ?",
                            (enrollment, row["id"]))
                return get_user(row["id"])
            return row
        u = uid("usr")
        con.execute(
            "INSERT INTO users (id, tenant_id, ref, enrollment, created_at)"
            " VALUES (?,?,?,?,?)",
            (u, tenant_id, ref, enrollment or "self_asserted", now()))
    return get_user(u)


def get_user(user_id):
    with connect() as con:
        return con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def find_user(tenant_id, external_id):
    with connect() as con:
        return con.execute("SELECT * FROM users WHERE tenant_id = ? AND ref = ?",
                           (tenant_id, user_ref(tenant_id, external_id))).fetchone()


# ----------------------------------------------------------- credentials

def add_credential(user_id, credential_id, public_key, sign_count,
                   device_type, backed_up):
    with connect() as con:
        con.execute(
            "INSERT INTO credentials (id, user_id, credential_id, public_key,"
            " sign_count, device_type, backed_up, created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (uid("cred"), user_id, credential_id, public_key, sign_count,
             device_type, int(backed_up), now()))


def credentials_for(user_id):
    with connect() as con:
        return con.execute(
            "SELECT * FROM credentials WHERE user_id = ? ORDER BY created_at",
            (user_id,)).fetchall()


def credential_by_id(credential_id):
    with connect() as con:
        return con.execute("SELECT * FROM credentials WHERE credential_id = ?",
                           (credential_id,)).fetchone()


def touch_credential(credential_id, sign_count):
    with connect() as con:
        con.execute("UPDATE credentials SET sign_count = ?, last_used_at = ?"
                    " WHERE credential_id = ?", (sign_count, now(), credential_id))


# ------------------------------------------------------------ challenges

def create_challenge(tenant_id, user_id, kind, challenge, action, context,
                     ttl_seconds=120):
    cid = uid("chl")
    client_secret = cid + "_" + secrets.token_urlsafe(24)
    with connect() as con:
        con.execute(
            "INSERT INTO challenges (id, tenant_id, user_id, kind, challenge,"
            " action, context, secret_hash, expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (cid, tenant_id, user_id, kind, challenge, action, context,
             hash_secret(client_secret), now() + ttl_seconds))
    return cid, client_secret


def consume_challenge(challenge_id, client_secret, kind):
    """Uso unico de verdade: o UPDATE condicional resolve a corrida de duas
    tentativas simultaneas - so uma delas altera a linha."""
    with connect() as con:
        row = con.execute("SELECT * FROM challenges WHERE id = ?",
                          (challenge_id,)).fetchone()
        if row is None:
            return None, "desafio inexistente"
        # Compara o segredo SEMPRE, mesmo em desafio ja usado ou expirado,
        # pra nao virar um oraculo de tempo que diz quais ids existem.
        secret_ok = hmac.compare_digest(row["secret_hash"], hash_secret(client_secret))
        if not secret_ok:
            return None, "client_secret invalido"
        if row["used_at"] is not None:
            return None, "desafio ja usado"
        if row["expires_at"] < now():
            return None, "desafio expirado"
        if row["kind"] != kind:
            return None, "tipo de desafio errado"
        cur = con.execute(
            "UPDATE challenges SET used_at = ? WHERE id = ? AND used_at IS NULL",
            (now(), challenge_id))
        if cur.rowcount != 1:
            return None, "desafio ja usado"
    return row, None


def purge_expired(older_than_seconds=86400):
    """Retencao: desafio velho nao serve pra nada e so aumenta o passivo."""
    with connect() as con:
        cur = con.execute("DELETE FROM challenges WHERE expires_at < ?",
                          (now() - older_than_seconds,))
        return cur.rowcount


# ---------------------------------------------------------- rate limiting

def rate_check(bucket: str, limit: int, window_seconds: int) -> bool:
    """Janela fixa. Devolve True se ainda pode; False se estourou.

    Sem isto, alguem enumera usuarios ou faz forca bruta em client_secret a
    vontade. Nao e sofisticado - e suficiente, e roda numa transacao so.

    A chave do balde vai HASHEADA pro disco: quem chama monta baldes como
    "verify:<tenant>:<email>", e sem o hash o e-mail acabaria persistido aqui
    - anulando toda a minimizacao de dado do resto do arquivo. Foi um teste
    que pegou isso.
    """
    t = now()
    bucket = hmac.new(_server_secret(), bucket.encode(), hashlib.sha256).hexdigest()
    with connect() as con:
        row = con.execute("SELECT * FROM rate WHERE bucket = ?", (bucket,)).fetchone()
        if row is None or t - row["window_start"] >= window_seconds:
            con.execute(
                "INSERT INTO rate (bucket, count, window_start) VALUES (?,1,?)"
                " ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = ?",
                (bucket, t, t))
            return True
        if row["count"] >= limit:
            return False
        con.execute("UPDATE rate SET count = count + 1 WHERE bucket = ?", (bucket,))
        return True


# ----------------------------------------------------------------- audit

def log(tenant_id, user_id, event, detail=""):
    """Cada linha carrega o hash da anterior. Editar o passado quebra a cadeia,
    e `audit_verify()` acusa. Auditor de banco pede isso."""
    with connect() as con:
        prev = con.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
        prev_hash = prev["hash"] if prev else "0" * 64
        at = now()
        payload = "|".join([prev_hash, tenant_id, user_id or "", event,
                            detail or "", str(at)])
        con.execute(
            "INSERT INTO audit (tenant_id, user_id, event, detail, at, prev_hash,"
            " hash) VALUES (?,?,?,?,?,?,?)",
            (tenant_id, user_id, event, detail, at, prev_hash,
             hashlib.sha256(payload.encode()).hexdigest()))


def audit_for(tenant_id, limit=50):
    with connect() as con:
        return con.execute(
            "SELECT * FROM audit WHERE tenant_id = ? ORDER BY seq DESC LIMIT ?",
            (tenant_id, limit)).fetchall()


def audit_verify():
    """Recomputa a cadeia inteira. Devolve (ok, seq_da_primeira_linha_adulterada)."""
    with connect() as con:
        prev_hash = "0" * 64
        for r in con.execute("SELECT * FROM audit ORDER BY seq"):
            payload = "|".join([prev_hash, r["tenant_id"], r["user_id"] or "",
                                r["event"], r["detail"] or "", str(r["at"])])
            expected = hashlib.sha256(payload.encode()).hexdigest()
            if r["prev_hash"] != prev_hash or r["hash"] != expected:
                return False, r["seq"]
            prev_hash = r["hash"]
    return True, None


# ------------------------------------------------- prova de humanidade

def get_epoch_key(epoch):
    with connect() as con:
        r = con.execute("SELECT * FROM personhood_keys WHERE epoch = ?",
                        (epoch,)).fetchone()
    return None if r is None else {"epoch": r["epoch"], "n": int(r["n"]),
                                   "e": r["e"], "d": int(r["d"])}


def put_epoch_key(epoch, key):
    with connect() as con:
        con.execute(
            "INSERT OR IGNORE INTO personhood_keys (epoch, n, e, d, created_at)"
            " VALUES (?,?,?,?,?)",
            (epoch, str(key["n"]), key["e"], str(key["d"]), now()))
    return get_epoch_key(epoch)


def issued_count(user_id, epoch):
    with connect() as con:
        r = con.execute("SELECT count FROM personhood_issued WHERE user_id = ?"
                        " AND epoch = ?", (user_id, epoch)).fetchone()
    return r["count"] if r else 0


def add_issued(user_id, epoch, n, limit):
    """Incrementa o contador e recusa se estourar o limite - na mesma
    transacao, pra duas chamadas simultaneas nao furarem o teto."""
    with connect() as con:
        con.execute("INSERT OR IGNORE INTO personhood_issued (user_id, epoch,"
                    " count) VALUES (?,?,0)", (user_id, epoch))
        cur = con.execute(
            "UPDATE personhood_issued SET count = count + ? WHERE user_id = ?"
            " AND epoch = ? AND count + ? <= ?", (n, user_id, epoch, n, limit))
        return cur.rowcount == 1


def spend(spend_id, scope, epoch):
    """Gasta um cracha. False se ja foi gasto em QUALQUER escopo.

    Global, nao por escopo: ver o comentario na tabela.
    """
    try:
        with connect() as con:
            con.execute("INSERT INTO personhood_spent (spend_id, scope, epoch,"
                        " spent_at) VALUES (?,?,?,?)",
                        (spend_id, scope, epoch, now()))
        return True
    except sqlite3.IntegrityError:
        return False
