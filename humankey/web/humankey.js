/* humankey - SDK do navegador.
 *
 * E o unico arquivo que a empresa cliente cola no site dela. Ele NUNCA ve a
 * chave de API: quem pede o desafio e o backend da propria empresa, e o
 * navegador so recebe um client_secret descartavel.
 *
 *   await humankey.enroll({ start: "/meu-backend/cadastrar" });
 *   const { token } = await humankey.verify({ start: "/meu-backend/aprovar",
 *                                             body: { valor: 25000000 } });
 *
 * O `token` vai pro backend da empresa, que confere a assinatura. O navegador
 * nao decide nada - ele so carrega o envelope.
 */
(function (global) {
  const b64uToBuf = (s) => {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
  };
  const bufToB64u = (b) =>
    btoa(String.fromCharCode(...new Uint8Array(b)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  async function post(url, body) {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
    return data;
  }

  function assertSupported() {
    if (!global.PublicKeyCredential) {
      throw new Error("Este navegador nao suporta passkey.");
    }
  }

  // O aparelho devolve ArrayBuffers; o servidor fala base64url.
  function serialize(cred, extra) {
    const r = cred.response;
    return {
      id: cred.id, rawId: bufToB64u(cred.rawId), type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
      response: Object.assign({
        clientDataJSON: bufToB64u(r.clientDataJSON),
      }, extra(r)),
    };
  }

  const base = (o) => (o && o.base) || "";

  async function enroll(o) {
    assertSupported();
    const s = await post(o.start, o.body);
    const opts = s.options;
    opts.challenge = b64uToBuf(opts.challenge);
    opts.user.id = b64uToBuf(opts.user.id);
    (opts.excludeCredentials || []).forEach((c) => { c.id = b64uToBuf(c.id); });

    const cred = await navigator.credentials.create({ publicKey: opts });
    if (!cred) throw new Error("cadastro cancelado");

    return post(`${base(o)}/v1/enrollments/${s.enrollment_id}/complete`, {
      client_secret: s.client_secret,
      credential: serialize(cred, (r) => ({
        attestationObject: bufToB64u(r.attestationObject),
        transports: r.getTransports ? r.getTransports() : [],
      })),
    });
  }

  async function verify(o) {
    assertSupported();
    const s = await post(o.start, o.body);
    const opts = s.options;
    opts.challenge = b64uToBuf(opts.challenge);
    (opts.allowCredentials || []).forEach((c) => { c.id = b64uToBuf(c.id); });

    const cred = await navigator.credentials.get({ publicKey: opts });
    if (!cred) throw new Error("verificacao cancelada");

    return post(`${base(o)}/v1/verifications/${s.verification_id}/complete`, {
      client_secret: s.client_secret,
      credential: serialize(cred, (r) => ({
        authenticatorData: bufToB64u(r.authenticatorData),
        signature: bufToB64u(r.signature),
        userHandle: r.userHandle ? bufToB64u(r.userHandle) : null,
      })),
    });
  }

  global.humankey = { enroll, verify };
})(window);

/* ---------------------------------------------------------------------------
 * Prova de humanidade anonima - o lado do usuario.
 *
 * A matematica que garante a privacidade roda AQUI, no navegador da pessoa.
 * O segredo nunca sai daqui em claro: o que vai pro servidor e o envelope
 * fechado. Nao e uma promessa de politica de privacidade - o servidor
 * simplesmente nao tem como saber.
 * ------------------------------------------------------------------------ */
(function (global) {
  const b64u = (bytes) =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-")
      .replace(/\//g, "_").replace(/=+$/, "");

  function modPow(base, exp, mod) {
    let r = 1n; base %= mod;
    while (exp > 0n) {
      if (exp & 1n) r = (r * base) % mod;
      base = (base * base) % mod;
      exp >>= 1n;
    }
    return r;
  }

  function modInverse(a, m) {
    let [old_r, r] = [a % m, m];
    let [old_s, s] = [1n, 0n];
    while (r !== 0n) {
      const q = old_r / r;
      [old_r, r] = [r, old_r - q * r];
      [old_s, s] = [s, old_s - q * s];
    }
    if (old_r !== 1n) return null;            // sem inverso: sorteia outro r
    return ((old_s % m) + m) % m;
  }

  const bytesToBig = (b) =>
    b.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);

  // MGF1(SHA-256) - identico ao lado Python, senao a assinatura nao confere.
  async function mgf1(seed, length) {
    const out = [];
    for (let counter = 0; out.length < length; counter++) {
      const c = new Uint8Array(4);
      new DataView(c.buffer).setUint32(0, counter, false);
      const block = new Uint8Array(await crypto.subtle.digest(
        "SHA-256", new Uint8Array([...seed, ...c])));
      out.push(...block);
    }
    return new Uint8Array(out.slice(0, length));
  }

  async function fullDomainHash(msg, n) {
    const label = new TextEncoder().encode("humankey-fdh-v1");
    const k = Math.ceil(n.toString(2).length / 8);
    return bytesToBig(await mgf1(new Uint8Array([...label, ...msg]), k)) % n;
  }

  function randomBelow(n) {
    const k = Math.ceil(n.toString(2).length / 8);
    const buf = new Uint8Array(k);
    crypto.getRandomValues(buf);
    return bytesToBig(buf) % n;
  }

  /* Pede crachas anonimos. `start` e o endpoint do backend da empresa, que
   * repassa o pedido junto com o token de verificacao da Parte 1. */
  async function getBadges({ start, token, count = 1, base = "" }) {
    const p = await (await fetch(`${base}/v1/personhood/params`)).json();
    const n = BigInt(p.n), e = BigInt(p.e);

    const secrets = [], rInvs = [], blinded = [];
    for (let i = 0; i < count; i++) {
      const m = new Uint8Array(32);
      crypto.getRandomValues(m);
      const h = await fullDomainHash(m, n);
      let r, rInv = null;
      while (rInv === null) { r = randomBelow(n - 2n) + 2n; rInv = modInverse(r, n); }
      secrets.push(m); rInvs.push(rInv);
      blinded.push(((h * modPow(r, e, n)) % n).toString());
    }

    const res = await post(start, { token, blinded });
    return res.signatures.map((sig, i) => ({
      epoch: res.epoch,
      token: b64u(secrets[i]),
      // Tirar o envelope. A assinatura segue valida no segredo de dentro.
      signature: ((BigInt(sig) * rInvs[i]) % n).toString(),
    }));
  }

  /* Gasta um cracha num site. O site aprende "humano verificado" e mais nada. */
  async function redeem({ badge, scope, base = "" }) {
    return post(`${base}/v1/personhood/redeem`, Object.assign({ scope }, badge));
  }

  async function post(url, body) {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
    return d;
  }

  global.humankey.personhood = { getBadges, redeem };
  // Exposto so pro teste de paridade com o servidor (tests/test_sdk_math.js).
  // Se o hash do navegador divergir do hash do Python, nenhuma assinatura
  // confere - e o sintoma seria "assinatura invalida" sem explicacao.
  global.humankey.personhood._math = { fullDomainHash, modPow, modInverse };
})(window);
