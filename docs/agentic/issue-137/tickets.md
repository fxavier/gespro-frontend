# Tickets — issue #137 (ver `spec.md`)

- [ ] 0. [BLOCKING][orquestrador] Migração: `ANULADO` + `motivoAnulacao`
  ✅ Gate: `prisma migrate diff … --script` devolve *empty migration*; `npx prisma validate`.

- [ ] 1. [BLOCKING] Backend: editar e anular rascunho (serviço + actions + auditoria)
  - 1.1 `contabilidade.interface.ts`: `TRANSICOES_LANCAMENTO`, tipo `StatusLancamento`.
  - 1.2 `validations/contabilidade.ts`: `EditarLancamentoSchema`, `AnularLancamentoSchema`, `StatusLancamentoEnum`.
  - 1.3 `contabilidade.service.ts`: `editarLancamentoRascunho`, `anularLancamentoRascunho`, `listarLancamentos` sem anulados por omissão.
  - 1.4 `audit-extension.ts`: `Lancamento`, `PartidaLancamento` em `AUDIT_MODELS`.
  - 1.5 `contabilidade.actions.ts`: `editarLancamento`, `anularLancamento`.
  ✅ Gate: `npx vitest run src/server/services/financas/__tests__/lancamento-rascunho.test.ts` (I1–I6) e `state-machines.property.test.ts` verdes; `pnpm gates` (gate-periodo) verde.

- [ ] 2. Frontend: Editar/Anular visíveis só em RASCUNHO com permissão
  - 2.1 `[id]/page.tsx` e `_components/lancamentos-table.tsx`: botões condicionados a estado + permissão.
  - 2.2 `[id]/editar/page.tsx` + formulário (reutiliza `novo-lancamento-form.tsx` em modo edição).
  ✅ Gate: E2E `e2e/24-lancamento-rascunho.spec.ts` — criar rascunho, editar partidas/histórico, ver valores novos; operador sem permissão não vê os botões.

- [ ] 3. UI & feedback: anular com motivo, badge e textos
  - 3.1 `[id]/anular/page.tsx` + formulário com motivo.
  - 3.2 `status-badge.tsx`: `ANULADO`; filtro de estado na lista.
  - 3.3 textos de orientação (estornar de rascunho → ligações a Editar/Anular); detalhe mostra o motivo.
  ✅ Gate: E2E — anular com motivo → sai da lista por omissão, aparece no filtro «Anulado» com o motivo no detalhe; `pnpm check`, `pnpm gates`, `pnpm build` verdes.
