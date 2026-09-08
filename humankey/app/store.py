"""Banco de dados. SQLite de proposito: um arquivo, zero configuracao.

Cinco tabelas:
  tenants        as empresas que usam o servico (os seus clientes)
  users          os usuarios finais de cada empresa
  credentials    as passkeys - so a chave PUBLICA fica aqui
  challenges     os desafios em aberto, de uso unico e com prazo
  audit          o log do que aconteceu (nao da pra apagar)

O que NAO existe aqui: nenhuma senha, nenhum dado biometrico, nenhuma foto.
A digital do usuario nunca sai do celular dele. O que a gente guarda e uma
chave publica, que sozinha nao serve pra nada - por isso um vazamento deste
banco nao permite ninguem se passar por ninguem.
"""

import os
import secrets
import sqlite3
import time
from hashlib import sha256
from pathlib import Path

DB_PATH = Path(os.environ.get(
    "HUMANKEY_DB", Path(__file__).resolve().parents[1] / "humankey.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  external_id TEXT NOT NULL,          -- o id que a empresa ja usa pro usuario
  display     TEXT NOT NULL,
  -- O quanto a empresa checou QUEM e essa pessoa na hora do cadastro.
  -- E o teto de confianca de tudo que vier depois. Ver README.
  enrollment  TEXT NOT NULL DEFAULT 'self_asserted',
  created_at  INTEGER NOT NULL,
  UNIQUE (tenant_id, external_id)
);

CREATE TABLE IF NOT EXISTS credentials (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  credential_id TEXT NOT NULL UNIQUE, -- base64url
  public_key    BLOB NOT NULL,
  sign_count    INTEGER NOT NULL DEFAULT 0,
  device_type   TEXT,                 -- single_device | multi_device
  backed_up     INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);

CREATE TABLE IF NOT EXISTS challenges (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  kind          TEXT NOT NULL,        -- enroll | verify
  challenge     BLOB NOT NULL,
  action        TEXT,                 -- a que este desafio esta amarrado
  context       TEXT,                 -- JSON livre (valor, destino, etc)
  secret_hash   TEXT NOT NULL,        -- hash do client_secret
  expires_at    INTEGER NOT NULL,
  used_at       INTEGER
);

CREATE TABLE IF NOT EXISTS audit (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  user_id    TEXT,
  event      TEXT NOT NULL,
  detail     TEXT,
  at         INTEGER NOT NULL
);
"""


def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init():
    with connect() as con:
        con.executescript(SCHEMA)


def now():
    return int(time.time())


def uid(prefix):
    return "%s_%s" % (prefix, secrets.token_hex(12))


def hash_secret(value: str) -> str:
    """Guardamos so o hash. Se este banco vazar, as chaves de API nao vazam."""
    return sha256(value.encode()).hexdigest()


# --------------------------------------------------------------- tenants

def create_tenant(name):
    """Cria uma empresa cliente e devolve a chave de API UMA unica vez."""
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

def upsert_user(tenant_id, external_id, display, enrollment=None):
    with connect() as con:
        row = con.execute(
            "SELECT * FROM users WHERE tenant_id = ? AND external_id = ?",
            (tenant_id, external_id)).fetchone()
        if row:
            if enrollment and enrollment != row["enrollment"]:
                con.execute("UPDATE users SET enrollment = ? WHERE id = ?",
                            (enrollment, row["id"]))
                return get_user(row["id"])
            return row
        u = uid("usr")
        con.execute(
            "INSERT INTO users (id, tenant_id, external_id, display, enrollment,"
            " created_at) VALUES (?,?,?,?,?,?)",
            (u, tenant_id, external_id, display, enrollment or "self_asserted", now()))
    return get_user(u)


def get_user(user_id):
    with connect() as con:
        return con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def find_user(tenant_id, external_id):
    with connect() as con:
        return con.execute(
            "SELECT * FROM users WHERE tenant_id = ? AND external_id = ?",
            (tenant_id, external_id)).fetchone()


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
        con.execute(
            "UPDATE credentials SET sign_count = ?, last_used_at = ?"
            " WHERE credential_id = ?", (sign_count, now(), credential_id))


# ------------------------------------------------------------ challenges

def create_challenge(tenant_id, user_id, kind, challenge, action, context,
                     ttl_seconds=120):
    """Desafio de uso unico e com prazo curto.

    O prazo e o que impede o golpista de guardar uma assinatura boa de hoje
    e usar amanha. O client_secret e o que o navegador usa pra concluir sem
    nunca ver a chave de API da empresa.
    """
    cid = uid("chl")
    client_secret = cid + "_" + secrets.token_urlsafe(24)
    with connect() as con:
        con.execute(
            "INSERT INTO challenges (id, tenant_id, user_id, kind, challenge,"
            " action, context, secret_hash, expires_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (cid, tenant_id, user_id, kind, challenge, action, context,
             hash_secret(client_secret), now() + ttl_seconds))
    return cid, client_secret


def consume_challenge(challenge_id, client_secret, kind):
    """Devolve o desafio e o marca como usado, na MESMA transacao.

    Uso unico de verdade: uma segunda tentativa com o mesmo segredo falha,
    mesmo que chegue no mesmo instante.
    """
    with connect() as con:
        row = con.execute("SELECT * FROM challenges WHERE id = ?",
                          (challenge_id,)).fetchone()
        if row is None:
            return None, "desafio inexistente"
        if row["used_at"] is not None:
            return None, "desafio ja usado"
        if row["expires_at"] < now():
            return None, "desafio expirado"
        if row["kind"] != kind:
            return None, "tipo de desafio errado"
        if not secrets.compare_digest(row["secret_hash"], hash_secret(client_secret)):
            return None, "client_secret invalido"
        cur = con.execute(
            "UPDATE challenges SET used_at = ? WHERE id = ? AND used_at IS NULL",
            (now(), challenge_id))
        if cur.rowcount != 1:
            return None, "desafio ja usado"
    return row, None


# ----------------------------------------------------------------- audit

def log(tenant_id, user_id, event, detail=""):
    with connect() as con:
        con.execute(
            "INSERT INTO audit (id, tenant_id, user_id, event, detail, at)"
            " VALUES (?,?,?,?,?,?)",
            (uid("evt"), tenant_id, user_id, event, detail, now()))


def audit_for(tenant_id, limit=50):
    with connect() as con:
        return con.execute(
            "SELECT * FROM audit WHERE tenant_id = ? ORDER BY at DESC, rowid DESC"
            " LIMIT ?", (tenant_id, limit)).fetchall()
