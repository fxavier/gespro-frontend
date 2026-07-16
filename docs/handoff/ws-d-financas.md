# WS D — Finanças: Handoff Wave 1 (Contratos)

Agente: `domain-financas` | Data: 2026-07-10 | Wave: 1 (só contratos)
Revisão: 2026-07-10 — gate Wave 1 (ADR-0003 aplicado)

---

## 1. Entidades e modelos Prisma

Ficheiro: `prisma/schema/financas.prisma`

### Caixa

| Modelo | Descrição |
|--------|-----------|
| `SessaoCaixa` | Sessão de caixa diária por responsável; abertura/fecho com conferência de fundo |
| `MovimentoCaixa` | Movimentos imutáveis dentro da sessão (venda, sangria, reforço, ajuste, …) |

### Contabilidade PGC-NIRF

| Modelo | Descrição |
|--------|-----------|
| `ContaPGC` | Plano de contas PGC-NIRF (Decreto 70/2009), hierárquico por código; seed populado a partir do xlsx oficial |
| `Diario` | Diário contabilístico por natureza (Vendas, Compras, Caixa, Banco, …) |
| `CentroCusto` | Dimensão analítica cruzada com partidas; tipos: Departamento, Projeto, Filial, Outro |
| `Lancamento` | Lançamento contabilístico; imutável após LANCADO; estorno por novo lançamento compensatório |
| `PartidaLancamento` | Linha de débito/crédito; invariante débito=crédito obrigatória na transacção |
| `ContaBancaria` | Conta bancária ligada a uma conta PGC |
| `ReconciliacaoBancaria` | Reconciliação extracto vs razão |
| `ItemReconciliacaoBancaria` | Linha de reconciliação (lançamento contabilístico ou linha de extracto) |

### Numeração sequencial

| Modelo | Descrição |
|--------|-----------|
| `SerieDocumento` | Série com prefixo + ano + proximoNumero; incremento via UPDATE…RETURNING sem lacunas. Enum `TipoSerieDocumento` cobre TODOS os documentos sequenciais do sistema (B6 / ADR-0003) |

### Faturação

