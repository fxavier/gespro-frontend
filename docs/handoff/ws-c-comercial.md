# Handoff WS C — Comercial (Wave 1: Contratos)

Agente: domain-comercial | Data: 2026-07-10 | Wave: 1 (contratos)

---

## 1. Entidades e ficheiro Prisma

Ficheiro: `prisma/schema/comercial.prisma`

| Entidade | Chave primária | Soft delete | Append-only |
|---|---|---|---|
| `Cliente` | cuid | sim (`deletedAt`) | não |
| `EnderecoCliente` | cuid | não | não |
| `ContactoCliente` | cuid | não | não |
| `SegmentacaoCliente` | cuid (clienteId unique) | não | não |
| `HistoricoTransacao` | cuid | não | **sim** |
| `SessaoPOS` | cuid | não | não |
| `Venda` | cuid | não | não |
| `ItemVenda` | cuid | não | **sim** (criado com a venda; sem update) |
| `PagamentoVenda` | cuid | não | **sim** |
| `HistoricoEstadoVenda` | cuid | não | **sim** |
| `RegraComissao` | cuid | não | não |
| `Comissao` | cuid | não | não |

### Enums Prisma

`TipoCliente`, `StatusCliente`, `CategoriaCliente`, `TipoEnderecoCliente`,
`TipoContactoCliente`, `SegmentoCliente`, `TamanhoEmpresa`, `PotencialVendas`,
`FrequenciaCompra`, `TipoHistoricoTransacao`, `StatusHistoricoTransacao`,
`OrigemVenda`, `StatusVenda`, `MetodoPagamentoTipo`, `StatusSessaoPOS`,
`TipoRegraComissao`, `StatusComissao`

---

## 2. Conflitos resolvidos

### Conflito #1 — Cliente duplo (RESOLVIDO)
- **Decisão**: Uma única entidade `Cliente` (versão rica de `src/types/cliente.ts`).
- `tipo` ∈ {`FISICA`, `JURIDICA`, `REVENDEDOR`} (elimina `individual/empresarial` de `venda.ts`).
- `endereco: string` de `venda.ts.Cliente` substituído por relação `EnderecoCliente[]`.
- `Venda` referencia `Cliente` via `clienteId String?` (nullable = consumidor final anónimo).
- Ficheiro `src/types/venda.ts` mantém a interface `Cliente` como re-export temporário até Wave 3.

### Conflito #7 — Venda vs Pedido (DECISÃO PROVISÓRIA — necessita confirmação do owner)

**SUPOSIÇÃO ADOPTADA:** Uma única entidade `Venda` com campo `origem: OrigemVenda`.
- `Pedido` (de `src/types/pedido.ts`) = `Venda` com `origem = ENCOMENDA`.
- `POS` = `Venda` com `origem = POS`.
- `ECOMMERCE` e `MANUAL` são origens adicionais.

**Implicações:**
- Stock reservado no `PENDENTE` (encomenda); baixado no `FATURADA` (POS).
- Comissão calculada na mesma transacção que cria/fatura a `Venda`.
- `ComissaoVendedor` de `pedido.ts` migra para entidade `Comissao` com `vendaId`.

**Pedido de confirmação ao owner:**
> Confirmar se devem existir DUAS entidades (`Venda` + `Pedido`) com ciclos de vida distintos,
> ou se a abordagem unificada serve os requisitos de negócio (POS e Encomenda no mesmo pipeline).
> Impacto: se duas entidades forem necessárias, a migration e os serviços são revistos antes de Wave 2.

---

## 3. Máquina de estado — Venda

```
RASCUNHO ──→ PENDENTE ──→ CONFIRMADA ──→ EM_PREPARACAO ──→ FATURADA ──→ CONCLUIDA
    │            │               │                │               │
    └──CANCELADA └──CANCELADA    └──CANCELADA     └──CANCELADA    └──DEVOLVIDA
```

Mapa completo (`src/server/services/comercial/venda.interface.ts`):

| De \ Para | RASCUNHO | PENDENTE | CONFIRMADA | EM_PREPARACAO | FATURADA | CONCLUIDA | CANCELADA | DEVOLVIDA |
|---|---|---|---|---|---|---|---|---|
| RASCUNHO | — | ✓ | — | — | — | — | ✓ | — |
| PENDENTE | — | — | ✓ | — | ✓ | — | ✓ | — |
| CONFIRMADA | — | — | — | ✓ | ✓ | — | ✓ | — |
| EM_PREPARACAO | — | — | — | — | ✓ | — | ✓ | — |
| FATURADA | — | — | — | — | — | ✓ | — | ✓ |
| CONCLUIDA | — | — | — | — | — | — | — | — |
| CANCELADA | — | — | — | — | — | — | — | — |
| DEVOLVIDA | — | — | — | — | — | — | — | — |

