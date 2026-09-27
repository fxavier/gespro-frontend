# Tickets — Acções sobre notas de crédito, proformas e cotações (#148)

Deriva de [`intent.md`](intent.md). Fatias tracer-bullet (skill `tracer-bullet-tickets`): cada ticket
fecha num comando que passa ou falha. Ordem: contratos → oráculos → serviço → UI → E2E. Quem escreve os
oráculos não os implementa.

## Desenho fixado

- **Invariantes**
  - **N1** — NC `CANCELADA` ⇒ o lançamento dela está `ESTORNADO` e `lancamentoEstornoId` aponta para o
    estorno; nenhuma NC cancelada tem lançamento vivo.
  - **N2** — NC `LIQUIDADA` por `DEVOLUCAO` ⇒ `lancamentoLiquidacaoId` com 411 a débito e a conta do meio
    a crédito, pelo total da NC.
  - **N3** — NC `LIQUIDADA` por `COMPENSACAO` ⇒ o `totalPago` da factura original subiu exactamente o total
    da NC, e não há lançamento novo.
  - **N4** — `motivoCancelamento` preenchido em todo o documento `CANCELADA`; `observacoes` inalterado.
  - **N5** — liquidar e cancelar a mesma NC em simultâneo ⇒ exactamente uma operação passa.
- **Códigos**: `NC_COMPENSACAO_EXCEDE_SALDO`, `FATURA_NAO_COMPENSAVEL`, `NC_PERIODO_IVA_APURADO`,
  `NC_DATA_ANTERIOR_EMISSAO`, `PERIODO_FECHADO` (existente), `TRANSICAO_INVALIDA` (existente),
  `MEIO_PAGAMENTO_SEM_PERMISSAO`.
- **Permissões**: nenhuma nova (tabela no `intent.md`).

---

- [ ] 1. [BLOCKING] Migração — **só o orquestrador**
  - [ ] 1.1 `financas.prisma`:
    - `NotaCredito`: `lancamentoEstornoId String?`, `lancamentoLiquidacaoId String?`,
      `formaLiquidacao FormaLiquidacaoNC?`, `dataLiquidacao DateTime?`;
    - enum `FormaLiquidacaoNC { DEVOLUCAO COMPENSACAO }`;
    - `Proforma.motivoCancelamento String?` e `CotacaoComercial.motivoCancelamento String?`.
  - [ ] 1.2 Migração via `migrate diff` (aditiva; nenhum `UPDATE`).
  - ✅ Gate:
    - `npx prisma validate`;
    - `migrate deploy` verde;
    - `migrate diff` = *empty migration*.

- [ ] 2. [BLOCKING] Contratos
  - [ ] 2.1 `lib/validations/faturacao.ts`:
    - `CancelarDocumentoSchema { id: idEntidade(), motivo: 3..500 }`;
    - `LiquidarNotaCreditoSchema`, discriminado por `forma`:
      - `DEVOLUCAO`: `formaPagamento`, `contaBancariaId?`, `data`;
      - `COMPENSACAO`: `data`.
  - [ ] 2.2 `faturacao.interface.ts`:
    - assinaturas `liquidarNotaCredito(input, ctx)` e `cancelarCotacaoComercial(id, motivo, ctx)`;
    - novos campos nos tipos.
  - [ ] 2.3 `contabilidade.service.ts`: `estornarLancamentoEmTx(tx, input, ctx)`, a variante composta. A
    `estornarLancamento` actual passa a delegar nela (mesmo comportamento, mesmo `FOR SHARE`).
  - ✅ Gate:
    - `npx tsc --noEmit` verde;
    - os testes existentes de `estornarLancamento` verdes.

- [ ] 3. Oráculos do serviço (verificador)
  - [ ] 3.1 `financas/__tests__/nc-accoes.test.ts`, contra um duplo com estado:
    - N1 a N4;
    - `PERIODO_FECHADO` sem escrita nenhuma;
    - compensação com saldo insuficiente ⇒ `NC_COMPENSACAO_EXCEDE_SALDO`;
    - devolução sem permissão de caixa/banca ⇒ recusa;
    - transições inválidas (NC `LIQUIDADA` ⇒ cancelar recusa, e o inverso);
    - cross-tenant ⇒ 404.
  - [ ] 3.2 `financas/__tests__/cancelar-proforma-cotacao.test.ts`:
    - N4;
    - cotação só em `RASCUNHO`;
    - `observacoes` intacto.
  - [ ] 3.3 `test/integration/nc-accoes.test.ts`:
    - N5 (liquidar ‖ cancelar em simultâneo ⇒ uma passa);
    - N1 contra Postgres real (o lançamento fica `ESTORNADO`).
  - ✅ Gate: os três ficheiros vermelhos pelos motivos certos (serviço por implementar), sem erros do
    próprio teste.

