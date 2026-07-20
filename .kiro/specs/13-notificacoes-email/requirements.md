# Requisitos: Notificações & Email

## Introdução

O Auth.js suporta reset de password e convite de utilizador, mas **não há transporte de email** (sem
`nodemailer`/`resend` no `package.json`) — os fluxos ficam incompletos. O cron `api/cron/transporte-alertas`
calcula alertas **sem os entregar**. Não existe centro de notificações in-app nem modelo `Notificacao`.
Este spec cria a infraestrutura de notificações (in-app + email) e liga os produtores existentes.

Skills obrigatórias: `prisma-conventions`, `api-conventions`, `ui-conventions`.

## Requisitos

### Requisito 1 — Modelo e serviço de notificações

1. DEVE existir `Notificacao` (`tenantId`, `userId`/destinatário, `tipo`, `titulo`, `mensagem`, `entidadeTipo?`,
   `entidadeId?`, `lida Boolean @default(false)`, `canal`, `createdAt`) e `PreferenciaNotificacao` por utilizador
   (canais activos por tipo).
2. `notificacao.service.ts`: `emitir(dto, ctx)` (persiste + dispara canais conforme preferências), `listar`,
   `marcarLida`, `marcarTodasLidas`, `naoLidasCount`. Idempotência por `(tipo, entidadeId, userId)` quando aplicável.

### Requisito 2 — Transporte de email (abstração)

1. DEVE existir uma abstração `EmailProvider` (`enviar({para,assunto,html,texto})`) com implementação por
   **provider configurável via env** (recomendado SMTP `nodemailer` para portabilidade; adaptador `resend` opcional),
   e um provider **noop/log** em dev/teste. Sem credenciais no repo — só `.env`/segredos.
2. Templates de email (reset, convite, alerta) em pt-PT, com layout consistente.

### Requisito 3 — Ligar produtores existentes

1. Reset de password e convite de utilizador (Auth.js) DEVEM passar a **enviar email** através do `EmailProvider`
   (hoje o token é gerado mas não entregue).
2. O cron `transporte-alertas` DEVE **emitir notificações** (in-app + email conforme preferência) para os alertas
   que calcula (validade de documentos, manutenção). Idempotente (não repete o mesmo alerta no mesmo período).

### Requisito 4 — Centro de notificações (UI)

1. Um indicador no `topbar` com contador de não-lidas e um painel/rota `/notificacoes` (lista + marcar lida),
   Server Component + folhas client, sem modais. `/notificacoes/preferencias` para gerir canais.

## Critérios de Aceitação

1. `pnpm check`/`pnpm gates` verdes; `EmailProvider` injectável e testado com provider noop.
2. Isolamento multi-tenant (um utilizador só vê as suas notificações do seu tenant).
3. Reset/convite entregam email (verificado com provider fake); cron gera notificações idempotentes.
4. Smoke autenticado: emitir → aparece no centro → marcar lida → contador actualiza.

## Fontes

- Código: `src/app/api/cron/transporte-alertas/route.ts`, config Auth.js (reset/convite),
  `operacoes/alertas.service.ts`, `plataforma.prisma`.
- Convenções: `CLAUDE.md`, skills `prisma-conventions`/`api-conventions`/`ui-conventions`.
