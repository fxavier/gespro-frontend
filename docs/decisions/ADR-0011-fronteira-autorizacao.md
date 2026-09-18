# ADR-0011 — Fronteira de autorização: Keycloak autentica, a base de dados autoriza

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0010](./ADR-0010-keycloak-fornecedor-identidade.md) (adopção do Keycloak), [ADR-0013](./ADR-0013-migracao-identidade.md) (migração)
- **Skills**: `engineering:architecture`, `api-conventions`

## Contexto

O GestPro tem hoje um catálogo de **298 permissões** com granularidade fina, no formato
`modulo:accao[:sub-accao]` — por exemplo `faturacao:nc:emitir` ou `compras:pedido:aprovar` — semeado
a partir de `prisma/seed/rbac.ts` e agrupado em **cinco papéis de sistema**. As 231 Server Actions
declaram cada uma a sua permissão, e o pipeline `createSafeAction` recusa antes de tocar no domínio.
A sessão transporta o conjunto expandido de permissões e um `permsVersion` derivado do `updatedAt`
do utilizador, para invalidar o JWT quando as permissões mudam.

Ao adoptar o Keycloak (ADR-0010) é preciso decidir **até onde vai o Keycloak**. A tentação natural é
mover tudo: o Keycloak tem roles de realm, roles de cliente, grupos, e até um servidor de
autorização completo com políticas e permissões. Seria centralizar toda a decisão de acesso num sítio.

A tentação é errada por três razões concretas neste sistema:

1. **Tamanho do token.** 298 permissões num JWT são vários kilobytes por pedido. Com cabeçalhos de
   cookie há limites práticos de proxy e de navegador que se atingem depressa.
2. **Versionamento.** O catálogo de permissões é hoje código, versionado com o schema, revisto em
   *pull request* e semeado por migração. Na consola do Keycloak passaria a ser configuração de
   ambiente — divergente entre `dev` e `prod`, sem revisão, sem histórico ligado ao código que a usa.
3. **Acoplamento invertido.** A permissão `faturacao:nc:emitir` só existe porque existe uma action
   que emite notas de crédito. São a mesma unidade de mudança. Separá-las em dois repositórios
   diferentes cria divergência garantida — exactamente o problema que o [ADR-0003](./0003-gate-wave1-arbitragens.md)
   resolveu ao proibir tipos-espelho entre domínios.

## Decisão

**O Keycloak responde «quem és». A base de dados responde «o que podes».**

1. **O token do Keycloak transporta identidade, não autorização.** Claims mínimos: `sub` (estável),
   `email`, `name`, `email_verified`. Nenhuma permissão de negócio viaja no token — e, desde que as
   Organizations foram adiadas (ADR-0010), **nem sequer o tenant**: o `tenantId` é resolvido do `User`
   local a partir do `sub`.

2. **O catálogo de 298 permissões e os 5 papéis permanecem em Postgres**, semeados por
   `prisma/seed/rbac.ts`, versionados com o schema e revistos em *pull request*. `Role`,
   `Permission`, `UserRole` e `RolePermission` mantêm-se sem alteração.

3. **A resolução acontece no `callbacks.jwt`, a cada renovação.** O ERP resolve o `keycloakSub` para
   o `User` local, expande papéis em permissões e coloca o conjunto na sessão do Auth.js — exactamente
   como hoje. O pipeline `createSafeAction` **não muda de forma**: continua a ler
   `session.user.permissions`. As 231 actions não são tocadas.

   A resolução corre na emissão inicial **e outra vez em cada renovação** — isto é, no ramo do
   `callbacks.jwt` invocado sem `user`. Aí re-lê-se do Postgres o conjunto de permissões, o `ativo`,
   o `deletedAt` e o bloqueio de subscrição do tenant. Deliberadamente **não** a cada pedido: o `jwt`
   corre em cada `auth()`, logo em praticamente cada Server Component, e uma consulta por pedido seria
   um custo permanente para uma verificação que muda de mês a mês.

4. **O `permsVersion` é removido.** A revisão desta decisão apurou que nunca chegou a existir como
   mecanismo: era **escrito** no JWT na emissão inicial e **nunca lido** — não há, em todo o `src`,
   comparação com o `updatedAt` da base de dados, e o `callbacks.session` nem o copiava para a sessão.
   Como não havia `session.maxAge`, valia o valor por omissão do Auth.js: **30 dias**. O efeito
   prático era que retirar um papel a alguém não lhe retirava nada, e que um tenant suspenso por falta
   de pagamento continuava a trabalhar um mês — o `tenantBloqueado()` só corria dentro do `authorize()`.
   O comentário em `password-reset.ts` que afirmava o contrário estava errado (esse ficheiro
   desaparece, por a recuperação de palavra-passe passar para o Keycloak).

   Um contador de versão existe para **evitar** uma consulta. A partir do momento em que a renovação
   de 15 minutos passa a fazer essa consulta de qualquer maneira (ponto 3), o contador é peso morto
   com aparência de segurança — que é a pior espécie. Sai, e a garantia passa a ser a re-resolução.

