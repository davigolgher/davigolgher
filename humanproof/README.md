# humanproof

Prova de presenca humana por **desafio-resposta**. Nao e um detector de IA: nao
tenta achar artefato em video gerado (jogo perdido, o adversario treina contra
o seu detector). Ele pergunta o contrario: *existe um corpo humano vivo
produzindo este sinal agora?*

Duas cabecas, as duas baseadas em fisica, nenhuma treinada:

| Cabeca | Mede | Fase | Como |
|---|---|---|---|
| **A - pulso** | Micro-variacao de cor da pele a cada batida | `quiet` (8 s, luz branca constante) | rPPG por POS + SNR na banda 0,7-4 Hz |
| **B - luz** | A pele respondeu ao flash que o **servidor sorteou** | `flash` (2,5 s, cores aleatorias) | Correlacao cruzada emitido x observado, com atraso |

Mais um sinal de apoio: **geometria**, a razao entre quanto a pele e quanto o
fundo devolvem de luz. Rosto 3D perto da tela responde mais forte que o fundo;
uma tela plana reproduzindo video responde igual nos dois.

## Por que desafio-resposta

Um sistema passivo julga um video que chegou pronto, e o atacante teve tempo
infinito pra prepara-lo. Um sistema ativo **causa** algo no mundo fisico e
verifica se o mundo respondeu certo, dentro de um prazo curto:

1. O servidor sorteia um `nonce` de uso unico. Dele deriva a sequencia de cores.
2. O cliente executa e captura. Nao dava pra pre-fabricar: ele nao sabia as cores.
3. A resposta so vale dentro da janela. Deepfake em tempo real tem latencia de
   pipeline; reflexao de luz nao tem.

Contra **injecao de stream** (camera virtual com face-swap, o ataque que
importa hoje) a cabeca B da correlacao ~0: nao ha nada fisico na frente da
lente pra reagir a cor nenhuma.

## Rodar

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python tools/selftest.py        # valida o pipeline sem webcam
.venv/bin/python server.py                # abre http://127.0.0.1:8000
```

O browser so libera a camera em `localhost` ou HTTPS. Deixe o ambiente com luz
suave e constante, encaixe o rosto no oval e fique parado durante os ~10 s.

## O experimento da semana 1

O objetivo nao e ter um produto - e responder *uma* pergunta: as classes
separam? Grave com o seletor da interface:

- **~20 `real`** - voce, ao vivo, variando luz, distancia e roupa.
- **~20 `replay`** - um celular ou monitor reproduzindo um video seu.
- **~20 `injection`** - OBS com camera virtual alimentando um face-swap.

```bash
.venv/bin/python tools/evaluate.py        # tabela + out/scatter.png
```

`evaluate.py` **recalcula** as features a partir das amostras cruas, entao voce
pode mexer no `detector.py` e reavaliar sem regravar nada. Ele imprime a
*margem*: pior `real` menos melhor ataque. Positiva significa que um limiar
unico separa. Se separar, voce tem produto. Se nao, voce descobriu em tres dias
em vez de seis meses.

Numeros de referencia do `selftest` (sinteticos, so pra saber que a matematica
esta de pe): real 1.00, replay 0.49-0.75, injection 0.00-0.50.

## O que isto **nao** e

Tres limitacoes de verdade, nao ressalvas de rodape:

1. **O cliente calcula as medias e manda os numeros.** Otimo pro experimento -
   o payload fica minusculo. Inutil como seguranca: um atacante manda os
   numeros que quiser. Em producao, o servidor precisa receber a midia crua.
2. **Nao ha atestacao de dispositivo.** Esta e a limitacao que manda em todas
   as outras. Enquanto o servidor nao souber que os pixels vieram de um sensor
   real - Play Integrity no Android, App Attest no iOS - o melhor modelo do
   mundo esta analisando pixels escolhidos pelo adversario. A IA e ~30% do
   valor; a atestacao e o resto.
3. **A fusao e um chute com limiares fixos.** Deliberadamente: nao ha dados
   ainda. Com sessoes rotuladas, troque `fuse()` por uma regressao logistica
   sobre exatamente as mesmas features - e ela continua explicavel.

E um vies que precisa ser medido, nao descoberto depois: **melanina absorve luz
verde**, que e o canal onde o rPPG tem mais sinal. A cabeca A tende a ir pior
em pele escura por fisica, nao por bug. Quebre a metrica por tom de pele desde
a primeira rodada; se voce nao medir, voce lanca um produto que rejeita mais
uns usuarios que outros. Mitigacao: peso maior em vermelho, janela mais longa,
e deixar a fusao compensar pelas outras cabecas quando o pulso vier fraco.

## Proximos passos, na ordem que importa

1. **Ataque voce mesmo.** OBS + face-swap em tempo real contra o seu proprio
   desafio. O que sobreviver e o produto; o resto era demo.
2. **Reflexo especular na cornea.** O olho e uma esfera molhada: espelha a cor
   que voce emitiu. Precisa de pixel, nao de media de ROI - e o upgrade de
   maior retorno da cabeca B.
3. **Atestacao de dispositivo** num app mobile. Sem isso nada acima e seguranca.
4. **Token assinado** de vida curta como saida (`{subject_key_id,
   assurance_level, method, exp}`), com a identidade duravel numa passkey
   WebAuthn. O biometrico e efemero, a chave e persistente - assim voce nunca
   guarda template facial, que e dado sensivel pela LGPD Art. 5 II e pelo GDPR
   Art. 9.

## Arquivos

```
server.py            desafio, nonce de uso unico, prazo, gravacao das sessoes
detector.py          cabecas A e B + fusao (a matematica toda esta aqui)
web/index.html       interface e o overlay de flash de tela cheia
web/app.js           captura, execucao do desafio, extracao de ROI
tools/selftest.py    valida o pipeline com dados sinteticos, sem webcam
tools/evaluate.py    tabela + scatter das classes gravadas
```
