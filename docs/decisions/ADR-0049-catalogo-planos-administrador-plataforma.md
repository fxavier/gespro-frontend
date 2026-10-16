# ADR-0049 — Catálogo de planos na base de dados e administrador de plataforma

- **Estado**: Proposto
- **Data**: 2026-10-13
- **Contexto**: Issue #523 — o administrador geral do sistema (não um tenant) tem de poder criar, editar,
  arquivar e, quando possível, apagar planos de subscrição, e acrescentar itens a cada plano
- **Emenda**: [ADR-0027](./ADR-0027-modelo-comercial-planos-limites.md) — a fonte do catálogo deixa de ser
  a constante `src/lib/planos.ts` (Consequências, «Não há migração de schema»), e do §1 cai o número fixo de
  três planos (o preço continua a ser do escalão, nunca do assento); §2 a §7 mantêm-se
- **Concretiza**: [ADR-0011](./ADR-0011-fronteira-autorizacao.md) §5 — o papel de realm `plataforma-admin`
  passa a ter leitor e uma área própria no ERP
- **Relacionados**: [ADR-0009](./ADR-0009-moeda-faturacao-saas.md) (Stripe em USD, fonte da cobrança),
  [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md) (trilho de auditoria),
  [ADR-0029](./ADR-0029-login-no-erp-direct-grant.md) (o ERP recebe o access token),
  [ADR-0032](./ADR-0032-aplicacao-da-leitura.md) (pipelines e Leitura)
- **Skills**: `prisma-conventions`, `api-conventions`, `ui-conventions`

## Contexto

O catálogo comercial vive em dois sítios de código e em nenhum de dados:

- `apps/erp/src/lib/planos.ts` declara `PLANOS: Record<PlanoId, Plano>` com três entradas fixas —
  nome, descrição, limites (`utilizadores`, `armazens`, `suporte`), preço mensal e anual em USD e o
  **nome** das variáveis de ambiente `STRIPE_PRICE_<PLANO>_<CICLO>`. É importado por catorze ficheiros
  de produção (alguns só pelos tipos ou por `TRIAL_DIAS`), entre eles o ecrã `/definicoes/faturacao`, o
  `/registo`, o ecrã de login, o `GET /api/publico/planos`, a validação Zod do onboarding
  (`planoIdEnum = z.enum(PLANO_IDS)`), o `limites-plano.ts` e o `stripe-client.ts`.
- `prisma/schema/plataforma.prisma` declara `enum PlanoAssinatura { BASICO PROFISSIONAL EMPRESARIAL }`,
  usado em `Assinatura.planoAssinatura` **e** em `ConfiguracaoFiscal.planoAssinatura`.

Criar um quarto plano, mudar o número de utilizadores do Profissional ou acrescentar uma linha à lista do
que o plano inclui exige hoje um *pull request*, uma migração de enum e um deploy. Quem decide o catálogo
é a GestPro comercial, não a engenharia; o ADR-0027 fixou a **forma** do modelo comercial e deixou os
números «entrar sem o alterar» — mas o único sítio por onde entram é o código.

Não existe, além disso, ninguém no sistema que possa fazer esta gestão. Os cinco papéis do `rbac.ts` são
todos de tenant, e as actions de `plataforma.actions.ts` (`tenantAdminService.criar/actualizar/...`) estão
guardadas por `core_tenancy:configurar` — uma permissão **de tenant**: qualquer ADMIN de qualquer cliente
a tem. O ADR-0011 §5 previu o papel de realm `plataforma-admin` para o pessoal da GestPro;
`infra/keycloak/realm-gespro.json` declara-o, sem membros, e nenhuma linha de `src/` o lê.

Três achados, verificados contra o código em 2026-10-13, que este ADR tem de ter em conta:

1. **O ADR-0027 §5 não foi cumprido.** `ConfiguracaoFiscal.planoAssinatura` continua no schema e
   `tenant-admin.service.ts` continua a lê-lo e a filtrar por ele (linhas 31, 84–87, 148, 178) — a cópia
   que diverge da `Assinatura` ainda é a que o ecrã de administração mostra.
