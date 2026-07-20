# WS A — Catálogo & Inventário: Handoff Wave 1+2 (Contratos + Implementação)

Agente: `domain-inventario`  
Wave: 2 (implementação completa — tasks 2.1–2.4)  
Data: 2026-07-10

---

## 1. Ficheiros entregues

### Wave 1 (contratos)

| Ficheiro | Conteúdo |
|---|---|
| `prisma/schema/inventario.prisma` | Todos os modelos e enums do WS A |
| `src/lib/validations/produtos.ts` | Zod: CategoriaProduto, Produto, VarianteProduto |
| `src/lib/validations/stock.ts` | Zod: Localizacao, contratos EntradaStock/BaixaStock/ReservaStock, filtros |
| `src/lib/validations/inventario-ativos.ts` | Zod: CategoriaAtivo, Ativo, Movimentação, Manutenção, Amortização, InventárioFísico |
| `src/server/services/types.ts` | Tipos partilhados (Ctx, TxClient, PaginatedResult) — ADR-0003 fonte única |
| `src/server/services/inventario/types.ts` | Re-exports + BusinessRuleCode para o módulo |
| `src/server/services/inventario/catalogo.interface.ts` | Interface ICatalogoProdutoService |
| `src/server/services/inventario/stock.interface.ts` | Interface IStockService + contratos expostos + TRANSICOES_RESERVA_STOCK |
| `src/server/services/inventario/ativos.interface.ts` | Interface IAtivoService + TRANSICOES_ATIVO |
| `src/server/services/inventario/manutencao.interface.ts` | Interface IManutencaoAtivoService + TRANSICOES_MANUTENCAO_ATIVO |
| `src/server/services/inventario/inventario-fisico.interface.ts` | Interface IInventarioFisicoService + TRANSICOES_INVENTARIO_FISICO |
| `src/server/services/inventario/amortizacao.interface.ts` | Interface IAmortizacaoService |

### Wave 2 (implementação — tasks 2.1–2.4)

| Ficheiro | Conteúdo | Task |
|---|---|---|
| `src/server/services/inventario/state-machine.ts` | Helper `transitar()` — lança TRANSICAO_INVALIDA | 2.1 |
| `src/server/services/inventario/catalogo.service.ts` | `catalogoProdutoService` — CRUD produtos/variantes/categorias | 2.1 |
| `src/server/services/inventario/stock.service.ts` | `stockService` — localizações, saldos, movimentos, 5 contratos B/C/E | 2.1 |
| `src/server/services/inventario/ativos.service.ts` | `ativosService` — ciclo de vida ativos + documentos + movimentações | 2.1 |
| `src/server/services/inventario/manutencao.service.ts` | `manutencaoService` — CRUD + transições + alertas | 2.1 |
| `src/server/services/inventario/inventario-fisico.service.ts` | `inventarioFisicoService` — inventário, contagem, reconciliação | 2.1 |
| `src/server/services/inventario/amortizacao.service.ts` | `amortizacaoService` — plano + processamento mensal + abate | 2.1 |
| `src/server/services/inventario/inventario.test.ts` | 38 testes (property + unit): máquinas de estado + invariantes stock + amortização | 2.2 |
| `src/server/actions/inventario.actions.ts` | 35 actions via `createSafeAction` com permissões e revalidate | 2.3 |
| `prisma/seed/inventario.ts` | `seedInventario(prisma, tenantId)` — idempotente, dados de exemplo | 2.4 |

---

## 2. Entidades criadas (proprietário: WS A)

| Modelo Prisma | Tipo | Soft delete |
|---|---|---|
| `CategoriaProduto` | referência | sim (deletedAt) |
| `Produto` | referência | sim (deletedAt) |
| `VarianteProduto` | referência | não |
| `Localizacao` | referência | sim (deletedAt) |
| `MovimentoStock` | transaccional append-only | não |
| `SaldoStock` | snapshot mutável | não |
| `ReservaStock` | estado (ATIVA/CONSUMIDA/LIBERADA/EXPIRADA) | não |
| `CategoriaAtivo` | referência | sim (deletedAt) |
| `Ativo` | referência (ciclo de vida) | sim (deletedAt) |
| `DocumentoAtivo` | anexo | não |
| `MovimentacaoAtivo` | transaccional append-only | não |
| `ManutencaoAtivo` | estado (máquina de estado) | não |
| `PecaManutencao` | detalhe de manutenção | não |
| `AmortizacaoCalculo` | transaccional append-only | não |
| `InventarioFisico` | estado (máquina de estado) | não |
| `MembroEquipeInventario` | detalhe de inventário | não |
| `ContagemInventario` | detalhe de inventário | não |

