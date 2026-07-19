# Design: Notificações & Email

## Arquitectura

Domínio G/plataforma. Produtores (reset/convite/alertas/eventos de negócio) chamam `NotificacaoService.emitir`,
que persiste a notificação in-app e, conforme `PreferenciaNotificacao`, despacha para canais (email, futuramente
web-push). O `EmailProvider` é uma **porta** (interface) com adaptadores — segue inversão de dependência para
manter os serviços testáveis e sem I/O real em teste.

## Schema (`prisma/schema/plataforma.prisma`) — deltas

Enums: `TipoNotificacao`, `CanalNotificacao` (`IN_APP`, `EMAIL`), `EstadoEnvio`.
Modelos (`tenantId`, timestamps, índices em `userId`/`lida`):
- `Notificacao { id, tenantId, userId, tipo, titulo, mensagem, entidadeTipo?, entidadeId?, canal, lida, enviadoEm? }`
- `PreferenciaNotificacao { id, tenantId, userId, tipo, canais CanalNotificacao[], @@unique([userId,tipo]) }`

## Serviços e portas

- `src/server/services/plataforma/notificacao.service.ts` — `emitir/listar/marcarLida/marcarTodasLidas/naoLidasCount`.
- `src/server/email/provider.ts` — interface `EmailProvider`; `smtp.ts` (`nodemailer`, config via env),
  `resend.ts` (opcional), `noop.ts` (dev/teste). Selecção por `EMAIL_PROVIDER` env.
- `src/server/email/templates/` — `reset.tsx`, `convite.tsx`, `alerta.tsx` (pt-PT).

## Integração com produtores

- Auth.js: nos callbacks/actions de reset e convite, após gerar o token, chamar `EmailProvider.enviar` com o template.
- Cron `transporte-alertas`: para cada alerta calculado, `NotificacaoService.emitir` (idempotente por
  `(tipo, entidadeId, período)`), respeitando preferências.
- (Extensível) eventos de negócio (ex.: encomenda confirmada, folha paga) podem emitir notificações — fora do âmbito mínimo.

## UI (Server Components; folhas client; sem modais)

- `topbar`: sino com `naoLidasCount` (Server Component lê o serviço; badge client actualiza via revalidate).
- `/notificacoes` (lista + filtros em `searchParams` + marcar lida via Server Action) e `/notificacoes/preferencias`
  (`FormPage` com toggles por tipo/canal). Estados no `patterns/status-badge.tsx` se aplicável.

## Riscos e segurança

- Segredos SMTP só em `.env`/secret manager (coordenar com spec 16). Rate-limit/anti-abuso no reset (spec 17).
- Envio de email **fora** da `$transaction` de negócio (efeito colateral não deve reverter dados nem bloquear);
  usar padrão “persistir depois enviar”, com estado `EstadoEnvio` para reprocessar falhas.
