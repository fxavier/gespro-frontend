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
   `email`, `name`, `email_verified`, e a organização do utilizador. Nenhuma permissão de negócio
   viaja no token.

2. **O catálogo de 298 permissões e os 5 papéis permanecem em Postgres**, semeados por
   `prisma/seed/rbac.ts`, versionados com o schema e revistos em *pull request*. `Role`,
   `Permission`, `UserRole` e `RolePermission` mantêm-se sem alteração.

3. **A resolução acontece uma vez, no `callbacks.jwt`.** Na primeira emissão da sessão, o ERP resolve
   o `keycloakSub` para o `User` local, expande papéis em permissões e coloca o conjunto na sessão do
   Auth.js — exactamente como hoje. O pipeline `createSafeAction` **não muda de forma**: continua a
   ler `session.user.permissions`. As 231 actions não são tocadas.

4. **O `permsVersion` mantém-se e ganha importância.** Continua derivado do `updatedAt` do utilizador;
   uma alteração de papéis invalida a sessão na renovação seguinte. Passa a ser acompanhado de um
   tempo de vida de sessão explicitamente curto (ver Consequências).

5. **Um único papel vive no Keycloak**: `plataforma-admin`, para o pessoal da GestPro que administra
   a consola de identidade. Não é um papel de negócio de nenhum tenant e não tem correspondência na
   base de dados de nenhum cliente.

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
- **O `tenantId` é confirmado nos dois lados.** A organização vem no token; o `User` local tem o seu
  `tenantId`. Se divergirem, a sessão é recusada e o evento é registado como incidente de segurança.
  Redundância deliberada: a divergência só é possível por erro de provisionamento ou por manipulação.
- **Tempo de vida da sessão passa a 15 minutos**, com renovação silenciosa pelo token de renovação do
  Keycloak. Reduz a janela em que uma revogação de papel ou uma suspensão de subscrição ainda não
  fez efeito. A revogação imediata continua a ser possível pelo lado do Keycloak (encerrar sessão),
  que corta a renovação.
- **A alteração de papéis continua a ser feita no ERP**, na área de definições, e continua a
  actualizar o `updatedAt`. Nada muda para o administrador do tenant.
- **Auditoria de acesso fica repartida** — autenticação no Keycloak, autorização no `AuditLog`. É
  aceitável e até desejável: são dois trilhos com retenções e audiências diferentes. O ADR-0015 fixa
  o lado do negócio; a correlação entre os dois faz-se pelo `keycloakSub`.
- **Evolução prevista:** se algum dia existir um segundo serviço que precise de autorizar contra as
  mesmas permissões, a saída não é mover o catálogo para o Keycloak — é publicar um endpoint de
  decisão no ERP, que continua dono da regra. Registar-se-á em ADR próprio.
