# humankey

Um servico que outras empresas plugam no sistema delas pra saber que tem uma
**pessoa real e cadastrada** do outro lado. Tipo o Stripe, mas em vez de
cobrar, prova presenca humana.

Nao usa camera. Nao analisa video. Nao tenta descobrir se uma imagem foi
gerada por IA - isso e uma corrida que o detector sempre perde, porque o
adversario treina contra ele.

## A ideia, em uma frase

Em vez de tentar *olhar* pra pessoa, o sistema **faz o aparelho dela provar
que ela e ela**.

## Como funciona

**Uma vez, no cadastro:** o celular da pessoa cria um par de chaves. A chave
privada nasce e morre dentro do chip de seguranca do aparelho - nao sai por
cabo, nem por print, nem se a pessoa quiser. O servidor guarda so a chave
publica, que sozinha nao serve pra se passar por ninguem.

**Toda vez que precisa verificar:**

1. O backend da empresa pede um desafio, preso a uma acao especifica.
2. O celular da pessoa pede digital / Face ID / PIN - **no aparelho dela**.
3. O celular assina o desafio.
4. O servidor confere e emite um cracha assinado, valido por 2 minutos.

## Por que isso derruba o deepfake

O golpista consegue copiar **o rosto** e **a voz**. Nao consegue copiar **a
chave**, porque ela esta trancada no celular da vitima.

Nao importa o quanto o video esteja perfeito: sem assinatura, nao passa. A
pergunta deixou de ser "esse video e real?" (que voce sempre perde) e passou a
ser "cade a prova?".

Isso esta testado. O teste `celular do golpista rejeitado` faz exatamente esse
ataque.

## Por que passkey e nao codigo por SMS

| | Codigo por SMS | Passkey |
|---|---|---|
| Golpista liga e pede pra voce ler | **funciona** | nao tem o que ler |
| Clonagem de chip | **funciona** | nao usa telefonia |
| Site clonado | **funciona** | a chave e presa ao dominio real |
| Custo por uso | por mensagem | zero |

Nao existe codigo pra ser lido em voz alta. E o que torna a passkey resistente
a phishing por definicao, e nao por treinamento do usuario.

## O ponto onde tudo pode dar errado: o cadastro

**A seguranca inteira vale o quanto vale o momento do cadastro.** Se o golpista
conseguir se cadastrar como "Carlos" no primeiro dia, todas as verificacoes
depois vao dar verde - e estarao corretas, do ponto de vista do sistema. Ele e
o Carlos agora.

Por isso o nivel de cadastro viaja **dentro do token**, e a empresa decide o
que exigir pra cada operacao:

| Nivel | O que foi conferido | Serve pra |
|---|---|---|
| `self_asserted` | nada - a pessoa se cadastrou sozinha | entrar no sistema |
| `vouched` | alguem da empresa confirmou (RH, gestor) | operacoes internas |
| `identity_proofed` | documento conferido, presencial ou video | transferencia, contrato |

Na demo, um usuario `self_asserted` **e barrado** ao tentar aprovar R$ 25
milhoes, mesmo com a assinatura perfeitamente valida. E o comportamento certo.

## O que este sistema NAO prova

Tres limites reais, nao ressalvas de rodape:

1. **Nao prova que o rosto na tela e daquela pessoa.** Prova que o dono do
   celular cadastrado participou. Por isso voce trava a *aprovacao*, nao o
   video - ninguem transfere 25 milhoes sem alguem assinar.
2. **Contra robo/IA, da responsabilizacao, nao presenca.** Prova que existe
   uma pessoa real e identificada por tras da conta. Nao prova que foi ela quem
   digitou aquela frase agora. Pra quase todo caso de empresa, responsabilizacao
   e o que se quer de verdade.
3. **Passkey sincronizada existe em mais de um aparelho.** iPhone e Android
   sincronizam passkeys pela conta (iCloud / Google). Comodo pro usuario, mas
   significa que a chave esta em todo aparelho logado naquela conta. O campo
   `device_type` diz qual e o caso; pra operacao critica, exija
   `single_device`.

## Rodar

```bash
./run.sh                       # http://localhost:8000
.venv/bin/python tests/test_flow.py
```

Passkey so funciona em `localhost` ou HTTPS - e uma regra do navegador, nao
uma limitacao daqui.

Na demo: cadastre uma passkey, depois tente "Entrar" e "Aprovar transferencia".
Repare que o token do login **nao** aprova a transferencia.

## Testes

19 testes, dos quais 9 sao ataques concretos. `tests/authenticator.py` e um
celular de mentira em Python: guarda uma chave, monta o `authenticatorData`,
assina. Da pra forjar respostas invalidas de proposito.

```
FLUXO NORMAL                     cadastro, verificacao, aprovacao
reusar assinatura de login       token de 'login' nao aprova transferencia
cadastro fraco                   'self_asserted' barrado em alto valor
celular do golpista              rejeitado  <- o caso do deepfake
replay                           desafio e de uso unico
client_secret errado             rejeitado
assinar sem biometria            rejeitado
passkey de outro usuario         rejeitada
desafio expirado                 rejeitado
token de outra empresa           rejeitado
```

Se um desses passar quando nao deveria, e buraco de seguranca real - nao e
"so um teste vermelho".

## Como uma empresa cliente integra

No backend dela (a chave de API nunca chega no navegador):

```python
r = requests.post("https://api.humankey.com/v1/verifications",
                  headers={"Authorization": f"Bearer {API_KEY}"},
                  json={"external_id": "carlos@banco.com",
                        "action": "wire_transfer",
                        "context": {"amount_brl": 25000000}})
# devolve r.json()["client_secret"] pro navegador
```

No site dela:

```html
<script src="https://js.humankey.com/humankey.js"></script>
<script>
  const { token } = await humankey.verify({ start: "/meu-backend/aprovar" });
  // manda o token pro backend
</script>
```

De volta no backend, conferindo o cracha:

```python
claims = jwt.decode(token, chave_publica_do_jwks, algorithms=["ES256"],
                    audience=MEU_TENANT_ID, issuer="https://humankey.com")
if claims["action"] == "wire_transfer" and claims["enrollment"] == "identity_proofed":
    liberar()
```

## Arquivos

```
app/main.py            a API (cadastro, verificacao) + o backend de demo
app/store.py           SQLite: empresas, usuarios, passkeys, desafios, auditoria
app/tokens.py          assina e confere o cracha (JWT ES256) + JWKS
web/humankey.js        o SDK que a empresa cola no site dela
web/demo.html          site ficticio de um banco, pra ver o fluxo rodando
tests/authenticator.py celular de mentira, pra testar sem aparelho
tests/test_flow.py     19 testes, 9 deles sao ataques
```

## Proximos passos

1. **Recuperacao de conta.** O usuario perdeu o celular. Este e o caminho que
   todo golpista vai atacar primeiro, porque e o elo mais fraco de qualquer
   sistema de autenticacao. Exija o mesmo nivel de conferencia do cadastro
   original - nunca menos.
2. **Mais de uma passkey por pessoa**, pra ninguem ficar trancado do lado de fora.
3. **Webhook** avisando a empresa cliente de cada verificacao.
4. **Limite de tentativas** por usuario e por chave de API.
5. **Nivel `identity_proofed` de verdade**: hoje a empresa so declara o nivel.
   Falta integrar conferencia de documento.
