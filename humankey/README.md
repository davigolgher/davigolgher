# humankey

**A camada de confianca da internet, sem transformar a internet num banco de
identidades.**

Duas perguntas diferentes precisam de mecanismos diferentes. Quase todo mundo
tenta responder as duas com a mesma coisa - normalmente uma foto do seu rosto -
e por isso acaba construindo exatamente o banco de dados que nao deveria existir.

| | Pergunta | Mecanismo | Resolve |
|---|---|---|---|
| **Parte 1** | Voce e *o Carlos*? | Passkey (WebAuthn) | Deepfake em chamada, golpe do CFO, fraude de identidade |
| **Parte 2** | Voce e *gente*, sem me dizer quem? | Assinatura cega (Chaum) | Bot em rede social, perfil falso, avaliacao comprada |

As duas compartilham o mesmo cadastro e **nunca** compartilham dado entre si.
E essa separacao que faz a privacidade ser uma propriedade matematica em vez de
uma promessa num rodape.

## O que nao fazemos: detectar IA

Nao analisamos video procurando artefato de geracao. Essa corrida o detector
perde por construcao - todo detector publicado vira funcao de aptidao pro
proximo gerador, e detectores treinados num pipeline caem pra quase aleatorio
num modelo tres meses mais novo.

Nos invertemos a pergunta. Em vez de "esse video e falso?", que voce sempre
perde, perguntamos **"cade a prova?"**. Prova nao envelhece com o avanco dos
geradores.

---

## Parte 1 - Prova de identidade

O celular da pessoa cria um par de chaves. A privada nasce e morre dentro do
chip de seguranca; nao sai por cabo, nem por print, nem se a pessoa quiser.

Quando a empresa precisa verificar:

1. O backend dela pede um desafio, **preso a uma acao especifica**.
2. O celular pede digital / Face ID / PIN - no aparelho da pessoa.
3. O celular assina.
4. Nos conferimos e emitimos um cracha assinado, valido por 2 minutos.

**Por que isso derruba o deepfake:** o golpista clona o rosto e a voz. Nao clona
a chave, que esta trancada no celular da vitima. Nao importa o quanto o video
esteja perfeito - sem assinatura, nao passa.

### Por que passkey e nao codigo por SMS

| | Codigo por SMS | Passkey |
|---|---|---|
| Golpista liga e pede pra voce ler | **funciona** | nao existe codigo pra ler |
| Clonagem de chip (SIM swap) | **funciona** | nao usa telefonia |
| Site clonado | **funciona** | a chave e presa ao dominio real |
| Custo por uso | por mensagem | zero |

### O ponto onde tudo pode dar errado: o cadastro

**A seguranca inteira vale o quanto vale o momento do cadastro.** Se o golpista
se cadastrar como "Carlos" no primeiro dia, todas as verificacoes depois darao
verde - e estarao corretas, do ponto de vista do sistema.

Por isso o nivel do cadastro viaja **dentro do cracha**:

| Nivel | O que foi conferido | NIST | Serve pra |
|---|---|---|---|
| `self_asserted` | nada | IAL1 | entrar no sistema |
| `vouched` | alguem da empresa confirmou | ~IAL1+ | operacoes internas |
| `identity_proofed` | documento conferido | IAL2 | transferencia, cracha anonimo |

Na demo, um usuario `self_asserted` **e barrado** ao aprovar R$ 25 milhoes,
mesmo com assinatura perfeitamente valida. E o comportamento certo.

---

## Parte 2 - Prova de humanidade anonima

Aqui esta a parte que quase ninguem constroi, e que responde a linha
"idealmente sem que todo mundo abra mao da privacidade".

**O truque, em portugues:**

1. Voce sorteia um numero secreto e o fecha num envelope opaco.
2. O emissor assina **por cima do envelope**, sem ver o que tem dentro.
3. Voce tira o envelope. A assinatura continua valida no numero de dentro.
4. Voce mostra esse numero assinado em qualquer site.

**O que ninguem consegue fazer:**

- O **site** nao descobre quem voce e - recebe um numero aleatorio assinado.
- O **emissor** nao descobre onde voce usou - nunca viu aquele numero.
- **Nem os dois juntos**, porque nao existe nada em comum entre o que cada um
  viu.

Isso e matematica (assinatura cega, Chaum 1982), nao politica de privacidade.
Os testes em `tests/test_personhood.py` verificam essas afirmacoes uma a uma.

### Tres ataques que o design precisou tratar

**Marcacao pelo emissor.** Se o emissor usasse uma chave diferente por pessoa, a
assinatura entregaria a identidade. Por isso existe a **epoca**: uma unica chave
publica por semana, valida pra todo mundo. Se aparecerem duas chaves ativas na
mesma epoca, e emissor malicioso - e da pra provar.

