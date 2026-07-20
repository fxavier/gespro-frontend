# Handoff: WS 13 — Notificações & Email

Branch: `ws-13` | Worktree: `wt/feat-notificacoes` | Data: 2026-07-20

## Resumo Executivo

Implementação end-to-end da infraestrutura de notificações in-app + email para o GestPro.
Inclui schema, serviço, porta de email com adaptadores, templates pt-PT, ligação dos produtores existentes e UI completa.

## Ficheiros Criados / Modificados

### Schema (aditivo)
- `prisma/schema/plataforma.prisma` — enums `TipoNotificacao`, `CanalNotificacao`, `EstadoEnvio`; modelos `Notificacao`, `PreferenciaNotificacao`

### Email Provider (porta + adaptadores)
- `src/server/email/provider.ts` — interface `EmailProvider` + `EnviarEmailDto`
- `src/server/email/noop.ts` — adaptador dev/teste (log na consola, sem I/O)
- `src/server/email/smtp.ts` — adaptador nodemailer (require dinâmico; tsc não exige nodemailer instalado)
- `src/server/email/index.ts` — factory: selecção por `EMAIL_PROVIDER` env (`smtp` | `noop`)
- `src/server/email/templates/layout.ts` — layout HTML base
- `src/server/email/templates/reset.ts` — template reset de password
- `src/server/email/templates/convite.ts` — template convite de utilizador
- `src/server/email/templates/alerta.ts` — template alerta (urgência CRITICO/AVISO/INFO)

### Serviço de Notificações
- `src/server/services/plataforma/notificacao.interface.ts` — tipos `EmitirNotificacaoDto`, `NotificacaoListItem`, `INotificacaoService`
- `src/server/services/plataforma/notificacao.service.ts` — implementação completa

### Validações
- `src/lib/validations/notificacoes.ts` — `FiltroNotificacoesSchema`, `MarcarLidaSchema`, `ActualizarPreferenciaSchema`

### Server Actions
- `src/server/actions/notificacoes.actions.ts` — `marcarNotificacaoLida`, `marcarTodasNotificacoesLidas`, `actualizarPreferenciaNotificacao`, `emitirNotificacao`

### Produtores Ligados (modificados)
- `src/server/auth/password-reset.ts` — `createPasswordResetToken` envia email de reset; `createUserInvite` envia email de convite
- `src/app/api/cron/transporte-alertas/route.ts` — emite notificações por alerta (idempotente por entidadeId+tipo+userId/dia)

### UI
- `src/components/layout/NotificationBell.tsx` — sino CC com badge de contagem; Link para `/notificacoes`
- `src/components/layout/AppHeader.tsx` — slot `notificationSlot?: ReactNode` (aceita SC do layout)
- `src/app/(dashboard)/layout.tsx` — `NotificationBellServer` SC (async, count real); passa como slot ao AppHeader
- `src/app/(dashboard)/notificacoes/page.tsx` — listagem SC + FilterBar + Suspense
- `src/app/(dashboard)/notificacoes/_components/notificacoes-list.tsx` — CC com marcar lida/todas
- `src/app/(dashboard)/notificacoes/preferencias/page.tsx` — SC com Suspense
- `src/app/(dashboard)/notificacoes/preferencias/_components/preferencias-form.tsx` — CC com toggles

### Patterns (aditivo)
- `src/components/patterns/status-badge.tsx` — estados `FALHA`, `NAO_LIDA`, `LIDA`, `IN_APP` adicionados

### Testes
- `src/server/services/plataforma/__tests__/notificacao.service.test.ts` — 15 testes (idempotência, multi-tenant, marcarLida, preferências)
- `src/server/email/__tests__/email.test.ts` — 15 testes (noop provider, templates, provider fake injectável)

### Dependências
- `package.json` → `nodemailer@^7.0.7` adicionado a `dependencies`

## Decisões Técnicas

### Padrão "Persistir Depois Enviar"
`notificacaoService.emitir` persiste a `Notificacao` com `EstadoEnvio=PENDENTE` **antes** de qualquer I/O de email. O envio ocorre depois via `void enviarEmailNotificacao(...)` fora de qualquer `$transaction`. Em caso de falha, o estado fica `FALHA` com `erroEnvio` (truncado a 500 chars) para reprocessamento futuro.

### require() Dinâmico para nodemailer
`smtp.ts` usa `require('nodemailer')` com type cast inline (não `import ... from 'nodemailer'`) para que `tsc --noEmit` passe mesmo sem o pacote instalado. O orquestrador instala o pacote via `pnpm install` antes do smoke.

### Idempotência do cron
`notificacaoService.emitir` verifica se já existe uma notificação com o mesmo `(tipo, entidadeId, userId)` na mesma data civil. Se existir, devolve o id existente sem criar duplicado.

### Isolamento Multi-tenant
- `notificacaoService.listar` filtra sempre `{ tenantId, userId }` — utilizador de tenant diferente obtém lista vazia.
- `notificacaoService.marcarLida` verifica `tenantId + userId` antes do UPDATE; divergência → `NotFoundError` (404, nunca 403).
- `notificacaoService.actualizarPreferencia` inclui `tenantId` no `create` do upsert.

### Sino no Topbar (slot pattern)
`AppHeader` é `'use client'` (sessão next-auth). Para injectar dados do servidor (contagem de não-lidas), o `(dashboard)/layout.tsx` (Server Component) cria um `<NotificationBellServer>` (async SC) envolvido em Suspense e passa-o como prop `notificationSlot` ao AppHeader. Evita tornar o header um SC ou fazer fetch no cliente.

## Variáveis de Ambiente Necessárias

```
# Email Provider (opcional — default: noop)
EMAIL_PROVIDER=smtp         # ou "noop" para dev/teste

# SMTP (obrigatório quando EMAIL_PROVIDER=smtp)
SMTP_HOST=smtp.example.com
SMTP_PORT=587               # 465 para SSL
SMTP_USER=noreply@empresa.mz
SMTP_PASS=<segredo>         # nunca no repo
SMTP_FROM="GestPro <noreply@empresa.mz>"  # opcional
```

## Nota para o Orquestrador

1. Adicionar `'Notificacao'` e `'PreferenciaNotificacao'` a `TENANT_MODELS` em `src/server/db/tenant-extension.ts` (ou confirmar que o auto-derivado de `Prisma.dmmf` já os apanha — qualquer modelo com `tenantId` é apanhado automaticamente).
2. Migration `11xx_notificacoes` deve criar tabelas `Notificacao` e `PreferenciaNotificacao` com os enums e índices definidos em `plataforma.prisma`.
3. Correr `pnpm install` para instalar `nodemailer@^7.0.7`.

## Gaps / Trabalho Futuro

- Reprocessamento automático de notificações com `EstadoEnvio=FALHA` (cron separado).
- Paginação next/prev na lista `/notificacoes` (cursor implementado no serviço, UI usa apenas a primeira página).
- Web push (canal `PUSH`) — estrutura de canais já suporta extensão.
- Rate limiting no endpoint de reset (spec 17).
- Seed de `PreferenciaNotificacao` com defaults por tenant (actualmente usa os defaults em código).
- RBAC: permissões `notificacoes:ver` e `notificacoes:gerir_prefs` não adicionadas ao `prisma/seed/rbac.ts` (actions sem `permission` guard por defeito; adicionar no seed do orquestrador).
