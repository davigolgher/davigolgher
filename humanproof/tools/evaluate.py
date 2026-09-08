"""O experimento da semana 1.

Le tudo que esta em sessions/, RECALCULA as features a partir das amostras
cruas (entao voce pode mexer no detector.py e reavaliar sem regravar nada) e
plota as duas cabecas uma contra a outra.

A pergunta que o grafico responde: as tres classes - real, replay, injection -
se separam? Se separam, voce tem produto. Se nao separam, voce descobriu isso
em tres dias em vez de seis meses.

    python tools/evaluate.py [pasta]
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import detector  # noqa: E402

BASE = Path(__file__).resolve().parents[1]
COLORS = {"real": "#3fb950", "replay": "#d29922", "injection": "#f85149"}


def load(dirname="sessions"):
    rows = []
    for p in sorted((BASE / dirname).glob("*.json")):
        d = json.loads(p.read_text())
        feats = detector.extract_features(d["samples"])       # recalcula
        rows.append({"file": p.name, "label": d.get("label", "unlabeled"),
                     "feats": feats, "fused": detector.fuse(feats)})
    return rows


def table(rows):
    print("\n%-11s %6s %8s %9s %9s %7s  %s" % (
        "classe", "illum_r", "lag_ms", "pele/fundo", "pulso_dB", "score", "arquivo"))
    print("-" * 86)
    for r in sorted(rows, key=lambda r: r["label"]):
        f = r["feats"]
        print("%-11s %6.2f %8.0f %9.2f %9.1f %7.2f  %s" % (
            r["label"], f["illum_r"], f["illum_lag_ms"], f["skin_over_bg"],
            f["pulse_snr_db"], r["fused"]["score"], r["file"]))

    by = defaultdict(list)
    for r in rows:
        by[r["label"]].append(r["fused"]["score"])
    print("\nscore medio por classe:")
    for k in sorted(by):
        v = by[k]
        print("  %-11s n=%-3d media=%.2f  min=%.2f  max=%.2f"
              % (k, len(v), sum(v) / len(v), min(v), max(v)))

    reais = by.get("real", [])
    ataques = [s for k, v in by.items() if k != "real" for s in v]
    if reais and ataques:
        print("\nmargem (pior real - melhor ataque): %+.2f" % (min(reais) - max(ataques)))
        print("  positiva = as classes separam com um limiar unico.")


def plot(rows, dest):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(7, 5.5))
    seen = set()
    for r in rows:
        lb = r["label"]
        ax.scatter(r["feats"]["illum_r"], r["feats"]["pulse_snr_db"],
                   s=90, alpha=.85, edgecolor="#111", linewidth=.6,
                   color=COLORS.get(lb, "#8b949e"),
                   label=lb if lb not in seen else None)
        seen.add(lb)

    ax.axvline(detector.TH["illum_r_fail"], ls="--", lw=1, color="#888")
    ax.axhline(detector.TH["pulse_snr_fail"], ls="--", lw=1, color="#888")
    ax.set_xlabel("cabeca B: resposta a luz  (correlacao r)")
    ax.set_ylabel("cabeca A: pulso rPPG  (SNR, dB)")
    ax.set_title("As tres classes separam?")
    ax.grid(alpha=.2)
    ax.legend()
    fig.tight_layout()
    dest.parent.mkdir(exist_ok=True)
    fig.savefig(dest, dpi=140)
    print("\ngrafico: %s" % dest)


if __name__ == "__main__":
    dirname = sys.argv[1] if len(sys.argv) > 1 else "sessions"
    rows = load(dirname)
    if not rows:
        print("Nenhuma sessao em %s/. Rode o servidor e grave algumas:" % dirname)
        print("  ~20 'real', ~20 'replay', ~20 'injection'.")
        raise SystemExit(1)
    table(rows)
    try:
        plot(rows, BASE / "out" / "scatter.png")
    except ImportError:
        print("\n(matplotlib nao instalado - pulando o grafico)")
