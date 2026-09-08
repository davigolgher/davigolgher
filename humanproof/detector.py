"""Sinais de vivacidade + fusao.

Duas cabecas, as duas baseadas em fisica:

  A) rPPG  - pulso pela micro-variacao de cor da pele (algoritmo POS).
             Medido na fase "quiet", com a tela em luz constante.
  B) Luz   - a pele respondeu ao flash aleatorio que o servidor mandou piscar.
             Medido na fase "flash".

Nada aqui e treinado. Sao formulas fechadas + limiares explicitos, de proposito:
da pra explicar cada reprovacao ("nao houve resposta a luz"), o que uma rede
end-to-end nao te da. Quando voce tiver dados rotulados suficientes, troque
`fuse()` por uma regressao logistica sobre exatamente estas mesmas features.
"""

import numpy as np
from scipy import signal as sps

FS = 30.0                       # grade de reamostragem, em Hz
LUM = np.array([0.299, 0.587, 0.114])


# ---------------------------------------------------------------- utilidades

def _uniform(t_ms, x, fs=FS):
    """Reamostra uma serie irregular (timestamps do requestAnimationFrame)
    numa grade uniforme. Sem isso, qualquer analise de frequencia mente."""
    t = np.asarray(t_ms, dtype=float) / 1000.0
    x = np.asarray(x, dtype=float)
    if t.size < 8:
        raise ValueError("amostras insuficientes")
    t = t - t[0]
    n = int(np.floor(t[-1] * fs)) + 1
    grid = np.arange(n) / fs
    if x.ndim == 1:
        return grid, np.interp(grid, t, x)
    cols = [np.interp(grid, t, x[:, c]) for c in range(x.shape[1])]
    return grid, np.stack(cols, axis=1)


def _znorm(x):
    x = sps.detrend(np.asarray(x, dtype=float))
    s = float(x.std())
    return x / s if s > 1e-9 else x


# -------------------------------------------------------- cabeca A: pulso

def pos_rppg(rgb, fs=FS, win_s=1.6):
    """POS (Plane-Orthogonal-to-Skin, Wang et al. 2017).

    Combina os canais de cor num plano ortogonal a variacao de tom de pele,
    o que cancela boa parte do ruido de movimento e deixa o que sobra sendo
    principalmente volume de sangue. Sem treino: e algebra linear.
    """
    C = np.asarray(rgb, dtype=float)
    n = len(C)
    l = max(8, int(round(win_s * fs)))
    if n < l:
        return np.zeros(n)
    P = np.array([[0.0, 1.0, -1.0],      # S1 = G - B
                  [-2.0, 1.0, 1.0]])     # S2 = -2R + G + B
    H = np.zeros(n)
    for i in range(0, n - l + 1):
        Cw = C[i:i + l]
        mu = Cw.mean(axis=0)
        mu[np.abs(mu) < 1e-9] = 1e-9
        S = P @ (Cw / mu).T              # 2 x l
        s1, s2 = S[0], S[1]
        h = s1 + (s1.std() / (s2.std() + 1e-9)) * s2
        h = h - h.mean()
        sd = h.std()
        if sd > 1e-9:
            h = h / sd
        H[i:i + l] += h                  # overlap-add
    return H - H.mean()


def band_snr(x, fs=FS, lo=0.7, hi=4.0):
    """Existe um pico limpo na banda fisiologica (42-240 bpm)?

    Devolve (bpm, snr_db). SNR = potencia no pico dominante e no seu primeiro
    harmonico, contra o resto da banda. Video gerado costuma nao ter nada
    coerente aqui - so ruido espalhado.
    """
    x = sps.detrend(np.asarray(x, dtype=float))
    if x.size < int(2 * fs):
        return 0.0, -99.0
    sp = np.abs(np.fft.rfft(x * np.hanning(x.size))) ** 2
    f = np.fft.rfftfreq(x.size, 1.0 / fs)
    band = (f >= lo) & (f <= hi)
    if not band.any() or sp[band].sum() <= 0:
        return 0.0, -99.0
    fb, pb = f[band], sp[band]
    f0 = float(fb[int(np.argmax(pb))])
    # A largura do pico tem que acompanhar a resolucao do espectro (df = fs/N),
    # senao janelas curtas sao punidas por um limiar que elas nao tem como
    # atingir. Com 8 s a 30 fps, df = 0.125 Hz = 7.5 bpm.
    df = float(f[1] - f[0])
    w = max(0.12, 1.5 * df)
    sel = (np.abs(fb - f0) <= w) | (np.abs(fb - 2 * f0) <= 1.6 * w)
    sig = float(pb[sel].sum())
    noise = float(pb.sum() - sig)
    return f0 * 60.0, float(10 * np.log10(sig / (noise + 1e-12)))