5. **Um único papel vive no Keycloak**: `plataforma-admin`, para o pessoal da GestPro que administra
   a consola de identidade. Não é um papel de negócio de nenhum tenant e não tem correspondência na
   base de dados de nenhum cliente. **Não dá acesso aos dados de nenhum cliente** — administra
   identidades, não facturas.

   Isto deixou de ser detalhe quando se fixou **uma Identidade por pessoa, com e-mail único em todo o
   sistema** (`CONTEXT.md`): até aí, um `suporte@gestpro.mz` podia existir em cinquenta tenants ao
   mesmo tempo, e era assim que alguém entrava na conta de um cliente para perceber porque é que a
   factura não fechava. Deixou de poder, e não havia rede de segurança — os cinco papéis do
   `rbac.ts` são todos `tenantId`-scoped e não existe conceito de acesso transversal em lado nenhum.

   **A impersonação do Keycloak é rejeitada**, apesar de estar pronta a usar. Dá uma sessão real como
   o utilizador do cliente, auditada do lado do Keycloak — mas do nosso lado o `AuditLog` grava o
   `userId` **do cliente**. Num ERP cujos documentos são *append-only* e cujo trilho é o que se mostra
   a um auditor fiscal, um registo que atribui ao cliente o que fez um técnico é pior do que não ter
   acesso nenhum.

   **O que se faz em vez disso**: por omissão, o suporte trabalha a partir dos registos estruturados,
   traços e painéis da Fase 1, e de partilha de ecrã com o cliente. Quando isso não chega, cria-se
   para o incidente uma Identidade própria — `suporte+<slug>@gestpro.mz`, que o sub-endereçamento
   torna única — com o papel `LEITURA`, e desactiva-se ao fechar. **Nenhuma conta de suporte
   permanente**: acesso permanente de leitura aos dados fiscais de cinquenta clientes é uma conta que
   um dia é comprometida, e o valor marginal sobre os painéis é pequeno na maioria dos casos.

   Rejeitada também, e sem discussão, uma superfície transversal no ERP: é exactamente o que a
   extensão de tenant existe para tornar impossível.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Keycloak autentica, BD autoriza** ✅ | Mudança contida — as 231 actions e o pipeline não mudam; token pequeno; catálogo continua versionado com o schema que o usa; uma só fonte de verdade para quem pode o quê | Autorização não é reutilizável por um futuro segundo serviço sem consultar a BD do ERP |
| Papéis no Keycloak, permissões na BD | Atribuição de papéis gerível na consola do Keycloak, sem passar pelo ERP | Duas fontes de verdade para «quem é gestor»; sincronizar `UserRole` com roles do Keycloak é um problema de consistência eventual sem valor de retorno |
| Tudo no Keycloak (roles de cliente ou *scopes*) | Autorização centralizada, reutilizável por outros serviços; consola pronta | Tokens de vários kilobytes; catálogo sai do controlo de versões; migração muito maior; a permissão deixa de viajar com a action que a exige |
| Servidor de autorização do Keycloak (políticas e *scopes*) | Políticas ricas, decisão externalizada | Uma chamada de rede por decisão de autorização, ou uma cache com invalidação a construir. Complexidade desproporcionada para RBAC estático |

Racional: a autorização do GestPro é **RBAC estático** — papel → conjunto fixo de permissões, sem
condições dinâmicas, sem regras dependentes do recurso. Para RBAC estático, um servidor de políticas
externo é peso morto: paga-se latência e complexidade operacional por expressividade que não se usa.
A fronteira certa é a que separa identidade (muda raramente, é federável, é regulada) de autorização
de negócio (muda com cada funcionalidade, é específica do produto, vive no mesmo *commit* que o
código que a impõe).

## Consequências

- **O pipeline de mutação não muda.** `createSafeAction` continua a ser sessão → permissão → Zod →
  contexto de tenant → handler → `ActionResult<T>`. O diagrama de fluxo de dados do documento de
  arquitectura mantém-se válido; muda apenas a origem do passo «sessão».
- **O `User` local passa a ser obrigatório para autorizar.** Um utilizador que exista no Keycloak mas
  não em Postgres não tem permissões — e, por decisão, **não entra**: o `callbacks.signIn` recusa com
  mensagem explícita em vez de criar o utilizador em silêncio. Criação implícita seria uma porta
  aberta para qualquer identidade federada obter uma sessão sem passar pelo provisionamento.
