# ADR-0013 — Migração da identidade e provisionamento de tenants no Keycloak

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0010](./ADR-0010-keycloak-fornecedor-identidade.md), [ADR-0011](./ADR-0011-fronteira-autorizacao.md), [ADR-0012](./ADR-0012-alojamento-keycloak.md), [ADR-0016](./ADR-0016-anti-abuso-registo.md)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `api-conventions`

## Contexto

O ADR-0010 decide adoptar o Keycloak; este decide **como lá chegar sem partir o que já funciona**.

A situação é invulgarmente favorável: **não há utilizadores em produção**. Não há palavras-passe para
migrar, sessões para invalidar nem clientes para reeducar. O que existe é um *seed* de demonstração
com cinco utilizadores, uma suite de 1 199 testes que assume autenticação por credenciais, 37 cenários
E2E que fazem login com e-mail e palavra-passe, e um fluxo de registo público que cria o tenant e
estabelece a sessão por um token de transferência de uso único.

O problema central não é migrar dados. É que **criar um tenant deixa de ser uma transacção**. Hoje o
registo público cria `Tenant`, `User`, papéis e `ConfiguracaoFiscal` numa `$transaction` — tudo ou
nada. Com o Keycloak passam a existir dois sistemas com estado, sem transacção que os abranja: se a
escrita em Postgres confirmar e a chamada ao Keycloak falhar, fica um tenant sem forma de entrar; se
falhar ao contrário, fica uma organização órfã.

## Decisão

**Substituição completa, sem período de coexistência, com provisionamento idempotente e reconciliável.**

### 1. Sem autenticação dupla

Não há bandeira de funcionalidade que mantenha os dois caminhos activos. Manter `Credentials` e OIDC
em paralelo significaria manter `passwordHash` vivo, duplicar as regras de bloqueio de subscrição e
ter duas superfícies de ataque — para proteger uma migração que não tem utilizadores para proteger.
A troca é feita de uma vez, numa *branch* de integração, e o gate de entrada é a suite E2E verde.

### 2. Ordem de provisionamento: Keycloak primeiro, Postgres depois

O registo público passa a esta sequência, protegida pela `ChaveIdempotencia` que já existe:

1. Criar a **Organization** no Keycloak e o utilizador administrador, com e-mail por verificar.
2. Criar `Tenant`, `User` (com `keycloakSub`), papéis e `ConfiguracaoFiscal` numa `$transaction`.
3. Enviar o convite de verificação de e-mail **pelo Keycloak**.

A ordem é deliberada: **o lado que não tem transacção vai primeiro**. Se o passo 1 falhar, nada foi
escrito em Postgres e o pedido é simplesmente repetível. Se o passo 2 falhar, fica uma organização no
Keycloak sem tenant — estado detectável, reparável e **inofensivo**, porque sem `User` local não há
autorização nenhuma (ADR-0011). O contrário — tenant sem identidade — seria um cliente pago sem forma
de entrar.

### 3. Reconciliação como rede de segurança

Uma tarefa agendada diária, através de `withApi` como todas as outras, compara organizações do
Keycloak com `Tenant` em Postgres e reporta divergências nas duas direcções. **Reporta, não repara
automaticamente**: reparação automática de identidade é como se cria um incidente pior do que aquele
que se resolve. As divergências vão para o registo estruturado e disparam alerta.

### 4. Tabelas descontinuadas

| Tabela | Schema | Destino |
|---|---|---|
| `PasswordResetToken` | `auth.prisma` | Removida — recuperação de palavra-passe é do Keycloak |
| `UserInvite` | `auth.prisma` | Removida — convites são do Keycloak, com organização associada |
| `LoginAttempt` | `auth.prisma` | Removida — detecção de força bruta é nativa do Keycloak |
| `TokenVerificacaoEmail` | **`plataforma.prisma`** | Removida — verificação é do Keycloak |
| `TokenHandoff` | `plataforma.prisma` | **Mantida** — ver ponto 5 |
| `ChaveIdempotencia` | `plataforma.prisma` | Mantida — reutilizada no provisionamento (ponto 2) |
| `User.passwordHash` | `auth.prisma` | Coluna removida; `User` ganha `keycloakSub` único e não nulo |

> **Atenção ao ficheiro.** Três das quatro tabelas removidas estão em `auth.prisma`, mas
> `TokenVerificacaoEmail` está em **`plataforma.prisma`** — onde também vivem `Assinatura` e
> `ConfiguracaoFiscal`, que o `w8-billing` toca na mesma fase. O mapa de propriedade do handoff
> declara `w8-identidade` como dono de `plataforma.prisma` na Fase 2; o `w8-billing` **pede**
> alterações a esse ficheiro em vez de as escrever.