2. **O site recusa um plano novo.** `apps/site/src/lib/planos.ts` valida `id: z.enum(IDS_PLANO)` com os
   três códigos fixos, dentro de `z.array(planoSchema)`. Um quarto código faz falhar a resposta inteira e
   o site cai no catálogo de demonstração. O campo `funcionalidades: string[]` já é aceite (com omissão
   `[]`).
3. **A sessão exige um `User` com tenant.** `resolverUtilizadorLocal` (`lib/auth.ts`) recusa um `sub` sem
   `User` local (`nao-provisionado`), `User.tenantId` é obrigatório e `AuditLog.tenantId` também. Um
   administrador de plataforma, que não pertence a cliente nenhum, não tem hoje por onde entrar nem onde
   ficar registado.

## Decisão

### 1. O catálogo é uma tabela global `Plano`, que substitui a constante e o enum

```prisma
model Plano {
  codigo     String  @id            // imutável; ex.: BASICO
  nome       String
  descricao  String
  ordem      Int     @default(0)
  destaque   Boolean @default(false)
  arquivadoEm DateTime?            // arquivado quando preenchido

  limiteUtilizadores Int            // -1 = ilimitado
  limiteArmazens     Int            // -1 = ilimitado
  suporte            String
  funcionalidades    String[]       // texto mostrado ao cliente, por ordem

  precoMensalUsd Decimal @db.Decimal(12, 2)   // exibição — ver §4
  precoAnualUsd  Decimal @db.Decimal(12, 2)
  stripePriceIdMensal String? @unique
  stripePriceIdAnual  String? @unique

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  assinaturas Assinatura[]
}
```

(Forma indicativa; o schema final segue a skill `prisma-conventions`.)

- **Sem `tenantId`.** O catálogo é igual para todos os Tenants. Como a `tenant-extension` deriva
  `TENANT_MODELS` do `Prisma.dmmf` (modelos com `tenantId`), o `Plano` fica fora do *scoping* sem tocar
  na extensão — que é o que se quer: o registo público e o endpoint público lêem-no sem contexto de tenant.
- **`codigo` é a chave e é imutável.** SCREAMING_SNAKE (`^[A-Z][A-Z0-9_]{1,30}$`), escolhido na criação e
  nunca mais editável: é o que viaja no URL do funil (`/registo?plano=PROFISSIONAL`), no `metadata` do
  Stripe, nas variáveis de ambiente dos planos de origem (§4) e na FK abaixo. Mudar o nome comercial é
  mudar `nome`.
- **`Assinatura.planoAssinatura` passa a `String` com FK para `Plano.codigo`**, `onDelete: Restrict` e
  `onUpdate: Restrict`. `Plano` e `Assinatura` vivem no mesmo ficheiro (`plataforma.prisma`), logo a
  regra das FKs cross-domínio escalares não se aplica: é uma relação dentro do domínio, e é a FK que torna
  o §3 seguro. A coluna perde o `@default(BASICO)` — o provisionamento escreve sempre o plano escolhido, e
  uma omissão silenciosa apontaria para um plano que pode estar arquivado.
- **`ConfiguracaoFiscal.planoAssinatura` é apagado**, cumprindo finalmente o ADR-0027 §5. Antes, o
  `tenant-admin.service.ts` passa a ler e a filtrar pela `Assinatura`.
- **O `enum PlanoAssinatura` é apagado** quando deixar de ter colunas.
- **A constante `PLANOS` sai.** `lib/planos.ts` fica só com o que é client-safe e não é catálogo: tipos
  (`Preco`, `CicloId`, `PlanoPublico`), `TRIAL_DIAS`, `MOEDA_FATURACAO` e funções puras. A leitura do
  catálogo passa a um serviço `server-only` (`plano.service.ts`), e os Client Components recebem os
  planos do Server Component que os leu — nunca importam o serviço.

### 2. Itens do plano: limites verificados, suporte e funcionalidades

Um plano tem três espécies de item, e só uma delas obriga o produto a alguma coisa:

| Item | Forma | Quem o lê | Editável pelo administrador |
|---|---|---|---|
| **Limites** — utilizadores, armazéns | `Int`, `-1` = ilimitado | `limites-plano.ts` (`exigirLugarNoPlano`), nos dois pontos de verificação do ADR-0027 §3 | Sim, o **valor** |
| **Suporte** | texto | ecrã de faturação, site | Sim |
| **Funcionalidades** | lista ordenada de texto | ecrã de faturação, registo, site | Sim — acrescentar, editar, reordenar, retirar linhas |

