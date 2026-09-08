"""Roteiro narrado: o sistema inteiro rodando, passo a passo.

Nao e simulacao. E o servidor de verdade, a criptografia de verdade e o mesmo
"celular de mentira" dos testes. Cada passo mostra tres coisas:

    ->  o que sai da maquina do usuario
    <-  o que o servidor responde
    []  o que fica guardado no disco

    python tools/walkthrough.py
"""

import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

d = tempfile.mkdtemp()
os.environ.update(HUMANKEY_DB=d + "/w.db", HUMANKEY_SECRET=d + "/s.bin",
                  HUMANKEY_DEMO_FILE=d + "/t.json",
                  RP_ID="localhost", ORIGIN="http://localhost:8000")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient                # noqa: E402
from webauthn.helpers import bytes_to_base64url          # noqa: E402
from app import main, personhood, store                  # noqa: E402
from tests.authenticator import VirtualAuthenticator     # noqa: E402

ORIGIN = "http://localhost:8000"
c = TestClient(main.app)
W = 78


def titulo(n, txt):
    print("\n" + "=" * W)
    print("PASSO %s  %s" % (n, txt))
    print("=" * W)


def nota(txt):
    for line in txt.strip().split("\n"):
        print("   " + line.strip())


def envia(label, obj):
    print("\n   -> ENVIA  %s" % label)
    print(recuar(obj))


def recebe(label, obj):
    print("\n   <- RECEBE %s" % label)
    print(recuar(obj))


def disco(label, rows):
    print("\n   [] NO DISCO  %s" % label)
    print(recuar(rows))


def recuar(obj):
    txt = obj if isinstance(obj, str) else json.dumps(obj, indent=2, ensure_ascii=False)
    return "\n".join("      " + l for l in txt.split("\n"))


def curto(s, n=54):
    s = str(s)
    return s if len(s) <= n else s[:n] + "..."


def tabela(nome):
    with store.connect() as con:
        return [dict(r) for r in con.execute("SELECT * FROM %s" % nome)]


# ===========================================================================
titulo(1, "A empresa cliente cria a conta dela")
tenant, API_KEY = main._demo_tenant()
AUTH = {"Authorization": "Bearer " + API_KEY}
nota("""
Uma empresa - um banco, um app, uma rede social - vira um "tenant".
Ela recebe uma chave de API que fica NO BACKEND dela. O navegador do
usuario final nunca ve essa chave.
""")
recebe("chave de API (mostrada uma unica vez)", {"tenant": tenant["name"],
                                                 "api_key": curto(API_KEY)})
disco("tabela tenants", [{k: curto(v) for k, v in r.items()} for r in tabela("tenants")])
nota("""
Repare: guardamos o HASH da chave, nao a chave. Se o banco vazar, ninguem
consegue usar a API de ninguem.
""")


# ===========================================================================
titulo(2, "Cadastro - o celular do Carlos cria uma chave que nunca sai de la")
celular_do_carlos = VirtualAuthenticator()
r = c.post("/v1/enrollments", headers=AUTH, json={
    "external_id": "carlos@banco.com", "display": "Carlos",
    "enrollment_level": "identity_proofed"}).json()
o = r["options"]
envia("o backend do banco pede um cadastro", {
    "external_id": "carlos@banco.com", "enrollment_level": "identity_proofed"})
recebe("o desafio que vai pro navegador", {
    "challenge": curto(o["challenge"]),
    "rp": o["rp"],
    "authenticatorSelection": o["authenticatorSelection"]})
nota("""
`userVerification: required` e a linha mais importante daqui: obriga o
aparelho a pedir digital, Face ID ou PIN. Sem ela, um celular desbloqueado
esquecido na mesa assinaria sozinho.

`rp.id` amarra a chave ao dominio. Um site clonado em outro dominio nao
consegue usar essa passkey - e dai que vem a resistencia a phishing.
""")

cred = celular_do_carlos.register(o, ORIGIN)
envia("o que o celular devolve", {
    "id": curto(cred["id"]),
    "response.attestationObject": curto(cred["response"]["attestationObject"]),
    "(a chave PRIVADA)": "nao aparece aqui - ela nunca sai do aparelho"})

fin = c.post("/v1/enrollments/%s/complete" % r["enrollment_id"], json={
    "client_secret": r["client_secret"], "credential": cred}).json()
recebe("confirmacao", fin)
disco("tabela users", [{k: curto(v) for k, v in x.items()} for x in tabela("users")])
nota("""
Nao existe "carlos@banco.com" nessa linha. O identificador virou um HMAC.
O banco ja sabe quem e o cliente dele; nos nao precisamos saber.
""")
disco("tabela credentials", [{k: curto(v) for k, v in x.items()}
                             for x in tabela("credentials")])
