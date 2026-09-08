"""O token de saida - o produto de verdade.

Quando alguem passa na verificacao, a gente devolve um cracha assinado que
vale por 2 minutos. A empresa cliente confere a assinatura com a nossa chave
publica (endpoint /.well-known/jwks.json) e nao precisa confiar no navegador
do usuario pra nada.

Por que assinado e nao um "ok" simples: o navegador do usuario esta nas maos
dele, entao qualquer resposta que passe por la pode ser adulterada. Uma
assinatura, nao.
"""

import base64
import json
import secrets
import time
from pathlib import Path

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

KEY_PATH = Path(__file__).resolve().parents[1] / "signing_key.pem"
ISSUER = "https://humankey.local"
TTL_SECONDS = 120


def _b64u(n: int, size: int) -> str:
    return base64.urlsafe_b64encode(n.to_bytes(size, "big")).rstrip(b"=").decode()


def _load_key():
    if not KEY_PATH.exists():
        key = ec.generate_private_key(ec.SECP256R1())
        KEY_PATH.write_bytes(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption()))
        KEY_PATH.chmod(0o600)
    return serialization.load_pem_private_key(KEY_PATH.read_bytes(), password=None)


_KEY = _load_key()
_PEM = _KEY.private_bytes(serialization.Encoding.PEM,
                         serialization.PrivateFormat.PKCS8,
                         serialization.NoEncryption())
_PUB = _KEY.public_key()
KID = base64.urlsafe_b64encode(
    _PUB.public_bytes(serialization.Encoding.DER,
                      serialization.PublicFormat.SubjectPublicKeyInfo)[-16:]
).rstrip(b"=").decode()


def jwks():
    nums = _PUB.public_numbers()
    return {"keys": [{"kty": "EC", "crv": "P-256", "use": "sig", "alg": "ES256",
                      "kid": KID, "x": _b64u(nums.x, 32), "y": _b64u(nums.y, 32)}]}


def issue(*, tenant_id, external_id, action, aal, enrollment, context,
          credential_id):
    """Emite o cracha.

    `aal` e `enrollment` vao DENTRO do token de proposito: a empresa cliente
    precisa saber o quanto aquele verde vale antes de liberar uma
    transferencia. Um 'user_verified' em cima de um cadastro 'self_asserted'
    prova posse do aparelho, nao identidade da pessoa.
    """
    iat = int(time.time())
    payload = {
        "iss": ISSUER,
        "aud": tenant_id,
        "sub": external_id,
        "iat": iat,
        "exp": iat + TTL_SECONDS,
        "jti": secrets.token_hex(16),
        "action": action,
        "aal": aal,
        "enrollment": enrollment,
        "cred": credential_id[:16],
        "ctx": json.loads(context) if context else {},
    }
    return jwt.encode(payload, _PEM, algorithm="ES256",
                      headers={"kid": KID}), payload


def verify(token, *, tenant_id):
    """So pra demonstrar o lado do cliente. Em producao a empresa faz isso no
    servidor DELA, buscando a chave publica no nosso JWKS."""
    return jwt.decode(token, _PUB, algorithms=["ES256"],
                      audience=tenant_id, issuer=ISSUER)