---

## 3. Enums criados

| Enum | Valores |
|---|---|
| `TipoLocalizacao` | ARMAZEM, ESCRITORIO, DEPARTAMENTO, FILIAL, PRATELEIRA, SALA, ANDAR, AREA_TECNICA |
| `TipoMovimentoStock` | ENTRADA, SAIDA, AJUSTE, TRANSFERENCIA_ENTRADA, TRANSFERENCIA_SAIDA |
| `StatusReservaStock` | ATIVA, CONSUMIDA, LIBERADA, EXPIRADA |
| `EstadoAtivo` | NOVO, EM_USO, EM_MANUTENCAO, OBSOLETO, BAIXADO, EM_TRANSFERENCIA |
| `TipoMovimentacaoAtivo` | ENTRADA, SAIDA, TRANSFERENCIA, EMPRESTIMO, DEVOLUCAO, BAIXA, AJUSTE |
| `TipoManutencaoAtivo` | PREVENTIVA, CORRETIVA, INSPECAO, CALIBRACAO |
| `StatusManutencaoAtivo` | AGENDADA, EM_ANDAMENTO, ORCAMENTO, CONCLUIDA, CANCELADA |
| `PrioridadeManutencao` | BAIXA, MEDIA, ALTA, CRITICA |
| `MetodoAmortizacao` | LINEAR, DIGITOS_ANOS, UNIDADES_PRODUCAO, SALDOS_DECRESCENTES |
| `StatusInventarioFisico` | PLANEJADO, AGENDADO, EM_ANDAMENTO, PAUSADO, CONCLUIDO, CANCELADO |
| `TipoDiscrepanciaInventario` | NAO_ENCONTRADO, LOCAL_DIFERENTE, RESPONSAVEL_DIFERENTE, ESTADO_DIFERENTE, DADOS_INCORRETOS |
| `TipoDocumentoAtivo` | MANUAL, CERTIFICADO, GARANTIA, NOTA_FISCAL, OUTRO |

---

## 4. Máquinas de estado

### 4.1 EstadoAtivo

```
NOVO ──────────────────────────────────────────────────▶ EM_USO
NOVO ────────────────────────────────────────────────────▶ BAIXADO
EM_USO ─────────────────────────────────────────────────▶ EM_MANUTENCAO
EM_USO ─────────────────────────────────────────────────▶ EM_TRANSFERENCIA
EM_USO ─────────────────────────────────────────────────▶ OBSOLETO
EM_USO ─────────────────────────────────────────────────▶ BAIXADO
EM_MANUTENCAO ───────────────────────────────────────────▶ EM_USO
EM_MANUTENCAO ───────────────────────────────────────────▶ OBSOLETO
EM_MANUTENCAO ───────────────────────────────────────────▶ BAIXADO
EM_TRANSFERENCIA ────────────────────────────────────────▶ EM_USO
EM_TRANSFERENCIA ────────────────────────────────────────▶ BAIXADO
OBSOLETO ────────────────────────────────────────────────▶ BAIXADO
BAIXADO (terminal)
```

Mapa: `TRANSICOES_ATIVO` em `ativos.interface.ts`.

### 4.2 StatusManutencaoAtivo

```
AGENDADA ────────────────────▶ EM_ANDAMENTO
AGENDADA ────────────────────▶ CANCELADA
EM_ANDAMENTO ────────────────▶ ORCAMENTO
EM_ANDAMENTO ────────────────▶ CONCLUIDA
EM_ANDAMENTO ────────────────▶ CANCELADA
ORCAMENTO ───────────────────▶ EM_ANDAMENTO
ORCAMENTO ───────────────────▶ CANCELADA
CONCLUIDA (terminal)
CANCELADA (terminal)
```

