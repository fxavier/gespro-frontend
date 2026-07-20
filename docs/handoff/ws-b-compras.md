# Handoff WS B — Compras & Fornecedores (Wave 1: Contratos)

Agente: `domain-compras` | Data: 2026-07-10 | Wave: 1 (contratos) — ADR-0003 aplicado

---

## 1. Entidades e Modelos Prisma

Ficheiro: `prisma/schema/compras.prisma`

### 1.1 Fornecedores

| Modelo | Descrição | Soft delete |
|---|---|---|
| `Fornecedor` | Unificado (#3, #5): endereço estruturado + rating + crédito (saldoDevedor/limiteCredito/totalCompras) | `deletedAt DateTime?` |
| `EnderecoFornecedor` | Endereço estruturado com províncias moçambicanas | — |
| `ContactoFornecedor` | Versão rica (conflito #5): cargo, tipo, telefoneSec | — |
| `DocumentoFornecedor` | Versão rica (conflito #5): dataValidade, url | — |
| `AvaliacaoFornecedor` | Scores 1–5 em qualidade/prazo/preço/comunicação | — |

### 1.2 Workflow de Aprovação

| Modelo | Descrição |
|---|---|
| `ConfiguracaoWorkflow` | Config multi-nível por tenant e tipo (REQUISICAO_COMPRA / PEDIDO_COMPRA) |
| `NivelAprovacao` | Nível com faixa de valor (min/max) e tipo de quórum (QUALQUER_UM / TODOS / MAIORIA) |
| `AprovadorNivel` | Utilizadores autorizados a aprovar num nível |
| `AprovacaoCompra` | Registo de decisão de aprovação (FK nullable para Requisicao ou Pedido) |

### 1.3 Fluxo de Compras

| Modelo | Descrição |
|---|---|
| `RequisicaoCompra` | Pedido interno de compra com itens e aprovações |
| `ItemRequisicao` | Linha da requisição (`produtoId` scalar → WS A) |
| `Cotacao` | RFQ (Request for Quotation) — conflito #2: esta é a cotação de COMPRAS |
| `CotacaoFornecedor` | Fornecedor convidado para a RFQ e resposta global |
| `ItemCotacao` | Linha da RFQ (`produtoId` scalar → WS A) |
| `RespostaItemCotacao` | Resposta por item por fornecedor |
| `PedidoCompra` | Ordem de compra canónica — conflito #4 (PedidoFornecedor descartado) |
| `ItemPedidoCompra` | Linha do pedido (`produtoId` scalar → WS A) |
| `RecebimentoCompra` | Registo append-only de recebimento de mercadoria |
| `ItemRecebimento` | Detalhe de aceite/rejeição por item |

### 1.4 Contas a Pagar — conflito #6

| Modelo | Descrição |
|---|---|
| `ContaPagar` | Documento a pagar (gerado por recebimento ou serviço) |
| `Pagamento` | Liquidação de conta a pagar; `lancamentoId` scalar → WS D |

### 1.5 Serviços

| Modelo | Descrição |
|---|---|
| `CategoriaServico` | Árvore plana de categorias de serviço |
| `Servico` | Catálogo de serviços com disponibilidade e estatísticas |
| `TecnicoServico` | Técnico executante; `colaboradorId` scalar → WS E |
| `AgendamentoServico` | Agendamento de prestação; `clienteId` scalar → WS C |
| `AvaliacaoServico` | Avaliação pós-serviço; `clienteId` scalar → WS C |
| `ContratoServico` | Contrato de prestação recorrente; `clienteId` scalar → WS C |

---

## 2. Enums

### Fornecedor
- `TipoFornecedor`: PESSOA_FISICA, PESSOA_JURIDICA
- `StatusFornecedor`: ATIVO, INATIVO, SUSPENSO
- `ClassificacaoFornecedor`: PREFERENCIAL, REGULAR, NOVO
- `TipoEnderecoFornecedor`: SEDE, ENTREGA, OUTRO
- `TipoContactoFornecedor`: PRINCIPAL, SECUNDARIO, TECNICO, FINANCEIRO
- `TipoDocumentoFornecedor`: CONTRATO, NUIT, CERTIFICACAO, OUTRO

### Workflow
- `TipoAprovacaoWorkflow`: REQUISICAO_COMPRA, PEDIDO_COMPRA
- `TipoAprovacao`: QUALQUER_UM, TODOS, MAIORIA
- `StatusAprovacao`: PENDENTE, APROVADO, REJEITADO

### Compras
- `PrioridadeRequisicao`: BAIXA, MEDIA, ALTA, URGENTE
- `StatusRequisicaoCompra`: RASCUNHO, PENDENTE, EM_APROVACAO, APROVADA, REJEITADA, CANCELADA, CONVERTIDA
- `StatusCotacao`: RASCUNHO, ENVIADA, RESPONDIDA, ADJUDICADA, VENCIDA, CANCELADA
- `StatusCotacaoFornecedor`: PENDENTE, RESPONDIDA, RECUSADA
- `StatusPedidoCompra`: RASCUNHO, ENVIADO, CONFIRMADO, EM_TRANSITO, RECEBIDO_PARCIAL, RECEBIDO_TOTAL, CANCELADO
- `StatusRecebimento`: COMPLETO, PARCIAL, COM_DIVERGENCIA

### Financeiro
- `StatusContaPagar`: ABERTA, PARCIALMENTE_PAGA, PAGA, CANCELADA, VENCIDA
- `StatusPagamento`: PENDENTE, PROCESSANDO, CONCLUIDO, CANCELADO

### Serviços
- `TipoServico`: INSTALACAO, MANUTENCAO, REPARACAO, CONSULTORIA, LIMPEZA, TRANSPORTE, OUTRO
- `NivelTecnicoServico`: BASICO, INTERMEDIARIO, AVANCADO
- `StatusAgendamento`: PENDENTE, CONFIRMADO, EM_ANDAMENTO, CONCLUIDO, CANCELADO, NAO_COMPARECEU
- `StatusContratoServico`: ATIVO, PAUSADO, ENCERRADO, CANCELADO
- `PeriodicidadeContrato`: MENSAL, TRIMESTRAL, SEMESTRAL, ANUAL

---

## 3. Máquinas de Estado

Exportadas como constantes em `src/server/services/compras/compras.service.interface.ts`, `conta-pagar.service.interface.ts` e `servico.service.interface.ts`.

### RequisicaoCompra (`TRANSICOES_REQUISICAO`)
```
RASCUNHO       → [PENDENTE, CANCELADA]
PENDENTE       → [EM_APROVACAO, CANCELADA]
EM_APROVACAO   → [APROVADA, REJEITADA]
APROVADA       → [CONVERTIDA, CANCELADA]
REJEITADA      → []  (terminal)
CANCELADA      → []  (terminal)
CONVERTIDA     → []  (terminal)
```

### Cotacao/RFQ (`TRANSICOES_COTACAO`)
```
RASCUNHO   → [ENVIADA, CANCELADA]
ENVIADA    → [RESPONDIDA, VENCIDA, CANCELADA]
RESPONDIDA → [ADJUDICADA, VENCIDA, CANCELADA]
ADJUDICADA → []  (terminal — gerou PedidoCompra)
VENCIDA    → []  (terminal — prazo expirou sem adjudicação)
CANCELADA  → []  (terminal)
```

### PedidoCompra (`TRANSICOES_PEDIDO_COMPRA`)
```
RASCUNHO         → [ENVIADO, CANCELADO]
ENVIADO          → [CONFIRMADO, CANCELADO]
CONFIRMADO       → [EM_TRANSITO, CANCELADO]
EM_TRANSITO      → [RECEBIDO_PARCIAL, RECEBIDO_TOTAL]
RECEBIDO_PARCIAL → [RECEBIDO_TOTAL]
RECEBIDO_TOTAL   → []  (terminal — trigga entradaStock + ContaPagar)
CANCELADO        → []  (terminal)
```

### AgendamentoServico (`TRANSICOES_AGENDAMENTO`)
```
PENDENTE    → [CONFIRMADO, CANCELADO]
CONFIRMADO  → [EM_ANDAMENTO, CANCELADO, NAO_COMPARECEU]
EM_ANDAMENTO → [CONCLUIDO, CANCELADO]
CONCLUIDO   → []  (terminal — pode gerar avaliação)
CANCELADO   → []  (terminal)
NAO_COMPARECEU → []  (terminal)
```

### Aprovação Multi-nível (`TRANSICOES_APROVACAO`)
```
PENDENTE → [APROVADO, REJEITADO]
APROVADO → []
REJEITADO → []
```

### ContaPagar (`TRANSICOES_CONTA_PAGAR`)
```
ABERTA            → [PARCIALMENTE_PAGA, PAGA, VENCIDA, CANCELADA]
PARCIALMENTE_PAGA → [PAGA, VENCIDA, CANCELADA]
PAGA              → []  (terminal)
VENCIDA           → [PAGA, CANCELADA]
CANCELADA         → []  (terminal)
```

### Pagamento (`TRANSICOES_PAGAMENTO`)
```
PENDENTE    → [PROCESSANDO, CONCLUIDO, CANCELADO]
PROCESSANDO → [CONCLUIDO, CANCELADO]
CONCLUIDO   → []  (terminal)
CANCELADO   → []  (terminal)
```

**Funções de transição**: `transitarContaPagar(actual, alvo)` e `transitarPagamento(actual, alvo)` exportadas de `conta-pagar.service.interface.ts`.

**Lógica de quórum** (implementada em Wave 2):
- `QUALQUER_UM`: primeira aprovação no nível → avança.
- `TODOS`: todos os AprovadorNivel do nível devem aprovar.
- `MAIORIA`: `ceil(n/2)` aprovações são suficientes.
- Qualquer `REJEITADO` num nível → documento `REJEITADO`.

---

## 4. Modelos a Registar em TENANT_MODELS

O orquestrador deve acrescentar a `src/server/db/tenant-extension.ts`:

```typescript
// TENANT_MODELS — adicionar após merge Wave 1:
'Fornecedor', 'EnderecoFornecedor', 'ContactoFornecedor', 'DocumentoFornecedor',
'AvaliacaoFornecedor', 'ConfiguracaoWorkflow', 'NivelAprovacao', 'AprovadorNivel',
'RequisicaoCompra', 'ItemRequisicao', 'AprovacaoCompra',
'Cotacao', 'CotacaoFornecedor', 'ItemCotacao', 'RespostaItemCotacao',
'PedidoCompra', 'ItemPedidoCompra', 'RecebimentoCompra', 'ItemRecebimento',
'ContaPagar', 'Pagamento',
'CategoriaServico', 'Servico', 'TecnicoServico', 'AgendamentoServico',
'AvaliacaoServico', 'ContratoServico',

// SOFT_DELETE_MODELS — adicionar:
'Fornecedor'
```

---

## 5. FKs Escalares Cross-Domínio (sem @relation inter-WS)

| Campo | Modelo(s) | Aponta para | WS |
|---|---|---|---|
| `produtoId` | ItemRequisicao, ItemCotacao, ItemPedidoCompra | Produto | A |
| `centroCustoId` | RequisicaoCompra, PedidoCompra, ContaPagar | CentroCusto | D |
| `contaContabilId` | ContaPagar | ContaPGC | D |
| `lancamentoId` | Pagamento | Lancamento | D |
| `solicitanteId` | RequisicaoCompra | User | auth |
| `aprovadorId` | AprovacaoCompra | User | auth |
| `responsavelId` | RecebimentoCompra | User | auth |
| `avaliadorId` | AvaliacaoFornecedor | User | auth |
| `usuarioId` | AprovadorNivel | User | auth |
| `clienteId` | AgendamentoServico, AvaliacaoServico, ContratoServico | Cliente | C |
| `colaboradorId` | TecnicoServico | Colaborador | E |

---

## 6. Contratos que WS B CONSOME de outros WS (ADR-0003)

### De WS A — `entradaStock()`
Importar de `@/server/services/inventario/stock.interface` — NÃO criar espelho local.
Chamado dentro de `prisma.$transaction` em `IComprasService.registarRecebimento()` para CADA recebimento (parcial OU total) — ADR-0003 A8.

```typescript
import type { EntradaStockInput, IStockService } from '@/server/services/inventario/stock.interface';

// Assinatura canónica:
entradaStock(tx: TxClient, data: EntradaStockInput, ctx: Ctx): Promise<MovimentoStockDto>

// Payload correcto (EntradaStockInput de @/lib/validations/stock):
{
  produtoId: string;
  varianteProdutoId?: string;
  localizacaoDestinoId: string;   // obrigatório
  quantidade: number;             // Decimal(18,4)
  documentoReferenciaId: string;  // RecebimentoCompra.id
  documentoReferenciaTipo: 'RecebimentoCompra';
  // NÃO incluir: tenantId (vem do ctx), custo, unidadeMedida, responsavelId
}
```

### De WS D — `registarLancamentoContabilistico()`
Importar de `@/server/services/financas` — NÃO criar espelho local.
Chamado dentro de `prisma.$transaction` em `IContaPagarService.registarPagamento()`.

```typescript
import type { RegistarLancamentoContabilisticoInput } from '@/server/services/financas';

// Partidas com tipo DEBITO/CREDITO (não colunas débito/crédito):
{
  data: Date;
  diarioTipo: TipoDiario;
  origem: OrigemLancamento;
  documentoOrigemId: string;   // Pagamento.id
  documentoOrigemTipo: string; // 'Pagamento'
  historico: string;
  partidas: Array<{
    contaCodigo: string;                   // ex: '2211' Fornecedores
    tipo: 'DEBITO' | 'CREDITO';
    valor: Prisma.Decimal | string;
    centroCustoCodigo?: string;
    historico?: string;
  }>;
}
```

**Invariante**: débitos balanceiam créditos — violação lança `BusinessRuleError('PARTIDAS_DESEQUILIBRADAS')`.

### De WS D — `proximoNumeroSerie()`
Importar `TipoSerieDocumento` de `@/server/services/financas`.
Chamado para gerar números de documento (REQ-..., COT-..., PC-..., CP-..., PAG-..., REC-...).

```typescript
import type { TipoSerieDocumento } from '@/server/services/financas';

proximoNumeroSerie(tx: TxClient, tipo: TipoSerieDocumento, ctx: Ctx): Promise<string>

// Tipos usados por WS B (adicionados ao TipoSerieDocumento por ADR-0003 B6):
// 'REQUISICAO_COMPRA' | 'COTACAO_RFQ' | 'PEDIDO_COMPRA'
// | 'CONTA_PAGAR' | 'PAGAMENTO' | 'RECEBIMENTO'
```

---

## 7. Contratos que WS B EXPÕE (para WS G — analytics)

WS G pode chamar directamente queries de leitura (sem mutação):

- `IFornecedorService.listar()` + `obterAging()` → painel de fornecedores
- `IComprasService.listarRequisicoes()` + `listarPedidos()` → KPIs de compras
- `IContaPagarService.relatorioAging()` → painel financeiro (contas a pagar)
- `IServicoService.listarServicos()` + `listarAgendamentos()` → painel de serviços

---

## 8. Ficheiros Entregues (Wave 1)

| Ficheiro | Tipo | Estado |
|---|---|---|
| `prisma/schema/compras.prisma` | Schema Prisma | Completo |
| `src/lib/validations/fornecedores.ts` | Zod schemas | Completo |
| `src/lib/validations/compras.ts` | Zod schemas | Completo |
| `src/lib/validations/servicos.ts` | Zod schemas | Completo |
| `src/server/services/compras/fornecedor.service.interface.ts` | Interface | Completo |
| `src/server/services/compras/compras.service.interface.ts` | Interface + máquinas de estado | Completo |
| `src/server/services/compras/conta-pagar.service.interface.ts` | Interface | Completo |
| `src/server/services/compras/servico.service.interface.ts` | Interface + máquina de estado | Completo |

---

## 9. Páginas do Domínio B → Actions (para Agente UI)

Mapa pages → services/actions para o spec 03:

| Rota | Tipo | Serviço/Action (Wave 2) |
|---|---|---|
| `/compras/requisicoes` | Listagem | `IComprasService.listarRequisicoes()` |
| `/compras/requisicoes/nova` | Mutação | `criarRequisicao` action |
| `/compras/requisicoes/[id]` | Detalhe | `IComprasService.obterRequisicao()` |
| `/compras/requisicoes/[id]/aprovar` | Mutação | `decidirAprovacao` action |
| `/compras/cotacoes` | Listagem | `IComprasService.listarCotacoes()` |
| `/compras/cotacoes/nova` | Mutação | `criarCotacao` action |
| `/compras/cotacoes/[id]` | Detalhe | `IComprasService.obterCotacao()` |
| `/compras/pedidos` | Listagem | `IComprasService.listarPedidos()` |
| `/compras/pedidos/novo` | Mutação | `criarPedido` action |
| `/compras/pedidos/[id]` | Detalhe | `IComprasService.obterPedido()` |
| `/compras/pedidos/[id]/receber` | Mutação | `registarRecebimento` action |
| `/procurement/requisicoes` | Redirect → `/compras/requisicoes` | (spec 03 — unificação #B3) |
| `/procurement/cotacoes` | Redirect → `/compras/cotacoes` | (spec 03 — unificação #B3) |
| `/fornecedores` | Listagem | `IFornecedorService.listar()` |
| `/fornecedores/novo` | Mutação | `criarFornecedor` action |
| `/fornecedores/[id]` | Detalhe | `IFornecedorService.obter()` |
| `/fornecedores/[id]/contactos` | Mutação | `adicionarContacto` action |
| `/fornecedores/[id]/documentos` | Mutação | `adicionarDocumento` action |
| `/fornecedores/contas-pagar` | Listagem | `IContaPagarService.listar()` + `relatorioAging()` |
| `/servicos` | Listagem | `IServicoService.listarServicos()` |
| `/servicos/novo` | Mutação | `criarServico` action |
| `/servicos/[id]` | Detalhe | `IServicoService.obterServico()` |
| `/servicos/agendamentos` | Listagem | `IServicoService.listarAgendamentos()` |
| `/servicos/agendamentos/novo` | Mutação | `criarAgendamento` action |
| `/servicos/contratos` | Listagem | `IServicoService.listarContratos()` |

---

## 10. Nota para o Orquestrador

1. **TENANT_MODELS**: adicionar todos os modelos listados na secção 4 ao `src/server/db/tenant-extension.ts` no merge da Wave 1. Todos os 11 modelos filho agora têm `tenantId String` (ADR-0003 A1).
2. **Tenant @relation**: os modelos WS B NÃO têm `@relation` a `Tenant` (para não modificar `tenant.prisma` partilhado). O orquestrador deve adicionar as back-references em `tenant.prisma` no merge.
3. **prisma/schema path**: verificar se `package.json` tem `"prisma": { "schema": "prisma/schema" }` — sem esta config `prisma validate` procura `prisma/schema.prisma` e falha.
4. **Numeração de documentos**: WS B consome `proximoNumeroSerie(tx, tipo, ctx)` de WS D. ADR-0003 B6: WS D deve adicionar ao `TipoSerieDocumento`: `'REQUISICAO_COMPRA' | 'COTACAO_RFQ' | 'PEDIDO_COMPRA' | 'CONTA_PAGAR' | 'PAGAMENTO' | 'RECEBIMENTO'`.
5. **Migration order**: B vem depois de A (produtos referenciados) e antes de D (lançamentos). Ordem: A → B → C → D → E → F → G.
6. **Unificação compras/procurement** (task B3): as rotas `/procurement/*` devem ser redirecionadas para `/compras/*` no spec 03. Os serviços são o mesmo domínio.
7. **ADR-0003 aplicado**: B1 (sem espelhos de stock), B4 (sem LancamentoContabilInputB), A1 (tenantId em 11 child models), A5 (import server-only), A6 (TRANSICOES_CONTA_PAGAR + TRANSICOES_PAGAMENTO + validators), A8 (entradaStock tb em recepção parcial).