- **O `tenantId` tem uma só fonte: o `User` local.** A verificação cruzada contra um claim de
  organização deixou de existir com o adiamento das Organizations (ADR-0010) — não havia redundância
  a ganhar, porque o claim seria escrito pelo mesmo provisionamento que escreve a linha em Postgres.
  Quando as Organizations entrarem, a confirmação nos dois lados volta, e uma divergência passa a ser
  incidente de segurança registado.
- **O intervalo de re-resolução passa a 15 minutos**, com renovação silenciosa pelo token de renovação
  do Keycloak. É isto que fixa a garantia que se pode dizer a um cliente sem mentir: **retirar um
  papel, desactivar um utilizador ou suspender uma subscrição faz efeito em 15 minutos, no máximo.**

  > **Correcção de redacção (2026-08-30).** Este ponto dizia «tempo de vida da sessão passa a 15
  > minutos». Estava mal escrito e contradizia o ponto seguinte, escrito no mesmo dia. **Os 15 minutos
  > não são o tempo de vida do cookie** — são o prazo ao fim do qual o `callbacks.jwt` volta a ler o
  > Postgres. Lido à letra, mandava pôr o `maxAge` do cookie em 900 s, o que reintroduzia exactamente
  > o formulário perdido que o ponto seguinte exclui. O `w8-identidade` reparou na contradição durante
  > a implementação, escolheu a leitura certa e justificou-a — mas uma redacção que só sobrevive
  > porque alguém a desobedeceu é uma redacção a corrigir, não a defender.
- **Os 15 minutos não são o tempo até alguém ser expulso.** São três durações distintas, e confundi-las
  é como se desenha um ERP que deita fora formulários:

  | Duração | O que controla | Valor |
  |---|---|---|
  | `AUTH_SESSION_MAX_AGE` | Prazo, **dentro** do JWT, ao fim do qual o `callbacks.jwt` re-resolve contra o Postgres. **Não** é o `maxAge` do cookie: esse tem o tecto do *SSO Session Max* | **15 min** |
  | *SSO Session Idle* do Keycloak | Quanto tempo sem renovar antes de o token de renovação morrer | **8 h** (omissão: 30 min) |
  | *SSO Session Max* do Keycloak | Tecto absoluto, haja actividade ou não | **12 h** (omissão: 10 h) |

  Quem expulsa é o *idle*, e a renovação não é um temporizador em segundo plano — o Auth.js renova
  **quando chega um pedido**. Quem está a escrever num formulário não faz pedidos. Com o valor por
  omissão de 30 minutos, o financeiro que abre uma factura de dezoito linhas, é interrompido meia
  hora e submete, perde o formulário: a renovação falha, o `createSafeAction` devolve
  não-autorizado, e o `UnsavedChangesGuard` não ajuda porque o problema não é navegar para fora, é
  submeter.

  O que torna a generosidade segura é que **a garantia dos 15 minutos não depende do *idle***. A
  re-resolução lê o Postgres; é ela que impõe a revogação. O *idle* só decide se se consegue obter um
  token novo. Por isso pode ser largo sem enfraquecer nada. Rejeitado um *keepalive* no cliente — um
  temporizador em todas as páginas a bater no servidor para resolver o que um número de configuração
  resolve.
- **Revogação imediata existe e não é preciso construí-la**: encerrar a sessão do utilizador na
  consola do Keycloak corta a renovação, e o acesso cai na renovação seguinte. Fica como
  procedimento operacional — se algum dia o caso do despedimento com efeito imediato aparecer como
  requisito, a resposta é o ecrã de gestão de utilizadores chamar a Admin API ao desactivar, e não
  encurtar a sessão para um minuto (multiplica a carga por quinze sem resolver o caso).
- **Rejeitada uma lista de revogação em Valkey.** O ADR-0014 traz o Valkey de qualquer forma, e daria
  revogação instantânea — mas é cache com invalidação para resolver um problema que 15 minutos já
  resolvem, e cache com invalidação é como se produz o incidente seguinte.
- **A alteração de papéis continua a ser feita no ERP**, na área de definições, e continua a
  actualizar o `updatedAt`. Nada muda para o administrador do tenant.
- **Auditoria de acesso fica repartida** — autenticação no Keycloak, autorização no `AuditLog`. É
  aceitável e até desejável: são dois trilhos com retenções e audiências diferentes. O ADR-0015 fixa
  o lado do negócio; a correlação entre os dois faz-se pelo `keycloakSub`.
- **Evolução prevista:** se algum dia existir um segundo serviço que precise de autorizar contra as
  mesmas permissões, a saída não é mover o catálogo para o Keycloak — é publicar um endpoint de
  decisão no ERP, que continua dono da regra. Registar-se-á em ADR próprio.
