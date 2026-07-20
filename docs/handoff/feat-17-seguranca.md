# Handoff: Spec 17 — Segurança & Hardening

**Branch**: `ws-17` | **Worktree**: `wt/feat-seguranca` | **Data**: 2026-07-20

---

## Âmbito implementado

### 1. CORS wildcard removido (`next.config.ts`)

O bloco `Access-Control-Allow-Origin: *` foi removido integralmente de `next.config.ts`.
Os cabeçalhos de segurança HTTP são agora geridos exclusivamente no `middleware.ts` (edge), que
tem acesso ao nonce CSP por pedido.

**CORS explícito**: disponível por handler via `src/lib/api/cors.ts` (`buildCorsHeaders`,
`corsPreflightResponse`). Usa allowlist `ALLOWED_ORIGINS` (env, separada por vírgulas). Nunca
emite `Access-Control-Allow-Origin: *`.

---

### 2. Cabeçalhos de segurança (`middleware.ts`)

Aplicados em todas as respostas (incluindo redirects auth):

| Cabeçalho | Valor |
|---|---|
| `Content-Security-Policy[-Report-Only]` | Nonce por pedido; `default-src 'self'`; `object-src 'none'`; `frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (apenas produção) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `x-nonce` | Nonce base64 (propagado ao layout RSC) |

**Modo CSP**: report-only por omissão (`Content-Security-Policy-Report-Only`). Activa enforce
via env `CSP_ENFORCE=true`. Permite validar a política sem partir a app em produção.

**Turbopack/dev**: `'unsafe-eval'` em `script-src` e `ws://localhost:*` em `connect-src`
apenas quando `NODE_ENV=development`.

**HSTS**: não emitido em dev (HTTP local). Sem `preload` por omissão (irreversível; requer
submissão explícita ao HSTS preload list quando o domínio de produção estiver fixo).

---

### 3. Rate limiting (`src/server/security/rate-limiter.ts`)

Abstracção `RateLimiter` (porta hexagonal) com backend em memória (adequado para dev e testes;
substituto Redis por adaptador em produção).

| Instância | Chave | Janela | Máximo |
|---|---|---|---|
| `passwordResetLimiter` | `${ip}::reset-request` | 15 min | 5 |
| `inviteLimiter` | `${userId}::invite` | 1 hora | 10 |
| `exportLimiter` | `${userId}::export` | 1 hora | 20 |
| `webhookLimiter` | `${ip}` | 1 min | 100 |

Rate limiting aplicado a:
- `POST /api/auth/reset-request` — pedido de recuperação de senha (novo endpoint)
- `POST /api/auth/invite` — criação de convite de utilizador (novo endpoint)
- `GET /api/contabilidade/reconciliacao/[id]/export`
- `GET /api/rh/payroll/mapas/inss`
- `GET /api/rh/payroll/mapas/irps`
- `GET /api/rh/payroll/[id]/recibo`

Resposta 429 inclui `Retry-After` em segundos e corpo JSON `{ error: { code: 'RATE_LIMIT_EXCEEDED' } }`.

---

### 4. Sessão Auth.js e CSRF

- Auth.js usa JWT (`session.strategy: 'jwt'`). Cookies de sessão geridos pelo Auth.js v5 com
  flags `HttpOnly`, `Secure` (em produção via `trustHost: true`), `SameSite=Lax` (padrão Auth.js).
- Server Actions do Next.js validam origem automaticamente (proteção CSRF built-in).
- Route Handlers mutáveis (POST) requerem `withApi` que verifica sessão; sem `Access-Control-Allow-Origin: *`,
  o browser bloqueia cross-origin sem cabeçalho explícito.

---

### 5. Scan de dependências (`pnpm audit`)

**Resultado em 2026-07-20**: 64 vulnerabilidades (7 low, 26 moderate, 31 high).

**Vulnerabilidades HIGH com acção pendente**:

