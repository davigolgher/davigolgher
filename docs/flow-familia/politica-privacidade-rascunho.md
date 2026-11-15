# Rascunho — Política de Privacidade da Flow Família

> Rascunho para revisão por advogado(a). Não é aconselhamento jurídico. O texto
> que o app e o site mostram está em inglês, em `src/features/legal/content.ts`
> (`FAMILY`, mais os ajustes em `PRIVACY` e `TERMS`), e deve ser mantido igual a
> este depois da revisão. Os trechos entre `[ ]` dependem de decisões suas.

**Controlador:** [razão social e CNPJ, quando houver — preencher `APP.company`],
contato golgherbusiness@gmail.com. Prazo de resposta a pedidos de titulares: 15 dias.

## 1. O que é a Flow Família

Recurso do Flow que permite a um **responsável** acompanhar, apenas em modo de
leitura, os gastos de uma pessoa de quem cuida (filho menor ou maior, pessoa
idosa, pessoa sob curatela) a partir das contas e cartões que essa pessoa
escolhe compartilhar por open banking: o Open Finance Brasil e as redes de
open banking de outros países. Não movimenta dinheiro, não
bloqueia compras, não emite cartões e não acessa senhas bancárias.

## 2. Papéis

- **Responsável:** cria a família, convida, vê o que for compartilhado, define alertas e orçamentos para si.
- **Dependente:** aceita o convite, conecta o banco, escolhe as contas, vê exatamente o que o responsável vê e pode revogar a qualquer momento.
- **Representante legal:** para menor de 18 anos ou pessoa sob curatela, o responsável consente em nome dela e declara ser pai, mãe, tutor(a) ou curador(a).

## 3. Dados tratados

| Categoria | Dados | Titular |
| --- | --- | --- |
| Família | nome da família; nome que cada membro usa; papel; tipo (adulto, menor, curatelado); data de nascimento do menor | todos |
| Prova de consentimento | versão do termo, data e hora, prazo escolhido, quem consentiu, IP, cadeia de IPs e identificação do aplicativo | dependente e representante |
| Dados bancários (via o provedor do país) | instituição e país; tipo, nome, moeda e 4 últimos dígitos de cada conta; das contas compartilhadas: data, valor, moeda, descrição, estabelecimento, categoria e situação de cada lançamento | dependente |
| Fuso horário | o fuso do celular, para os meses terminarem à meia-noite local | dependente |
| Configurações do responsável | orçamentos mensais, regras e eventos de alerta | responsável (sobre o dependente) |
| Histórico de acessos | quem abriu os dados de quem e quando; ações (convidar, consentir, compartilhar, revogar) | todos |
| Notificações | token de push do aparelho do responsável | responsável |

**Não tratamos:** senhas ou credenciais bancárias, saldos, limites de crédito, números completos de contas, dados do aparelho do dependente (localização, contatos, mensagens).

## 4. Finalidades e bases legais (LGPD)

| Finalidade | Base legal |
| --- | --- |
| Mostrar ao responsável os gastos compartilhados, gerar alertas e relatórios, permitir ao dependente ver e controlar o compartilhamento | Consentimento do titular (art. 7º, I); para menores, consentimento específico e em destaque de um dos pais ou responsável legal, no melhor interesse da criança ou adolescente (art. 14, §1º) |
| Guardar a prova do consentimento e o histórico de acessos | Cumprimento de obrigação legal e de prestação de contas (art. 7º, II; art. 8º, §2º) e legítimo interesse em demonstrar que cada acesso foi autorizado (art. 7º, IX) |
| Segurança e prevenção de abuso (limite de tentativas de código) | Legítimo interesse (art. 7º, IX) |

Dados bancários não são usados para publicidade, decisão de crédito, venda,
treino de IA nem rastreamento. [Confirmar com o advogado se dados financeiros
compartilhados entre familiares exigem alguma cautela adicional; não são dados
sensíveis pelo art. 5º, II.]

## 5. Operadores

- **Provedor de open banking do país do banco**, em nome do controlador:
  - **Pluggy Serviços de Tecnologia Ltda.** [confirmar razão social] — Brasil (Open Finance Brasil);
  - **Plaid Inc.** e suas afiliadas [confirmar a entidade por região] — EUA, Canadá, Reino Unido e EEE;
  - **Salt Edge** [confirmar a entidade] — demais países.
- No caso da Plaid, a chave de acesso emitida para cada conexão fica cifrada, só nos nossos servidores.
- **Supabase Inc.** — banco de dados e autenticação, nos EUA (transferência internacional com base no art. 33, IX, e cláusulas contratuais).
- **Expo (650 Industries), Apple e Google** — entrega de notificações; o conteúdo da notificação não contém valores, estabelecimentos nem categorias.

## 5a. Transferências internacionais e outras leis

- Banco de dados nos EUA (Supabase). Os dados bancários vão do banco ao provedor do país e dele para nós, cifrados em trânsito.
- Saída do Brasil: art. 33, IX da LGPD. Saída da UE/EEE e do Reino Unido: cláusulas contratuais-padrão dos provedores e operadores.
- Onde se aplica a GDPR ou a UK GDPR: base legal do consentimento (art. 6(1)(a)); crianças abaixo da idade de consentimento digital do país, com consentimento do titular da responsabilidade parental (art. 8). [Nomear representante na UE e no Reino Unido — art. 27 — antes de distribuir lá.]

## 6. Retenção

- Lançamentos compartilhados: até 13 meses.
- Alertas: 12 meses. Histórico de acessos: 24 meses.
- Convites não usados: excluídos 30 dias após expirarem.
- Dependente que deixa de compartilhar com todas as famílias: nada novo é lido; após 30 dias as conexões bancárias são encerradas e os dados lidos, excluídos — salvo se voltar a compartilhar.
- Parar de compartilhar uma conta exclui o que foi lido dela; desconectar um banco encerra a conexão no provedor (e o consentimento dado no banco) e exclui o que foi lido.
- Exclusão da conta: remove todos os dados acima do titular, encerra as conexões nos provedores e o remove de todas as famílias. [Avaliar com o advogado se a prova de consentimento deve ser mantida por prazo maior após a exclusão, para defesa em processo — art. 16, II e IV. Hoje ela é excluída com a conta.]

## 7. Direitos e controles

- No app, sem precisar pedir: ver quem vê o quê e cada acesso; revogar (efeito imediato); parar de compartilhar uma conta; desconectar o banco; sair da família; baixar uma cópia dos dados; excluir a conta.
- Por e-mail: confirmação, correção, anonimização, portabilidade, informação sobre compartilhamento, revogação; reclamação à ANPD.

## 8. Crianças e adolescentes

Menor de 18 anos só entra por convite de um dos pais ou responsável legal, que
consente por ele. O menor confirma com a data de nascimento, vê exatamente o que
é compartilhado e pode revogar. O compartilhamento termina no máximo no 18º
aniversário; depois disso só o próprio titular pode renová-lo. [Decidir idade
mínima — ver risco R3 em `conformidade-lojas.md`.]

## 9. Segurança

Controle de acesso no banco de dados (Row Level Security e funções que
conferem o consentimento a cada leitura), criptografia em trânsito e em
repouso, chaves do agregador apenas no servidor, segredo e deduplicação no
webhook, histórico de acessos visível ao dependente.

## 10. Alterações

Mudanças relevantes serão avisadas no app. Uma nova versão do termo de
consentimento só vale para quem a aceitar.
