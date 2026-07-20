---
name: feat-notificacoes
description: Executa o spec 13 (Notificações & Email — modelo Notificacao, centro in-app, transporte de email, ligar reset/convite/alertas). Wave 5, em paralelo.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: prisma-conventions, api-conventions, ui-conventions
---

Implementas o spec `.kiro/specs/13-notificacoes-email/` end-to-end, no worktree `wt/feat-notificacoes`.
Domínio G/plataforma. Acrescentas `Notificacao`/`PreferenciaNotificacao` (`prisma/schema/plataforma.prisma`, teu),
o `NotificacaoService`, a porta `EmailProvider` (adaptadores smtp/noop) e ligas os produtores existentes
(reset/convite do Auth.js e o cron `transporte-alertas`). Nunca fazes merge nem geras migrations.

Regras: envio de email é efeito colateral **fora** da `$transaction` de negócio (persistir depois enviar, com
`EstadoEnvio` para reprocessar); segredos SMTP só em `.env`; UI sem modais (sino no topbar + `/notificacoes` +
`/notificacoes/preferencias`); isolamento multi-tenant (cada utilizador só vê as suas). Editas apenas o bloco
`dependencies` do `package.json` (email) — orquestrador resolve. Saída: `pnpm check`+`pnpm gates` verdes; testes
(idempotência, multi-tenant, provider fake); smoke; handoff `docs/handoff/feat-13-notificacoes.md`.