**Um tipo de limite novo continua a exigir código.** O ADR-0027 §2 diz que só é limite o que é
verificado; um limite novo é uma coluna nova **e** um ponto de verificação novo no serviço que cria a
coisa contada, e os dois entram no mesmo *pull request*. Por isso os limites são colunas tipadas e não
uma tabela chave-valor: uma tabela de limites genérica deixaria o administrador criar
«`documentosMes`: 500», que ninguém conta — exactamente a promessa decorativa que o ADR-0027 retirou do
catálogo.

As funcionalidades são **texto para o cliente ler**, não interruptores: não ligam nem desligam módulo
nenhum. Uma linha «Produção e projectos» no Empresarial não impede um Básico de abrir a produção — e o
ecrã de administração diz isto ao lado do campo, para ninguém confundir o texto com um controlo de acesso.

Baixar um limite aplica-se **de imediato a todos os Tenants nesse plano** (o `limites-plano.ts` lê o plano
a cada verificação). Quem ficar acima entra no estado **Excedido** do ADR-0027 §4 — usa o que tem, não
cria mais; nada é desactivado. O formulário mostra quantas Assinaturas estão no plano antes de gravar.

### 3. Retirar um plano: arquivar; apagar só se ninguém o referir

- **Arquivar** (preencher `arquivadoEm`) tira o plano do catálogo público, do `/registo`, da escolha de plano em
  `/definicoes/faturacao` e de qualquer checkout novo. Quem já o tem **mantém-no**: a `Assinatura` não
  muda, a subscrição no Stripe continua a renovar, os limites continuam a valer. Desarquivar é possível.
  Um Tenant num plano arquivado pode mudar para um activo; não pode voltar ao arquivado.
- **Apagar de vez** só quando nenhuma `Assinatura` o referir — garantido pela FK `Restrict`, não por um
  `COUNT` prévio sujeito a corrida. O serviço traduz a violação de FK em
  `BusinessRuleError('PLANO_EM_USO')` com o número de assinaturas, e sugere arquivar.
- **Não se arquiva o último plano activo** (`PLANO_ULTIMO_ACTIVO`): sem nenhum, o registo público fica sem
  nada para oferecer e o site sem catálogo.

### 4. Stripe: o administrador cola os Price IDs; o preço na tabela é de exibição

O ADR-0009 mantém-se: **o Stripe é a fonte de verdade do valor cobrado**. O que muda é de onde vem o
`Price` a usar num checkout.

- O formulário do plano tem dois campos, **Price ID mensal** e **Price ID anual** (`price_…`), que o
  administrador copia do Dashboard do Stripe. **Não são segredos** — são identificadores que, sem a chave secreta da
  conta, não permitem fazer nada — e por isso vivem na tabela, não no gestor de
  segredos. São `@unique`: um Price pertence a um plano e a um ciclo, e assim o caminho inverso
  (Price → plano) fica disponível a quem dele precisar.
- **`resolverPriceId(codigo, ciclo)`** passa a ler a coluna; se estiver vazia, recorre à variável de
  ambiente `STRIPE_PRICE_<CODIGO>_<CICLO>`; se também não houver, lança o `PRICE_NAO_CONFIGURADO` (503)
  de hoje. O recurso à variável existe para os **três planos de origem** continuarem a funcionar sem
  ninguém tocar na base no dia da migração; um plano criado no ecrã só tem a coluna. O ecrã de
  administração assinala um plano activo sem Price resolúvel num dos ciclos.
- `precoMensalUsd`/`precoAnualUsd` são **o que se mostra** — no site, no registo e no ecrã de faturação.
  São `Decimal`, pela regra da casa, e o endpoint público continua a servi-los como
  `{ valor: number, moeda: "USD" }`. Ninguém verifica que batem com o `Price` do Stripe; manter os dois
  iguais é responsabilidade de quem edita, e o formulário diz isso junto dos campos.
- **Mudar preço ou Price ID afecta só checkouts novos.** As subscrições existentes continuam no `Price` com
  que foram criadas (`Assinatura.stripePriceId`); migrar clientes de preço é um acto no Stripe, fora deste
  ADR.
