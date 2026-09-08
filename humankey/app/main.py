"""humankey - a camada de confianca, em duas partes.

  PARTE 1 - VERIFICACAO (quem)
    Prova que uma pessoa especifica e cadastrada esta ali agora, usando a
    passkey do aparelho dela. Resolve o golpe do CFO deepfake.

  PARTE 2 - HUMANIDADE ANONIMA (que e gente)
    Prova que voce e um humano unico e verificado, SEM dizer quem voce e,
    usando assinatura cega. Resolve bot em rede social, perfil falso em app
    de namoro e avaliacao comprada - sem construir um banco de identidades
    que vira alvo.

As duas partes compartilham o mesmo cadastro e nunca compartilham dado entre
si: e essa separacao que faz a privacidade ser matematica, e nao promessa.
"""

import json
import os
import time
from pathlib import Path

import webauthn
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from webauthn.helpers import structs

from . import personhood, store, tokens

BASE = Path(__file__).resolve().parents[1]

RP_ID = os.environ.get("RP_ID", "localhost")
RP_NAME = os.environ.get("RP_NAME", "humankey")
ORIGIN = os.environ.get("ORIGIN", "http://localhost:8000")

ENROLLMENT_LEVELS = ("self_asserted", "vouched", "identity_proofed")
RANK = {lvl: i for i, lvl in enumerate(ENROLLMENT_LEVELS)}

MAX_BODY_BYTES = 64 * 1024
EPOCH_SECONDS = 7 * 24 * 3600      # uma chave de humanidade por semana
MAX_TOKENS_PER_EPOCH = 5           # ver a ressalva honesta no README

app = FastAPI(title="humankey", version="0.2.0", docs_url=None, redoc_url=None)
store.init()


# ------------------------------------------------------------- middleware

@app.middleware("http")
async def guard(request: Request, call_next):
    """Limite de tamanho + cabecalhos de seguranca em toda resposta."""
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "corpo grande demais"}, status_code=413)

    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
        "base-uri 'none'; form-action 'none'")
    return resp


def limit(bucket, n, window, message="limite de requisicoes excedido"):
    if not store.rate_check(bucket, n, window):
        raise HTTPException(429, message)


# ------------------------------------------------------------------ auth

def tenant(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "faltou o header Authorization: Bearer <api_key>")
    row = store.tenant_by_key(authorization[7:])
    if row is None:
        # Limita a forca bruta em chave de API pelo prefixo enviado.
        store.rate_check("badkey:" + authorization[7:27], 10, 300)
        raise HTTPException(401, "chave de API invalida")
    limit("tenant:" + row["id"], 600, 60)
    return row


# --------------------------------------------------------------- cadastro

class EnrollStart(BaseModel):
    external_id: str = Field(min_length=1, max_length=256)
    display: str = Field(default="", max_length=256)
    enrollment_level: str = "self_asserted"


@app.post("/v1/enrollments")
def enroll_start(body: EnrollStart, t=Depends(tenant)):
    if body.enrollment_level not in ENROLLMENT_LEVELS:
        raise HTTPException(400, "enrollment_level deve ser um de %s"
                            % (ENROLLMENT_LEVELS,))
    limit("enroll:%s:%s" % (t["id"], body.external_id), 10, 3600,
          "muitas tentativas de cadastro para este usuario")

    user = store.upsert_user(t["id"], body.external_id, body.enrollment_level)
    opts = webauthn.generate_registration_options(
        rp_id=RP_ID, rp_name=RP_NAME,
        user_id=user["id"].encode(),
        # Estes dois so alimentam a tela do aparelho, e nao sao persistidos.
        user_name=body.external_id,
        user_display_name=body.display or body.external_id,
        authenticator_selection=structs.AuthenticatorSelectionCriteria(
            resident_key=structs.ResidentKeyRequirement.REQUIRED,
            user_verification=structs.UserVerificationRequirement.REQUIRED),
        exclude_credentials=[
            structs.PublicKeyCredentialDescriptor(
                id=webauthn.base64url_to_bytes(c["credential_id"]))
            for c in store.credentials_for(user["id"])],
    )
    cid, secret = store.create_challenge(t["id"], user["id"], "enroll",
                                         opts.challenge, None, None)
    store.log(t["id"], user["id"], "enroll.start", body.enrollment_level)
    return {"enrollment_id": cid, "client_secret": secret,
            "options": json.loads(webauthn.options_to_json(opts))}


