/* Paridade entre a matematica do navegador e a do servidor.
 *
 * O SDK precisa calcular EXATAMENTE o mesmo full-domain hash que o Python.
 * Uma divergencia de um byte faz toda assinatura falhar, e o erro visivel
 * seria so "assinatura invalida" - impossivel de diagnosticar em producao.
 */
const nodeCrypto = require("crypto");
const fs = require("fs");
const path = require("path");

global.window = global;
global.crypto = {
  subtle: { digest: async (_alg, data) =>
    nodeCrypto.createHash("sha256").update(Buffer.from(data)).digest().buffer },
  getRandomValues: (b) => nodeCrypto.randomFillSync(b),
};
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");
global.TextEncoder = require("util").TextEncoder;
global.PublicKeyCredential = function () {};
global.navigator = { credentials: {} };
global.fetch = async () => { throw new Error("rede nao usada neste teste"); };

eval(fs.readFileSync(path.join(__dirname, "..", "web", "humankey.js"), "utf8"));
const { fullDomainHash, modPow, modInverse } = window.humankey.personhood._math;

(async () => {
  const vectors = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  let fails = 0;

  for (const v of vectors.fdh) {
    const msg = Uint8Array.from(Buffer.from(v.msg_hex, "hex"));
    const got = (await fullDomainHash(msg, BigInt(v.n))).toString();
    const ok = got === v.expected;
    if (!ok) fails++;
    console.log(`  ${ok ? "OK  " : "FALHOU"} full-domain hash (${v.label})`);
  }

  const { n, e, d, msg_hex, r } = vectors.blind;
  const N = BigInt(n), E = BigInt(e), D = BigInt(d), R = BigInt(r);
  const h = await fullDomainHash(Uint8Array.from(Buffer.from(msg_hex, "hex")), N);
  const blinded = (h * modPow(R, E, N)) % N;
  const blindSig = modPow(blinded, D, N);
  const sig = (blindSig * modInverse(R, N)) % N;
  const verified = modPow(sig, E, N) === h;
  if (!verified) fails++;
  console.log(`  ${verified ? "OK  " : "FALHOU"} ciclo cego completo do lado do navegador`);
  console.log(`  ${sig.toString() === vectors.blind.expected_sig ? "OK  " : "FALHOU"} assinatura identica a do servidor`);
  if (sig.toString() !== vectors.blind.expected_sig) fails++;

  process.exit(fails ? 1 : 0);
})();