A remoção é feita numa migração escrita à mão. A dependência `@node-rs/argon2` sai do `package.json`.

### 5. O token de transferência sobrevive, com outro papel

Hoje o `TokenHandoff` transporta a sessão do site para o ERP depois do registo. Com o Keycloak, o
utilizador acabado de registar ainda não verificou o e-mail e ainda não tem sessão OIDC. O token
mantém-se, mas passa a transportar **apenas o destino pretendido** através do fluxo de autenticação —
não estabelece sessão por si. Continua de uso único e de vida curta.

### 6. Testes: um duplo de identidade, não um Keycloak em cada teste

- **Unitários** (a esmagadora maioria dos 1 199): não tocam em autenticação. Não mudam.
- **Integração** e **E2E**: `docker-compose` levanta o Keycloak com o realm importado do ficheiro
  versionado. O E2E autentica-se de verdade, contra um Keycloak real, uma vez, e reutiliza o estado
  de sessão nos restantes cenários — que é o que a suite já faz hoje com `auth.setup.ts`.
- **Novo cenário obrigatório**: expiração e renovação silenciosa de sessão. É a aresta conhecida do
  Auth.js v5 identificada no ADR-0010 e não pode ser verificada por inspecção de código.

### 7. Utilizadores de demonstração preservados

Os cinco utilizadores do *seed* (`admin@demo.mz` e restantes, palavra-passe `demo1234`) continuam a
existir — agora criados no realm importado, com as mesmas credenciais. A experiência de arranque
local documentada no `CLAUDE.md` não muda: `docker compose up -d`, `pnpm db:seed`, `pnpm dev`, entrar.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Substituição completa, sem coexistência** ✅ | Uma só superfície de autenticação; sem código morto; aproveita a janela única de não haver utilizadores reais | Sem retorno gradual: a reversão é reverter a *branch* inteira |
| Coexistência com bandeira de funcionalidade | Reversão instantânea; migração gradual dos utilizadores | Mantém `passwordHash` e duas superfícies de ataque vivas; duplica regras de bloqueio; complexidade permanente para proteger uma migração sem utilizadores |
| Postgres primeiro, Keycloak depois | O caminho feliz parece mais natural | A falha deixa **tenant sem identidade** — um cliente que pagou e não entra. Inverte exactamente o modo de falha que interessa evitar |
| Reconciliação com reparação automática | Sem intervenção manual | Reparação automática de identidade cria incidentes piores do que resolve. Detectar e alertar é a escolha conservadora certa |
| Federação de utilizadores do Keycloak contra o Postgres actual | Sem migração de palavras-passe; o Keycloak lê os utilizadores existentes | Resolve um problema que não temos — não há palavras-passe a preservar. Acrescenta um fornecedor de armazenamento personalizado, em Java, para manter |

## Consequências

- **`prisma/schema/auth.prisma` encolhe de 9 para 6 modelos**: `User`, `Role`, `Permission`,
  `UserRole`, `RolePermission` e `AuditLog`. Saem três — `PasswordResetToken`, `UserInvite` e
  `LoginAttempt`. A quarta tabela removida, `TokenVerificacaoEmail`, está em `plataforma.prisma`,
  que passa de 8 para 7 modelos.
- **`User.keycloakSub` é único e não nulo**, com índice. É a chave de correlação entre os dois
  sistemas e o que liga o trilho de autenticação ao trilho de auditoria de negócio (ADR-0015).
- **Um utilizador que exista no Keycloak sem `User` local não entra**, por decisão do ADR-0011. A
  mensagem de erro tem de dizer «contacte o administrador da sua empresa», não «utilizador
  desconhecido» — é o caso legítimo de um colaborador federado ainda não provisionado.
- **A gestão de utilizadores no ERP passa a escrever nos dois sítios**: convidar um colaborador cria
  o convite no Keycloak e o `User` local. Desactivar desactiva nos dois. A ordem é a mesma do registo
  — Keycloak primeiro — e a operação é idempotente.
- **`docker-compose.yml` ganha o serviço Keycloak**, e o arranque local passa a ser mais lento. É o
  custo aceite; documenta-se no `CLAUDE.md`.
- **A suite E2E passa a depender de um serviço a mais no CI.** O job `e2e` fica mais lento e mais
  frágil. Mitiga-se com o realm importado de ficheiro (arranque determinístico) e com verificação de
  saúde antes de correr os cenários.
- **Ponto de não retorno**: depois de removidas as tabelas e a coluna `passwordHash`, voltar atrás é
  reverter a migração e a *branch*. Por isso o gate desta migração é mais exigente do que o habitual —
  E2E verdes **contra um Keycloak real**, não contra um duplo.
