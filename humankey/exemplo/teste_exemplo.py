"""A historia inteira, com os dois servicos rodando de verdade.

Sobe o humankey num servidor HTTP real, e faz a SemBot conversar com ele por
rede - exatamente como um cliente faria em producao. Nada de mock.
"""

import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path

d = tempfile.mkdtemp()
os.environ.update(HUMANKEY_DB=d + "/hk.db", HUMANKEY_SECRET=d + "/s.bin",
                  HUMANKEY_DEMO_FILE=d + "/t.json", SEMBOT_DB=d + "/sb.db",
                  RP_ID="localhost", ORIGIN="http://localhost:8000",
                  HUMANKEY_URL="http://127.0.0.1:8765")

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "exemplo"))

import uvicorn                                             # noqa: E402
from fastapi.testclient import TestClient                  # noqa: E402
from webauthn.helpers import bytes_to_base64url            # noqa: E402
from app import main as humankey, personhood               # noqa: E402
from tests.authenticator import VirtualAuthenticator       # noqa: E402
import sembot                                              # noqa: E402

PASS, FAIL = [], []


def check(nome, cond, detalhe=""):
    (PASS if cond else FAIL).append(nome)
    print("  %s %s%s" % ("OK  " if cond else "FALHOU", nome,
                         "" if cond else "   <- " + str(detalhe)))


# --- sobe o humankey num servidor HTTP de verdade -------------------------
srv = uvicorn.Server(uvicorn.Config(humankey.app, host="127.0.0.1", port=8765,
                                    log_level="error"))
threading.Thread(target=srv.run, daemon=True).start()
for _ in range(100):
    if srv.started:
        break
    time.sleep(0.05)

hk = TestClient(humankey.app)
sb = TestClient(sembot.app)
_, API_KEY = humankey._demo_tenant()
AUTH = {"Authorization": "Bearer " + API_KEY}
ORIGIN = "http://localhost:8000"


def pegar_crachas(usuario, quantos):
    """O que o navegador do usuario faz no site do banco."""
    a = VirtualAuthenticator()
    e = hk.post("/v1/enrollments", headers=AUTH, json={
        "external_id": usuario, "display": usuario,
        "enrollment_level": "identity_proofed"}).json()
    hk.post("/v1/enrollments/%s/complete" % e["enrollment_id"], json={
        "client_secret": e["client_secret"],
        "credential": a.register(e["options"], ORIGIN)})
    v = hk.post("/v1/verifications", headers=AUTH, json={
        "external_id": usuario, "action": "personhood"}).json()
    prova = hk.post("/v1/verifications/%s/complete" % v["verification_id"], json={
        "client_secret": v["client_secret"], "external_id": usuario,
        "credential": a.authenticate(v["options"], ORIGIN)}).json()["token"]

    p = hk.get("/v1/personhood/params").json()
    n, e_pub = int(p["n"]), p["e"]
    segredos, invs, cegos = [], [], []
    for _ in range(quantos):
        m = personhood.make_token()
        b, inv = personhood.blind(m, n, e_pub)
        segredos.append(m); invs.append(inv); cegos.append(str(b))
    r = hk.post("/v1/personhood/tokens", headers=AUTH,
                json={"token": prova, "blinded": cegos}).json()
    return [{"epoch": r["epoch"], "token": bytes_to_base64url(segredos[i]),
             "signature": str(personhood.unblind(int(r["signatures"][i]), invs[i], n))}
            for i in range(quantos)]


print("\nO CARLOS PEGA CRACHAS NO BANCO")
crachas = pegar_crachas("carlos@banco.com", 3)
check("banco emitiu 3 crachas anonimos", len(crachas) == 3)


print("\nELE CRIA CONTA NA SEMBOT, QUE NAO O CONHECE")
r = sb.post("/criar-conta", json={"apelido": "pinguim42", "badge": crachas[0]})
check("conta criada", r.status_code == 200, r.text)
aprendeu = r.json()["o_que_a_sembot_aprendeu"]
check("a SemBot so aprendeu que e um humano",
      set(aprendeu) == {"ok", "human", "scope", "epoch"}, aprendeu)
check("nada no retorno identifica a pessoa",
      "carlos" not in json.dumps(r.json()).lower(), r.text)
sessao = r.json()["sessao"]


print("\nATAQUE: fazenda de bots reusando o mesmo cracha")
r2 = sb.post("/criar-conta", json={"apelido": "pinguim43", "badge": crachas[0]})
check("segunda conta com o mesmo cracha e barrada", r2.status_code == 400, r2.text)
check("o motivo veio do humankey, nao da SemBot",
      "cracha" in r2.json()["detail"], r2.text)


print("\nATAQUE: cracha inventado")
falso = dict(crachas[1]); falso["signature"] = str(int(falso["signature"]) + 1)
r3 = sb.post("/criar-conta", json={"apelido": "bot99", "badge": falso})
check("assinatura forjada e barrada", r3.status_code == 400, r3.text)


print("\nUSO NORMAL")
sb.post("/postar", json={"sessao": sessao, "texto": "primeiro post sem bot"})
r = sb.post("/criar-conta", json={"apelido": "coruja7", "badge": crachas[1]})
check("segunda pessoa entra com o proprio cracha", r.status_code == 200, r.text)
sb.post("/postar", json={"sessao": r.json()["sessao"], "texto": "oi pinguim"})
tl = sb.get("/posts").json()["posts"]
check("linha do tempo com 2 posts", len(tl) == 2, tl)
check("postar sem sessao valida e barrado",
      sb.post("/postar", json={"sessao": "invento", "texto": "x"}).status_code == 401)


print("\nO QUE A SEMBOT GUARDA")
banco = sb.get("/meu-banco").json()
print("   " + json.dumps(banco["contas"], indent=2).replace("\n", "\n   "))
bruto = json.dumps(banco).lower()
check("nenhum e-mail no banco da SemBot", "@" not in bruto, bruto[:200])
check("nenhuma mencao ao usuario real", "carlos" not in bruto)
check("nenhum cracha em claro", not any(c["token"] in json.dumps(banco)
                                        for c in crachas))

print("\n%d passaram, %d falharam" % (len(PASS), len(FAIL)))
if FAIL:
    print("FALHAS: " + ", ".join(FAIL))
srv.should_exit = True
raise SystemExit(1 if FAIL else 0)
