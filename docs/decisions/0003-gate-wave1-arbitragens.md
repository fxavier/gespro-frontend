# ADR-0003 — Arbitragens do gate da Wave 1 (correções pré-migration)

- **Data**: 2026-07-10
- **Estado**: Aceite (owner a confirmar #7 e #11)
- **Autor**: orchestrator (após parecer do code-reviewer)

## Contexto
O code-reviewer rejeitou o gate da Wave 1 com 6 BLOCKERs + 10 avisos. Causa-raiz:
consumidores criaram **tipos-espelho locais** dos contratos dos fornecedores que
divergem (nomes de campo, forma das partidas, ordem de argumentos). `tsc` passa
(cada WS tipa o seu espelho) mas a integração da Wave 2 falharia. Vários pontos
tocam **DDL** (enum, defaults, tenantId) e têm de fechar ANTES de gerar migrations.

## Decisões (aplicáveis por todos os WS na ronda de correção)

1. **Contratos têm fonte única.** O consumidor **importa** o tipo do fornecedor;
   proibido tipo-espelho local. (B1–B5)
   - C importa `BaixaStockInput`/`ReservaStockInput`… de `@/lib/validations/stock` e o tipo de movimento de `@/lib/validations/caixa`.
   - B importa `EntradaStockInput` de A e `RegistarLancamentoContabilisticoInput` de D.
   - E: `StockContratoA = Pick<IStockService, 'reservarStock'|'confirmarConsumoStock'|'libertarStock'|'entradaStock'>`; guarda `reservaId` devolvido por A (em `ConsumoProducao`).
2. **`tenantId` em TODOS os modelos de negócio**, incluindo linhas/filhos (`Item*`, `Linha*`, `Componente*`, etc.). Regra literal da skill + isolamento defensivo; barato agora, migration dolorosa depois. (A1)
3. **Numeração sequencial unificada em D.** `TipoSerieDocumento` cobre **todos** os documentos sequenciais (fiscais + operacionais: VENDA, SESSAO_CAIXA, REQUISICAO_COMPRA, COTACAO_RFQ, PEDIDO_COMPRA, CONTA_PAGAR, PAGAMENTO, RECEBIMENTO, ORDEM_PRODUCAO, ATIVIDADE, TICKET, ENTREGA, …). Assinatura única `proximoNumeroSerie(tx, tipo, ctx)`. Todos os WS numeram via este contrato. (B6, #12)
4. **IVA como fracção** `Decimal(9,6)` em todo o lado (0.16). G corrige `taxaIvaDefault` 16→0.16. (A2)
5. **Remover `Venda.lojaId`/`SessaoPOS.lojaId`** — multi-loja adiado para módulo futuro. (A7)
6. **Tipos partilhados** em `src/server/services/types.ts`: `Ctx { tenantId, userId }`, `TxClient = Prisma.TransactionClient`. `tx` é 1.º parâmetro obrigatório nos contratos transaccionais. (N2, N3)
7. **Dinheiro nos inputs de contrato** como `Prisma.Decimal`/string decimal, nunca `number` JS (evita falha de igualdade débito=crédito). (A9)
8. **Enums pt-PT + prefixo `Status*`**; F alinha `Estado*`→`Status*` e `PLANEJADA`→`PLANEADA`. (N1)
9. **Interfaces de ciclo de vida em falta**: F cria serviços+`TRANSICOES` de `Rota`/`Entrega`/`Abastecimento`; B de `ContaPagar`/`Pagamento`; C de `SessaoPOS`/`Comissao`. (A6)
10. **`import 'server-only'`** em todos os ficheiros de interface de serviço (A, B, C, D em falta). (A5)
11. **DDL**: A adiciona unicidade a `SaldoStock` (índice parcial na migration + sentinela p/ `varianteProdutoId`); D alinha constraint de `Lancamento.numero` (`[tenantId, diarioId, periodoFiscal, numero]`). (A3, A4)
12. **Armazém por defeito** (A10): `CreateVendaSchema` ganha `localizacaoOrigemId?`; o serviço de venda resolve o default por tenant na Wave 2.

## Pendente do owner
- **#7** — Venda única com `origem`: code-reviewer **concorda**; recomenda adicionar campos de encomenda opcionais (data prevista, endereço) ou delegar à `Entrega`. Aguarda confirmação final.
- **#11** — plano PGC-NIRF oficial: seed é spec 01 task 10; JSON já extraído (504 contas). Sem impacto nos contratos.

## Gate
Após a ronda de correção: nova passagem rápida do code-reviewer só sobre contratos; se sem BLOCKERs, gerar migrations A→B→C→D→E→F→G.
