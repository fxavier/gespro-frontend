# Handoff — Spec 04: Operações de Stock (entrada / saída / transferência)

Branch: `ws-stock` (Wave 7.1)

## Resumo

Trabalho **exclusivamente de UI** (ADR-0003: o backend já existia). Ligou-se a UI às três
Server Actions transaccionais existentes em `inventario.actions.ts` — que não foram tocadas:

- `registarEntradaStockAction` → `stockService.entradaStock` (dentro de `$transaction`)
- `registarBaixaStockAction` → `stockService.baixarStock` (saída; lança `STOCK_INSUFICIENTE`)
- `registarTransferenciaStockAction` → `stockService.registarTransferencia` (devolve os 2 movimentos)

Schemas Zod reutilizados sem alteração: `EntradaStockSchema`, `BaixaStockSchema`,
`TransferenciaStockSchema` de `@/lib/validations/stock`.

## Diagnóstico da auditoria (T1)

Os dois formulários "nova movimentação" existentes eram **stubs/mock**, não ligados a nada:
- `inventario/movimentacoes/nova/page.tsx` — mock de *movimentação de ativos* (dados hardcoded,
  `setTimeout` + `console.log`, nunca chamava action). **Substituído.**
- `stock/movimentacao/nova/page.tsx` — mock com `<Select>` de produtos fixos, `toast` falso,
  `setTimeout`. **Redireccionado para a rota canónica.**

## Decisão de arquitectura (T1, T5)

- **Rota canónica:** `inventario/movimentacoes/**`. Adoptadas **sub-rotas dedicadas** por operação
  (recomendação da spec — URLs partilháveis, menos estado condicional):
  - `movimentacoes/nova` — Server Component seletor (3 cartões → sub-rotas)
  - `movimentacoes/nova/entrada` · `.../saida` · `.../transferencia`
- **Rota duplicada `/stock/movimentacao`** — consolidada: `page.tsx` e `nova/page.tsx` agora fazem
  `redirect()` para a canónica; componente órfão `stock/movimentacao/_components/movimentacao-table.tsx`
  removido.

## Ficheiros

**Novos**
- `inventario/movimentacoes/_data.ts` — carregador server-only de produtos + localizações
  (via `catalogoProdutoService.listarProdutos` + `stockService.listarLocalizacoes`), devolve DTOs
  serializados (client-safe).
- `inventario/movimentacoes/_components/entity-combobox.tsx` — Combobox reutilizável (cmdk + popover)
  com pesquisa; recebe opções já carregadas pelo SC pai (sem value-import server-only).
- `inventario/movimentacoes/_components/{entrada,saida,transferencia}-stock-form.tsx` — Client
  Components: `react-hook-form` + `zodResolver` (mesmo schema) + `useActionState`; `fieldErrors` do
  servidor via `setError`; `UnsavedChangesGuard`; toasts `sonner`.
- `inventario/movimentacoes/nova/{entrada,saida,transferencia}/page.tsx` — Server Components que
  carregam dados e passam aos formulários.
- `e2e/06-stock.spec.ts` — fluxos E2E (ver abaixo).

**Alterados**
- `inventario/movimentacoes/nova/page.tsx` — mock → SC seletor de operação.
- `inventario/movimentacoes/page.tsx` — adicionada acção primária "Nova Movimentação".
- `inventario/transferencias/page.tsx` — acção primária "Nova Transferência"
  (→ `.../nova/transferencia`); "Ver Todas" passou a secundária.
- `stock/movimentacao/page.tsx` + `stock/movimentacao/nova/page.tsx` — redirects para a canónica.

## Comportamento por operação

- **Entrada (RF1):** produto (combobox) + variante opcional + localização destino + quantidade +
  tipo/nº documento + motivo/observações → sucesso: toast + redirect para a listagem.
- **Saída (RF2):** produto + localização origem + quantidade → em `STOCK_INSUFICIENTE` mostra aviso
  claro (banner + toast) **sem crash** de RSC/runtime.
- **Transferência (RF3):** origem + destino (destino filtra a origem; refine origem≠destino do schema
  aplicado) → em sucesso mostra **painel com os dois movimentos gerados** (saída + entrada) e o saldo
  total mantém-se; botões "Ver transferências" / "Registar outra".

`Decimal`-safe: quantidade em `number` no cliente, `z.coerce.number()` no schema; nunca `Float`.
`varianteProdutoId`/documento opcionais normalizados a `undefined` antes do dispatch (evita falhar `cuid('')`).

## Gates corridos (neste worktree)

- `CI=true pnpm install` — OK
- `pnpm db:generate` — OK (Prisma Client v7.8.0)
- `pnpm check` — **verde** (tsc 0 erros, eslint 0 erros / warnings pré-existentes, 1148 testes ✓)
- `pnpm gates` — **verde** (dialog / use-client / data-imports: 0 violações)
- Lint dos ficheiros novos — 0 erros; 3 warnings `react-hooks/incompatible-library` do
  `form.watch()` (benignos; idênticos ao golden standard `nova-requisicao-form.tsx`).

## Não corrido aqui / a validar na integração

- **E2E / smoke autenticado:** a porta `:3000` já estava ocupada pelo dev server de outro worktree
  (partilhada entre os worktrees da Wave 7) e o Playwright tem `reuseExistingServer:true` — correr os
  specs aqui testaria o código do **outro** worktree. O ficheiro `e2e/06-stock.spec.ts` está escrito
  e passa lint/tsc; **o orquestrador deve corrê-lo na integração** (`pnpm e2e -- e2e/06-stock.spec.ts`).
  Cobre: acção "Nova Movimentação" + seletor; **entrada real** (sucesso + redirect); saída com
  quantidade enorme (sem crash / aviso stock insuficiente); página dedicada de transferência;
  redirect da rota legada.
- Assertions de delta de saldo e `STOCK_INSUFICIENTE` a nível de serviço já estão cobertas pelos
  testes de serviço existentes.

## Sem alterações de schema/serviço/contratos

Nenhuma migration gerada. `stock.service.ts` / `stock.interface.ts` intactos (ADR-0003).