| Pacote | CVE | Severidade | Fix |
|---|---|---|---|
| `xlsx` | GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9 | HIGH | Sem fix upstream (SheetJS abandonou npm). **Acção**: avaliar substituição por `exceljs` ou geração CSV própria (spec 15). |
| `next` | GHSA-h25m-26qc-wcjf | HIGH | Actualizar para `>=16.0.11` (spec 16 coordena upgrades de infra). |
| `tar` | GHSA-vfv6-92ff-j949 | HIGH | Dev dependency via Prisma; actualização automática na próxima release do Prisma CLI. |
| `@babel/core` | GHSA-4x5r-pxfx-6jf8 | LOW | Dev dependency via eslint. Actualização via eslint-config-next. |

**Job CI** (coordenar com spec 15): adicionar `pnpm audit --audit-level high` no pipeline; falhar em HIGH não resolvidos.

---

### 6. Revisão multi-tenant (skill `engineering:code-review`)

**Âmbito**: todos os `findUnique/update/delete/upsert` em `src/server/services/**/*.service.ts`.

**Padrão seguro encontrado** (sem BLOCKERs):

Todos os serviços seguem um de dois padrões defensivos:

**Padrão A** — pre-fetch + check explícito:
```typescript
const req = await db.requisicaoCompra.findUnique({ where: { id } });
if (!req || req.tenantId !== ctx.tenantId) throw new NotFoundError('...');
// update seguro pois o id foi validado acima
await db.requisicaoCompra.update({ where: { id }, data: ... });
```

**Padrão B** — findFirst com tenantId no where:
```typescript
const existente = await prisma.colaborador.findFirst({
  where: { id, tenantId: ctx.tenantId, deletedAt: null },
  select: { id: true },
});
if (!existente) throw new NotFoundError('...');
await prisma.colaborador.update({ where: { id }, data: ... });
```

**Serviços auditados**:
- `compras.service.ts` — Padrão A em todas as mutações. ✓
- `user-admin.service.ts` — helpers `findUser`/`findRole` usam `findFirst({ where: { id, tenantId } })`. ✓
- `rh.service.ts` — Padrão B (findFirst + tenantId). ✓
- `recrutamento.service.ts` — Padrão A (findUnique + check `vaga.tenantId !== ctx.tenantId`). ✓
- `tenant-admin.service.ts` — `upsert({ where: { tenantId } })` — escopo correcto. ✓
- `beneficios.service.ts`, `producao.service.ts`, `payroll.service.ts` — derivados do mesmo padrão. ✓

**Observação de boas práticas** (sem blocker):
Em `compras.service.ts:492-493`, dentro de uma transacção, `findUnique` é chamado sem `tenantId`
no `where`, mas o `docId` foi obtido de um `aprovacaoCompra` previamente validado com
`tenantId: ctx.tenantId`. O risco é teórico (a chave primária é UUID não-guessable e veio de
dentro do contexto tenant). Recomendação futura: usar `findFirst({ where: { id, tenantId } })`
mesmo dentro de transacções para uniformidade.

---

### 7. Ficheiros criados/modificados

| Ficheiro | Operação | Notas |
|---|---|---|
| `middleware.ts` | Reescrito | Headers de segurança + nonce CSP; auth check mantida |
| `next.config.ts` | Modificado | CORS wildcard removido; sem tocar em `output: 'standalone'` (spec 16) |
| `src/server/security/rate-limiter.ts` | Novo | Abstracção RateLimiter + instâncias pré-configuradas |
| `src/lib/api/cors.ts` | Novo | Utilitário CORS por allowlist para handlers específicos |
| `src/app/api/auth/reset-request/route.ts` | Novo | POST reset de senha + rate limit |
| `src/app/api/auth/invite/route.ts` | Novo | POST convite + rate limit |
| `src/app/api/contabilidade/reconciliacao/[id]/export/route.ts` | Modificado | +exportLimiter |
| `src/app/api/rh/payroll/mapas/inss/route.ts` | Modificado | +exportLimiter |
| `src/app/api/rh/payroll/mapas/irps/route.ts` | Modificado | +exportLimiter |
| `src/app/api/rh/payroll/[id]/recibo/route.ts` | Modificado | +exportLimiter |
| `src/server/security/__tests__/rate-limiter.test.ts` | Novo | 15 testes do RateLimiter |
| `src/server/security/__tests__/rate-limit-429.test.ts` | Novo | 4 testes de integração 429 |
| `src/server/security/__tests__/security-headers.test.ts` | Actualizado | Importa `src/lib/security/headers.ts` (sem cópia de lógica) |
| `src/lib/security/headers.ts` | Novo | Lógica de headers extraída; importada pelo middleware E pelos testes |
| `src/lib/api/__tests__/cors.test.ts` | Novo | 7 testes do utilitário CORS |