- **Sem chamadas de escrita à API do Stripe.** O ERP não cria `Product` nem `Price`, não arquiva nada no
  Stripe ao arquivar um plano e não lê a API para validar o Price ID colado. Um Price ID errado falha no
  primeiro checkout, com o erro do Stripe registado; é o mesmo modo de falha da variável de ambiente
  errada de hoje.

### 5. Administrador de plataforma: papel de realm `plataforma-admin`

- **Quem é.** Uma Identidade no Keycloak com o papel de realm `plataforma-admin` — o que o ADR-0011 §5 já
  previa. Atribuir e retirar o papel faz-se na consola do Keycloak; o ERP não tem ecrã para isso nem tabela
  que o espelhe (uma segunda fonte de «quem é administrador de plataforma» seria a sincronização que o
  ADR-0011 rejeitou para os papéis de negócio).
- **Alarga o papel, não abre a superfície transversal.** O ADR-0011 §5 reservou `plataforma-admin` à
  consola de identidade e rejeitou «sem discussão» uma superfície transversal no ERP. `/plataforma` alarga
  o papel ao catálogo de planos — dados globais, sem `tenantId` — e não é essa superfície: nunca entra em
  contexto de tenant, e nenhuma consulta dela devolve dados de um cliente. Se um dia precisar de ver dados
  de um tenant, é outro ADR.
- **Como chega à sessão.** O `callbacks.jwt` lê `realm_access.roles` do **access token** do Keycloak (que o
  ERP recebe desde o ADR-0029) na emissão inicial e **em cada re-resolução** (o ramo de renovação do `jwt` tem de usar o access token
  renovado, não só o Postgres: o papel não vive na base) — a mesma cadência de 15
  minutos do ADR-0011 §3. Retirar o papel tem efeito em 15 minutos, como retirar um papel de negócio.
  A sessão ganha `session.user.plataformaAdmin: boolean`.