class Complete(BaseModel):
    client_secret: str = Field(min_length=1, max_length=512)
    credential: dict


@app.post("/v1/enrollments/{enrollment_id}/complete")
def enroll_complete(enrollment_id: str, body: Complete):
    limit("complete:" + enrollment_id, 5, 300)
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
    return {"ok": True, "credential_id": cred_id,
            "enrollment": store.get_user(chl["user_id"])["enrollment"],
            "device_type": v.credential_device_type.value}


# ------------------------------------------------------------ verificacao

class VerifyStart(BaseModel):
    external_id: str = Field(min_length=1, max_length=256)
    action: str = Field(default="login", max_length=64)
    context: dict = {}


@app.post("/v1/verifications")
def verify_start(body: VerifyStart, t=Depends(tenant)):
    limit("verify:%s:%s" % (t["id"], body.external_id), 20, 300,
          "muitas verificacoes para este usuario")
    user = store.find_user(t["id"], body.external_id)
    if user is None:
        raise HTTPException(404, "usuario nao cadastrado")
    creds = store.credentials_for(user["id"])
    if not creds:
        raise HTTPException(409, "usuario sem passkey - precisa se cadastrar antes")
    if len(json.dumps(body.context)) > 4096:
        raise HTTPException(400, "context grande demais")

    opts = webauthn.generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=[
            structs.PublicKeyCredentialDescriptor(
                id=webauthn.base64url_to_bytes(c["credential_id"]))
            for c in creds],
        user_verification=structs.UserVerificationRequirement.REQUIRED)
    cid, secret = store.create_challenge(t["id"], user["id"], "verify",
                                         opts.challenge, body.action,
                                         json.dumps(body.context))
    store.log(t["id"], user["id"], "verify.start", body.action)
    return {"verification_id": cid, "client_secret": secret,
            "action": body.action,
            "options": json.loads(webauthn.options_to_json(opts))}


class VerifyComplete(Complete):
    external_id: str = Field(min_length=1, max_length=256)


@app.post("/v1/verifications/{verification_id}/complete")
def verify_complete(verification_id: str, body: VerifyComplete):
    limit("complete:" + verification_id, 5, 300)
    chl, err = store.consume_challenge(verification_id, body.client_secret, "verify")
    if err:
        raise HTTPException(400, err)

    # O identificador legivel nunca fica no disco, entao o cliente reenvia e
    # nos conferimos contra o HMAC guardado. Se nao bater, ele nao e o dono
    # deste desafio.
    user = store.get_user(chl["user_id"])
    if not store.user_ref(chl["tenant_id"], body.external_id) == user["ref"]:
        raise HTTPException(400, "external_id nao corresponde a este desafio")

    cred = store.credential_by_id(body.credential.get("id", ""))
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
    token, claims = tokens.issue(
        tenant_id=chl["tenant_id"], external_id=body.external_id,
        action=chl["action"],
        aal="user_verified" if v.user_verified else "device_only",
        enrollment=user["enrollment"], context=chl["context"],
        credential_id=cred["credential_id"])
    store.log(chl["tenant_id"], chl["user_id"], "verify.ok",
              "%s / %s" % (chl["action"], user["enrollment"]))
    return {"token": token, "claims": claims}


# ------------------------------------------------- prova de humanidade

def current_epoch():
    return int(time.time()) // EPOCH_SECONDS


def epoch_key(epoch=None):
    """Uma unica chave por epoca, igual pra todo mundo.

    Se cada pessoa tivesse a sua, a assinatura entregaria a identidade - e o
    'ataque de marcacao'. Por isso a chave e publica e compartilhada.
    """
    epoch = current_epoch() if epoch is None else epoch
    key = store.get_epoch_key(epoch)
    if key is None:
        key = store.put_epoch_key(epoch, personhood.generate_epoch_key())
    return key