---

### 8. Gates finais

- `pnpm check`: verde (808 testes, 0 erros TypeScript/ESLint)
- `pnpm gates`: verde (dialog, use-client, data-imports)
- 41 novos testes de segurança: todos verdes
- `Access-Control-Allow-Origin: *` ausente de todo o codebase

---

### 9. Coordenação com outros specs

- **Spec 14** (observabilidade): `requestId` vem de `instrumentation.ts` — não colide com `middleware.ts`.
- **Spec 15** (CI/CD): adicionar `pnpm audit --audit-level high` ao pipeline; acção sobre `xlsx` e `next` version.
- **Spec 16** (infra): actualizar `next` para `>=16.0.11` (HIGH vuln); `output: 'standalone'` não foi tocado.
- **Nonce CSP → Layout**: para propagar o nonce ao `<Script>` do Next.js, o layout deve ler `headers().get('x-nonce')` (Server Component). Implementação recomendada quando a primeira `<Script>` externa for adicionada.

---

### 10. Variáveis de ambiente novas

| Variável | Descrição | Default |
|---|---|---|
| `CSP_ENFORCE` | `true` para Content-Security-Policy em enforce; `false`/ausente para report-only | `false` (report-only) |
| `ALLOWED_ORIGINS` | Lista de origens CORS permitidas separadas por vírgula | vazio (sem CORS) |

---

### 11. Follow-ups documentados (não corrigidos neste PR)

**Aviso 2 — Não activar CSP_ENFORCE sem smoke autenticado**
Antes de mudar `CSP_ENFORCE=true` em produção, executar smoke test completo com sessão autenticada
e verificar o relatório CSP (via `report-uri` ou DevTools). Possíveis fontes de violação que ainda
não foram testadas em produção: fontes Google externas (se adicionadas no futuro), scripts de
analytics externos, qualquer `<Script>` com `strategy="beforeInteractive"`.

**NIT 1 — `webhookLimiter` sem consumidor**
`src/server/security/rate-limiter.ts` exporta `webhookLimiter` (100 req/min por IP) mas não está
ainda aplicado a nenhum handler (não há endpoints de webhook externos implementados na Wave 5).
Aplicar quando os webhooks de entrada forem criados.

**NIT 2 — Colocação de `/api/auth/invite`**
O endpoint `POST /api/auth/invite` usa `withApi` (que exige sessão autenticada), o que é correcto.
No entanto, o path `/api/auth/` está na allowlist `PUBLIC_PATHS` do middleware, o que significa
que o middleware não vai redirecionar para login — a sessão é verificada pelo `withApi` em vez disso.
Alternativa futura: mover para `/api/platform/invite` para clareza semântica.

**NIT 3 — `compras.service.ts:492` findUnique→findFirst**
Dentro da transacção `decidirAprovacao`, `findUnique` é chamado sem `tenantId` explícito no `where`
(o ID vem de um registo pré-validado com tenantId scope, portanto sem risco prático). Para
uniformidade com o resto do codebase, converter para:
```typescript
await tx.requisicaoCompra.findFirst({ where: { id: docId!, tenantId: ctx.tenantId } })
```
