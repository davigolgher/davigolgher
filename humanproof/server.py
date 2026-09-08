"""Servidor do desafio.

O ponto central: o desafio e imprevisivel e tem prazo. O cliente nao sabe qual
sequencia de cores vai piscar antes de pedir, e a resposta so vale se chegar
dentro da janela. Isso e o que impede replay (mandar uma gravacao boa de ontem)
e o que da a restricao de latencia que deepfake em tempo real tem dificuldade
de cumprir.
"""

import json
import os
import random
import secrets
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import detector

BASE = Path(__file__).parent
SESSIONS_DIR = BASE / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)

QUIET_MS = 8000          # tela em luz constante -> mede pulso (rPPG)
                         # 8 s = ~9 batidas e df=0.125 Hz de resolucao.
                         # Menos que isso e o espectro fica cego.
FLASH_MS = 2500          # sequencia de cores aleatorias -> mede resposta a luz
SLACK_MS = 4000          # folga pra upload e processamento do cliente

PALETTE = [
    [255, 255, 255], [255, 40, 40], [40, 255, 40], [60, 60, 255],
    [255, 255, 40], [40, 255, 255], [255, 40, 255],
]

app = FastAPI(title="humanproof")
_pending = {}            # nonce de uso unico, em memoria


@app.get("/")
def index():
    return FileResponse(BASE / "web" / "index.html")


@app.post("/challenge")
def challenge():
    sid = secrets.token_urlsafe(12)
    nonce = secrets.token_hex(16)
    rng = random.Random(nonce)          # o plano deriva do nonce

    plan, t, last = [], 0, None
    while t < FLASH_MS:
        c = rng.choice([c for c in PALETTE if c != last])
        last = c
        dur = rng.choice([260, 320, 380, 440])
        plan.append({"t_ms": t, "rgb": c, "dur_ms": dur})
        t += dur

    _pending[sid] = {"nonce": nonce, "issued_ms": time.time() * 1000,
                     "plan": plan}
    return {"session_id": sid, "nonce": nonce, "plan": plan,
            "quiet_ms": QUIET_MS, "flash_ms": FLASH_MS,
            "deadline_ms": QUIET_MS + FLASH_MS + SLACK_MS}


class Verify(BaseModel):
    session_id: str
    nonce: str
    samples: list
    label: str = "unlabeled"


@app.post("/verify")
def verify(body: Verify):
    sess = _pending.pop(body.session_id, None)          # uso unico
    if sess is None:
        raise HTTPException(400, "sessao desconhecida ou ja usada")
    if not secrets.compare_digest(sess["nonce"], body.nonce):
        raise HTTPException(400, "nonce nao confere")
    if not body.samples:
        raise HTTPException(400, "sem amostras")

    elapsed = time.time() * 1000 - sess["issued_ms"]
    deadline_ok = elapsed <= QUIET_MS + FLASH_MS + SLACK_MS

    feats = detector.extract_features(body.samples)
    result = detector.fuse(feats, deadline_ok=deadline_ok,
                           elapsed_ms=int(elapsed))
    result["features"] = feats
    result["elapsed_ms"] = int(elapsed)

    # Grava a sessao pra virar dataset. E isso que alimenta tools/evaluate.py.
    name = "%s_%s_%s.json" % (time.strftime("%Y%m%d-%H%M%S"),
                              body.label, body.session_id)
    (SESSIONS_DIR / name).write_text(json.dumps({
        "label": body.label, "plan": sess["plan"],
        "samples": body.samples, "result": result,
    }))
    return result


app.mount("/", StaticFiles(directory=BASE / "web"), name="web")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))
