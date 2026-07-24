# WS-STOCK — Operações de entrada, saída e transferência de stock

**Wave 7.1 · independente.** 1 worktree.

## O que já existe (backend pronto)
- Contratos transacionais em `stock.service.ts` / `stock.interface.ts`: `entradaStock(tx, data, ctx)`, `baixarStock(tx, data, ctx)` (saída), `registarTransferencia(data, ctx)` (devolve `{ movimentoSaida, movimentoEntrada }`), + saldos, localizações, reservas.
- Actions de UI já implementadas em `inventario.actions.ts`:
  - `registarEntradaStockAction` — abre `$transaction` e chama `entradaStock`.
  - `registarBaixaStockAction` — **saída** ad-hoc, abre `$transaction` e chama `baixarStock`.
  - `registarTransferenciaStockAction` — chama `registarTransferencia`.
  - Schemas: `EntradaStockSchema`, `BaixaStockSchema`, `TransferenciaStockSchema` (`@/lib/validations/stock`).
- UI existente: `inventario/movimentacoes/nova/page.tsx` (`'use client'`, ~32 KB), `inventario/movimentacoes/page.tsx` (lista), `inventario/transferencias/page.tsx` (só tabela, filtra `tipo === 'TRANSFERENCIA'`), `stock/movimentacao/*` (rota paralela).

## Diagnóstico / lacuna a validar
O backend das três operações existe. O trabalho é **garantir que a UI as invoca de forma completa e correta**. Verificar primeiro (auditoria no worktree):
1. `movimentacoes/nova/page.tsx` **importa e chama** `registarEntradaStockAction` / `registarBaixaStockAction` / `registarTransferenciaStockAction`? (a inspeção inicial mostrou imports de UI e `TipoMovimentacao`, mas não confirmou o import das actions — risco de o formulário ser *stub*/`toast` sem submeter à action real).
2. `transferencias/page.tsx` não tem fluxo de criação próprio (envia para `movimentacoes`). Falta uma experiência dedicada de "nova transferência".
3. Coerência entre as duas rotas (`/inventario/movimentacoes` e `/stock/movimentacao`) — evitar duplicação divergente; escolher uma como canónica.

## Requisitos
- **RF1 Entrada:** registar entrada de stock (produto, variante opcional, `localizacaoDestinoId` obrigatório, quantidade, motivo/documento de referência) → `registarEntradaStockAction`. Atualiza saldo.
- **RF2 Saída:** registar saída/baixa (produto, `localizacaoOrigemId` obrigatório, quantidade, motivo) → `registarBaixaStockAction`; bloquear com erro claro em `STOCK_INSUFICIENTE`.
- **RF3 Transferência:** mover entre localizações (origem, destino, produto, quantidade) → `registarTransferenciaStockAction`; mostra os dois movimentos gerados.
- **RF4** Cada operação valida no cliente (react-hook-form + o mesmo schema Zod) e no servidor; erros de negócio (`BusinessRuleError`) apresentados sem crash.
- **RF5** Após sucesso, `revalidate` das listas de movimentos/saldos e navegação de volta com toast.

## Design
- **Rota canónica:** consolidar em `inventario/movimentacoes/nova` com um seletor de **tipo de operação** (Entrada / Saída / Transferência) que condiciona os campos (localização destino vs origem vs ambas). Alternativa (preferível para clareza e *deep-linking*): três sub-rotas dedicadas `movimentacoes/nova/entrada`, `.../saida`, `.../transferencia`, cada uma com o seu formulário e a sua action. Recomenda-se **sub-rotas dedicadas** (menos estado condicional, URLs partilháveis, testes E2E simples).
- **Formulários** (`'use client'`): campos com *combobox* de produto e de localização (carregados via Server Component pai ou action de leitura), quantidade `Decimal`-safe (string→number no submit; nunca `Float`), `useActionState`.
- **Transferências:** `transferencias/page.tsx` ganha ação primária "Nova transferência" → `.../nova/transferencia`. A tabela continua a filtrar `TRANSFERENCIA`.
- **Não** alterar `stock.service.ts` nem os contratos (ADR-0003). Só UI + ligação. Se faltar uma action de leitura para popular *comboboxes* (produtos/localizações), reutilizar serviços existentes (`catalogoProdutoService`, `stockService.listarLocalizacoes`).
- **Decidir** o destino de `/stock/movimentacao`: redirecionar para a rota canónica de `/inventario/movimentacoes` ou remover, para não manter dois fluxos.

## Ficheiros afetados
`app/(dashboard)/inventario/movimentacoes/**`, `app/(dashboard)/inventario/transferencias/**`, possivelmente `app/(dashboard)/stock/**` (redirect). Sem alterações de schema/serviço esperadas.

## Tarefas
1. `T1` Auditar o `movimentacoes/nova` atual; decidir consolidação (recomendado: 3 sub-rotas).
2. `T2` Formulário de **entrada** ligado a `registarEntradaStockAction`.
3. `T3` Formulário de **saída** ligado a `registarBaixaStockAction` (tratar `STOCK_INSUFICIENTE`).
4. `T4` Formulário de **transferência** ligado a `registarTransferenciaStockAction` (mostra os 2 movimentos).
5. `T5` Ação "Nova transferência" na página de transferências; resolver rota `/stock/*` duplicada.
6. `T6` E2E: entrada aumenta saldo; saída falha em stock insuficiente; transferência gera saída+entrada e mantém saldo total.

## Critérios de aceitação
- As três operações persistem movimentos reais e refletem-se nos saldos/listas.
- Erros de negócio apresentados sem crash de RSC/runtime.
- `pnpm check` + `pnpm gates` + build + smoke + E2E verdes.
