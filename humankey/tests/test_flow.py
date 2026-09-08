"""Testes de ponta a ponta.

Cada teste corresponde a um ataque concreto. Se um deles passar quando nao
deveria, existe um buraco de seguranca real - nao e "so um teste vermelho".
"""

import os
import sys
import tempfile
from pathlib import Path

os.environ["HUMANKEY_DB"] = str(Path(tempfile.mkdtemp()) / "test.db")
os.environ["RP_ID"] = "localhost"
os.environ["ORIGIN"] = "http://localhost:8000"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient          # noqa: E402
from app import main, store                        # noqa: E402
from tests.authenticator import VirtualAuthenticator  # noqa: E402

ORIGIN = "http://localhost:8000"
c = TestClient(main.app)
_, API_KEY = main._demo_tenant()
AUTH = {"Authorization": "Bearer " + API_KEY}

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(name)
    print("  %s %s%s" % ("OK  " if condition else "FALHOU", name,
                         "" if condition else "   <- " + str(detail)))


# ------------------------------------------------------------- helpers

def enroll(user, level="self_asserted", authenticator=None, uv=True):
    a = authenticator or VirtualAuthenticator()
    s = c.post("/v1/enrollments", headers=AUTH, json={
        "external_id": user, "display": user, "enrollment_level": level}).json()
    r = c.post("/v1/enrollments/%s/complete" % s["enrollment_id"], json={
        "client_secret": s["client_secret"],
        "credential": a.register(s["options"], ORIGIN, user_verified=uv)})
    return a, r


def start_verify(user, action="login", context=None):
    return c.post("/v1/verifications", headers=AUTH, json={
        "external_id": user, "action": action, "context": context or {}}).json()


def finish_verify(s, a, **kw):
    return c.post("/v1/verifications/%s/complete" % s["verification_id"], json={
        "client_secret": s["client_secret"],
        "credential": a.authenticate(s["options"], ORIGIN, **kw)})


# --------------------------------------------------------------- testes

print("\nFLUXO NORMAL")
carlos, reg = enroll("carlos@banco.com", "identity_proofed")
check("cadastro aceito", reg.status_code == 200, reg.text)
check("nivel de cadastro registrado",
      reg.json().get("enrollment") == "identity_proofed", reg.text)

s = start_verify("carlos@banco.com", "wire_transfer", {"amount_brl": 25000000})
r = finish_verify(s, carlos)
check("verificacao aceita", r.status_code == 200, r.text)
claims = r.json()["claims"]
check("biometria registrada no token", claims["aal"] == "user_verified", claims)
check("acao amarrada no token", claims["action"] == "wire_transfer", claims)
check("contexto amarrado no token",
      claims["ctx"]["amount_brl"] == 25000000, claims)

d = c.post("/demo/approve", json={"token": r.json()["token"],
                                  "action": "wire_transfer",
                                  "min_enrollment": "identity_proofed"}).json()
check("backend aprova a transferencia", d["approved"] is True, d)


print("\nATAQUE: reusar a assinatura do login pra aprovar a transferencia")
s = start_verify("carlos@banco.com", "login")
r = finish_verify(s, carlos)
d = c.post("/demo/approve", json={"token": r.json()["token"],
                                  "action": "wire_transfer",
                                  "min_enrollment": "identity_proofed"}).json()
check("token de 'login' NAO aprova transferencia", d["approved"] is False, d)


print("\nATAQUE: cadastro fraco tentando operacao de alto valor")
enroll("ana@banco.com", "self_asserted")  # ninguem conferiu quem e a Ana
ana_auth, _ = enroll("ana2@banco.com", "self_asserted")
s = start_verify("ana2@banco.com", "wire_transfer")
r = finish_verify(s, ana_auth)
d = c.post("/demo/approve", json={"token": r.json()["token"],
                                  "action": "wire_transfer",
                                  "min_enrollment": "identity_proofed"}).json()
check("cadastro 'self_asserted' e barrado", d["approved"] is False, d)


print("\nATAQUE: golpista com o proprio celular (o caso do deepfake)")
# Ele imita o rosto e a voz do Carlos perfeitamente, mas o celular e o dele.
golpista = VirtualAuthenticator()
s = start_verify("carlos@banco.com", "wire_transfer")
r = finish_verify(s, golpista)
check("celular do golpista rejeitado", r.status_code == 400, r.text)


print("\nATAQUE: repetir um desafio ja usado (replay)")
s = start_verify("carlos@banco.com", "login")
finish_verify(s, carlos)
r2 = finish_verify(s, carlos)
check("desafio de uso unico", r2.status_code == 400, r2.text)


print("\nATAQUE: adivinhar o client_secret")
s = start_verify("carlos@banco.com", "login")
r = c.post("/v1/verifications/%s/complete" % s["verification_id"], json={
    "client_secret": "chute_errado",
    "credential": carlos.authenticate(s["options"], ORIGIN)})
check("client_secret errado rejeitado", r.status_code == 400, r.text)


print("\nATAQUE: assinar sem biometria (celular desbloqueado na mesa)")
s = start_verify("carlos@banco.com", "login")
r = finish_verify(s, carlos, user_verified=False)
check("assinatura sem biometria rejeitada", r.status_code == 400, r.text)


print("\nATAQUE: usar a passkey da Ana no desafio do Carlos")
from webauthn.helpers import bytes_to_base64url  # noqa: E402
s = start_verify("carlos@banco.com", "login")
r = finish_verify(s, ana_auth,
                  credential_id=bytes_to_base64url(ana_auth.credential_id))
check("passkey de outro usuario rejeitada", r.status_code == 400, r.text)


print("\nATAQUE: desafio expirado")
s = start_verify("carlos@banco.com", "login")
with store.connect() as con:
    con.execute("UPDATE challenges SET expires_at = 1 WHERE id = ?",
                (s["verification_id"],))
r = finish_verify(s, carlos)
check("desafio expirado rejeitado", r.status_code == 400, r.text)


print("\nATAQUE: outra empresa tentando usar o token")
s = start_verify("carlos@banco.com", "login")
tok = finish_verify(s, carlos).json()["token"]
from app import tokens  # noqa: E402
try:
    tokens.verify(tok, tenant_id="ten_outra_empresa")
    check("token so vale pra empresa que pediu", False, "aceitou!")
except Exception:
    check("token so vale pra empresa que pediu", True)


print("\nCONTROLE DE ACESSO DA API")
r = c.post("/v1/verifications", json={"external_id": "carlos@banco.com"})
check("sem chave de API e barrado", r.status_code == 401, r.text)
r = c.post("/v1/verifications", headers={"Authorization": "Bearer hk_live_falsa"},
           json={"external_id": "carlos@banco.com"})
check("chave de API falsa e barrada", r.status_code == 401, r.text)
r = c.post("/v1/verifications", headers=AUTH, json={"external_id": "ninguem@x.com"})
check("usuario inexistente e barrado", r.status_code == 404, r.text)


print("\n%d passaram, %d falharam" % (len(PASS), len(FAIL)))
if FAIL:
    print("FALHAS: " + ", ".join(FAIL))
raise SystemExit(1 if FAIL else 0)
