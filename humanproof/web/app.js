/* Cliente de captura.
 *
 * Roda o desafio que o servidor sorteou e devolve series temporais de cor
 * por regiao do rosto. NAO decide nada - a decisao e do servidor.
 *
 * LIMITACAO IMPORTANTE (leia o README): este cliente calcula as medias de cor
 * no browser e manda so os numeros. Isso e otimo pro experimento (o payload
 * fica minusculo) e inutil como seguranca - um atacante manda os numeros que
 * quiser. Em producao o servidor precisa receber a midia crua junto com uma
 * atestacao de hardware (Play Integrity / App Attest). O modelo nao resolve
 * isso; so a atestacao resolve.
 */

const ROIS = {                    // x, y, w, h normalizados (canto sup. esq.)
  forehead: [0.42, 0.24, 0.16, 0.08],
  cheekL:   [0.30, 0.50, 0.12, 0.10],
  cheekR:   [0.58, 0.50, 0.12, 0.10],
  bg:       [0.02, 0.02, 0.14, 0.16],   // controle: canto do quadro
};

const MIN_DT = 30;                // ~33 fps
const CAPW = 320, CAPH = 240;

const $ = (id) => document.getElementById(id);
const video = $("cam"), flash = $("flash"), status = $("status"), out = $("out");

const canvas = document.createElement("canvas");
canvas.width = CAPW; canvas.height = CAPH;
const ctx = canvas.getContext("2d", { willReadFrequently: true });

let running = false;

// --------------------------------------------------------------- camera

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: { ideal: 30 } }, audio: false,
  });
  video.srcObject = stream;
  await video.play();

  // Auto-exposicao e auto-white-balance lutam contra os dois sinais que a
  // gente mede. Travar quando o browser deixa. Falhar aqui e normal.
  try {
    const track = stream.getVideoTracks()[0];
    await track.applyConstraints({
      advanced: [{ exposureMode: "manual", whiteBalanceMode: "manual" }],
    });
  } catch (e) { /* a maioria dos browsers nao suporta; segue o jogo */ }

  $("start").disabled = false;
  status.textContent = "Encaixe o rosto no oval, com luz suave, e inicie.";
}

// ------------------------------------------------------------- amostragem

function meanRGB(x, y, w, h) {
  const px = ctx.getImageData(Math.round(x * CAPW), Math.round(y * CAPH),
                              Math.max(1, Math.round(w * CAPW)),
                              Math.max(1, Math.round(h * CAPH))).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4;
  return [r / n, g / n, b / n];
}

function sampleFrame(t, phase, emitted) {
  ctx.drawImage(video, 0, 0, CAPW, CAPH);
  const f = meanRGB(...ROIS.forehead);
  const l = meanRGB(...ROIS.cheekL);
  const r = meanRGB(...ROIS.cheekR);
  const skin = [0, 1, 2].map((c) => (f[c] + l[c] + r[c]) / 3);
  return { t: Math.round(t), phase, emitted, skin, bg: meanRGB(...ROIS.bg) };
}

// ---------------------------------------------------------------- desafio

function colorAt(plan, tFlash) {
  let cur = plan[0].rgb;
  for (const step of plan) { if (tFlash >= step.t_ms) cur = step.rgb; else break; }
  return cur;
}

async function run() {
  running = true;
  $("start").disabled = true;
  out.innerHTML = "";

  const ch = await (await fetch("/challenge", { method: "POST" })).json();
  const QUIET = ch.quiet_ms, FLASH = ch.flash_ms;
  const samples = [];
  const t0 = performance.now();
  let last = -1e9;

  await new Promise((resolve) => {
    function tick(now) {
      const t = now - t0;

      if (t >= QUIET + FLASH) { resolve(); return; }

      const inQuiet = t < QUIET;
      // Fase quiet: luz branca constante -> nao contamina o rPPG.
      // Fase flash: a sequencia que o servidor sorteou.
      const rgb = inQuiet ? [235, 235, 235] : colorAt(ch.plan, t - QUIET);
      flash.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

      if (t - last >= MIN_DT) {
        last = t;
        samples.push(sampleFrame(t, inQuiet ? "quiet" : "flash", rgb));
        const left = Math.ceil((QUIET + FLASH - t) / 1000);
        status.textContent = inQuiet
          ? `Fique parado, olhando pra tela... ${left}s`
          : `Sequencia de luz... ${left}s`;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  flash.style.background = "#000";
  status.textContent = "Verificando...";

  const res = await fetch("/verify", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: ch.session_id, nonce: ch.nonce,
      samples, label: $("label").value,
    }),
  });

  render(res.ok ? await res.json() : { error: await res.text() });
  status.textContent = `${samples.length} amostras gravadas.`;
  $("start").disabled = false;
  running = false;
}

// ------------------------------------------------------------------ saida

function render(r) {
  if (r.error) { out.innerHTML = `<div class="card bad">${r.error}</div>`; return; }
  const f = r.features;
  const reasons = r.reasons.length
    ? `<ul>${r.reasons.map((x) => `<li>${x}</li>`).join("")}</ul>` : "";
  out.innerHTML = `
    <div class="card">
      <div class="verdict ${r.human ? "ok" : "bad"}">
        ${r.human ? "HUMANO PRESENTE" : "NAO VERIFICADO"} &middot; ${r.score}
      </div>
      <div class="row">
        luz ${r.parts.luz} &nbsp;|&nbsp; pulso ${r.parts.pulso}
        &nbsp;|&nbsp; geometria ${r.parts.geometria} &nbsp;|&nbsp; tempo ${r.parts.tempo}
      </div>
      ${reasons}
      <pre>resposta a luz   r = ${f.illum_r}   atraso = ${f.illum_lag_ms} ms
fundo (controle) r = ${f.bg_r}   pele/fundo = ${f.skin_over_bg}
pulso            ${f.pulse_bpm} bpm   SNR = ${f.pulse_snr_db} dB
ganho por canal  R ${f.gain_R}  G ${f.gain_G}  B ${f.gain_B}
captura          ${f.fps_est} fps   (${f.n_quiet} quiet / ${f.n_flash} flash)</pre>
    </div>`;
}

$("start").addEventListener("click", () => { if (!running) run().catch(showErr); });

function showErr(e) {
  status.textContent = "Erro: " + e.message;
  $("start").disabled = false; running = false;
}

initCamera().catch(showErr);
