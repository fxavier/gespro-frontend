# WS B — Compras & Fornecedores — Wave 2 Handoff

Estado: Wave 2 completa. Wave 3 (integrações reais + remoção de mocks) pendente após WS A e WS D finalizarem.

## Ficheiros produzidos

### Contratos (Wave 1)
- `prisma/schema/compras.prisma` — 22 enums + 27 modelos; ADR-0003 A1 aplicado
- `src/lib/validations/fornecedores.ts`
- `src/lib/validations/compras.ts`
- `src/lib/validations/servicos.ts`
- `src/server/services/compras/compras.service.interface.ts`
- `src/server/services/compras/conta-pagar.service.interface.ts`
- `src/server/services/compras/fornecedor.service.interface.ts`
- `src/server/services/compras/servico.service.interface.ts`

### Implementação (Wave 2)
- `src/server/services/compras/compras.service.ts`
- `src/server/services/compras/conta-pagar.service.ts`
- `src/server/services/compras/fornecedor.service.ts`
- `src/server/services/compras/servico.service.ts`
- `src/server/actions/compras.actions.ts`
- `src/server/actions/fornecedores.actions.ts`
- `src/server/actions/servicos.actions.ts`
- `prisma/seed/compras.ts` — `seedCompras(prisma, tenantId)`

### Testes
- `src/server/services/compras/__tests__/compras.service.test.ts` (30 testes)
- `src/server/services/compras/__tests__/conta-pagar.service.test.ts` (30 testes)
- `src/server/services/compras/__tests__/state-machines.property.test.ts` (30 property tests, fast-check)
- Total: 90 testes, 90 passam

## Mapa páginas → actions (para agente UI)

| Página | Permissão | Action(s) |
|--------|-----------|-----------|
| `/compras/requisicoes` | `compras:requisicao:criar` | `criarRequisicaoAction`, `actualizarRequisicaoAction`, `submeterRequisicaoAction`, `cancelarRequisicaoAction` |
| `/compras/requisicoes/[id]/aprovacao` | `compras:aprovacao:decidir` | `decidirAprovacaoAction` |
| `/compras/cotacoes` | `compras:cotacao:criar` | `criarCotacaoAction`, `enviarCotacaoAction`, `registarRespostaCotacaoAction`, `adjudicarCotacaoAction`, `cancelarCotacaoAction` |
| `/compras/pedidos` | `compras:pedido:criar` | `criarPedidoCompraAction`, `converterRequisicaoEmPedidoAction`, `actualizarPedidoCompraAction`, `enviarPedidoCompraAction`, `cancelarPedidoCompraAction` |
| `/compras/pedidos/[id]/recebimento` | `compras:recebimento:registar` | `registarRecebimentoAction` |
| `/compras/configuracoes/workflow` | `compras:configurar` | `criarConfiguracaoWorkflowAction` |
| `/fornecedores` | `fornecedores:criar` | `criarFornecedorAction`, `actualizarFornecedorAction`, `arquivarFornecedorAction` |
| `/fornecedores/[id]/contactos` | `fornecedores:editar` | `adicionarContactoFornecedorAction`, `actualizarContactoFornecedorAction`, `removerContactoFornecedorAction` |
| `/fornecedores/[id]/documentos` | `fornecedores:editar` | `adicionarDocumentoFornecedorAction`, `removerDocumentoFornecedorAction` |
| `/fornecedores/[id]/avaliacao` | `fornecedores:avaliar` | `registarAvaliacaoFornecedorAction` |
| `/fornecedores/contas-pagar` | `compras:conta-pagar:criar` | `criarContaPagarAction`, `cancelarContaPagarAction`, `registarPagamentoAction` |
| `/servicos/categorias` | `servicos:configurar` | `criarCategoriaServicoAction`, `actualizarCategoriaServicoAction` |
| `/servicos` | `servicos:criar` | `criarServicoAction`, `actualizarServicoAction`, `arquivarServicoAction` |
| `/servicos/tecnicos` | `servicos:tecnicos:criar` | `criarTecnicoServicoAction`, `actualizarTecnicoServicoAction` |
| `/servicos/agendamentos` | `servicos:agendamento:criar` | `criarAgendamentoAction`, `actualizarAgendamentoAction`, `transitarAgendamentoAction` |
| `/servicos/agendamentos/[id]/avaliacao` | `servicos:avaliar` | `registarAvaliacaoServicoAction` |
| `/servicos/contratos` | `servicos:contrato:criar` | `criarContratoServicoAction`, `actualizarContratoServicoAction`, `renovarContratoServicoAction` |

## Stubs Wave 2 a substituir na Wave 3

| Stub | Localização | Substituição |
|------|-------------|--------------|
| `stubEntradaStock` | `compras.service.ts` | `import { stockService } from '@/server/services/inventario/stock.service'` |
| `stubLancamentoContabilistico` | `conta-pagar.service.ts` | `import { contabilidadeService } from '@/server/services/financas/contabilidade.service'` |
| `stubNumeroSerie` (compras) | `compras.service.ts` | `import { proximoNumeroSerie } from '@/server/services/financas'` |
| `stubNumeroSerie` (conta-pagar) | `conta-pagar.service.ts` | idem |

## Invariantes de negócio implementados

- **Aprovação multinível**: nunca salta nível — `decidirAprovacao` avança exactamente para `nivel+1`
- **Recepção parcial**: `entradaStock` chamado por cada item com `quantidadeAceita > 0` (ADR-0003 A8)
- **Soma recebida ≤ pedida**: validado por item antes de criar `RecebimentoCompra`
- **Append-only recebimentos**: `RecebimentoCompra` nunca atualizado; correcções são registos novos
- **ContaPagar criada apenas em RECEBIDO_TOTAL**
- **Cross-tenant → 404**: `tenantId !== ctx.tenantId` em todos os serviços
- **Quorum**: QUALQUER_UM (1), TODOS (n), MAIORIA (ceil(n/2))

## Notas para Wave 3

- `compras.service.ts` usa `prisma as any` — remover após `prisma generate` incluir modelos WS B
- `gerarCodigoFornecedor`, `gerarCodigoServico`, etc. usam `count+1` — substituir por `proximoNumeroSerie` com tipo correcto
- `ContaPagar.liquidada` chama `stubLancamentoContabilistico` — Wave 3 integra WS D real com partidas `2211 DÉBITO / 1121 CRÉDITO`
- `tecnicosDisponiveis` simplificado — Wave 3 verifica conflitos de horário em `AgendamentoServico`
