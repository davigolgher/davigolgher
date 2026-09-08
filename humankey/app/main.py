"""humankey - API de prova de humano verificado.

Modelo mental: e o Stripe, mas em vez de cobrar, prova que tem uma pessoa
real e cadastrada do outro lado.

Fluxo, do jeito que a empresa cliente usa:

  1. O BACKEND da empresa chama POST /v1/verifications com a chave de API.
     Recebe um `client_secret` - descartavel, vale 2 minutos, so serve pra
     esta acao especifica.
  2. O NAVEGADOR do usuario recebe so o client_secret (nunca a chave de API)
     e conclui o desafio com a passkey.
  3. A empresa recebe um token assinado e confere no servidor dela.

Amarracao da acao (a parte que quase todo mundo esquece): o desafio nasce
preso a uma acao especifica - "transferir R$ 25 milhoes pra conta X". Uma
assinatura feita pra "entrar no sistema" nao pode ser reaproveitada pra
aprovar a transferencia, porque e outro desafio.
"""

import json
import os
from pathlib import Path

import webauthn
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from webauthn.helpers import structs

from . import store, tokens

BASE = Path(__file__).resolve().parents[1]

# Em producao: RP_ID e o dominio da empresa cliente (ex.: "banco.com.br") e
# ORIGIN e a URL exata. A passkey fica AMARRADA a esse dominio - por isso um
# site clonado nao consegue usa-la. E dai que vem a resistencia a phishing.
RP_ID = os.environ.get("RP_ID", "localhost")
RP_NAME = os.environ.get("RP_NAME", "humankey")
ORIGIN = os.environ.get("ORIGIN", "http://localhost:8000")

ENROLLMENT_LEVELS = ("self_asserted", "vouched", "identity_proofed")

app = FastAPI(title="humankey", version="0.1.0")
store.init()


# ----------------------------------------------------------------- auth