Conflito #10 resolvido: `em_curso` (duplicado de `em_andamento`) removido.  
Mapa: `TRANSICOES_MANUTENCAO_ATIVO` em `manutencao.interface.ts`.

### 4.3 StatusInventarioFisico

```
PLANEJADO ───────────────────▶ AGENDADO
PLANEJADO ───────────────────▶ CANCELADO
AGENDADO ────────────────────▶ EM_ANDAMENTO
AGENDADO ────────────────────▶ CANCELADO
EM_ANDAMENTO ────────────────▶ PAUSADO
EM_ANDAMENTO ────────────────▶ CONCLUIDO
EM_ANDAMENTO ────────────────▶ CANCELADO
PAUSADO ─────────────────────▶ EM_ANDAMENTO
PAUSADO ─────────────────────▶ CANCELADO
CONCLUIDO (terminal)
CANCELADO (terminal)
```

Mapa: `TRANSICOES_INVENTARIO_FISICO` em `inventario-fisico.interface.ts`.

### 4.4 StatusReservaStock

```
ATIVA ───────────────────────▶ CONSUMIDA (via confirmarConsumoStock)
ATIVA ───────────────────────▶ LIBERADA  (via libertarStock)
ATIVA ───────────────────────▶ EXPIRADA  (via job de expiração)
CONSUMIDA (terminal)
LIBERADA  (terminal)
EXPIRADA  (terminal)
```

Mapa: `TRANSICOES_RESERVA_STOCK` em `stock.interface.ts`.

---

## 5. Modelos a registar em TENANT_MODELS

O orquestrador deve acrescentar em `src/server/db/tenant-extension.ts`:

```ts
// WS A — Catálogo & Inventário
'CategoriaProduto', 'Produto', 'VarianteProduto',
'Localizacao',
'MovimentoStock', 'SaldoStock', 'ReservaStock',
'CategoriaAtivo', 'Ativo', 'DocumentoAtivo',
'MovimentacaoAtivo', 'ManutencaoAtivo', 'PecaManutencao', 'AmortizacaoCalculo',
'InventarioFisico', 'MembroEquipeInventario', 'ContagemInventario',
```

Soft delete (SOFT_DELETE_MODELS): `'CategoriaProduto', 'Produto', 'Localizacao', 'CategoriaAtivo', 'Ativo'`

---

## 6. Contratos expostos a outros Workstreams

**Ficheiro de referência (fonte única):** `src/server/services/inventario/stock.interface.ts`

**ADR-0003 ponto 1:** B/C/E importam os tipos directamente — proibido criar espelhos locais.

```ts
// Como importar nos consumidores (B, C, E):
import type {
  IStockService,
  EntradaStockInput,
  BaixaStockInput,
  ReservaStockInput,
  ReservaStockResult,
  MovimentoStockDto,
} from '@/server/services/inventario/stock.interface';
```

**ADR-0003 ponto 6:** `tx` é o **1.º parâmetro OBRIGATÓRIO** em todos os contratos transaccionais.

### 6.1 `entradaStock(tx, data, ctx)`

```ts
entradaStock(
  tx: TxClient,
  data: EntradaStockInput,
  ctx: Ctx,
): Promise<MovimentoStockDto>
```

- **Consumidores:** WS B (RecebimentoCompra), WS E (output de OrdemProducao)
- **Efeito:** cria `MovimentoStock(ENTRADA)` + incrementa `SaldoStock.saldo`
- `localizacaoDestinoId` **obrigatório** no input
- NÃO aceita `tenantId` (vem do ctx) nem `custo`/`unidadeMedida`

### 6.2 `baixarStock(tx, data, ctx)`

```ts
baixarStock(
  tx: TxClient,
  data: BaixaStockInput,
  ctx: Ctx,
): Promise<MovimentoStockDto>
```