nota("""
`public_key` e so a metade PUBLICA. Sozinha ela confere assinatura, mas nao
produz nenhuma. Vazou o banco? Ninguem se passa por ninguem.
""")


# ===========================================================================
titulo(3, "Verificacao - aprovar uma transferencia de R$ 25 milhoes")
operacao = {"amount_brl": 25000000, "to": "conta 4471-2"}
v = c.post("/v1/verifications", headers=AUTH, json={
    "external_id": "carlos@banco.com", "action": "wire_transfer",
    "context": operacao}).json()
envia("o backend do banco abre a verificacao", {
    "external_id": "carlos@banco.com", "action": "wire_transfer",
    "context": operacao})
recebe("desafio + client_secret", {
    "challenge": curto(v["options"]["challenge"]),
    "client_secret": curto(v["client_secret"]),
    "userVerification": v["options"]["userVerification"]})
nota("""
O desafio nasce PRESO a essa operacao. Uma assinatura feita pra "entrar no
sistema" nao aprova esta transferencia, mesmo sendo da mesma pessoa, no
mesmo minuto. Isso e o que os testes chamam de amarracao de acao.

O `client_secret` e descartavel e vale 2 minutos. E o unico segredo que o
navegador recebe - a chave de API fica no backend.
""")

assinado = celular_do_carlos.authenticate(v["options"], ORIGIN)
res = c.post("/v1/verifications/%s/complete" % v["verification_id"], json={
    "client_secret": v["client_secret"], "external_id": "carlos@banco.com",
    "credential": assinado}).json()
envia("o celular assina o desafio", {
    "signature": curto(assinado["response"]["signature"]),
    "authenticatorData": curto(assinado["response"]["authenticatorData"])})
recebe("o cracha assinado (JWT)", {"token": curto(res["token"], 60)})
print("\n   Conteudo do cracha, decodificado:")
print(recuar(res["claims"]))
nota("""
`aal: user_verified`  -> o aparelho pediu biometria. NIST chama isso de AAL2.
`enrollment`          -> o quanto conferimos QUEM e essa pessoa (IAL2).
`ctx`                 -> a operacao exata, amarrada na assinatura.
`exp`                 -> vale 2 minutos.
`jti`                 -> identificador unico, pra nao valer duas vezes.
""")

d1 = c.post("/demo/approve", json={
    "token": res["token"], "action": "wire_transfer",
    "min_enrollment": "identity_proofed", "expect_context": operacao}).json()
recebe("o backend do banco decide", {"approved": d1["approved"], "reason": d1["reason"]})


# ===========================================================================
titulo(4, "ATAQUE - o golpista com deepfake perfeito")
nota("""
Ele clonou o rosto e a voz do Carlos. Numa chamada de video, ninguem
distingue. Mas o celular e o dele.
""")
celular_do_golpista = VirtualAuthenticator()
v = c.post("/v1/verifications", headers=AUTH, json={
    "external_id": "carlos@banco.com", "action": "wire_transfer"}).json()
r = c.post("/v1/verifications/%s/complete" % v["verification_id"], json={
    "client_secret": v["client_secret"], "external_id": "carlos@banco.com",
    "credential": celular_do_golpista.authenticate(v["options"], ORIGIN)})
recebe("resposta do servidor", {"http": r.status_code, "erro": r.json()["detail"]})
nota("""
Nao importa o quanto o video esteja perfeito. Ele nao tem a chave, e a chave
nao da pra copiar - ela esta trancada no chip do celular do Carlos.
""")


# ===========================================================================
titulo(5, "ATAQUE - reapresentar o mesmo cracha aprovado")
d2 = c.post("/demo/approve", json={
    "token": res["token"], "action": "wire_transfer",
    "min_enrollment": "identity_proofed", "expect_context": operacao}).json()
recebe("segunda apresentacao do MESMO cracha", {
    "approved": d2["approved"], "reason": d2["reason"]})
nota("""
Prazo curto nao e uso unico. Sem consumir o `jti`, um proxy que capturasse o
cracha aprovaria duas transferencias com uma assinatura so.
""")


# ===========================================================================
titulo(6, "PARTE 2 - o cracha anonimo, onde a privacidade vira matematica")
v = c.post("/v1/verifications", headers=AUTH, json={
    "external_id": "carlos@banco.com", "action": "personhood"}).json()
prova = c.post("/v1/verifications/%s/complete" % v["verification_id"], json={
    "client_secret": v["client_secret"], "external_id": "carlos@banco.com",
    "credential": celular_do_carlos.authenticate(v["options"], ORIGIN)}).json()["token"]