**POS caminho rápido:** `PENDENTE → FATURADA → CONCLUIDA`
**Encomenda caminho completo:** `RASCUNHO → PENDENTE → CONFIRMADA → EM_PREPARACAO → FATURADA → CONCLUIDA`

Função `transitarVenda(actual, alvo)` em `venda.interface.ts` lança
`BusinessRuleError('TRANSICAO_INVALIDA')` para transições fora do mapa.

---

## 4. TENANT_MODELS a registar (pelo orquestrador no merge)

Adicionar a `src/server/db/tenant-extension.ts`:

```ts
// WS C — Comercial
'Cliente', 'EnderecoCliente', 'ContactoCliente', 'SegmentacaoCliente',
'HistoricoTransacao', 'SessaoPOS', 'Venda', 'ItemVenda', 'PagamentoVenda',
'HistoricoEstadoVenda', 'RegraComissao', 'Comissao'
```

`SOFT_DELETE_MODELS`: adicionar `'Cliente'`.

---

## 5. Contratos cross-WS

### Contratos que WS C CONSOME

#### De WS A (Catálogo & Inventário)

| Função | Quando | Nota |
|---|---|---|
| `reservarStock(tx, input, ctx)` | `Venda` origem=ENCOMENDA, ao criar | Liberar em CANCELADA |
| `baixarStock(tx, input, ctx)` | `Venda` ao transitar para FATURADA (POS: na criação; Encomenda: ao faturar) | |
| `libertarStock(tx, input, ctx)` | `Venda` CANCELADA com reserva activa | |
| `entradaStock(tx, input, ctx)` | `Venda` DEVOLVIDA | Devolução de stock |

Input esperado de `baixarStock` (ver `venda.interface.ts::BaixarStockInput`):
```ts
{ produtoId, varianteId?, localizacaoId, quantidade, referenciaVenda }
```

#### De WS D (Finanças)

| Função | Quando | Nota |
|---|---|---|
| `registarMovimentoCaixa(tx, input, ctx)` | `Venda` POS criada | Dentro da mesma $transaction |
| `proximoNumeroSerie(tx, tenantId, serieId)` | Criar `Venda` | Para gerar o campo `numero` |

Input esperado de `registarMovimentoCaixa` (ver `venda.interface.ts::RegistarMovimentoCaixaInput`):
```ts
{ sessaoCaixaId, tipo: 'ENTRADA', valor, descricao, documentoId, documentoTipo: 'Venda' }
```

### Contratos que WS C EXPÕE

#### Para WS D (Finanças)

**Factura de venda** — ao emitir factura via WS D, o serviço WS C recebe o `faturaId`
gerado e actualiza `Venda.faturaId`. O WS D cria a `Fatura` com as linhas derivadas
dos `ItemVenda` (desnormalizados), a partir do `vendaId` que WS C fornece.

Campos chave da `Venda` expostos ao WS D para emissão de factura:

```ts
{
  id: string           // vendaId
  numero: string       // número de série da venda (ex: VND-2024-0001)
  clienteId: string    // para dados fiscais
  itens: ItemVenda[]   // produtoId, nomeProduto, quantidade, precoUnitario, taxaIva, total
  subtotal, ivaTotal, total, currency
  dataVenda
}
```

#### Para WS G (Plataforma/Analytics)

- `HistoricoTransacao` por cliente (para KPIs de CRM)
- Totais de vendas por período (para dashboard de vendas)
- Comissões por vendedor (para relatório de performance)

---

## 6. Ficheiros criados (Wave 1)

| Ficheiro | Tipo | Descrição |
|---|---|---|
| `prisma/schema/comercial.prisma` | Schema Prisma | 12 entidades + 15 enums |
| `src/lib/validations/common.ts` | Zod helpers | `nuit()`, `biMocambicano()`, `provinciaSchema` |
| `src/lib/validations/clientes.ts` | Zod schemas | Create/Update/Filter para Cliente e sub-entidades |
| `src/lib/validations/vendas.ts` | Zod schemas | Create/Update/Filter para Venda, Sessão POS, Comissão |
| `src/server/services/comercial/cliente.interface.ts` | Interface TS | `IClienteService` + tipos de resultado |
| `src/server/services/comercial/venda.interface.ts` | Interface TS | `TRANSICOES_VENDA`, `transitarVenda()`, `IVendaService`, `ISessaoPOSService` |
| `src/server/services/comercial/comissao.interface.ts` | Interface TS | `IComissaoService` (portado de `comissao.service.ts`) |

