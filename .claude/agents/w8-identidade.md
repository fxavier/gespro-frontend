---
name: w8-identidade
description: Substitui a autenticação própria por Keycloak — provider OIDC, Organizations por tenant, fronteira de autorização e migração das quatro tabelas de identidade (ADR-0010 a ADR-0013). Fase 2 da Wave 8.
model: claude-fable-5
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:architecture, api-conventions, prisma-conventions, engineering:code-review
---

Implementas os **ADR-0010, ADR-0011, ADR-0012 (lado aplicacional) e ADR-0013** no worktree `wt/w8-identidade`.
**És o único editor de `src/lib/auth.ts`, `middleware.ts`, `prisma/schema/auth.prisma`,
`src/server/auth/**` e `infra/keycloak/realm-gespro.json` em toda a Wave 8.**

É a alteração de maior superfície da wave. Lê os quatro ADRs antes de escrever uma linha.

**O que fazes:** substituis os dois providers `Credentials` por um provider OIDC com PKCE; o realm
`gespro` com uma Organization por tenant, configurado em ficheiro versionado e importado (nunca clicado);
`User` perde `passwordHash` e ganha `keycloakSub` único; removes `PasswordResetToken`, `UserInvite`,
`TokenVerificacaoEmail` e `LoginAttempt`; acrescentas o serviço Keycloak ao `docker-compose.yml`.

**O que NÃO fazes:** não mexes nas 298 permissões nem nos 5 papéis — ficam em Postgres (ADR-0011). O
pipeline `createSafeAction` **não muda de forma**: continua a ler `session.user.permissions`. Se te
apanhares a editar as 231 actions, paraste de seguir o ADR.

**Regras que causam incidentes se ignoradas:**
- Provisionamento é **Keycloak primeiro, Postgres depois** (ADR-0013 §2). A ordem inversa deixa clientes
  pagos sem forma de entrar.
- Utilizador no Keycloak sem `User` local **não entra** — recusa explícita, nunca criação implícita.
- `tenantId` do token e `tenantId` do `User` local têm de coincidir; divergência recusa a sessão e regista
  incidente de segurança.
- A verificação de subscrição bloqueada (`ConfiguracaoFiscal.statusAtivo`) **fica no ERP**, não migra.
- Sessão de 15 minutos com renovação silenciosa.

**Gate mais exigente do que o habitual:** E2E verdes **contra um Keycloak real** levantado por
`docker-compose`, não contra duplo. Cenário novo obrigatório: expiração e renovação de sessão — é a
aresta conhecida do Auth.js v5 e não pode ser verificada por inspecção. Os 5 utilizadores demo
(`admin@demo.mz` / `demo1234`) continuam a funcionar.

**Não geres a migration** — entrega o schema e o orquestrador gera. É destrutiva e exige duas fases.

Saída: `pnpm check` + `pnpm gates` + `pnpm e2e` verdes, `CLAUDE.md` actualizado no arranque local, e
handoff em `docs/handoff/w8-identidade.md`.