p = c.get("/v1/personhood/params").json()
n, e = int(p["n"]), p["e"]
recebe("parametros publicos da epoca", {
    "epoch": p["epoch"], "n": curto(p["n"], 46), "e": p["e"],
    "max_tokens_per_epoch": p["max_tokens_per_epoch"]})
nota("""
UMA chave por semana, publica, igual pra todo mundo. Se cada pessoa tivesse
a sua, a assinatura entregaria a identidade - e o ataque de marcacao.
""")

segredo = personhood.make_token()
cego, desembrulho = personhood.blind(segredo, n, e)
print("\n   O navegador do Carlos, sozinho, faz isto:")
nota("""
segredo sorteado (fica SO no navegador):
  %s

envelope fechado que vai pro servidor:
  %s
""" % (segredo.hex(), curto(str(cego), 62)))

emissao = c.post("/v1/personhood/tokens", headers=AUTH,
                 json={"token": prova, "blinded": [str(cego)]}).json()
assin_cega = int(emissao["signatures"][0])
assinatura = personhood.unblind(assin_cega, desembrulho, n)
recebe("assinatura por cima do envelope", {"blind_sig": curto(str(assin_cega), 62)})
print("\n   O navegador tira o envelope:")
nota("assinatura final, valida no segredo: %s" % curto(str(assinatura), 58))

print("\n   ILUSTRACAO: o servidor consegue ligar as duas pontas?")
visto_pelo_servidor = str(cego) + str(assin_cega)
nota("""
o segredo aparece no que o servidor recebeu?  %s
a assinatura final aparece?                    %s
""" % (segredo.hex() in visto_pelo_servidor,
       str(assinatura) in visto_pelo_servidor))
nota("""
Atencao ao que isso e e ao que nao e. As duas linhas acima sao so uma
ILUSTRACAO - procuram o numero como texto. Isso nao prova nada sozinho.

A garantia de verdade e outra: o envelope e (segredo x r^e mod n), com `r`
sorteado no navegador e que nunca sai de la. Para QUALQUER cracha que o site
apresente depois, existe um `r` que o ligaria a QUALQUER envelope que o
servidor assinou. Ou seja: mesmo com poder de computacao infinito, o emissor
nao tem como escolher entre as possibilidades - todas sao igualmente
compativeis com o que ele viu. Isso se chama sigilo perfeito, e vale
independentemente de quem administra o servidor.
""")


# ===========================================================================
titulo(7, "O Carlos cria conta num site que nao faz ideia de quem ele e")
badge = {"epoch": emissao["epoch"], "token": bytes_to_base64url(segredo),
         "signature": str(assinatura), "scope": "rede-social.com"}
envia("o que rede-social.com recebe", {k: curto(v) for k, v in badge.items()})
resg = c.post("/v1/personhood/redeem", json=badge).json()
recebe("o que rede-social.com aprende", resg)
nota("""
Isso e TUDO. Nem nome, nem e-mail, nem de qual banco veio, nem um
identificador que sirva pra cruzar com outro site.

E o site nem precisa de contrato com a gente: com a chave publica da epoca
ele confere a assinatura sozinho, offline.
""")

outro = c.post("/v1/personhood/redeem", json=dict(badge, scope="app-namoro.com"))
recebe("o mesmo cracha tentado em app-namoro.com", {
    "http": outro.status_code, "erro": outro.json()["detail"]})
nota("""
Uso unico GLOBAL, nao por site. Se o mesmo cracha valesse nos dois, os dois
poderiam comparar o valor e concluir "e a mesma pessoa". Cada site consome
um cracha diferente - por isso o teto por semana e, na pratica, quantos
cadastros a pessoa consegue fazer.
""")


# ===========================================================================
titulo(8, "O que sobrou no disco depois de tudo isso")
disco("personhood_issued (quem pediu crachas)", tabela("personhood_issued"))
disco("personhood_spent (crachas gastos)",
      [{k: curto(v, 30) for k, v in x.items()} for x in tabela("personhood_spent")])
nota("""
Olhe as duas tabelas. A de cima sabe QUE o Carlos pediu 1 cracha. A de baixo
sabe QUE um cracha foi gasto em rede-social.com. Nao existe coluna, chave ou
indice que ligue uma linha a outra - e nao existe porque e matematicamente
impossivel construir.
""")

ok, adulterado = store.audit_verify()
print("\n   Log de auditoria: cadeia integra = %s" % ok)
for ev in reversed(tabela("audit")):
    print("      %-20s %s" % (ev["event"], ev["detail"] or ""))
nota("""
Cada linha carrega o hash da anterior. Mexer numa linha antiga quebra todas
as seguintes, e audit_verify() aponta exatamente onde.
""")

print("\n" + "=" * W)
print("FIM. Nenhum e-mail, nenhuma senha e nenhuma biometria tocou o disco.")
print("=" * W)