def tenant(authorization: str = Header(default="")):
    """Autentica a EMPRESA. Nunca chega no navegador do usuario final."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "faltou o header Authorization: Bearer <api_key>")
    row = store.tenant_by_key(authorization[7:])
    if row is None:
        raise HTTPException(401, "chave de API invalida")
    return row


# ------------------------------------------------------------ cadastro

class EnrollStart(BaseModel):
    external_id: str
    display: str = ""
    enrollment_level: str = "self_asserted"


@app.post("/v1/enrollments")
def enroll_start(body: EnrollStart, t=Depends(tenant)):
    """Passo 1 do cadastro: pede pro aparelho do usuario criar uma passkey."""
    if body.enrollment_level not in ENROLLMENT_LEVELS:
        raise HTTPException(400, "enrollment_level deve ser um de %s"
                            % (ENROLLMENT_LEVELS,))
    user = store.upsert_user(t["id"], body.external_id,
                             body.display or body.external_id,
                             body.enrollment_level)

    opts = webauthn.generate_registration_options(
        rp_id=RP_ID, rp_name=RP_NAME,
        user_id=user["id"].encode(),
        user_name=user["external_id"], user_display_name=user["display"],
        # resident_key=required -> a passkey vive no aparelho e aparece sozinha,
        # sem o usuario precisar digitar quem ele e.
        # user_verification=required -> o aparelho EXIGE digital/Face ID/PIN.
        # Sem isso, um celular desbloqueado esquecido na mesa ja assinaria.
        authenticator_selection=structs.AuthenticatorSelectionCriteria(
            resident_key=structs.ResidentKeyRequirement.REQUIRED,
            user_verification=structs.UserVerificationRequirement.REQUIRED),
        exclude_credentials=[
            structs.PublicKeyCredentialDescriptor(
                id=webauthn.base64url_to_bytes(c["credential_id"]))
            for c in store.credentials_for(user["id"])],
    )
    cid, secret = store.create_challenge(
        t["id"], user["id"], "enroll", opts.challenge, None, None)
    store.log(t["id"], user["id"], "enroll.start", body.enrollment_level)
    return {"enrollment_id": cid, "client_secret": secret,
            "options": json.loads(webauthn.options_to_json(opts))}


class Complete(BaseModel):
    client_secret: str
    credential: dict


@app.post("/v1/enrollments/{enrollment_id}/complete")
def enroll_complete(enrollment_id: str, body: Complete):
    """Passo 2: guarda a chave PUBLICA. A privada fica no aparelho, pra sempre."""
    chl, err = store.consume_challenge(enrollment_id, body.client_secret, "enroll")
    if err:
        raise HTTPException(400, err)
    try:
        v = webauthn.verify_registration_response(
            credential=body.credential, expected_challenge=chl["challenge"],
            expected_rp_id=RP_ID, expected_origin=ORIGIN,
            require_user_verification=True)
    except Exception as e:
        store.log(chl["tenant_id"], chl["user_id"], "enroll.fail", str(e)[:200])
        raise HTTPException(400, "cadastro invalido: %s" % e)

    cred_id = webauthn.helpers.bytes_to_base64url(v.credential_id)
    store.add_credential(chl["user_id"], cred_id, v.credential_public_key,
                         v.sign_count, v.credential_device_type.value,
                         v.credential_backed_up)
    store.log(chl["tenant_id"], chl["user_id"], "enroll.ok", cred_id[:16])
    user = store.get_user(chl["user_id"])
    return {"ok": True, "credential_id": cred_id,
            "enrollment": user["enrollment"],
            # multi_device = a passkey sincroniza (iCloud/Google). Comodo pro
            # usuario, mas significa que ela existe em mais de um aparelho.
            "device_type": v.credential_device_type.value}


# --------------------------------------------------------- verificacao

class VerifyStart(BaseModel):
    external_id: str
    action: str = "login"
    context: dict = {}


@app.post("/v1/verifications")
def verify_start(body: VerifyStart, t=Depends(tenant)):
    """Passo 1 da verificacao: cria um desafio preso a UMA acao."""
    user = store.find_user(t["id"], body.external_id)
    if user is None:
        raise HTTPException(404, "usuario nao cadastrado")
    creds = store.credentials_for(user["id"])
    if not creds:
        raise HTTPException(409, "usuario sem passkey - precisa se cadastrar antes")

    opts = webauthn.generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=[
            structs.PublicKeyCredentialDescriptor(
                id=webauthn.base64url_to_bytes(c["credential_id"]))
            for c in creds],
        user_verification=structs.UserVerificationRequirement.REQUIRED)

    cid, secret = store.create_challenge(
        t["id"], user["id"], "verify", opts.challenge, body.action,
        json.dumps(body.context))
    store.log(t["id"], user["id"], "verify.start", body.action)
    return {"verification_id": cid, "client_secret": secret,
            "action": body.action,
            "options": json.loads(webauthn.options_to_json(opts))}


@app.post("/v1/verifications/{verification_id}/complete")
def verify_complete(verification_id: str, body: Complete):
    """Passo 2: confere a assinatura e emite o cracha."""
    chl, err = store.consume_challenge(verification_id, body.client_secret, "verify")
    if err:
        raise HTTPException(400, err)

    raw_id = body.credential.get("id", "")
    cred = store.credential_by_id(raw_id)
    if cred is None or cred["user_id"] != chl["user_id"]:
        store.log(chl["tenant_id"], chl["user_id"], "verify.fail",
                  "passkey de outro usuario")
        raise HTTPException(400, "essa passkey nao pertence a este usuario")

    try:
        v = webauthn.verify_authentication_response(
            credential=body.credential, expected_challenge=chl["challenge"],
            expected_rp_id=RP_ID, expected_origin=ORIGIN,
            credential_public_key=cred["public_key"],
            credential_current_sign_count=cred["sign_count"],
            require_user_verification=True)
    except Exception as e:
        store.log(chl["tenant_id"], chl["user_id"], "verify.fail", str(e)[:200])
        raise HTTPException(400, "assinatura invalida: %s" % e)

    store.touch_credential(cred["credential_id"], v.new_sign_count)
    user = store.get_user(chl["user_id"])
    token, claims = tokens.issue(
        tenant_id=chl["tenant_id"], external_id=user["external_id"],
        action=chl["action"], aal="user_verified" if v.user_verified else "device_only",
        enrollment=user["enrollment"], context=chl["context"],
        credential_id=cred["credential_id"])
    store.log(chl["tenant_id"], chl["user_id"], "verify.ok",
              "%s / %s" % (chl["action"], user["enrollment"]))
    return {"token": token, "claims": claims}


# ----------------------------------------------------------- auxiliares

@app.get("/.well-known/jwks.json")
def jwks():
    """A chave publica. A empresa cliente confere o token com isto."""
    return JSONResponse(tokens.jwks())


@app.get("/v1/audit")
def audit(t=Depends(tenant)):
    return {"events": [dict(r) for r in store.audit_for(t["id"])]}


@app.get("/")
def demo():
    return FileResponse(BASE / "web" / "demo.html")


app.mount("/static", StaticFiles(directory=BASE / "web"), name="static")


# ===========================================================================
# DEMO - isto aqui faz o papel do BACKEND DA EMPRESA CLIENTE.
#
# Nao faz parte do produto. Existe so pra voce ver o fluxo inteiro rodando
# numa maquina so. Repare que e ele quem guarda a chave de API: o navegador
# nunca encosta nela.
# ===========================================================================

DEMO_FILE = BASE / "demo_tenant.json"


def _demo_tenant():
    if DEMO_FILE.exists():
        d = json.loads(DEMO_FILE.read_text())
        row = store.tenant_by_key(d["api_key"])
        if row is not None:
            return row, d["api_key"]
    tid, key = store.create_tenant("Banco Exemplo (demo)")
    DEMO_FILE.write_text(json.dumps({"tenant_id": tid, "api_key": key}))
    return store.tenant_by_key(key), key


class DemoEnroll(BaseModel):
    external_id: str
    display: str = ""
    enrollment_level: str = "self_asserted"


@app.post("/demo/enroll")
def demo_enroll(body: DemoEnroll):
    t, _ = _demo_tenant()
    return enroll_start(EnrollStart(**body.model_dump()), t)


class DemoVerify(BaseModel):
    external_id: str
    action: str = "login"
    context: dict = {}


@app.post("/demo/verify")
def demo_verify(body: DemoVerify):
    t, _ = _demo_tenant()
    return verify_start(VerifyStart(**body.model_dump()), t)


class DemoApprove(BaseModel):
    token: str
    action: str
    min_enrollment: str = "self_asserted"


@app.post("/demo/approve")
def demo_approve(body: DemoApprove):
    """A decisao final, do lado da empresa.

    Repare que NAO basta o token ser valido. A empresa ainda decide se aquele
    nivel de confianca e suficiente pra aquela operacao - e uma transferencia
    de 25 milhoes deveria exigir cadastro com documento conferido, nao um
    cadastro que qualquer um fez sozinho.
    """
    t, _ = _demo_tenant()
    try:
        claims = tokens.verify(body.token, tenant_id=t["id"])
    except Exception as e:
        return {"approved": False, "reason": "token invalido: %s" % e}

    if claims["action"] != body.action:
        return {"approved": False, "claims": claims,
                "reason": "o token foi assinado para '%s', nao para '%s'"
                          % (claims["action"], body.action)}
    if claims["aal"] != "user_verified":
        return {"approved": False, "claims": claims,
                "reason": "o aparelho nao pediu biometria/PIN"}

    rank = {lvl: i for i, lvl in enumerate(ENROLLMENT_LEVELS)}
    if rank[claims["enrollment"]] < rank[body.min_enrollment]:
        return {"approved": False, "claims": claims,
                "reason": "esta operacao exige cadastro '%s', mas este usuario "
                          "foi cadastrado como '%s'"
                          % (body.min_enrollment, claims["enrollment"])}
    return {"approved": True, "claims": claims,
            "reason": "assinatura valida, biometria confirmada, cadastro suficiente"}


@app.get("/demo/audit")
def demo_audit():
    t, _ = _demo_tenant()
    return {"events": [dict(r) for r in store.audit_for(t["id"], 20)]}
