# Plano de Implementação: Contagem e Reconciliação de Stock

Depende de: WS A (contratos `entradaStock`/`baixarStock`) e, opcional, WS D
(`registarLancamentoContabilistico`). Ambos já implementados.

- [ ] 1. Schema e migração
  - [ ] 1.1 Enums `StatusContagemStock`/`StatusItemContagem` + modelos `ContagemStock`/`ItemContagemStock`
  - [ ] 1.2 Acrescentar `CONTAGEM_STOCK` a `TipoSerieDocumento` (financas.prisma)
  - [ ] 1.3 Migração `05xx_contagem_stock`

- [ ] 2. Validações (`src/lib/validations/inventario-contagem.ts`)
  - [ ] 2.1 `AbrirContagemSchema`, `RegistarItemSchema`, `ReconciliarSchema`, `FilterContagemSchema`

- [ ] 3. Serviço (`src/server/services/inventario/contagem-stock.service.ts`)
  - [ ] 3.1 `abrirContagem` com snapshot de `SaldoStock` no âmbito
  - [ ] 3.2 `registarContagemItem` (cálculo de `diferenca`) + `justificar`
  - [ ] 3.3 `reconciliar` transaccional com `entradaStock`/`baixarStock` (WS A) + `movimentoStockId`
  - [ ] 3.4 Lançamento contabilístico opcional de regularização (WS D)
  - [ ] 3.5 Limiar/aprovação de discrepâncias; `concluir`/`cancelar`/`listar`/`obter`
  - [ ] 3.6 Interface `contagem-stock.interface.ts` + mapa `TRANSICOES_CONTAGEM`

- [ ] 4. Testes
  - [ ] 4.1 Unit ≥80%
  - [ ] 4.2 Property test: Σ ajustes == Σ diferenças; máquina de estados
  - [ ] 4.3 Integração real contra Postgres (reconciliar → movimentos de stock)
  - [ ] 4.4 Isolamento multi-tenant

- [ ] 5. Actions (`src/server/actions/inventario.actions.ts`)
  - [ ] 5.1 `abrir/registar/justificar/reconciliar/concluir/cancelar` + permissões `inventario:contagens:*`

- [ ] 6. UI (sem modais)
  - [ ] 6.1 `/inventario/contagens` (lista) + `/nova` (abertura)
  - [ ] 6.2 `/inventario/contagens/[id]` (registo + diffs + Reconciliar/Concluir)
  - [ ] 6.3 Decisão de rota: renomear `/inventario/reconciliacao` (ativos) → `/inventario/ativos/reconciliacao`
  - [ ] 6.4 Estados no mapa único `status-badge.tsx`

- [ ] 7. Verificação
  - [ ] 7.1 `pnpm check` + `pnpm gates` verdes
  - [ ] 7.2 Seed de demonstração (uma contagem com discrepâncias)
  - [ ] 7.3 Smoke autenticado: abrir → contar → reconciliar → concluir