# --------------------------------------------------- cabeca B: resposta a luz

def illumination_response(emitted, skin, bg, fs=FS, max_lag_ms=300):
    """A pele reagiu ao flash que NOS escolhemos, no tempo certo?

    E a cabeca mais forte, e a que mata ataque por injecao (camera virtual):
    um stream sintetico nao tem como responder a uma cor que ele nao sabia
    que ia acontecer. Correlacao ~0 => nao tem ninguem na frente da camera.
    """
    e_raw = np.asarray(emitted, dtype=float) @ LUM
    s_raw = np.asarray(skin, dtype=float) @ LUM
    b_raw = np.asarray(bg, dtype=float) @ LUM
    e = _znorm(e_raw)
    s = _znorm(s_raw)
    b = _znorm(b_raw)

    max_lag = int(round(max_lag_ms / 1000.0 * fs))

    def best_lag(a, x):
        """Maior correlacao de x atrasado em relacao a a, e o atraso."""
        best_r, best_k = 0.0, 0
        for k in range(0, max_lag + 1):
            n = len(a) - k
            if n < 8:
                break
            u, v = a[:n], x[k:k + n]
            if u.std() < 1e-9 or v.std() < 1e-9:
                continue
            r = float(np.corrcoef(u, v)[0, 1])
            if np.isfinite(r) and r > best_r:
                best_r, best_k = r, k
        return best_r, best_k * 1000.0 / fs

    r_skin, lag_skin = best_lag(e, s)
    r_bg, _ = best_lag(e, b)

    # Ganho: quanto de brilho a superficie devolve por unidade de estimulo.
    def gain(raw):
        y = sps.detrend(np.asarray(raw, dtype=float))
        d = float(e @ e)
        return float(e @ y / d) if d > 1e-9 else 0.0

    g_skin, g_bg = gain(s_raw), gain(b_raw)

    # Rosto real esta mais perto da tela que o fundo -> responde mais forte.
    # Tela reproduzindo video: rosto e fundo sao a MESMA superficie -> ~1.
    skin_over_bg = abs(g_skin) / (abs(g_bg) + 1e-6)

    # Assinatura cromatica: como cada canal emitido volta na pele.
    E = np.asarray(emitted, dtype=float)
    S = np.asarray(skin, dtype=float)
    gains = {}
    for i, ch in enumerate("RGB"):
        ei = _znorm(E[:, i])
        d = float(ei @ ei)
        gains[ch] = float(ei @ sps.detrend(S[:, i]) / d) if d > 1e-9 else 0.0

    return {
        "illum_r": round(r_skin, 4),
        "illum_lag_ms": round(lag_skin, 1),
        "bg_r": round(r_bg, 4),
        "skin_over_bg": round(float(skin_over_bg), 3),
        "gain_R": round(gains["R"], 3),
        "gain_G": round(gains["G"], 3),
        "gain_B": round(gains["B"], 3),
    }


# ------------------------------------------------------------------ features

def extract_features(samples):
    """samples: lista de dicts vindos do cliente, cada um com
       {t, phase, emitted:[r,g,b], skin:[r,g,b], bg:[r,g,b]}"""
    quiet = [s for s in samples if s["phase"] == "quiet"]
    flash = [s for s in samples if s["phase"] == "flash"]
    feats = {
        "n_quiet": len(quiet),
        "n_flash": len(flash),
        "pulse_bpm": 0.0, "pulse_snr_db": -99.0,
        "illum_r": 0.0, "illum_lag_ms": 0.0, "bg_r": 0.0,
        "skin_over_bg": 0.0, "gain_R": 0.0, "gain_G": 0.0, "gain_B": 0.0,
        "fps_est": 0.0,
    }

    if len(samples) >= 2:
        span = (samples[-1]["t"] - samples[0]["t"]) / 1000.0
        if span > 0:
            feats["fps_est"] = round(len(samples) / span, 1)

    if len(quiet) >= 60:                      # ~2s minimo
        _, skin = _uniform([s["t"] for s in quiet], [s["skin"] for s in quiet])
        bpm, snr = band_snr(pos_rppg(skin))
        feats["pulse_bpm"] = round(bpm, 1)
        feats["pulse_snr_db"] = round(snr, 2)

    if len(flash) >= 20:
        t = [s["t"] for s in flash]
        _, em = _uniform(t, [s["emitted"] for s in flash])
        _, sk = _uniform(t, [s["skin"] for s in flash])
        _, bgm = _uniform(t, [s["bg"] for s in flash])
        feats.update(illumination_response(em, sk, bgm))

    return feats


