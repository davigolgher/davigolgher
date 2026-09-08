# Privacidade e conformidade

> **Nao sou advogado e este documento nao e parecer juridico.** Ele descreve o
> que o codigo faz e como isso se encaixa nas obrigacoes mais comuns. Antes de
> tratar dado de gente real, contrate um advogado de protecao de dados. As
> escolhas de arquitetura aqui foram feitas justamente pra reduzir o que
> precisa ser discutido com ele.

## A estrategia: nao guardar

A forma mais barata de nao vazar, nao ser intimado e nao ser multado por um
dado e **nao ter aquele dado**. Todo o desenho parte disso.

### O que este sistema guarda

| Dado | Forma | Por que |
|---|---|---|
| Identificador do usuario | `HMAC(segredo, tenant + id)` | Achar o usuario sem saber quem e |
| Chave publica da passkey | Em claro | Conferir assinatura; sozinha nao autentica |
| Contador de assinaturas | Inteiro | Detectar authenticator clonado |
| Nivel de cadastro | `self_asserted` / `vouched` / `identity_proofed` | Decidir o que a empresa pode liberar |
| Hash de crachas gastos | SHA-256 | Impedir uso duplo |
| Log de auditoria | Encadeado por hash | Obrigacao regulatoria e forense |

### O que este sistema **nunca** guarda

- **Nenhum dado biometrico.** A digital e o Face ID nunca saem do aparelho.
  Nos jamais recebemos imagem, template ou vetor facial.
- **Nenhum e-mail, nome ou documento.** O identificador chega a cada chamada e
  vira HMAC antes de tocar o disco. Ha um teste automatizado que faz dump do
  banco inteiro e falha se um e-mail aparecer.
- **Nenhuma senha.**
- **Nenhuma ligacao entre a pessoa e onde ela usou o cracha anonimo.** Isso nao
  e politica: e impossibilidade matematica da assinatura cega.

Se o banco inteiro vazar, o atacante ganha uma lista de identificadores opacos
e chaves publicas. Nao da pra se passar por ninguem nem descobrir quem sao as
pessoas.

## LGPD (Lei 13.709/2018)

**Dado biometrico e dado pessoal sensivel** (Art. 5º, II), com regras mais
duras de tratamento e potencial de multa maior. A resposta do sistema e nao
tratar biometria em momento nenhum - a verificacao acontece dentro do aparelho
do titular, e o servidor recebe so uma assinatura criptografica.

- **Minimizacao e necessidade** (Art. 6º, III): so o HMAC e a chave publica.
- **Base legal** (Art. 7º): o tratamento normalmente se apoia em execucao de
  contrato ou legitimo interesse (prevencao a fraude). **A base correta depende
  do seu caso concreto e quem decide isso e o seu advogado.**
- **Direitos do titular** (Art. 18): como nao guardamos identificador legivel,
  a empresa cliente e quem atende o titular; nos apagamos pelo `ref`. Falta
  implementar o endpoint de exclusao - esta listado em SECURITY.md.
- **Controlador x operador** (Art. 39): voce provavelmente sera **operador** dos
  dados da empresa cliente. Isso exige contrato de tratamento com cada uma.
- **Incidente de seguranca** (Art. 48): comunicacao a ANPD e aos titulares em
  prazo razoavel. Voce precisa de um plano de resposta escrito antes do primeiro
  cliente.

## GDPR (se atender a Europa)

- **Art. 9** - biometria para identificacao unica e categoria especial.
  Nao tratamos nenhuma.
- **Art. 25** - protecao de dados desde a concepcao. A assinatura cega e um
  exemplo de manual: a impossibilidade de rastrear e propriedade do protocolo.
- **Art. 32** - seguranca do tratamento. Ver SECURITY.md.
- **Art. 33** - notificacao de violacao em 72 h.
- **eIDAS 2.0 / EUDI Wallet** - a carteira europeia de identidade caminha na
  mesma direcao (credencial com divulgacao seletiva). Vale desenhar pensando em
  interoperar, nao em competir.

## Estados Unidos

- **BIPA (740 ILCS 14, Illinois)** - a lei de biometria mais agressiva do
  mundo: direito de acao individual e danos legais por violacao, com acordos de
  nove digitos no historico. Aplica-se a quem coleta identificador biometrico.
  **Nao coletamos nenhum**, o que retira o produto do escopo da lei. Texas e
  Washington tem leis analogas.
- **CCPA/CPRA (California)** - identificadores opacos ainda podem contar como
  dado pessoal. Trate como aplicavel.

## Normas tecnicas que o comprador vai citar

- **NIST SP 800-63-3** e o vocabulario que banco e governo usam:
  - **AAL** (forca da autenticacao) - a passkey com verificacao do usuario
    corresponde a **AAL2**; com autenticador de hardware dedicado, AAL3.
  - **IAL** (forca da conferencia de identidade) - os nossos niveis mapeiam
    direto: `self_asserted` = IAL1, `identity_proofed` = IAL2.
  Usar esses termos nas conversas comerciais economiza reuniao.
- **FIDO2 / WebAuthn (W3C)** - o padrao que a Parte 1 implementa.
- **ISO/IEC 29115** - equivalente internacional dos niveis de garantia.

## Retencao

| Dado | Prazo |
|---|---|
| Desafios | 120 s de validade; expurgados apos 24 h |
| Crachas gastos | Fim da epoca + 1 (14 dias) |
| Log de auditoria | Definido pelo cliente; normalmente 5 anos em servico financeiro |
| Chave publica da passkey | Enquanto a conta existir |

`store.purge_expired()` implementa o expurgo de desafios. O agendamento
periodico ainda precisa ser ligado.

## O que voce precisa fazer antes do primeiro cliente real

1. Advogado de protecao de dados revisando este documento e o contrato.
2. Contrato de operador de dados com cada empresa cliente.
3. Plano escrito de resposta a incidente, com prazos.
4. Endpoint de exclusao por titular.
5. Encarregado (DPO) nomeado, se a LGPD exigir no seu caso.
6. Relatorio de impacto (RIPD / DPIA) - provavel, por ser prevencao a fraude em
   escala.