| Modelo | Descrição |
|--------|-----------|
| `Fatura` | Factura fiscal; imutável após EMITIDA; correcção via NotaCredito |
| `LinhaFatura` | Linha de factura; IVA 16% padrão MZ |
| `NotaCredito` | Correcção de factura emitida; referencia faturaOriginalId obrigatório |
| `LinhaNotaCredito` | Linha de nota de crédito |
| `NotaDebito` | Cobrança adicional; faturaReferenciaId opcional |
| `LinhaNotaDebito` | Linha de nota de débito |
| `Proforma` | Proposta antes de factura; conversível em Fatura |
| `LinhaProforma` | Linha de proforma |
| `CotacaoComercial` | Proposta de preço para cliente (distinta da RFQ de compras — conflito #2) |
| `LinhaCotacaoComercial` | Linha de cotação comercial |

---

## 2. Enums

### Caixa
- `StatusSessaoCaixa`: `ABERTA`, `FECHADA`, `CANCELADA`
- `TipoMovimentoCaixa`: `ABERTURA`, `VENDA`, `RECEBIMENTO`, `SANGRIA`, `REFORCO`, `DEVOLUCAO`, `FECHAMENTO`, `AJUSTE`

### Contabilidade
- `ClassePGC`: `CLASSE_1` … `CLASSE_8` (Decreto 70/2009)
- `TipoConta`: `ATIVO`, `PASSIVO`, `CAPITAL_PROPRIO`, `RENDIMENTO`, `GASTO`, `RESULTADO`
- `NaturezaConta`: `DEVEDORA`, `CREDORA`
- `TipoDiario`: `VENDAS`, `COMPRAS`, `CAIXA`, `BANCO`, `OPERACOES`, `SALARIOS`, `ABERTURA`, `ENCERRAMENTO`, `OUTROS`
- `StatusLancamento`: `RASCUNHO`, `LANCADO`, `ESTORNADO`
- `OrigemLancamento`: `MANUAL`, `VENDA`, `COMPRA`, `PAGAMENTO`, `RECEBIMENTO`, `AJUSTE`, `AMORTIZACAO`, `PRODUCAO`, `CAIXA`, `RECONCILIACAO`
- `TipoPartida`: `DEBITO`, `CREDITO`
- `TipoCentroCusto`: `DEPARTAMENTO`, `PROJETO`, `FILIAL`, `OUTRO`
- `TipoContaBancaria`: `CORRENTE`, `POUPANCA`, `DEPOSITO_PRAZO`
- `StatusReconciliacao`: `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`

### Faturação
- `TipoSerieDocumento` (B6 — cobre TODOS os documentos sequenciais do sistema):
  - Faturação (WS D): `FATURA`, `NOTA_CREDITO`, `NOTA_DEBITO`, `PROFORMA`, `COTACAO_COMERCIAL`, `RECIBO`
  - Comercial/POS (WS C): `VENDA`, `SESSAO_CAIXA`
  - Compras (WS B): `REQUISICAO_COMPRA`, `COTACAO_RFQ`, `PEDIDO_COMPRA`, `CONTA_PAGAR`, `PAGAMENTO`, `RECEBIMENTO`
  - Produção (WS E): `ORDEM_PRODUCAO`
  - Operações/Transporte (WS F): `ATIVIDADE`, `TICKET`, `ENTREGA`
- `StatusFatura`: `RASCUNHO`, `EMITIDA`, `PAGA`, `PARCIALMENTE_PAGA`, `VENCIDA`, `CANCELADA`
- `StatusNotaCredito`: `RASCUNHO`, `EMITIDA`, `LIQUIDADA`, `CANCELADA`
- `StatusNotaDebito`: `RASCUNHO`, `EMITIDA`, `LIQUIDADA`, `CANCELADA`
- `StatusProforma`: `RASCUNHO`, `ENVIADA`, `ACEITE`, `CONVERTIDA`, `EXPIRADA`, `CANCELADA`
- `StatusCotacaoComercial`: `RASCUNHO`, `ENVIADA`, `ACEITE`, `REJEITADA`, `CONVERTIDA`, `EXPIRADA`, `CANCELADA`

---

## 3. Máquinas de estado

### SessaoCaixa

```
ABERTA → FECHADA (fecho normal com conferência)
ABERTA → CANCELADA (sem movimentos, admin)
FECHADA → [] terminal
CANCELADA → [] terminal
```

### Lancamento

```
RASCUNHO → LANCADO (confirmação; automáticos passam directamente dentro de tx)
LANCADO → ESTORNADO (lançamento compensatório gerado; original fica ESTORNADO)
ESTORNADO → [] terminal
```

### Fatura

```
RASCUNHO → EMITIDA
EMITIDA → PAGA | PARCIALMENTE_PAGA | VENCIDA | CANCELADA
PARCIALMENTE_PAGA → PAGA | VENCIDA
VENCIDA → PAGA | PARCIALMENTE_PAGA | CANCELADA
PAGA → [] terminal
CANCELADA → [] terminal

Nota: campos financeiros imutáveis após EMITIDA; correcção via NotaCredito.
```

### NotaCredito / NotaDebito

```
RASCUNHO → EMITIDA
EMITIDA → LIQUIDADA | CANCELADA
LIQUIDADA → [] terminal
CANCELADA → [] terminal
```

### Proforma

```
RASCUNHO → ENVIADA | CANCELADA
ENVIADA → ACEITE | EXPIRADA | CANCELADA
ACEITE → CONVERTIDA | CANCELADA
CONVERTIDA → [] terminal
EXPIRADA → [] terminal
CANCELADA → [] terminal
```

### CotacaoComercial

```
RASCUNHO → ENVIADA | CANCELADA
ENVIADA → ACEITE | REJEITADA | EXPIRADA
ACEITE → CONVERTIDA
REJEITADA → [] terminal
CONVERTIDA → [] terminal
EXPIRADA → [] terminal
CANCELADA → [] terminal
```

---

## 4. TENANT_MODELS (a adicionar pelo orquestrador no merge)

Os seguintes modelos devem ser adicionados ao `TENANT_MODELS` em `src/server/db/tenant-extension.ts`:

```ts
'SessaoCaixa', 'MovimentoCaixa',
'ContaPGC', 'Diario', 'CentroCusto', 'Lancamento', 'PartidaLancamento',
'ContaBancaria', 'ReconciliacaoBancaria', 'ItemReconciliacaoBancaria',
'SerieDocumento',
'Fatura', 'LinhaFatura',
'NotaCredito', 'LinhaNotaCredito',
'NotaDebito', 'LinhaNotaDebito',
'Proforma', 'LinhaProforma',
'CotacaoComercial', 'LinhaCotacaoComercial',
```

Nota de soft delete: nenhum modelo de WS D usa soft delete — documentos transaccionais cancelam-se por estado.

---

## 5. Contratos expostos a outros WS

Ficheiro: `src/server/services/financas/index.ts`

Todos chamados **dentro de `$transaction`** para consistência:

### `registarLancamentoContabilistico(tx, input, ctx): Promise<Lancamento>`

Exposto a: **WS A** (amortizações/abates), **WS B** (contas a pagar), **WS C** (facturas de venda)

```ts
// Input:
interface RegistarLancamentoContabilisticoInput {
  data: Date;
  diarioTipo: TipoDiario;          // ex.: 'VENDAS', 'COMPRAS'
  origem: OrigemLancamento;         // ex.: 'VENDA', 'COMPRA'
  documentoOrigemId: string;
  documentoOrigemTipo: string;      // ex.: 'Fatura', 'ContaPagar'
  historico: string;
  partidas: Array<{
    contaCodigo: string;            // código PGC; serviço resolve ID
    tipo: 'DEBITO' | 'CREDITO';
    valor: number;
    centroCustoCodigo?: string;
    historico?: string;
  }>;
}
```

Invariante: `sum(débitos) === sum(créditos)` — lança `BusinessRuleError('PARTIDAS_DESEQUILIBRADAS')` se violado.

### `registarMovimentoCaixa(tx, input, ctx): Promise<MovimentoCaixa>`

Exposto a: **WS C** (vendas POS)

```ts
// Input: RegistarMovimentoCaixaInput de src/lib/validations/caixa.ts
interface RegistarMovimentoCaixaInput {
  sessaoCaixaId: string;
  tipo: TipoMovimentoCaixa;    // ex.: 'VENDA', 'RECEBIMENTO'
  valor: number;               // positivo; em MZN
  descricao: string;
  documentoOrigemId?: string;
  documentoOrigemTipo?: string;
  observacoes?: string;
}
```

Regra: requer sessão ABERTA; lança `BusinessRuleError('SESSAO_CAIXA_FECHADA')` se não.

### `proximoNumeroSerie(tx, tipo: TipoSerieDocumento, ctx): Promise<string>`

Exposto a: **WS A, B, C, E, F** (numeração de todos os documentos — B6/ADR-0003)

```ts
// tipo: TipoSerieDocumento — enum unificado em D (ex.: 'FATURA', 'REQUISICAO_COMPRA', 'TICKET')
// tenantId vem de ctx — nunca passado directamente (convenção)
// Retorna string formatada: ex. "FAT/2024/000001"
// UPDATE SerieDocumento SET proximoNumero = proximoNumero + 1
//   WHERE tenantId = ctx.tenantId AND tipo = tipo AND ano = current_year AND ativo = true
// RETURNING proximoNumero — dentro da transacção (sem lacunas se rollback)
```

Todos os WS importam esta assinatura de `@/server/services/financas` — proibido tipo-espelho local.

---

## 6. Correcções ADR-0003 aplicadas

| # ADR | Correcção aplicada |
|-------|-------------------|
| B6 (DDL) | `TipoSerieDocumento` alargado para 20 valores (FATURA … ENTREGA); `proximoNumeroSerie(tx, tipo, ctx)` — assinatura única sem `serieId` |
| A9 | `valor: Prisma.Decimal \| string` em `RegistarLancamentoContabilisticoInput.partidas[]` e `RegistarMovimentoCaixaInput` |
| A5 | `import 'server-only'` nos 3 ficheiros de interface de serviço |
| A3 | `Lancamento.@@unique([tenantId, diarioId, periodoFiscal, numero])` |
| A1 | `tenantId` em `ItemReconciliacaoBancaria` (já existia nas outras tabelas-filho) |
| ADR dec.1 | `RegistarMovimentoCaixaInput` e `RegistarLancamentoContabilisticoInput` exportados como fonte única; Zod type renomeado para `RegistarMovimentoCaixaFormInput` |

## 7. Regras de design aplicadas

- **Dinheiro**: `Decimal @db.Decimal(18,2)` em todos os campos monetários; taxas de IVA `Decimal @db.Decimal(9,6)`.
- **Imutabilidade**: documentos após EMITIDA/LANCADO são append-only; correcções geram registos compensatórios.
- **FK cross-domínio**: `clienteId`, `vendaId`, `produtoId` são escalares `String` sem `@relation` inter-WS (convenção multi-file schema).
- **tenantId**: em todos os modelos; FK escalar sem @relation a Tenant nos modelos de domínio (back-relations adicionadas pelo orquestrador no merge em tenant.prisma).
- **Índices**: compostos começando por `[tenantId, ...]` para isolamento eficiente.
- **Conflito #2**: `CotacaoComercial` em WS D é cotação de venda; `Cotacao` (RFQ) em WS B é cotação de compra — nomes distintos, sem fusão.
- **Conflito #8**: `SessaoCaixa` + `MovimentoCaixa` modelados de raiz em WS D; WS C consome via `registarMovimentoCaixa(tx)`.
- **Conflito #11**: `ContaPGC` pronta para PGC-NIRF classes 1–8; seed pelo orquestrador a partir do xlsx Decreto 70/2009.
- **Conflito #12**: `SerieDocumento` transaccional para numeração sem lacunas de todos os documentos (FAT, NC, ND, PRO, COT, …).

---

## 7. Mapa páginas → actions (para agente UI)

| Página | Acção/Serviço | Permissão |
|--------|--------------|-----------|
| `/caixa` | `listarSessoes` | `caixa:listar` |
| `/caixa/abertura` | `abrirSessao` → action `caixa:abrir` | `caixa:abrir` |
| `/caixa/fechamento` | `fecharSessao` → action `caixa:fechar` | `caixa:fechar` |
| `/contabilidade` | `listarLancamentos` | `contabilidade:listar` |
| `/contabilidade/lancamentos` | `criarLancamento`, `confirmarLancamento` → actions | `contabilidade:lancar` |
| `/contabilidade/plano-contas` | `listarContas`, `criarConta` → action | `contabilidade:plano-contas` |
| `/contabilidade/diarios` | `listarDiarios`, `criarDiario` → action | `contabilidade:diarios` |
| `/contabilidade/centros-custo` | `listarCentrosCusto`, `criarCentroCusto` → action | `contabilidade:centros-custo` |
| `/contabilidade/balancete` | `gerarBalancete` | `contabilidade:relatorios` |
| `/contabilidade/balancete/nova` | `gerarBalancete` com filtros | `contabilidade:relatorios` |
| `/contabilidade/dre` | `gerarDRE` | `contabilidade:relatorios` |
| `/contabilidade/razao-geral` | `razaoConta` | `contabilidade:relatorios` |
| `/contabilidade/reconciliacao` | `iniciarReconciliacao`, `marcarItemReconciliado`, `concluirReconciliacao` | `contabilidade:reconciliacao` |
| `/contabilidade/configuracoes` | `criarDiario`, `criarCentroCusto`, `criarContaBancaria` | `contabilidade:configurar` |
| `/faturacao` | `listarFaturas` | `faturacao:listar` |
| `/faturacao/nova` | `emitirFatura` → action `faturacao:emitir` | `faturacao:emitir` |
| `/faturacao/nota-credito` | `emitirNotaCredito` → action | `faturacao:nota-credito` |
| `/faturacao/proforma` | `listarProformas` | `faturacao:proformas` |
| `/faturacao/proforma/nova` | `criarProforma` → action | `faturacao:proformas` |
| `/faturacao/cotacoes` | `listarCotacoesComerciais` | `faturacao:cotacoes` |
| `/vendas/faturas` | `listarFaturas` (filtro clienteId) | `faturacao:listar` |
| `/vendas/faturas/nova` | `emitirFatura` → action | `faturacao:emitir` |
| `/vendas/notas-credito` | `listarNotasCredito` | `faturacao:notas-credito` |
| `/vendas/notas-debito` | `listarNotasDebito` | `faturacao:notas-debito` |

### Exportações (Wave 2 — Route Handlers)

| Endpoint | Função | Permissão |
|----------|--------|-----------|
| `GET /api/contabilidade/export/balancete` | `gerarBalancete` → CSV/PDF | `contabilidade:relatorios` |
| `GET /api/contabilidade/export/dre` | `gerarDRE` → CSV/PDF | `contabilidade:relatorios` |
| `GET /api/faturacao/export/faturas` | `listarFaturas` → CSV | `faturacao:exportar` |

---

## 8. Ficheiros entregues

| Ficheiro | Descrição |
|---------|-----------|
| `prisma/schema/financas.prisma` | 20 modelos Prisma; 17 enums; sem erros de validação |
| `src/lib/validations/caixa.ts` | Zod schemas: `AbrirSessaoCaixaSchema`, `FecharSessaoCaixaSchema`, `RegistarMovimentoCaixaSchema`, `SangriaSchema`, `ReforcoSchema`, `FiltroSessaoCaixaSchema`, `FiltroMovimentoCaixaSchema` |
| `src/lib/validations/contabilidade.ts` | Zod schemas: ContaPGC, Diario, CentroCusto, Lancamento (com refinement débito=crédito), ContaBancaria, Reconciliacao, Balancete, DRE, Razão |
| `src/lib/validations/faturacao.ts` | Zod schemas: SerieDocumento, Fatura (com transform de totais), NotaCredito, NotaDebito, Proforma, CotacaoComercial; LinhaDocumentoSchema partilhado |
| `src/server/services/financas/caixa.interface.ts` | Interface `ICaixaService` + mapa `TRANSICOES_SESSAO_CAIXA` + `transitarSessaoCaixa()` |
| `src/server/services/financas/contabilidade.interface.ts` | Interface `IContabilidadeService` + mapa `TRANSICOES_LANCAMENTO` + `transitarLancamento()` + `RegistarLancamentoContabilisticoInput` |
| `src/server/services/financas/faturacao.interface.ts` | Interface `IFaturacaoService` + 5 mapas de transição + funções `transitar*()` |
| `src/server/services/financas/index.ts` | Re-exports cross-domínio para WS A, B, C |

---

## 9. Estado da validação

- `prisma validate`: ficheiro `financas.prisma` sem erros; erros presentes no schema são de `pessoas-projetos.prisma` (WS E, outro agente — não modificado por WS D).
- `tsc --noEmit`: nenhum erro nos ficheiros de WS D; erros pré-existentes em `password-reset.ts`, `rate-limit.ts`, `audit-extension.ts` e validations de outros WS.
- Os interfaces usam tipos locais (não importam de `@prisma/client`) porque o `prisma generate` ainda não foi executado; após o `generate` pelo orquestrador, os tipos Prisma serão compatíveis com os tipos locais definidos.
