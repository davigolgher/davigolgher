/* Demonstracao. Faz o papel do site da empresa cliente. */
const $ = (id) => document.getElementById(id);
const out = $("out");
let badges = [];      // na vida real: guardados no aparelho do usuario

/* A demo e o molde que a empresa cliente vai copiar. Entao nada de jogar
 * dado de terceiro em innerHTML, mesmo com a CSP bloqueando script inline:
 * o padrao errado viaja pro codigo dos outros. */
const esc = (v) => String(v).replace(/[&<>"']/g,
  (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const show = (h) => { out.innerHTML = `<div class="card">${h}</div>`; };
const fail = (m) => show(`<div class="verdict bad">Erro</div><pre>${esc(m)}</pre>`);
const user = () => $("user").value;

function refreshBadges() {
  $("badge-count").textContent = badges.length
    ? `${badges.length} cracha(s) na carteira` : "";
  $("btn-twitter").disabled = $("btn-tinder").disabled = badges.length === 0;
}
refreshBadges();

$("btn-enroll").onclick = async () => {
  try {
    const r = await humankey.enroll({ start: "/demo/enroll", body: {
      external_id: user(), display: user(),
      enrollment_level: $("level").value } });
    show(`<div class="verdict ok">Passkey cadastrada</div>
      <pre>nivel de cadastro : ${r.enrollment}
tipo de passkey   : ${r.device_type}${r.device_type === "multi_device"
  ? "  (sincroniza entre aparelhos)" : "  (presa a este aparelho)"}</pre>`);
  } catch (e) { fail(e.message); }
};

async function act(action, minEnrollment, context) {
  const r = await humankey.verify({ start: "/demo/verify",
    body: { external_id: user(), action, context: context || {} } });
  const d = await (await fetch("/demo/approve", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: r.token, action, min_enrollment: minEnrollment,
                           expect_context: context || {} }),
  })).json();
  show(`<div class="verdict ${d.approved ? "ok" : "warn"}">
      ${d.approved ? "APROVADO" : "NEGADO"}</div>
    <div style="color:var(--dim)">${esc(d.reason)}</div>
    <pre>${esc(JSON.stringify(d.claims || {}, null, 2))}</pre>`);
  return r.token;
}

$("btn-login").onclick = () => act("login", "self_asserted").catch((e) => fail(e.message));
$("btn-wire").onclick = () => act("wire_transfer", "identity_proofed",
  { amount_brl: 25000000, to: "conta 4471-2" }).catch((e) => fail(e.message));

$("btn-badges").onclick = async () => {
  try {
    // Primeiro prova quem e (Parte 1), com uma acao dedicada.
    const token = await act("personhood", "identity_proofed");
    badges = await humankey.personhood.getBadges({
      start: "/demo/personhood/issue", token, count: 3 });
    refreshBadges();
    show(`<div class="verdict ok">3 crachas anonimos na carteira</div>
      <p class="hint">O servidor assinou envelopes fechados. Ele NAO consegue
         ligar nenhum destes crachas a voce - nem hoje, nem depois de te ver
         usar. Isso e matematica, nao politica de privacidade.</p>
      <pre>${badges.map((b, i) =>
        `cracha ${i + 1}: ${b.token}\n  assinatura: ${b.signature.slice(0, 60)}...`
      ).join("\n")}</pre>
      <div class="row"><button id="copiar">Copiar 1 cracha</button>
        <span id="copiado" class="hint"></span></div>
      <p class="hint">Cole num site que use o humankey - por exemplo a SemBot,
         em <code>localhost:8001</code>. Ele vira uma conta la, sem que aquele
         site descubra nada sobre voce.</p>`);
    $("copiar").onclick = () => {
      const b = badges.shift();
      refreshBadges();
      navigator.clipboard.writeText(JSON.stringify(b));
      $("copiado").textContent = "copiado - restam " + badges.length;
    };
  } catch (e) { fail(e.message); }
};

async function useAt(scope, siteLabel) {
  try {
    const badge = badges.shift();
    const r = await humankey.personhood.redeem({ badge, scope });
    refreshBadges();
    show(`<div class="verdict ok">${siteLabel}: conta criada</div>
      <p class="hint">O que <b>${scope}</b> aprendeu sobre voce:</p>
      <pre>${esc(JSON.stringify(r, null, 2))}</pre>
      <p class="hint">Repare no que <b>nao</b> esta ai: nome, e-mail, de qual
         banco veio, nem um identificador que sirva pra cruzar com outro site.
         O cracha e de uso unico global exatamente pra que dois sites nao
         possam comparar e concluir "e a mesma pessoa".</p>`);
    window._ultimo = badge;
  } catch (e) { fail(e.message); }
}

$("btn-twitter").onclick = () => useAt("rede-social.com", "rede-social.com");
$("btn-tinder").onclick = () => useAt("app-namoro.com", "app-namoro.com");

$("btn-double").onclick = async () => {
  if (!window._ultimo) return fail("use um cracha em algum site primeiro");
  try {
    await humankey.personhood.redeem({ badge: window._ultimo, scope: "outro-site.com" });
    fail("PROBLEMA: o cracha foi aceito duas vezes");
  } catch (e) {
    show(`<div class="verdict ok">Reuso bloqueado</div>
      <pre>${esc(e.message)}</pre>
      <p class="hint">E o que impede tanto a fraude (uma pessoa, mil contas)
         quanto o cruzamento entre sites.</p>`);
  }
};

$("btn-audit").onclick = async () => {
  const r = await (await fetch("/demo/audit")).json();
  $("audit").textContent =
    `cadeia integra: ${r.chain_intact}\n\n` + (r.events.map((e) =>
      `${new Date(e.at * 1000).toLocaleTimeString("pt-BR")}  ${e.event.padEnd(18)} ${e.detail || ""}`
    ).join("\n") || "(vazio)");
};
