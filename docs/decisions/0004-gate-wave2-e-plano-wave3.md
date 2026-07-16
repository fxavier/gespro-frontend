# ADR-0004 — Gate da Wave 2 (correções) e plano da Wave 3

- **Data**: 2026-07-10
- **Estado**: Aceite (correções a decorrer)
- **Autor**: orchestrator (após code-review da Wave 2)

## Gate Wave 2 — REJEITADO → ronda de correção
`pnpm check` verde (509 testes) mas o code-review apanhou o que testes/`tsc` não vêem.

### BLOCKERs (isolamento de tenant) — corrigidos nesta ronda
- **B1** `contabilidade.service.ts:613` `marcarItemReconciliado` — `update` por id cru sem scope de tenant (fuga cross-tenant com escrita, exposta via action). → WS D.
- **B2** `ticket.service.ts:634` `registarVisualizacao` — `update` por id sem `ctx`/tenant. → WS F (interface incluída).

### Avisos de correção (não resolvidos por wiring) — corrigidos nesta ronda
- **W1** stock check-then-act não atómico → decremento condicional `updateMany(saldo gte)` (A).
- **W3** `registarProvaEntrega` contorna a máquina de estados (F).
- **W5** fallback de aprovação auto-aprova acima das bandas (B).
- **W6** `catch{}` dentro da `$transaction` mascara erro e perde comissões (C).
- **W8** WS B corre com `prisma as any` (typecheck desligado) + dinheiro em float (B); `apurarCusto` soma horas como custo (E).
- **W9** FKs (`clienteId`/`vendaId`/`contaBancariaId`) não validadas contra o tenant (D).

### Correcto (confirmado pelo review)
Fronteiras de módulo limpas (imports só de interfaces); débito=crédito imposto no serviço; `proximoNumeroSerie` de D atómico e sem lacunas; actions via `createSafeAction` bem formadas; máquinas de estado bem cobertas por property tests.

## Plano da Wave 3 — 5 pontos de wiring (stubs → contratos reais) + limpeza
Os stubs da Wave 2 são aceitáveis SÓ com este plano explícito (requisito do review).

| # | Wiring | Dono | Detalhe |
|---|---|---|---|
| 1 | **Produção → Stock** | E (consome A) | Injectar `IStockService` real; `reservarStock`→guardar `reservaId` real→`confirmarConsumoStock`; entrada do produto acabado; configurar armazéns MP/PA (remover placeholders). Remover `stockServiceMock`. |
| 2 | **POS/Venda → Stock+Caixa** | C (consome A,D) | Na tx da venda: `baixarStock` (A) + `registarMovimentoCaixa` (D); `Venda.numero` via `proximoNumeroSerie(tx,'VENDA')`; corrigir `libertarStock` para o `reservaId` real (não o id da venda). |
| 3 | **Receção → Stock; ContaPagar → Contabilidade** | B (consome A,D) | `entradaStock` (A) na receção; liquidação de `ContaPagar`→`registarLancamentoContabilistico` (D); numeração via D. |
| 4 | **Factura → Contabilidade** | D (intra) | `emitirFatura`→`registarLancamentoContabilistico` automático (débito Clientes / crédito Receita+IVA). |
| 5 | **Operações → Numeração** | F (consome D) | Substituir `gerarNumeroSerie` local por `proximoNumeroSerie(tx,tipo)` de D. |
| — | **Limpeza de dados fictícios** | orquestrador | Purgar `reservaId:'res-...'`, `mov-...`, números `Date.now()`/aleatórios persistidos por seeds/execuções manuais; re-seed limpo. |
| — | **Analytics reais** | G | Agregados reais sobre os domínios agora povoados (remover stubs a 0). |

## Gate de saída da Wave 3
Migrations de raiz aplicáveis num DB limpo; zero imports de `src/data/*` (o 2.7 acontece com a UI); `pnpm check` verde; um teste E2E por fluxo integrado (venda→stock→caixa; receção→stock→conta a pagar; factura→contabilidade) a provar a transacção real.
