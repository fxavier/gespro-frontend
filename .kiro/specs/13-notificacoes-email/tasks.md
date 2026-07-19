# Plano de Implementação: Notificações & Email

Depende de: fundação (Auth.js, cron de alertas). Worktree `wt/feat-notificacoes`.
Skills: `prisma-conventions`, `api-conventions`, `ui-conventions`. Migrations só o orquestrador.

- [ ] 1. Schema e migração
  - [ ] 1.1 Enums `TipoNotificacao`/`CanalNotificacao`/`EstadoEnvio`; modelos `Notificacao`, `PreferenciaNotificacao`
  - [ ] 1.2 Migração `11xx_notificacoes` (orquestrador)

- [ ] 2. Serviço de notificações
  - [ ] 2.1 `notificacao.service.ts` (emitir/listar/marcarLida/marcarTodasLidas/naoLidasCount) + isolamento tenant
  - [ ] 2.2 Testes (≥80%) incl. idempotência e multi-tenant

- [ ] 3. Transporte de email (porta + adaptadores)
  - [ ] 3.1 Interface `EmailProvider` + `smtp` (nodemailer) + `noop` (teste) + selecção por env
  - [ ] 3.2 Templates pt-PT (reset, convite, alerta)
  - [ ] 3.3 Teste com provider fake (assert de conteúdo, sem I/O real)

- [ ] 4. Ligar produtores
  - [ ] 4.1 Reset de password e convite → enviam email
  - [ ] 4.2 Cron `transporte-alertas` → emite notificações idempotentes (in-app + email por preferência)

- [ ] 5. UI (sem modais)
  - [ ] 5.1 Sino + contador no topbar; `/notificacoes` (lista + marcar lida via action)
  - [ ] 5.2 `/notificacoes/preferencias` (FormPage por tipo/canal)

- [ ] 6. Verificação
  - [ ] 6.1 `pnpm check` + `pnpm gates` verdes
  - [ ] 6.2 Smoke autenticado: emitir → centro → marcar lida → contador; reset/convite disparam email (fake)
  - [ ] 6.3 Handoff `docs/handoff/feat-13-notificacoes.md`