# -------------------------------------------------------------------- fusao

def _ramp(x, lo, hi):
    """Mapeia x para 0..1 linearmente entre lo e hi."""
    if hi <= lo:
        return 0.0
    return float(min(1.0, max(0.0, (x - lo) / (hi - lo))))


# Limiares iniciais, chutados de proposito. Depois de gravar suas primeiras
# sessoes rotuladas, rode tools/evaluate.py e ajuste com base no grafico.
TH = {
    "illum_r_fail": 0.30, "illum_r_pass": 0.55,
    "pulse_snr_fail": 0.0, "pulse_snr_pass": 5.0,
    "geom_fail": 1.20, "geom_pass": 2.20,
    "lag_max_ms": 250.0,
    "verdict_threshold": 0.70,
}

# Pesos da fusao. Somam 1. A cabeca da luz pesa mais porque e a unica que
# um ataque por injecao nao tem como falsificar de jeito nenhum.
W = {"luz": 0.35, "pulso": 0.30, "geometria": 0.25, "tempo": 0.10}


def fuse(feats, deadline_ok=True, elapsed_ms=0):
    """Fusao rasa e transparente.

    `blockers` reprovam sozinhos. `notes` sao ressalvas que ja estao
    refletidas na nota - nao reprovam duas vezes.
    """
    blockers, notes = [], []

    s_luz = _ramp(feats["illum_r"], TH["illum_r_fail"], TH["illum_r_pass"])
    s_pulso = _ramp(feats["pulse_snr_db"], TH["pulse_snr_fail"], TH["pulse_snr_pass"])
    # Rosto real esta mais perto da tela que o fundo, entao devolve mais luz.
    # Numa tela reproduzindo video, "rosto" e "fundo" sao a mesma superficie
    # plana e a razao cai pra ~1. Sinal de apoio, nao prova: quem senta
    # encostado na parede tambem tem razao baixa - por isso e pontuado, nao
    # e um portao.
    s_geom = _ramp(feats["skin_over_bg"], TH["geom_fail"], TH["geom_pass"])
    s_tempo = 1.0 if (deadline_ok and feats["illum_lag_ms"] <= TH["lag_max_ms"]) else 0.0

    if feats["illum_r"] < TH["illum_r_fail"]:
        blockers.append(
            "sem resposta a luz (r=%.2f): nada na frente da camera reagiu ao "
            "flash - assinatura classica de injecao de stream" % feats["illum_r"])
    if feats["illum_lag_ms"] > TH["lag_max_ms"]:
        blockers.append("resposta a luz atrasada demais (%.0f ms): tempo de pipeline"
                        % feats["illum_lag_ms"])
    if not deadline_ok:
        blockers.append("resposta fora do prazo (%d ms)" % elapsed_ms)
    if feats["fps_est"] < 15:
        blockers.append("captura muito lenta (%.0f fps): resultado nao confiavel"
                        % feats["fps_est"])

    if feats["pulse_snr_db"] < TH["pulse_snr_fail"]:
        notes.append("sem pulso detectavel (SNR=%.1f dB)" % feats["pulse_snr_db"])
    if feats["skin_over_bg"] < TH["geom_fail"] and feats["illum_r"] >= TH["illum_r_fail"]:
        notes.append(
            "rosto e fundo responderam igual (razao=%.2f): compativel com uma "
            "superficie plana, tipo uma tela" % feats["skin_over_bg"])

    score = (W["luz"] * s_luz + W["pulso"] * s_pulso
             + W["geometria"] * s_geom + W["tempo"] * s_tempo)
    return {
        "score": round(float(score), 3),
        "human": bool(score >= TH["verdict_threshold"] and not blockers),
        "parts": {"luz": round(s_luz, 3), "pulso": round(s_pulso, 3),
                  "geometria": round(s_geom, 3), "tempo": round(s_tempo, 3)},
        "reasons": blockers + notes,
        "blockers": blockers,
        "notes": notes,
    }
