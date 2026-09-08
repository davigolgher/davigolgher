"""Prova de humanidade anonima - assinatura cega (Chaum, 1982).

E a peca que responde a parte do problema que quase todo mundo ignora:
provar que voce e um humano unico **sem entregar quem voce e**.

O truque, em portugues:

  1. Voce gera um numero secreto e o "embrulha" num envelope opaco.
  2. O emissor assina POR CIMA do envelope, sem nunca ver o que tem dentro.
     Ele so sabe que voce - uma pessoa ja verificada - pediu uma assinatura.
  3. Voce tira o envelope. A assinatura continua valida no numero de dentro.
  4. Voce mostra esse numero assinado em qualquer site. O site confere e ve
     "humano verificado" - e mais nada.

O que ninguem consegue fazer:
  - O SITE nao descobre quem voce e. Recebe um numero aleatorio assinado.
  - O EMISSOR nao descobre onde voce usou. Ele nunca viu aquele numero.
  - Nem os dois JUNTOS conseguem, porque nao existe nada em comum entre o que
    cada um viu. Isso e matematica, nao politica de privacidade.

Ataque real que isto precisa tratar: se o emissor usasse uma chave DIFERENTE
por pessoa, a assinatura entregaria a identidade. Por isso existe a `epoca`:
uma unica chave por periodo, publica, valida pra todo mundo. Se um dia
aparecerem duas chaves ativas na mesma epoca, e sinal de emissor malicioso -
e da pra provar.
"""

import hashlib
import secrets

from cryptography.hazmat.primitives.asymmetric import rsa

HASH_LABEL = b"humankey-fdh-v1"
KEY_BITS = 2048
PUBLIC_E = 65537


# --------------------------------------------------------------- hashing

def _mgf1(seed: bytes, length: int) -> bytes:
    """Estica um hash ate o tamanho do modulo (MGF1, do RFC 8017)."""
    out, counter = b"", 0
    while len(out) < length:
        out += hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
        counter += 1
    return out[:length]


def full_domain_hash(msg: bytes, n: int) -> int:
    """RSA-FDH.

    Assinatura cega com RSA so e segura se a mensagem for espalhada por todo
    o dominio do modulo. Um SHA-256 puro (256 bits contra 2048) deixaria
    estrutura de sobra pra forjar assinatura. Por isso o MGF1.
    """
    k = (n.bit_length() + 7) // 8
    return int.from_bytes(_mgf1(HASH_LABEL + msg, k), "big") % n


# ----------------------------------------------------- chave de uma epoca

def generate_epoch_key():
    """Uma chave por epoca, compartilhada por TODOS. Ver o ataque de marcacao
    no topo do arquivo."""
    key = rsa.generate_private_key(public_exponent=PUBLIC_E, key_size=KEY_BITS)
    priv = key.private_numbers()
    pub = key.public_key().public_numbers()
    return {"n": pub.n, "e": pub.e, "d": priv.d}


# ------------------------------------------------ lado do emissor (servidor)

def blind_sign(blinded: int, key) -> int:
    """Assina o envelope fechado.

    O servidor NAO consegue extrair a mensagem daqui - ela esta multiplicada
    por um fator aleatorio que so o cliente conhece.
    """
    if not (1 < blinded < key["n"] - 1):
        raise ValueError("valor cego fora do intervalo valido")
    return pow(blinded, key["d"], key["n"])


def verify(token: bytes, signature: int, n: int, e: int) -> bool:
    """Qualquer site pode rodar isto com a chave publica. Nao precisa nos
    perguntar nada, nem ficar online conosco."""
    if not (0 < signature < n):
        return False
    return pow(signature, e, n) == full_domain_hash(token, n)


# ------------------------------------------------- lado do cliente (usuario)

def make_token() -> bytes:
    """O numero secreto que vira o cracha anonimo."""
    return secrets.token_bytes(32)


def blind(token: bytes, n: int, e: int):
    """Fecha o envelope. Devolve (valor_cego, fator_de_desembrulho)."""
    h = full_domain_hash(token, n)
    while True:
        r = secrets.randbelow(n - 2) + 2
        try:
            r_inv = pow(r, -1, n)          # exige gcd(r, n) == 1
        except ValueError:
            continue                        # praticamente impossivel; e barato tentar
        return (h * pow(r, e, n)) % n, r_inv


def unblind(blind_signature: int, r_inv: int, n: int) -> int:
    """Tira o envelope. A assinatura continua valida no numero de dentro."""
    return (blind_signature * r_inv) % n


def spend_id(token: bytes) -> str:
    """Identificador do cracha no livro de gastos.

    E o hash do numero, nao o numero. Mesmo o livro de double-spend vazando,
    ninguem consegue gastar cracha de ninguem.
    """
    return hashlib.sha256(b"humankey-spend-v1" + token).hexdigest()
