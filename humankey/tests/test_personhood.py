"""Testes da prova de humanidade anonima.

A privacidade aqui e uma afirmacao TECNICA, entao tem que ser testada como
tal. Nao basta escrever "nos respeitamos sua privacidade" no site.
"""

import os
import sys
import tempfile
from pathlib import Path

os.environ["HUMANKEY_DB"] = str(Path(tempfile.mkdtemp()) / "p.db")
os.environ["HUMANKEY_SECRET"] = str(Path(tempfile.mkdtemp()) / "s.bin")
os.environ["HUMANKEY_DEMO_FILE"] = str(Path(tempfile.mkdtemp()) / "d.json")
os.environ["RP_ID"] = "localhost"
os.environ["ORIGIN"] = "http://localhost:8000"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient                 # noqa: E402
from webauthn.helpers import bytes_to_base64url           # noqa: E402
from app import main, personhood, store                   # noqa: E402
from tests.authenticator import VirtualAuthenticator      # noqa: E402

ORIGIN = "http://localhost:8000"
c = TestClient(main.app)
_, API_KEY = main._demo_tenant()
AUTH = {"Authorization": "Bearer " + API_KEY}

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print("  %s %s%s" % ("OK  " if cond else "FALHOU", name,
                         "" if cond else "   <- " + str(detail)))


def onboard(user, level):
    """Cadastra e verifica com acao 'personhood'. Devolve o cracha da Parte 1."""
    a = VirtualAuthenticator()
    s = c.post("/v1/enrollments", headers=AUTH, json={
        "external_id": user, "display": user, "enrollment_level": level}).json()
    c.post("/v1/enrollments/%s/complete" % s["enrollment_id"], json={
        "client_secret": s["client_secret"],
        "credential": a.register(s["options"], ORIGIN)})
    v = c.post("/v1/verifications", headers=AUTH, json={
        "external_id": user, "action": "personhood"}).json()
    r = c.post("/v1/verifications/%s/complete" % v["verification_id"], json={
        "client_secret": v["client_secret"], "external_id": user,
        "credential": a.authenticate(v["options"], ORIGIN)})
    return r.json()["token"]


def get_badges(token, count=1):
    """O lado do usuario: gera segredos, fecha envelopes, pede assinatura,
    desembrulha. O servidor nunca ve os segredos."""
    p = c.get("/v1/personhood/params").json()
    n, e = int(p["n"]), p["e"]
    made = [personhood.make_token() for _ in range(count)]
    blinded, rinvs = [], []
    for m in made:
        b, rinv = personhood.blind(m, n, e)
        blinded.append(str(b)); rinvs.append(rinv)
    r = c.post("/v1/personhood/tokens", headers=AUTH,
               json={"token": token, "blinded": blinded})
    if r.status_code != 200:
        return r, None
    sigs = r.json()["signatures"]
    badges = [{"epoch": r.json()["epoch"],
               "token": bytes_to_base64url(made[i]),
               "signature": str(personhood.unblind(int(sigs[i]), rinvs[i], n))}
              for i in range(count)]
    return r, badges


print("\nFLUXO NORMAL")
tok = onboard("davi@banco.com", "identity_proofed")
r, badges = get_badges(tok, 3)
check("emissao de crachas anonimos", r.status_code == 200, r.text)

red = c.post("/v1/personhood/redeem", json=dict(badges[0], scope="twitter.com"))
check("site aceita o cracha", red.status_code == 200 and red.json()["human"], red.text)


print("\nPRIVACIDADE (as afirmacoes que precisam ser verdade)")
with store.connect() as con:
    spent = [dict(x) for x in con.execute("SELECT * FROM personhood_spent")]
    issued = [dict(x) for x in con.execute("SELECT * FROM personhood_issued")]
check("livro de gastos nao guarda usuario",
      all("user" not in k for row in spent for k in row), spent)
check("contador de emissao nao guarda cracha",
      all("token" not in k and "spend" not in k for row in issued for k in row), issued)
check("o cracha gasto nao aparece ligado a ninguem",
      not any(personhood.spend_id(b"x") == r["spend_id"] for r in spent) and len(spent) == 1)