- [ ] 4. Serviço
  - [ ] 4.1 `faturacao.service.ts`, `cancelarNotaCredito`:
    - `FOR UPDATE` na NC;
    - `estornarLancamentoEmTx`;
    - grava `lancamentoEstornoId` e `motivoCancelamento`.
  - [ ] 4.2 `liquidarNotaCredito`:
    - devolução: `resolverContaMeioPagamento`, `registarLancamentoContabilistico` (411 → meio) e, em
      numerário, `registarMovimentoCaixa`;
    - compensação: `FOR UPDATE` na factura, abate o `totalPago`, actualiza o estado da factura;
    - em ambos os casos grava forma e data.
  - [ ] 4.3 `cancelarProforma`: `motivoCancelamento` em vez de `observacoes`. `cancelarCotacaoComercial`
    novo.
  - [ ] 4.4 Actions em `faturacao.actions.ts`:
    - schema e permissões do `intent.md`;
    - a devolução confirma a permissão de caixa/banca dentro do handler;
    - action nova de cancelar cotação.
  - [ ] 4.5 `AUDIT_MODELS` inclui `NotaCredito`, `Proforma` e `CotacaoComercial` (confirmar e acrescentar).
  - ✅ Gate:
    - oráculos do ticket 3 verdes;
    - `pnpm test:integration` verde;
    - `pnpm check` verde (excepto resíduos locais conhecidos);
    - `pnpm gates` verde.

- [ ] 5. Detalhe da NC (fecha #152)
  - [ ] 5.1 `/faturacao/nota-credito/[id]/page.tsx` (Server Component):
    - cabeçalho, linhas, factura original (ligação), estado, motivo e liquidação (forma, data e ligação ao
      lançamento);
    - `notFound()` no cross-tenant.
  - [ ] 5.2 Barra de acções do detalhe (Liquidar, Cancelar) conforme `TRANSICOES_NOTA_CREDITO` e as
    permissões.
  - ✅ Gate:
    - smoke autenticado, em que o «Ver detalhe» da lista abre o documento;
    - `pnpm build` verde.

- [ ] 6. Formulários de liquidar e cancelar
  - [ ] 6.1 `/faturacao/nota-credito/[id]/liquidar`:
    - escolha da Forma;
    - a Compensação só aparece com saldo suficiente, com o saldo visível;
    - a Devolução só com permissão de caixa/banca, com forma de pagamento, conta (quando a forma a exige)
      e data de Maputo.
  - [ ] 6.2 `/[id]/cancelar` para NC, proforma e cotação: motivo obrigatório e aviso na NC («O lançamento
    da nota de crédito será estornado»). Um componente partilhado.
  - [ ] 6.3 Barras de acções da proforma e da cotação com «Cancelar». Menus ⋯ das três listas com as
    mesmas acções. O «Liquidar» da lista de NC deixa de dar 404.
  - ✅ Gate:
    - `pnpm build` verde;
    - smoke: cancelar uma NC (o lançamento aparece estornado no razão);
    - smoke: liquidar por compensação (o saldo da factura desce);
    - smoke: cancelar uma proforma e uma cotação em rascunho;
    - smoke: um GESTOR sem permissão de caixa não vê «Devolução».

- [ ] 7. E2E, documentação e fecho
  - [ ] 7.1 `e2e/21-nc-proforma-cotacao.spec.ts` (verificador):
    - emite a NC num exercício de teste isolado, ou repõe o estado no fim;
    - cancela proforma/cotação criadas pelo próprio teste.
  - [ ] 7.2 `e2e/a11y.a11y.ts`: detalhe da NC e as rotas de liquidar e cancelar, nos dois temas.
  - [ ] 7.3 Documentação:
    - manual 06: secções «Como liquidar uma nota de crédito» e «Como cancelar…»;
    - `08-lacunas-conhecidas`: retirar #148 e #152.
  - ✅ Gate:
    - o E2E verde 3× seguidas;
    - `pnpm e2e:a11y` verde;
    - `pnpm check` e `pnpm gates` verdes.

---

**Leitura dos gates, de cima a baixo:**

1. as colunas existem;
2. os contratos compilam e o estorno compõe-se numa transacção;
3. os invariantes estão escritos e falham;
4. o serviço cumpre-os, também em concorrência;
5. a NC tem página;
6. as quatro acções correm no build de produção com as permissões certas;
7. o fluxo passa em E2E e em axe.
