"""Gera vetores de teste a partir da implementacao Python, que e a referencia.
O SDK do navegador tem que reproduzir estes numeros exatamente."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import personhood as p  # noqa: E402

k = p.generate_epoch_key()
vec = {"fdh": [], "blind": {}}
for label, msg in [("vazio", b""), ("curto", b"oi"),
                   ("32 bytes", bytes(range(32))), ("acentos", "joao".encode())]:
    vec["fdh"].append({"label": label, "msg_hex": msg.hex(), "n": str(k["n"]),
                       "expected": str(p.full_domain_hash(msg, k["n"]))})

msg, r = bytes(range(32)), 12345678901234567890123456789
h = p.full_domain_hash(msg, k["n"])
sig = (p.blind_sign((h * pow(r, k["e"], k["n"])) % k["n"], k)
       * pow(r, -1, k["n"])) % k["n"]
assert p.verify(msg, sig, k["n"], k["e"])
vec["blind"] = {"n": str(k["n"]), "e": str(k["e"]), "d": str(k["d"]),
                "msg_hex": msg.hex(), "r": str(r), "expected_sig": str(sig)}

Path(sys.argv[1]).write_text(json.dumps(vec))
print("vetores gerados pela implementacao Python (referencia)")