---

## 7. Fontes portadas (não reescritas)

| Fonte | Destino | Estado |
|---|---|---|
| `src/types/cliente.ts` | `Cliente`, `EnderecoCliente`, `ContactoCliente`, `SegmentacaoCliente`, `HistoricoTransacao` em Prisma | Wave 1 schema criado |
| `src/types/venda.ts` | `Venda`, `ItemVenda`, `PagamentoVenda` (unificado) | Wave 1 schema criado |
| `src/types/pedido.ts` | Absorvido por `Venda` com `origem=ENCOMENDA` | Decisão provisória #7 |
| `src/services/comissao.service.ts` | `IComissaoService` + `RegraComissao` em Prisma | Portado como interface; implementação na Wave 2 |
| `src/lib/storage/cliente-storage.ts` | Seed `prisma/seed/comercial.ts` | Wave 2 |

---

## 8. Notas para Wave 2

1. **`src/lib/validations/common.ts`** — criado nesta wave com `nuit()`, `biMocambicano()`, `provinciaSchema`. WS B deve importar daqui para validação de Fornecedores (evitar duplicação com `plataforma.ts.nuitSchema`).

2. **Tipos de retorno nas interfaces** — campos `Decimal` nos interfaces estão tipados como `number` para compilação antes de `prisma generate`. Na Wave 2, substituir por `Prisma.Decimal` ou `Decimal` de `@prisma/client/runtime/client`.

3. **`tx: unknown`** nos contratos cross-WS — na Wave 2, substituir por `Prisma.TransactionClient` após geração do cliente.

4. **`creditoUtilizadoMT`** — campo calculado que deve ser mantido sincronizado pelo `ClienteService` em cada venda/pagamento. Considerar trigger ou computed field no futuro.

5. **POS sem cliente** — `Venda.clienteId` é nullable. A UI do POS deve permitir "consumidor final" sem cadastro. O `HistoricoTransacao` só é criado quando `clienteId` existe.

6. **Ordem das migrations** (orquestrador): `A → B → C → D → E → F → G`. WS C depende de A (para FKs de produto no ItemVenda) mas as FKs são escalares — sem FK de BD cross-WS, pelo que `comercial.prisma` pode migrar independentemente de `A`.

---

## 9. Mapa páginas → actions (para agente UI — Wave 3)

| Página | Action / Serviço | Permissão |
|---|---|---|
| `/clientes` | `listarClientes` (Server Component) | `clientes:listar` |
| `/clientes/novo` | `criarCliente` (Server Action) | `clientes:criar` |
| `/clientes/[id]` | `buscarClientePorId` (Server Component) | `clientes:ver` |
| `/clientes/[id]/editar` | `atualizarCliente` (Server Action) | `clientes:editar` |
| `/clientes/[id]/historico` | `obterHistoricoCliente` (Server Component) | `clientes:ver` |
| `/vendas` | `listarVendas` (Server Component) | `vendas:listar` |
| `/vendas/nova` | `criarVenda` (Server Action) | `vendas:criar` |
| `/vendas/[id]` | `buscarVendaPorId` (Server Component) | `vendas:ver` |
| `/vendas/[id]/transitar` | `transitarVenda` (Server Action) | `vendas:editar` |
| `/pos` | `abrirSessaoPOS` + `criarVenda` (Server Actions) | `pos:operar` |
| `/pos/fechar` | `fecharSessaoPOS` (Server Action) | `pos:operar` |
| `/comissoes` | `listarComissoes` (Server Component) | `comissoes:listar` |
| `/comissoes/regras` | `listarRegrasComissao` (Server Component) | `comissoes:gerir` |
| `/comissoes/regras/nova` | `criarRegraComissao` (Server Action) | `comissoes:gerir` |
| `/comissoes/[id]/pagar` | `marcarComissaoPaga` (Server Action) | `comissoes:pagar` |
| `/relatorios/comercial` | `relatorioComissoesPeriodo` (Server Component) | `relatorios:ver` |
