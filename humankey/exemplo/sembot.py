"""SemBot - uma rede social sem bots.

Este arquivo NAO faz parte do humankey. Ele e um CLIENTE: o codigo que uma
empresa qualquer escreveria pra usar o servico. Roda separado, na porta 8001,
com banco de dados proprio.

A regra da SemBot: pra criar conta voce precisa de um cracha anonimo. Sem
cracha, sem conta. Com isso ela ganha duas coisas ao mesmo tempo, que
normalmente sao inimigas:

    - nenhum bot, porque cada conta consumiu um cracha de um humano verificado
    - nenhuma identidade, porque o cracha nao diz quem e a pessoa

Repare no que este arquivo NAO tem: nem e-mail, nem senha, nem telefone, nem
"login com Google". A SemBot nao faz ideia de quem sao os usuarios dela - e
mesmo assim nao tem bot. Essa combinacao e o produto inteiro.
"""

import hashlib
import os
import secrets
import sqlite3
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
DB = Path(os.environ.get("SEMBOT_DB", BASE / "sembot.db"))
HUMANKEY = os.environ.get("HUMANKEY_URL", "http://localhost:8000")
ESCOPO = "sembot.local"          # o "nome" da SemBot no ecossistema

app = FastAPI(title="SemBot")


def con():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c


with con() as c:
    c.executescript("""
    -- Olhe as colunas. Nao existe e-mail, nome, telefone nem senha.
    CREATE TABLE IF NOT EXISTS contas (
      id         TEXT PRIMARY KEY,
      apelido    TEXT NOT NULL UNIQUE,
      badge_hash TEXT NOT NULL UNIQUE,   -- so pra nao aceitar o mesmo 2x aqui
      sessao     TEXT NOT NULL,
      criada_em  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id       TEXT PRIMARY KEY,
      conta_id TEXT NOT NULL REFERENCES contas(id),
      texto    TEXT NOT NULL,
      em       INTEGER NOT NULL
    );
    """)


class CriarConta(BaseModel):
    apelido: str = Field(min_length=2, max_length=24)
    badge: dict


@app.post("/criar-conta")
def criar_conta(body: CriarConta):
    """O unico requisito pra entrar: um cracha anonimo valido.

    A SemBot nao conhece o banco que emitiu o cracha, nao tem contrato com
    ninguem e nao precisa de chave de API. Ela so pergunta ao humankey se o
    cracha vale - e a resposta e sim ou nao, sem nome junto.
    """
    try:
        r = httpx.post("%s/v1/personhood/redeem" % HUMANKEY, timeout=10, json={
            "epoch": body.badge.get("epoch"),
            "token": body.badge.get("token"),
            "signature": body.badge.get("signature"),
            "scope": ESCOPO})
    except httpx.HTTPError:
        raise HTTPException(503, "o humankey nao esta respondendo em %s" % HUMANKEY)

    if r.status_code != 200:
        detalhe = r.json().get("detail", "cracha recusado")
        raise HTTPException(400, "cracha recusado: %s" % detalhe)

    # A resposta e literalmente {"ok", "human", "scope", "epoch"}.
    # Nao vem nome, nem e-mail, nem de qual emissor veio.
    resposta_do_humankey = r.json()

    badge_hash = hashlib.sha256(body.badge["token"].encode()).hexdigest()
    conta_id = "acc_" + secrets.token_hex(8)
    sessao = secrets.token_urlsafe(24)
    try:
        with con() as c:
            c.execute("INSERT INTO contas (id, apelido, badge_hash, sessao,"
                      " criada_em) VALUES (?,?,?,?,?)",
                      (conta_id, body.apelido, badge_hash, sessao, int(time.time())))
    except sqlite3.IntegrityError as e:
        campo = "apelido" if "apelido" in str(e) else "cracha"
        raise HTTPException(409, "esse %s ja esta em uso aqui" % campo)

    return {"conta_id": conta_id, "apelido": body.apelido, "sessao": sessao,
            "o_que_a_sembot_aprendeu": resposta_do_humankey}


class Postar(BaseModel):
    sessao: str
    texto: str = Field(min_length=1, max_length=280)


@app.post("/postar")
def postar(body: Postar):
    with con() as c:
        conta = c.execute("SELECT * FROM contas WHERE sessao = ?",
                          (body.sessao,)).fetchone()
        if conta is None:
            raise HTTPException(401, "sessao invalida")
        c.execute("INSERT INTO posts (id, conta_id, texto, em) VALUES (?,?,?,?)",
                  ("post_" + secrets.token_hex(6), conta["id"], body.texto,
                   int(time.time())))
    return {"ok": True}


@app.get("/posts")
def posts():
    with con() as c:
        linhas = c.execute(
            "SELECT p.texto, p.em, ct.apelido FROM posts p"
            " JOIN contas ct ON ct.id = p.conta_id ORDER BY p.em DESC LIMIT 50"
        ).fetchall()
    return {"posts": [dict(l) for l in linhas]}


@app.get("/meu-banco")
def meu_banco():
    """O momento didatico: o banco de dados inteiro da SemBot, exposto.

    Procure um e-mail. Procure um nome. Procure qualquer coisa que ligue uma
    conta a uma pessoa do mundo real. Nao tem - e mesmo assim nao tem bot.
    """
    with con() as c:
        contas = [dict(r) for r in c.execute("SELECT * FROM contas")]
    for x in contas:
        x["sessao"] = x["sessao"][:8] + "..."
    return {"contas": contas,
            "colunas_que_nao_existem": ["email", "nome", "telefone", "senha",
                                        "cpf", "foto", "ip"]}


@app.get("/")
def home():
    return FileResponse(BASE / "web" / "index.html")


app.mount("/static", StaticFiles(directory=BASE / "web"), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8001)))
