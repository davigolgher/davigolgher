"""Teste do pipeline sem webcam.

Gera sessoes sinteticas das tres classes a partir de um modelo simples de
fisica e roda o detector nelas. Serve pra duas coisas:

  1. conferir que a matematica funciona antes de voce sair gravando video;
  2. te dar uma intuicao de QUAIS features separam cada ataque.

Isto nao substitui dado real. Dado sintetico so contem o que voce ja sabia.

    python tools/selftest.py            # roda e imprime
    python tools/selftest.py --write    # grava em sessions_synthetic/
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import detector  # noqa: E402

BASE = Path(__file__).resolve().parents[1]
FS, QUIET_MS, FLASH_MS = 30.0, 8000, 2500
PALETTE = [[255, 255, 255], [255, 40, 40], [40, 255, 40], [60, 60, 255],
           [255, 255, 40], [40, 255, 255], [255, 40, 255]]
LUM = np.array([0.299, 0.587, 0.114])

# Como cada classe se comporta fisicamente:
#   g_skin/g_bg = quanto a pele e o fundo devolvem da luz emitida
#   pulse       = amplitude do sinal de pulso (0 = sem corpo vivo)
PROFILES = {
    # rosto 3D perto da tela, fundo longe, coracao batendo
    "real":      dict(g_skin=0.11, g_bg=0.035, pulse=0.60, lag=2),
    # tela plana: "rosto" e "fundo" sao a MESMA superficie -> respondem igual
    "replay":    dict(g_skin=0.07, g_bg=0.068, pulse=0.10, lag=3),
    # camera virtual: nada fisico na frente da lente -> nao responde a nada
    "injection": dict(g_skin=0.00, g_bg=0.000, pulse=0.00, lag=0),
}
CH_AMP = np.array([0.30, 1.00, 0.50])   # PPG e mais forte no verde

# Ruido da MEDIA da ROI, nao de um pixel. Uma bochecha de ~38x24 px tem ~900
# pixels; com ruido temporal de ~3 DN por pixel, a media fica com 3/sqrt(900)
# = 0.10 DN. Esse numero e derivado, nao ajustado ate passar no teste - se
# voce mexer nele pra fazer o self-test ficar verde, esta enganando a si mesmo.
NOISE_DN = 0.10


def make_plan(rng):
    plan, t, last = [], 0, None
    while t < FLASH_MS:
        c = PALETTE[rng.choice([i for i in range(len(PALETTE))
                                if PALETTE[i] != last])]
        last = c
        dur = int(rng.choice([260, 320, 380, 440]))
        plan.append({"t_ms": t, "rgb": c, "dur_ms": dur})
        t += dur
    return plan


def synth(label, seed):
    rng = np.random.default_rng(seed)
    p = PROFILES[label]
    plan = make_plan(rng)
    bpm = rng.uniform(58, 88)
    base_skin = np.array([168.0, 126.0, 112.0])
    base_bg = np.array([70.0, 72.0, 78.0])

    n = int((QUIET_MS + FLASH_MS) / 1000 * FS)
    emitted = []
    for i in range(n):
        t = i * 1000 / FS
        if t < QUIET_MS:
            emitted.append([235.0, 235.0, 235.0])
        else:
            tf, cur = t - QUIET_MS, plan[0]["rgb"]
            for st in plan:
                if tf >= st["t_ms"]:
                    cur = st["rgb"]
                else:
                    break
            emitted.append([float(v) for v in cur])
    emitted = np.array(emitted)

    samples = []
    for i in range(n):
        t = i * 1000 / FS
        j = max(0, i - p["lag"])                 # atraso do caminho optico
        e = emitted[j]
        phase = 2 * np.pi * bpm / 60.0 * (t / 1000.0)
        pulse = p["pulse"] * np.sin(phase) * CH_AMP
        skin = base_skin + p["g_skin"] * (e - 128.0) + pulse + rng.normal(0, NOISE_DN, 3)
        bg = base_bg + p["g_bg"] * (e - 128.0) + rng.normal(0, NOISE_DN, 3)
        samples.append({
            "t": round(t, 1),
            "phase": "quiet" if t < QUIET_MS else "flash",
            "emitted": [float(v) for v in emitted[i]],
            "skin": [float(v) for v in np.clip(skin, 0, 255)],
            "bg": [float(v) for v in np.clip(bg, 0, 255)],
        })
    return {"label": label, "plan": plan, "samples": samples, "bpm": round(bpm, 1)}


if __name__ == "__main__":
    write = "--write" in sys.argv
    outdir = BASE / "sessions_synthetic"
    if write:
        outdir.mkdir(exist_ok=True)

    print("%-11s %7s %8s %11s %9s %7s %-9s %s"
          % ("classe", "illum_r", "lag_ms", "pele/fundo", "pulso_dB",
             "score", "veredito", "bpm real/medido"))
    print("-" * 96)

    ok = True
    for label in PROFILES:
        for k in range(6):
            d = synth(label, seed=hash((label, k)) % (2 ** 31))
            f = detector.extract_features(d["samples"])
            r = detector.fuse(f)
            print("%-11s %7.2f %8.0f %11.2f %9.1f %7.2f %-9s %.0f / %.0f"
                  % (label, f["illum_r"], f["illum_lag_ms"], f["skin_over_bg"],
                     f["pulse_snr_db"], r["score"],
                     "humano" if r["human"] else "reprovado",
                     d["bpm"], f["pulse_bpm"]))
            if (label == "real") != r["human"]:
                ok = False
            if write:
                d["result"] = r
                (outdir / ("synthetic_%s_%d.json" % (label, k))).write_text(
                    json.dumps(d))
        print()

    if write:
        print("gravado em sessions_synthetic/ -> "
              "python tools/evaluate.py sessions_synthetic")
    print("PIPELINE OK" if ok else "FALHOU: alguma classe caiu do lado errado")
    raise SystemExit(0 if ok else 1)