**Cruzamento entre sites.** Se o mesmo cracha pudesse ser gasto em dois sites,
os dois poderiam comparar o valor e concluir "e a mesma pessoa". Por isso o uso
e unico **global**, nao por escopo.

**Fazenda de humanos falsos.** Cracha anonimo exige cadastro
`identity_proofed`, e ha teto por pessoa por epoca. Sem isso, um golpista com
mil e-mails viraria mil "humanos verificados".

### A ressalva honesta

O teto e de **5 crachas por pessoa por semana**. Isso significa que uma pessoa
pode criar ate 5 contas por semana no conjunto de todos os sites. Nao e "um
humano, uma conta" - e "um humano, poucas contas", que ja destroi a economia de
fazenda de bots sem exigir identificacao em cada site. Aumentar o teto melhora
a usabilidade e piora a resistencia a spam: e um botao de produto, nao um
detalhe tecnico.

---

## Rodar

```bash
./run.sh                          # a demo em http://localhost:8000
./run_tests.sh                    # 52 verificacoes
python tools/walkthrough.py       # o sistema narrado passo a passo
```

`tools/walkthrough.py` roda o sistema inteiro e narra cada passo: o que sai da
maquina do usuario, o que o servidor responde, e o que fica no disco. E o
caminho mais rapido pra entender o mecanismo sem ler codigo.

Passkey so funciona em `localhost` ou HTTPS - regra do navegador, nao limitacao
daqui.

Na demo: cadastre a passkey, tente as duas acoes da Parte 1, depois pegue
crachas anonimos e use em dois sites ficticios. Repare no que cada site aprende.

## Testes

**52 verificacoes automatizadas, 16 delas ataques concretos.** `tests/authenticator.py` e um celular
de mentira em Python: guarda uma chave, monta o `authenticatorData` e assina -
o que permite forjar respostas invalidas de proposito.

```
PARTE 1
  celular do golpista               rejeitado   <- o caso do deepfake
  reusar assinatura de login        rejeitado
  replay do mesmo desafio           rejeitado
  assinar sem biometria             rejeitado
  passkey de outro usuario          rejeitada
  external_id trocado               rejeitado
  desafio expirado                  rejeitado
  token de outra empresa            rejeitado

PARTE 2
  double spend                      barrado
  mesmo cracha em outro site        barrado (impede cruzamento)
  assinatura forjada                rejeitada
  cadastro fraco pedindo cracha     barrado
  token de login virando cracha     barrado
  teto por epoca                    barrado
  chave unica por epoca             conferido (defesa contra marcacao)

INFRAESTRUTURA
  cabecalhos de seguranca           presentes
  corpo grande demais               barrado
  rate limit por usuario            dispara
  adulteracao do log de auditoria   detectada
  nenhum e-mail persistido          conferido no dump do banco
```

Mais a paridade matematica entre o SDK do navegador e o servidor: se o
full-domain hash divergir num byte, nenhuma assinatura confere - e o sintoma
seria so "assinatura invalida", impossivel de diagnosticar em producao.

## Privacidade e conformidade

Ver **[PRIVACY.md](PRIVACY.md)** - inventario do que e e do que nao e guardado,
LGPD, GDPR, BIPA, mapeamento NIST 800-63-3, retencao, e o que falta antes do
primeiro cliente real.

A estrategia em uma frase: **a forma mais barata de nao vazar um dado e nao ter
aquele dado.** Nenhuma biometria, nenhum e-mail, nenhuma senha. Se o banco
inteiro vazar, o atacante ganha identificadores opacos e chaves publicas.

## Seguranca

Ver **[SECURITY.md](SECURITY.md)** - modelo de ameaca, o que esta defendido, e a
lista honesta do que **nao** esta implementado (recuperacao de conta, rotacao de
chave, HSM, rate limiting distribuido, conferencia real de documento).

## Arquivos

```
app/main.py             API das duas partes + backend de demo
app/store.py            SQLite com minimizacao de PII, rate limit, auditoria encadeada
app/tokens.py           cracha assinado (JWT ES256) + JWKS
app/personhood.py       assinatura cega RSA com full-domain hash
web/humankey.js         SDK: WebAuthn + a matematica cega em BigInt
web/demo.html/.js       site ficticio pra ver o fluxo inteiro
tests/authenticator.py  celular de mentira, pra testar sem aparelho
tests/test_flow.py      27 testes da Parte 1 e da infraestrutura
tests/test_personhood.py 16 testes da Parte 2
tests/test_sdk_math.js  paridade navegador x servidor
tools/walkthrough.py    o sistema narrado passo a passo, com valores reais
```