@app.get("/v1/personhood/params")
def personhood_params():
    """Publico de proposito: qualquer site confere um cracha sozinho, offline,
    sem nos perguntar nada e sem nos contar quem usou."""
    k = epoch_key()
    return {"epoch": k["epoch"], "n": str(k["n"]), "e": k["e"],
            "key_bits": personhood.KEY_BITS,
            "epoch_ends_at": (k["epoch"] + 1) * EPOCH_SECONDS,
            "max_tokens_per_epoch": MAX_TOKENS_PER_EPOCH}


class IssueRequest(BaseModel):
    token: str = Field(min_length=1, max_length=4096)   # cracha da Parte 1
    blinded: list[str] = Field(min_length=1, max_length=MAX_TOKENS_PER_EPOCH)


@app.post("/v1/personhood/tokens")
def personhood_issue(body: IssueRequest, t=Depends(tenant)):
    """Assina envelopes fechados para quem ja provou ser quem diz ser.

    Repare no que NAO e guardado: os valores cegos nao vao pro disco, e o
    servidor e matematicamente incapaz de ligar um cracha resgatado la na
    frente a esta chamada aqui.
    """
    try:
        claims = tokens.verify(body.token, tenant_id=t["id"])
    except Exception as e:
        raise HTTPException(401, "token de verificacao invalido: %s" % e)
    if claims["action"] != "personhood":
        raise HTTPException(400, "o token precisa ter sido emitido para a acao "
                                 "'personhood'")
    if claims["aal"] != "user_verified":
        raise HTTPException(403, "exige verificacao com biometria/PIN")
    if RANK[claims["enrollment"]] < RANK["identity_proofed"]:
        raise HTTPException(403, "cracha anonimo exige cadastro 'identity_proofed'"
                                 " - senao um so golpista cria humanos infinitos")

    user = store.find_user(t["id"], claims["sub"])
    if user is None:
        raise HTTPException(404, "usuario nao cadastrado")

    k = epoch_key()
    if not store.add_issued(user["id"], k["epoch"], len(body.blinded),
                            MAX_TOKENS_PER_EPOCH):
        raise HTTPException(429, "limite de %d crachas por epoca ja atingido"
                                 % MAX_TOKENS_PER_EPOCH)

    sigs = []
    for b in body.blinded:
        try:
            sigs.append(str(personhood.blind_sign(int(b), k)))
        except ValueError as e:
            raise HTTPException(400, str(e))

    store.log(t["id"], user["id"], "personhood.issue",
              "epoca %d, %d crachas" % (k["epoch"], len(sigs)))
    return {"epoch": k["epoch"], "signatures": sigs}


class RedeemRequest(BaseModel):
    epoch: int
    token: str = Field(min_length=1, max_length=128)      # base64url
    signature: str = Field(min_length=1, max_length=1024)
    scope: str = Field(min_length=1, max_length=128)       # ex.: "twitter.com"