- **Consumidores:** WS C (POS/Venda directa), WS E (consumo ad-hoc)
- **Efeito:** cria `MovimentoStock(SAIDA)` + decrementa `SaldoStock.saldo`
- `localizacaoOrigemId` **obrigatório** no input
- NÃO aceita `tenantId` nem `custo`/`unidadeMedida`
- **Lança** `BusinessRuleError('STOCK_INSUFICIENTE')` se `saldo < quantidade`

### 6.3 `reservarStock(tx, data, ctx)` → `{ reservaId }`

```ts
reservarStock(
  tx: TxClient,
  data: ReservaStockInput,
  ctx: Ctx,
): Promise<ReservaStockResult>  // { reservaId: string }
```

- **Consumidores:** WS C (confirmação de venda), WS E (planeamento de produção)
- **Efeito:** cria `ReservaStock(ATIVA)` + incrementa `SaldoStock.saldoReservado`
- Retorna `{ reservaId }` — guardar para confirmar/libertar depois
- NÃO aceita `tenantId` nem `custo`/`unidadeMedida`
- **Lança** `BusinessRuleError('STOCK_INSUFICIENTE')` se `saldoDisponivel < quantidade`

### 6.4 `confirmarConsumoStock(tx, reservaId, ctx)`

```ts
confirmarConsumoStock(
  tx: TxClient,
  reservaId: string,
  ctx: Ctx,
): Promise<MovimentoStockDto>
```

- **Consumidores:** WS C (entrega/facturação), WS E (conclusão de produção)
- **Efeito:** `ReservaStock(CONSUMIDA)` + `MovimentoStock(SAIDA)` + decrementa `saldo` e `saldoReservado`
- Transição válida: `ATIVA → CONSUMIDA`

### 6.5 `libertarStock(tx, reservaId, ctx)`

```ts
libertarStock(
  tx: TxClient,
  reservaId: string,
  ctx: Ctx,
): Promise<void>
```

- **Consumidores:** WS C (cancelamento de venda), WS E (cancelamento de produção)
- **Efeito:** `ReservaStock(LIBERADA)` + decrementa `SaldoStock.saldoReservado`
- Transição válida: `ATIVA → LIBERADA`
- **Não gera** `MovimentoStock`

---

## 7. FKs cross-domínio (escalares — sem @relation)

| Campo | Modelo | WS destino | Nota |
|---|---|---|---|
| `fornecedorId` | `Ativo`, `ManutencaoAtivo` | B | Fornecedor |
| `responsavelId` | `Ativo`, `ManutencaoAtivo`, `InventarioFisico`, `Localizacao` | Auth/E | User ou Colaborador |
| `departamentoId` | `Ativo` | E | Departamento |
| `projetoId` | `Ativo` | E | Projeto |
| `tecnicoId` | `ManutencaoAtivo` | E | Colaborador/User |
| `contaDebitoId`, `contaCreditoId` | `AmortizacaoCalculo` | D | ContaPGC |
| `lancamentoContabilId` | `AmortizacaoCalculo` | D | Lancamento |

---

## 8. Conflitos e ADRs aplicados

| # | Conflito / ADR | Resolução aplicada |
|---|---|---|
| #9 | Ativo/Localizacao/CategoriaAtivo sem tenantId | `tenantId String` adicionado; modelos registados em TENANT_MODELS |
| #10 | `em_andamento` + `em_curso` duplicados; typo `confirmdadaPor` | Enum `StatusManutencaoAtivo` sem `EM_CURSO`; campo renomeado para `confirmadaPor` |
| ADR-0003 A4 | `SaldoStock` unicidade real com `varianteProdutoId` nullable | Sentinela `@default("")` (non-null) + `@@unique([tenantId, produtoId, varianteProdutoId, localizacaoId])`. A @relation com VarianteProduto foi omitida (FK escalar). O orquestrador pode adicionar índice parcial SQL: `CREATE UNIQUE INDEX "SaldoStock_no_variant_key" ON "SaldoStock" ("tenantId", "produtoId", "localizacaoId") WHERE "varianteProdutoId" = ''` |
| ADR-0003 A5 | `import 'server-only'` em falta | Adicionado a todos os 7 ficheiros de interface e types.ts |
| ADR-0003 p.1 | Tipos-espelho nos consumidores | `IStockService`, `EntradaStockInput`, `BaixaStockInput`, `ReservaStockInput`, `ReservaStockResult` re-exportados de `stock.interface.ts` |
| ADR-0003 p.6 | `tx` opcional e no fim | `tx: TxClient` agora é 1.º parâmetro **obrigatório** nos 5 contratos transaccionais |
| ADR-0003 p.6 | `reservarStock` devolvia DTO completo | Agora devolve `ReservaStockResult = { reservaId: string }` |
| ADR-0003 p.6 | `TxClient` disperso por módulo | `Ctx`, `TxClient`, `PaginatedResult` centralizados em `src/server/services/types.ts` |