# O que o emissor viu foi o valor cego; o que o site viu foi o cracha.
# Nao existe nada em comum entre os dois.
p = c.get("/v1/personhood/params").json()
m = personhood.make_token()
b, _ = personhood.blind(m, int(p["n"]), p["e"])
check("valor cego nao revela o cracha",
      str(b) != str(int.from_bytes(m, "big")) and len(str(b)) > 300)


print("\nATAQUE: gastar o mesmo cracha duas vezes")
again = c.post("/v1/personhood/redeem", json=dict(badges[0], scope="twitter.com"))
check("double spend barrado", again.status_code == 409, again.text)


print("\nATAQUE: usar o mesmo cracha em outro site pra cruzar identidade")
outro = c.post("/v1/personhood/redeem", json=dict(badges[0], scope="tinder.com"))
check("cracha ja gasto nao serve em outro site (impede cruzamento)",
      outro.status_code == 409, outro.text)


print("\nATAQUE: forjar assinatura sem o emissor")
falso = dict(badges[1])
falso["signature"] = str(int(falso["signature"]) + 1)
r = c.post("/v1/personhood/redeem", json=dict(falso, scope="twitter.com"))
check("assinatura forjada rejeitada", r.status_code == 400, r.text)

k = store.get_epoch_key(main.current_epoch())
sozinho = {"epoch": k["epoch"], "token": bytes_to_base64url(personhood.make_token()),
           "signature": "12345", "scope": "twitter.com"}
r = c.post("/v1/personhood/redeem", json=sozinho)
check("cracha inventado do zero rejeitado", r.status_code == 400, r.text)


print("\nATAQUE: fabrica de humanos falsos (cadastro fraco)")
fraco = onboard("bot@fazenda.com", "self_asserted")
r, _ = get_badges(fraco, 1)
check("cadastro 'self_asserted' nao gera cracha anonimo", r.status_code == 403, r.text)


print("\nATAQUE: reaproveitar um token de login para pedir crachas")
a = VirtualAuthenticator()
s = c.post("/v1/enrollments", headers=AUTH, json={
    "external_id": "ana@banco.com", "display": "ana",
    "enrollment_level": "identity_proofed"}).json()
c.post("/v1/enrollments/%s/complete" % s["enrollment_id"], json={
    "client_secret": s["client_secret"], "credential": a.register(s["options"], ORIGIN)})
v = c.post("/v1/verifications", headers=AUTH,
           json={"external_id": "ana@banco.com", "action": "login"}).json()
login_tok = c.post("/v1/verifications/%s/complete" % v["verification_id"], json={
    "client_secret": v["client_secret"], "external_id": "ana@banco.com",
    "credential": a.authenticate(v["options"], ORIGIN)}).json()["token"]
r, _ = get_badges(login_tok, 1)
check("token de 'login' nao vira cracha anonimo", r.status_code == 400, r.text)


print("\nLIMITE POR PESSOA (o que segura fazenda de bots)")
r, _ = get_badges(tok, 3)   # ja pegou 3; o teto e 5
check("estourar o teto da epoca e barrado", r.status_code == 429, r.text)


print("\nDEFESA CONTRA MARCACAO (o emissor tentando identificar pela chave)")
p1 = c.get("/v1/personhood/params").json()
p2 = c.get("/v1/personhood/params").json()
check("uma unica chave por epoca, igual pra todos",
      p1["n"] == p2["n"] and p1["epoch"] == p2["epoch"])
check("a chave e publica e auditavel", "n" in p1 and "e" in p1 and "d" not in p1)


print("\nEPOCA VENCIDA")
old = store.put_epoch_key(main.current_epoch() - 5, personhood.generate_epoch_key())
r = c.post("/v1/personhood/redeem", json={
    "epoch": old["epoch"], "token": bytes_to_base64url(personhood.make_token()),
    "signature": "999", "scope": "twitter.com"})
check("cracha de epoca vencida rejeitado", r.status_code == 400, r.text)


print("\n%d passaram, %d falharam" % (len(PASS), len(FAIL)))
if FAIL:
    print("FALHAS: " + ", ".join(FAIL))
raise SystemExit(1 if FAIL else 0)
