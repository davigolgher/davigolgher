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