---

## 9. Mapa páginas → actions (para agente UI — spec 03)

| Página (rota) | Actions relevantes (Wave 2) | Serviço |
|---|---|---|
| `/inventario/produtos` | `criarProduto`, `actualizarProduto`, `arquivarProduto` | ICatalogoProdutoService |
| `/inventario/produtos/[id]` | `actualizarProduto`, `criarVariante`, `actualizarVariante`, `removerVariante` | ICatalogoProdutoService |
| `/inventario/categorias` | `criarCategoria`, `actualizarCategoria`, `arquivarCategoria` | ICatalogoProdutoService |
| `/inventario/stock` | `registarTransferencia` | IStockService |
| `/inventario/localizacoes` | `criarLocalizacao`, `actualizarLocalizacao`, `desactivarLocalizacao` | IStockService |
| `/inventario/ativos` | `criarAtivo`, `actualizarAtivo`, `transitarEstado`, `arquivarAtivo` | IAtivoService |
| `/inventario/ativos/[id]` | `actualizarAtivo`, `transitarEstado`, `adicionarDocumento`, `removerDocumento`, `registarMovimentacao`, `confirmarMovimentacao` | IAtivoService |
| `/inventario/ativos/categorias` | `criarCategoria`, `actualizarCategoria`, `arquivarCategoria` | IAtivoService |
| `/inventario/manutencao` | `criarManutencao`, `transitarStatus` | IManutencaoAtivoService |
| `/inventario/manutencao/[id]` | `actualizarManutencao`, `transitarStatus` | IManutencaoAtivoService |
| `/inventario/inventario-fisico` | `criarInventario`, `transitarStatus` | IInventarioFisicoService |
| `/inventario/inventario-fisico/[id]` | `actualizarInventario`, `transitarStatus`, `adicionarMembro`, `registarContagem`, `justificarDiscrepancia`, `reconciliar` | IInventarioFisicoService |
| `/inventario/amortizacao` | `processarAmortizacaoMensal` | IAmortizacaoService |
| `/inventario/ativos/export` | Route Handler CSV | IAtivoService.exportarRelatorioAtivos |
| `/inventario/stock/export` | Route Handler CSV | IStockService.listarMovimentos |

---

## 10. Dúvidas / decisões pendentes

1. **IVA moçambicano**: Validado como `0` (isento) ou `0.16` (16%). Confirmar se existem outras taxas (5%, 17%?) aplicáveis a categorias específicas.
2. **Inventário físico de stock vs. de ativos**: O modelo `InventarioFisico` + `ContagemInventario` cobre apenas ativos físicos. Se for necessário inventário de stock de produtos (contagem por localização), um modelo separado `InventarioStockFisico` + `ContagemStockItem` deve ser criado na Wave 2.
3. **Amortização com integração WS D**: `processarAmortizacaoMensal` delega `registarLancamentoContabilistico(tx, doc)` ao WS D. Este contrato deve ser publicado por WS D na Wave 1.
4. **Abate contabilístico**: `registarAbate` depende de `contaDebitoId`/`contaCreditoId` de WS D. Serão passados como parâmetro optional; se omitidos, o abate ocorre sem lançamento contabilístico.
5. **Amortização por `DIGITOS_ANOS` e `SALDOS_DECRESCENTES`**: apenas `LINEAR` está bem definida na spec. Os outros métodos precisam de validação com a equipa fiscal antes da implementação (Wave 2).