@app.options("/v1/personhood/redeem")
def personhood_redeem_preflight():
    """Preflight do CORS: qualquer site precisa conseguir chamar isto do
    navegador. Sem credencial, entao liberar a origem nao expoe nada."""
    return JSONResponse({}, headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600"})


@app.post("/v1/personhood/redeem")
def personhood_redeem(body: RedeemRequest):
    """Qualquer site chama isto. Nao precisa de chave de API, e de proposito:
    conferir humanidade nao deveria custar um contrato comercial.

    O que o site descobre: 'humano verificado, cracha inedito neste escopo'.
    Nada alem disso. Nem nome, nem e-mail, nem de qual empresa veio.
    """
    limit("redeem:" + body.scope, 6000, 60)
    k = store.get_epoch_key(body.epoch)
    if k is None:
        raise HTTPException(400, "epoca desconhecida")
    if body.epoch < current_epoch() - 1:
        raise HTTPException(400, "cracha vencido - peca um novo")

    try:
        raw = webauthn.base64url_to_bytes(body.token)
        sig = int(body.signature)
    except Exception:
        raise HTTPException(400, "cracha malformado")

    if not personhood.verify(raw, sig, k["n"], k["e"]):
        raise HTTPException(400, "assinatura invalida")
    if not store.spend(personhood.spend_id(raw), body.scope, body.epoch):
        # Uso unico GLOBAL. Se valesse por escopo, dois sites poderiam comparar
        # o mesmo cracha e descobrir que e a mesma pessoa.
        raise HTTPException(409, "cracha ja usado")

    return JSONResponse(
        {"ok": True, "human": True, "scope": body.scope, "epoch": body.epoch},
        headers={"Access-Control-Allow-Origin": "*"})


# ------------------------------------------------------------ auxiliares

@app.get("/.well-known/jwks.json")
def jwks():
    return JSONResponse(tokens.jwks())


@app.get("/v1/audit")
def audit(t=Depends(tenant)):
    ok, bad = store.audit_verify()
    return {"chain_intact": ok, "tampered_at": bad,
            "events": [dict(r) for r in store.audit_for(t["id"])]}


@app.get("/")
def demo_page():
    return FileResponse(BASE / "web" / "demo.html")


app.mount("/static", StaticFiles(directory=BASE / "web"), name="static")


# ===========================================================================
# DEMO - faz o papel do BACKEND DA EMPRESA CLIENTE. Nao e produto.
# Existe pra voce ver o fluxo inteiro rodando numa maquina so. Repare que e
# ele quem guarda a chave de API: o navegador nunca encosta nela.
# ===========================================================================

DEMO_FILE = Path(os.environ.get("HUMANKEY_DEMO_FILE", BASE / "demo_tenant.json"))


def _demo_tenant():
    if DEMO_FILE.exists():
        row = store.tenant_by_key(json.loads(DEMO_FILE.read_text())["api_key"])
        if row is not None:
            return row, json.loads(DEMO_FILE.read_text())["api_key"]
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
    expect_context: dict = {}


@app.post("/demo/approve")
def demo_approve(body: DemoApprove):
    """A decisao final, do lado da empresa. Nao basta o token ser valido: a
    empresa ainda decide se aquele nivel de confianca serve pra essa operacao."""
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
    if RANK[claims["enrollment"]] < RANK[body.min_enrollment]:
        return {"approved": False, "claims": claims,
                "reason": "esta operacao exige cadastro '%s', mas este usuario "
                          "foi cadastrado como '%s'"
                          % (body.min_enrollment, claims["enrollment"])}

    # Amarrar o contexto no cracha nao serve de nada se quem recebe nao
    # CONFERIR. Sem esta comparacao, um cracha assinado para "transferir 10
    # reais" aprovaria "transferir 25 milhoes".
    if body.expect_context and claims.get("ctx") != body.expect_context:
        return {"approved": False, "claims": claims,
                "reason": "o cracha foi assinado para outra operacao: %s"
                          % json.dumps(claims.get("ctx"))}

    # Uso unico. Prazo curto nao e uso unico: dentro dos 120 s o mesmo cracha
    # aprovaria duas transferencias.
    if not store.consume_jti(claims["jti"], claims["exp"]):
        return {"approved": False, "claims": claims,
                "reason": "este cracha ja foi usado (replay bloqueado)"}

    return {"approved": True, "claims": claims,
            "reason": "assinatura valida, biometria confirmada, cadastro suficiente"}


class DemoIssue(BaseModel):
    token: str
    blinded: list[str]


@app.post("/demo/personhood/issue")
def demo_issue(body: DemoIssue):
    t, _ = _demo_tenant()
    return personhood_issue(IssueRequest(**body.model_dump()), t)


@app.get("/demo/audit")
def demo_audit():
    t, _ = _demo_tenant()
    ok, bad = store.audit_verify()
    return {"chain_intact": ok, "tampered_at": bad,
            "events": [dict(r) for r in store.audit_for(t["id"], 20)]}
