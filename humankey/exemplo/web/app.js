/* SemBot - front do app de exemplo. Nao usa o SDK do humankey: a SemBot nunca
 * fala com o aparelho do usuario, so recebe um cracha ja pronto. */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let sessao = null;

async function api(url, body) {
  const r = await fetch(url, body ? {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
  return d;
}

$("entrar").onclick = async () => {
  try {
    const badge = JSON.parse($("badge").value.trim());
    const r = await api("/criar-conta", { apelido: $("apelido").value.trim(), badge });
    sessao = r.sessao;
    $("area-post").hidden = false;
    $("res-entrar").innerHTML =
      `<pre class="ok">conta criada: ${esc(r.apelido)}

tudo que a SemBot aprendeu sobre voce nesta chamada:
${esc(JSON.stringify(r.o_que_a_sembot_aprendeu, null, 2))}</pre>
       <p class="hint">Nao veio nome, nem e-mail, nem de qual banco o cracha
          saiu. So "e um humano verificado, e este cracha e inedito".</p>`;
    carregar();
  } catch (e) {
    $("res-entrar").innerHTML = `<pre class="bad">${esc(e.message)}</pre>`;
  }
};

$("postar").onclick = async () => {
  try {
    await api("/postar", { sessao, texto: $("texto").value });
    $("texto").value = "";
    carregar();
  } catch (e) { alert(e.message); }
};

async function carregar() {
  const { posts } = await api("/posts");
  $("timeline").innerHTML = posts.length
    ? posts.map((p) => `<div class="post"><span class="quem">${esc(p.apelido)}</span>
        <div>${esc(p.texto)}</div></div>`).join("")
    : "ninguem postou ainda.";
}

$("ver-banco").onclick = async () => {
  const d = await api("/meu-banco");
  $("banco").textContent = JSON.stringify(d, null, 2);
};

carregar();