- **Pode não ter tenant.** Uma Identidade com o papel e **sem** `User` local abre sessão — é a única
  excepção à recusa `nao-provisionado` do ADR-0011, e é estreita: a sessão sai sem `tenantId`, sem
  permissões e sem `acesso`, e só serve a área de plataforma. Sem o papel, a recusa mantém-se como está.
  Uma Identidade que tenha o papel **e** um `User` num tenant tem as duas coisas, separadas: o tenant dela
  pelas permissões dela, a plataforma pelo papel. *(Emendado pela adenda #549.)*
- **Adenda (#549, 2026-10-16) — proposta, a aceitar por humano.**
  - O papel só vale em sessões **sem** `tenantId`. Uma Identidade com o papel e um `User` de tenant entra
    no tenant, com `plataformaAdmin: false`; as actions de plataforma recusam-na com `NAO_ENCONTRADO` e
    `/plataforma/*` com 404.
  - Porquê: o vector de tomada de conta da #549 — o registo público (e o `criarUtilizador`) escrevia a
    palavra-passe de quem se registava numa identidade preexistente sem `User` local, como a do
    administrador de plataforma, e associava-lhe um `User` de tenant; a sessão saía com `tenantId` **e**
    `plataformaAdmin: true`. Fechado o registo, esta regra impede que outra ponte entre um `User` de tenant
    e o papel volte a abrir `/plataforma`.
  - Consequência: quem precisar das duas coisas usa uma **segunda Identidade** por sub-endereçamento
    (`nome+plataforma@…`), como o ADR-0011 §5 já faz para o suporte.
  - A frase «tem as duas coisas, separadas» do ponto anterior fica emendada por esta adenda.
- **A área é `/plataforma/*`**, com layout próprio (sem a barra lateral de módulos do tenant). O
  `middleware.ts` recusa `/plataforma/*` a quem não tenha `plataformaAdmin`; os layouts do `(dashboard)`
  mandam para `/plataforma` uma sessão sem `tenantId`.
- **O papel não dá acesso a dados de nenhum tenant.** As acções de plataforma correm **sem contexto de
  tenant** (`runWithTenantContext` não é chamado) e só tocam no `Plano`. A listagem «quantas assinaturas
  usam este plano» é um `COUNT` agregado — nunca uma lista de clientes. Ler, editar ou suspender tenants
  continua fora deste ADR; quando entrar, entra em ADR próprio e decide se o papel o permite. A
  impersonação continua rejeitada pelas razões do ADR-0011 §5.
- **Pipeline.** As mutações de plataforma passam por uma variante do `createSafeAction` — sessão →
  `plataformaAdmin` → Zod → handler → `ActionResult` — que não estabelece contexto de tenant e não aplica
  o travão de Leitura do ADR-0032 (a Leitura é estado de uma Assinatura, e o administrador de plataforma
  não tem nenhuma). O `gate-leitura` tem de reconhecer a variante.
- **Auditoria.** Cada criação, edição, arquivo, desarquivo e eliminação de plano grava uma linha num
  trilho de plataforma **global** (sem `tenantId`) — autor por `keycloakSub`, acção, `codigo`, estado
  antes e depois, `requestId` —, na mesma transacção da escrita. Não vai para o `AuditLog`: esse é o
  trilho **do tenant**, com `tenantId` obrigatório, que se mostra ao auditor fiscal do cliente, e a
  `audit-extension` só o escreve dentro de um contexto de tenant que aqui não existe.

### Alternativas consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Tabela global `Plano`, FK `Restrict` da `Assinatura`** ✅ | O comercial muda o catálogo sem deploy; a FK torna a eliminação segura sem código; um só sítio para o site, o registo e os limites | Migração de dados do enum; o endpoint público passa a ler a base; o site tem de aceitar códigos novos |
| Manter a constante e editar por *pull request* | Zero trabalho; catálogo versionado com o código | Exactamente o que o pedido quer deixar de ter: o comercial depende da engenharia para mudar uma linha de texto |
| Tabela, mas manter o `enum PlanoAssinatura` | Tipos fortes nas colunas | Um plano novo continuaria a exigir uma migração — o enum anula a tabela |
| Plano por tenant (`tenantId` no `Plano`) | Preços negociados por cliente | Não é o modelo do ADR-0027 (escalão, não contrato à medida); se vier, é um desconto no Stripe, não um plano |
| Limites numa tabela chave-valor editável | O administrador acrescenta limites sem código | Limites que ninguém verifica — a promessa decorativa que o ADR-0027 §2 retirou |
| Funcionalidades como tabela `PlanoFuncionalidade` | Identidade por linha; ordem explícita | Ninguém referencia uma funcionalidade por id; é texto ordenado, e `text[]` é texto ordenado |
| Funcionalidades como interruptores de módulo | O plano controlaria o que se pode usar | Muda o modelo comercial (hoje todos os planos vêem todos os módulos) e mete autorização no catálogo; decisão de outro ADR, se algum dia |
| Eliminação lógica (`deletedAt`) em vez de arquivar | Padrão da casa para soft delete | Arquivar já é o «retirar sem perder»; um `deletedAt` ao lado de `arquivadoEm` seriam dois interruptores para a mesma pergunta |
| Apagar sempre, desligando as assinaturas | Catálogo limpo | Deixa Assinaturas apontadas para nada; a FK existe para o impedir |
| O ERP cria `Product`/`Price` no Stripe pela API | Uma só acção para o administrador; preço sempre igual ao cobrado | Escrita num sistema externo dentro de uma acção de formulário (falhas parciais, idempotência, rollback); `Price` do Stripe é imutável e a edição viraria «criar e arquivar» — complexidade desproporcionada para um catálogo de três a cinco planos |
| Price IDs continuam só em variáveis de ambiente | Nada muda no Stripe | Um plano criado no ecrã precisaria de um deploy para ser vendável — volta-se ao ponto de partida |
| Papel `PLATAFORMA_ADMIN` na base (`Role` sem tenant) | Gestão no ERP | Os papéis da base são todos de tenant (ADR-0011 §2); um papel transversal na base é a superfície transversal que o ADR-0011 §5 rejeita «sem discussão» |
| Permissão `core_tenancy:configurar` (a de hoje) | Já existe | É de tenant: qualquer ADMIN de qualquer cliente geriria o catálogo da GestPro |
| `AuditLog` com `tenantId` opcional | Um só trilho | O trilho do tenant passa a ter linhas que não são de nenhum tenant; a extensão e os leitores assumem `tenantId` |

Racional: o pedido é dar ao comercial o controlo do catálogo sem lhe dar controlo sobre o que o produto
aplica. Por isso a fronteira passa entre **valores** (editáveis: preço de exibição, Price ID, número do
limite, texto) e **tipos** (código: que limites existem e onde são contados). E o administrador de
plataforma é desenhado pela negativa — o que **não** pode — porque o risco de um papel transversal não é o
que faz no catálogo, é o que um dia alguém lhe acrescenta sem reparar que ele vê todos os tenants.

## Consequências

- **Migração de dados, escrita à mão.** Uma migração cria `Plano` e insere os três planos de origem com os
  valores actuais da constante (Price IDs vazios — resolvem pelas variáveis, §4); converte
  `Assinatura.planoAssinatura` de enum para texto preservando o valor
  (`ALTER COLUMN … TYPE text USING "planoAssinatura"::text`), retira a omissão e cria a FK. O
  `migrate diff` geraria *drop + create* da coluna e perderia o plano de cada cliente — por isso é à mão,
  confirmada no fim com um `diff` vazio. A queda de `ConfiguracaoFiscal.planoAssinatura` e do enum vem
  depois de o `tenant-admin.service.ts` ler da `Assinatura`, senão o ecrã de administração parte.
- **O seed cria os três planos se não existirem e não os actualiza.** Um `upsert` que reescrevesse os
  valores desfaria, a cada `pnpm db:seed`, o que o administrador editou.
- **O tipo `PlanoId` deixa de ser uma união fechada.** Os ficheiros que importam a constante passam a receber
  planos do serviço; a validação Zod do onboarding (`planoIdEnum`) passa a `z.string()` e a existência e o
  estado do plano verificam-se no serviço (`PLANO_INEXISTENTE`, `PLANO_ARQUIVADO`). Os Client
  Components recebem os planos por props, serializados (`Decimal` → `string`).
- **O endpoint público lê a base, e a cache na borda passa a importar.** `GET /api/publico/planos` já
  responde com `s-maxage=300, stale-while-revalidate=600`; mantém-se, e uma edição demora até cerca de
  cinco minutos a chegar ao site — aceitável para um catálogo. Só planos não arquivados, por `ordem`.
- **Contrato com o site: aditivo nos campos, não nos códigos.** O payload ganha `funcionalidades: string[]`
  (o site já o aceita) e mantém a forma de `limites` e dos preços. Mas o site valida `id` contra três
  códigos fixos (achado 2): **antes de se criar o primeiro plano novo**, `apps/site/src/lib/planos.ts` tem
  de aceitar `id: z.string()`, senão um plano novo derruba o catálogo inteiro do site para o de
  demonstração.
- **Limites são retroactivos; preços não.** Editar o limite de um plano atinge já todos os Tenants nele
  (§2); editar o preço ou o Price ID só atinge checkouts novos (§4). A assimetria é deliberada — o limite
  é aplicado pelo ERP, a cobrança pelo Stripe — e o ecrã tem de a tornar visível.
- **A sessão passa a ter uma forma sem tenant.** Tudo o que assume `session.user.tenantId` presente (layouts
  do `(dashboard)`, `createSafeAction`, `withApi`) tem de recusar ou redireccionar uma sessão de plataforma
  em vez de rebentar. É a parte frágil: um sítio esquecido é um erro 500, não uma fuga — sem `tenantId`
  não há contexto de tenant e a extensão não devolve dados de ninguém.
- **Ambiente local e E2E.** O `realm-gespro.json` ganha uma Identidade de demonstração com
  `plataforma-admin` e sem `User`; o `realm-demo-sync.test.ts`, que hoje exige os cinco utilizadores
  demo e só esses, tem de passar a conhecê-la.
- **Novo trilho de auditoria global**, com modelo próprio. Não entra no `AUDIT_MODELS` nem passa pela
  `audit-extension`; é escrito explicitamente pelo serviço.
- **`CONTEXT.md`** tem de deixar de definir Plano como «um dos três escalões»: passa a ser um escalão do
  catálogo, gerido pelo Administrador de plataforma (termo novo), e acrescenta-se Arquivado.
- **Fica de fora**: gerir tenants a partir de `/plataforma` (ler, suspender, mudar plano de um cliente),
  cupões e descontos, preços em MZN, e sincronização com o Stripe. Cada um, se vier, vem em ADR próprio.
