# Modelo de ameaca e postura de seguranca

Este documento existe pra ser lido por quem vai comprar, auditar ou atacar o
sistema. Ele diz o que esta defendido, o que **nao** esta, e o que falta antes
de producao. A secao "ainda nao implementado" e a mais importante das tres.

## Contra quem estamos defendendo

| Adversario | Capacidade | Coberto? |
|---|---|---|
| Golpista com deepfake em chamada | Clona rosto e voz perfeitamente | **Sim.** Nao possui a chave privada da vitima |
| Phishing / engenharia social | Convence a vitima a "passar o codigo" | **Sim.** Nao existe codigo pra ler em voz alta |
| Site clonado | Copia pixel a pixel a pagina real | **Sim.** A passkey e amarrada ao dominio (RP ID) |
| Fazenda de bots | Cria contas em massa | **Parcial.** Teto de crachas por pessoa por epoca |
| Operador malicioso (nos mesmos) | Tenta identificar quem usou cada cracha | **Sim.** Assinatura cega + chave unica por epoca |
| Vazamento do nosso banco | Rouba a base inteira | **Sim.** Nao ha PII nem chave privada de usuario |
| Adversario com acesso ao servidor em execucao | Le memoria, troca codigo | **Nao.** Fora do escopo desta versao |
| Estado-nacao com acesso ao aparelho da vitima | Extrai do Secure Enclave | **Nao.** Nenhum sistema cobre isso |

## Defesas implementadas e testadas

Cada item abaixo tem teste correspondente em `tests/`. 43 testes, dos quais 20
sao ataques concretos.

**Autenticacao (Parte 1)**
- WebAuthn com `user_verification=required` no cadastro e na verificacao: um
  aparelho desbloqueado esquecido na mesa nao assina sozinho.
- Desafio amarrado a acao e contexto: assinatura de `login` nao aprova
  `wire_transfer`.
- Desafio de uso unico, com prazo de 120 s, consumido em `UPDATE` condicional
  (imune a corrida de duas tentativas simultaneas).
- `client_secret` conferido com `hmac.compare_digest`, e conferido **antes** de
  qualquer outra checagem, pra nao virar oraculo de tempo revelando quais ids
  existem.
- Contador de assinaturas (`sign_count`) verificado: detecta authenticator
  clonado nos aparelhos que implementam o contador.
- Vinculo de credencial ao usuario conferido explicitamente: a passkey de A nao
  serve no desafio de B.

**Humanidade anonima (Parte 2)**
- Assinatura cega RSA com full-domain hash (MGF1/SHA-256). FDH e obrigatorio:
  com SHA-256 puro (256 bits contra 2048) sobra estrutura pra forjar.
- Uma chave por epoca, publica, compartilhada por todos os usuarios. Impede o
  **ataque de marcacao**, em que o emissor daria uma chave por pessoa e a
  assinatura entregaria a identidade.
- Uso unico **global**, nao por escopo: se o mesmo cracha valesse em dois
  sites, os dois poderiam comparar o valor e concluir que e a mesma pessoa.
- Cracha anonimo exige cadastro `identity_proofed`. Sem isso, um golpista com
  mil e-mails viraria mil "humanos verificados".

**Infraestrutura**
- Chave de API guardada como hash; forca bruta limitada por prefixo.
- Rate limiting por tenant, por usuario e por desafio.
- Limite de corpo de requisicao (64 KB) e limites de tamanho em todo campo.
- Cabecalhos: CSP sem `unsafe-inline` em script, HSTS, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- Log de auditoria encadeado por hash: alterar uma linha antiga quebra a cadeia
  e `audit_verify()` aponta a linha exata.
- Token de saida assinado em ES256, com `aud` por tenant: o token de uma
  empresa nao vale em outra.

## Ainda NAO implementado - nao suba em producao sem isto

1. **Recuperacao de conta.** O usuario perde o celular e precisa recadastrar.
   E o caminho que todo atacante tenta primeiro, porque costuma ser mais fraco
   que o fluxo principal. Regra: exigir o mesmo nivel de conferencia do cadastro
   original, nunca menos.
2. **Rotacao de chave de assinatura.** O JWKS ja publica `kid`, mas nao ha
   rotacao nem periodo de sobreposicao.
3. **Migracoes de banco.** Hoje o schema so e criado, nunca migrado.
4. **HSM / KMS.** As chaves privadas ficam em arquivo no disco. Em producao
   precisam viver num modulo de seguranca ou servico gerenciado.
5. **Rate limiting distribuido.** A implementacao atual e por processo, em
   SQLite. Com varias instancias, o limite efetivo multiplica.
6. **Verificacao real de documento** para o nivel `identity_proofed`. Hoje a
   empresa cliente apenas **declara** o nivel, e nos confiamos nela.
7. **Backup e recuperacao do `server_secret.bin`.** Se ele se perder, todos os
   `ref` de usuario ficam irrecuperaveis.
8. **Alerta de anomalia** (picos de falha, resgates em rajada).

## Testes de seguranca

```bash
./run_tests.sh
```

Se um teste de ataque passar quando nao deveria, e buraco de seguranca real -
nao e "so um teste vermelho".

## Divulgacao responsavel

Achou uma falha? Nao abra issue publica. Escreva para o mantenedor com passos
de reproducao. Prazo alvo: resposta em 72 h, correcao em 90 dias.
