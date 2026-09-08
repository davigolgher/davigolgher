# SemBot - um exemplo de quem usa o humankey

Este diretorio **nao faz parte do produto**. E o codigo que uma empresa
qualquer escreveria pra usar o servico - serve pra voce ver como fica a
integracao do outro lado.

A SemBot e uma rede social com uma regra so: **pra criar conta, um cracha
anonimo**. Com isso ela ganha duas coisas que normalmente sao inimigas:

- **nenhum bot**, porque cada conta consumiu um cracha de um humano verificado
- **nenhuma identidade**, porque o cracha nao diz quem a pessoa e

Abra `sembot.py` e olhe a tabela `contas`. Nao existe coluna de e-mail, nome,
telefone, senha nem CPF. Nao existe "entrar com o Google". E mesmo assim nao
tem bot. Essa combinacao e o produto inteiro.

## Rodar

Dois terminais, porque sao dois servicos independentes - e isso e parte da
licao: eles nao se conhecem.

```bash
# terminal 1 - o humankey (e o site do "Banco Exemplo")
./run.sh                              # http://localhost:8000

# terminal 2 - a SemBot, um cliente qualquer
.venv/bin/python exemplo/sembot.py    # http://localhost:8001
```

Depois:

1. Em **localhost:8000**, cadastre a passkey com nivel `identity_proofed`.
2. Na Parte 2, clique em **Pegar crachas** e depois em **Copiar 1 cracha**.
3. Va pra **localhost:8001**, invente um apelido, cole o cracha e crie a conta.
4. Clique em **Ver tudo que a SemBot guarda**.

O passo 4 e o que vale a pena. Voce acabou de criar uma conta numa rede social
que **nao tem como saber quem voce e** - e que ao mesmo tempo tem certeza de
que voce nao e um bot.

## As tres coisas pra reparar

**1. A SemBot nao tem contrato com o banco.** Nenhuma chave de API, nenhum
acordo, nenhuma integracao previa. Ela so pergunta ao humankey se o cracha
vale. Isso e o que faz virar uma *camada*: qualquer site do mundo pode
verificar sem pedir permissao pra ninguem.

**2. A resposta e minuscula.** Literalmente:

```json
{"ok": true, "human": true, "scope": "sembot.local", "epoch": 2957}
```

Nao vem nome, nem e-mail, nem de qual banco o cracha saiu.

**3. O cracha atravessa por fora.** Voce copiou e colou. Os dois sites nunca
trocaram uma mensagem entre si - quem carregou a credencial foi voce. Num
produto real isso seria a carteira do celular fazendo o transporte, mas o
copiar-e-colar deixa a arquitetura visivel: **nao existe canal entre eles pra
vazar nada.**

## Testar sem navegador

```bash
.venv/bin/python exemplo/teste_exemplo.py
```

Sobe o humankey num servidor HTTP real e faz a SemBot conversar com ele por
rede, como em producao. 13 verificacoes, incluindo os ataques:

```
fazenda de bots reusando o mesmo cracha    barrado
assinatura forjada                         barrada
postar sem sessao                          barrado
nenhum e-mail no banco da SemBot           conferido
```
