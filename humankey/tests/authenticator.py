"""Um celular de mentira, em Python.

Faz exatamente o que o chip de seguranca de um celular faz: guarda uma chave
privada, monta o `authenticatorData`, e assina. Serve pra testar o servidor de
ponta a ponta sem precisar de um aparelho de verdade em cima da mesa.

Se o servidor aceitar uma assinatura que este arquivo NAO deveria conseguir
produzir, o servidor esta errado - e e exatamente isso que os testes checam.
"""

import hashlib
import json
import os

import cbor2
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url

UP = 0x01          # user present  - alguem encostou no aparelho
UV = 0x04          # user verified - digital / Face ID / PIN conferidos
AT = 0x40          # traz uma credencial nova (so no cadastro)


class VirtualAuthenticator:
    def __init__(self, aaguid=b"\x00" * 16):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = os.urandom(32)
        self.aaguid = aaguid
        self.sign_count = 0

    # ---------------------------------------------------------- internos

    def _cose_key(self):
        n = self.key.public_key().public_numbers()
        return cbor2.dumps({1: 2, 3: -7, -1: 1,                # EC2, ES256, P-256
                            -2: n.x.to_bytes(32, "big"),
                            -3: n.y.to_bytes(32, "big")})

    def _auth_data(self, rp_id, flags, include_cred=False):
        data = hashlib.sha256(rp_id.encode()).digest()
        data += bytes([flags])
        data += self.sign_count.to_bytes(4, "big")
        if include_cred:
            data += self.aaguid
            data += len(self.credential_id).to_bytes(2, "big")
            data += self.credential_id
            data += self._cose_key()
        return data

    def _client_data(self, typ, challenge, origin):
        return json.dumps({"type": typ, "challenge": challenge,
                           "origin": origin, "crossOrigin": False},
                          separators=(",", ":")).encode()

    # ------------------------------------------------------------ publico

    def register(self, options, origin, *, user_verified=True):
        """Equivale ao navigator.credentials.create()."""
        flags = UP | AT | (UV if user_verified else 0)
        auth_data = self._auth_data(options["rp"]["id"], flags, include_cred=True)
        client_data = self._client_data("webauthn.create",
                                        options["challenge"], origin)
        att = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        return {
            "id": bytes_to_base64url(self.credential_id),
            "rawId": bytes_to_base64url(self.credential_id),
            "type": "public-key",
            "clientExtensionResults": {},
            "response": {"clientDataJSON": bytes_to_base64url(client_data),
                         "attestationObject": bytes_to_base64url(att),
                         "transports": ["internal"]},
        }

    def authenticate(self, options, origin, *, user_verified=True,
                     credential_id=None, sign_count=None):
        """Equivale ao navigator.credentials.get().

        Os parametros extras existem pra FORJAR respostas invalidas nos testes:
        assinar sem biometria, mandar id de outra credencial, repetir contador.
        """
        self.sign_count = self.sign_count + 1 if sign_count is None else sign_count
        flags = UP | (UV if user_verified else 0)
        auth_data = self._auth_data(options["rpId"], flags)
        client_data = self._client_data("webauthn.get",
                                        options["challenge"], origin)
        sig = self.key.sign(auth_data + hashlib.sha256(client_data).digest(),
                            ec.ECDSA(hashes.SHA256()))
        cid = credential_id or bytes_to_base64url(self.credential_id)
        return {
            "id": cid, "rawId": cid, "type": "public-key",
            "clientExtensionResults": {},
            "response": {"clientDataJSON": bytes_to_base64url(client_data),
                         "authenticatorData": bytes_to_base64url(auth_data),
                         "signature": bytes_to_base64url(sig),
                         "userHandle": None},
        }
