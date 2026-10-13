## Contexto

Hoje uma venda no POS (`VendaService.criar`, `origem: 'POS'`) faz, numa só transacção:

1. cria a `Venda` com número da série `VENDA`;
2. dá baixa ao stock (`stockService.baixarStock`, um `MovimentoStock` por item);
3. regista o `MovimentoCaixa` (`caixaService.registarMovimentoCaixa`, tipo `VENDA`).

**Não emite documento fiscal nem gera lançamento contabilístico.** O `faturaId` da venda fica sempre `null`. A consequência é que as vendas POS **não existem para a contabilidade**:

- nem rendimento (71x) nem IVA liquidado (44331), o que torna o **apuramento de IVA (ADR-0034) incompleto**. O mapa e a pré-condição `DOCUMENTO_SEM_LANCAMENTO` só olham para `Fatura`, `NotaCredito` e `NotaDebito`, por isso as vendas POS escapam até ao controlo. **É um risco fiscal, não só de reporte**;
- o caixa (111) não reflecte o dinheiro recebido, logo o balancete, a DRE e a DFC (ADR-0037) divergem da tesouraria operacional;
- o stock baixa em quantidade, mas sem custo das vendas (611) nem crédito em inventário.

### Como o PHC CS faz (referência)

No PHC, o POS **emite documentos de facturação** (venda a dinheiro, factura, factura-recibo, nota de crédito). Esses documentos são exportados para o PHC Gestão e **integrados online na Contabilidade quando são gravados**. Cada tipo de documento de facturação tem um documento contabilístico configurado (diário, contas por artigo/família, IVA, meio de pagamento). A movimentação do caixa e do stock é consequência do mesmo documento, não um registo paralelo.

## Objectivo

Uma venda POS concluída passa **sempre** a emitir o documento fiscal. O lançamento contabilístico depende de uma **configuração** do tenant, ou seja, é **imediato** ou **diferido** (ver [Modo de integração contabilística](#modo-de-integração-contabilística)).

No modo automático, a venda gera **na mesma transacção** e **de forma atómica**:

1. **Documento comercial fiscal** do tipo *Factura-Recibo / Venda a Dinheiro* (tipo exacto a fixar no ADR, ver Decisões). Tem numeração em série própria, NUIT do cliente congelado, QR/hash e PDF como qualquer `Fatura`, e liga-se em `Venda.faturaId` (e `Fatura.vendaId`).
2. **Lançamento contabilístico** ligado ao documento (`Fatura.lancamentoId`), no diário `VENDAS`, `origem: 'VENDA'`:

   | Conta | D/C | Valor |
   |---|---|---|
   | Meio de pagamento (ver abaixo) | D | total recebido, por linha de pagamento |
   | 711 Vendas — Mercadorias (ou a conta do artigo/família) | C | base tributável |
   | 44331 IVA liquidado — operações gerais (por taxa) | C | IVA |

   Conta por meio de pagamento, a partir de `resolverContaMeioPagamento`:
   - `DINHEIRO` → 111 Caixa (ou a subconta do caixa da sessão);
   - `CARTAO` / `TRANSFERENCIA` → conta de bancos da `ContaBancaria` associada ao terminal;
   - `MPESA` / `EMOLA` → conta da carteira móvel (`CARTEIRA_MOVEL`, #78);
   - `CREDITO` → 411 Clientes c/c. Neste caso o documento é **Factura** e não Factura-Recibo, e exige cliente identificado.

   Pagamentos mistos geram várias partidas a débito. O troco não é receita: o débito em caixa é o valor líquido entregue.

3. **Custo das vendas** (se o tenant usar inventário permanente — ver Decisões): D 611 Custo dos inventários vendidos / C conta de inventário de mercadorias, ao custo da saída.

4. **Stock e caixa** mantêm-se, mas passam a referenciar o documento fiscal (`documentoReferenciaTipo: 'Fatura'`) além da venda.

## Defeitos encontrados durante a análise (corrigir no âmbito desta issue)

- **D1 — Caixa recebe valores não monetários.** `registarMovimentoCaixa` é chamado com `valor: total` qualquer que seja o `tipo` de pagamento: uma venda por cartão ou M-Pesa entra como dinheiro na gaveta e o fecho de sessão nunca bate certo. Só a parte `DINHEIRO` (líquida de troco) deve gerar `MovimentoCaixa`.
- **D2 — `Fatura.clienteId` é obrigatório, `Venda.clienteId` não.** O POS aceita consumidor final anónimo. É preciso um cliente técnico "Consumidor Final" por tenant (criado no provisionamento, `tenant-bootstrap`) ou tornar `Fatura.clienteId` opcional. Recomendação: cliente técnico, para não abrir excepções no mapa de IVA nem na integridade referencial.
- **D3 — `emitirFatura` abre a sua própria transacção** (`prismaBase.$transaction`) e chama `exigirEmailConfirmadoParaEmitir()`. Não pode ser chamado de dentro da transacção da venda. É preciso extrair um `emitirDocumentoEmTx(tx, …)` reutilizado por `emitirFatura`, `converterProformaEmFatura` e pelo POS.
- **D4 — Plano de contas de referência sem conta folha de inventário de mercadorias.** No `plano-contas-pgc.json`, o grupo `22 Mercadorias` só tem `221` (em trânsito) e `222` (em poder de terceiros). Falta a conta de mercadorias em armazém para creditar o custo das vendas.

## Requisitos técnicos

- **Atomicidade:** venda, documento, lançamento, stock e caixa ficam numa única `$transaction`. Se alguma parte falhar, nada fica gravado (nem venda órfã sem documento, nem documento sem lançamento).
- **Período contabilístico (ADR-0033):** se o período da data da venda estiver fechado, a venda é recusada com erro de negócio claro. Validar também na **abertura da sessão POS** (falhar cedo, não com o cliente ao balcão).
- **Travão de e-mail confirmado:** aplicar na abertura de sessão POS, não por venda. Sem isso, um tenant com e-mail por confirmar fica com o POS a falhar em cada venda.
- **Contas configuráveis:** os códigos fixos `PGC_FATURACAO` são o fallback. A conta de vendas resolve-se por artigo, depois família, depois omissão (modelo PHC). Se for preciso um modelo de configuração novo, entra no ADR.
- **Decimal** em todo o cálculo; arredondamento do IVA por linha e por taxa, igual a `calcularTotaisLinhas`. Invariante: `Σ débitos = Σ créditos = total` (sem CMV).
- **Idempotência:** um duplo clique ou um retry de rede no `criarVenda` não pode emitir dois documentos fiscais (chave de idempotência por pedido do terminal).
- **Desempenho:** o tempo de resposta do POS é crítico. A transacção ganha N inserções, mas nenhuma leitura pesada; medir com k6 antes e depois.
- **Comissão** continua pós-commit e best-effort, sem alterações.

## Ciclo de vida (anulação, devolução, troca)

- **Cancelar uma venda POS** emite uma **nota de crédito** ligada ao documento, com estorno contabilístico (`construirLancamentoNotaCredito`), reentrada de stock (com estorno do custo das vendas) e saída de caixa se houve reembolso em dinheiro. Nunca apagar ou alterar o documento original.
- `DevolucaoService.processar` e `TrocaService` passam a emitir nota de crédito (e nova factura-recibo na troca) pelo mesmo caminho.
- O fecho de sessão POS/caixa **não** gera lançamentos, porque cada documento já lançou o seu. A folha de caixa lista os documentos emitidos na sessão, como no PHC.

## Decisões em aberto → ADR-0041

1. **Tipo de documento:** Factura-Recibo vs. Venda a Dinheiro vs. Talão + factura a pedido, à luz do regime de facturação moçambicano (requisitos do documento, limite para consumidor final sem NUIT). **Exige confirmação legal**, como a #64 para o ADR-0034. Recomendação provisória: Factura-Recibo para pagamento imediato e Factura para `CREDITO`, com série própria `FATURA_RECIBO` por ponto de venda.
2. **Inventário permanente vs. intermitente.** O PHC suporta os dois; no intermitente o custo das vendas apura-se no fim do período a partir do inventário final. O permanente exige **custo de saída**, e hoje não existe custo médio: `MovimentoStock` não guarda custo e o `Produto` só tem `precoCompra`. Recomendação: permanente com custo médio ponderado, que é coerente com stock em tempo real. Até haver custo médio, ou se usa `precoCompra` como aproximação explícita, ou o custo das vendas fica fora do âmbito e passa para uma issue própria.
3. **Lançamento por venda vs. lançamento agregado por sessão.** O PHC integra documento a documento. Recomendação: por documento, que dá rastreabilidade documento → lançamento e é o que a pré-condição `DOCUMENTO_SEM_LANCAMENTO` assume. O volume de lançamentos é aceitável.
4. **Vendas POS históricas sem documento:** regularizar com um script (documentos com a data original, se o período estiver aberto) ou aceitar a lacuna e documentá-la.

## Critérios de aceitação

- [ ] Venda POS paga gera Factura-Recibo numerada, ligada à venda, com PDF/QR.
- [ ] Lançamento equilibrado ligado ao documento, com a conta certa por meio de pagamento (incluindo pagamentos mistos e troco).
- [ ] Venda POS a crédito gera Factura, débito em 411, e exige cliente identificado.
- [ ] Consumidor final anónimo emite documento contra o cliente técnico.
- [ ] `MovimentoCaixa` só para a parte em dinheiro (D1); fecho de sessão bate certo com vendas mistas.
- [ ] Falha em qualquer passo reverte tudo (teste de integração com falha injectada no lançamento).
- [ ] Período fechado e e-mail por confirmar recusados na abertura da sessão POS.
- [ ] Retry do mesmo pedido não duplica o documento.
- [ ] Cancelamento, devolução e troca emitem nota de crédito com estorno.
- [ ] Apuramento de IVA do período inclui as vendas POS (teste com o seed `demo-vendas`).
- [ ] Balancete: 111 / 711 / 44331 reflectem as vendas POS; DFC classifica o recebimento.
- [ ] Custo das vendas (D 611 / C inventário) conforme a decisão 2.
- [ ] Testes unitários das funções puras de construção do lançamento (padrão `construirLancamentoFatura`); E2E do POS actualizado.

## Referências

- Código: `apps/erp/src/server/services/comercial/venda.service.ts` (`VendaService.criar`, §3d), `apps/erp/src/server/services/financas/faturacao.service.ts` (`emitirFatura`, `construirLancamentoFatura`, `PGC_FATURACAO`), `caixa.service.ts` (`registarMovimentoCaixa`), `meio-pagamento.service.ts` (`resolverContaMeioPagamento`), `apuramento-iva.service.ts` (§4 `DOCUMENTO_SEM_LANCAMENTO`), `apps/erp/src/app/(dashboard)/pos/_components/pos-terminal.tsx`
- ADR-0033 (períodos), ADR-0034 (apuramento IVA, #64), ADR-0037 (DFC), ADR-0039 (nota de débito), #78 (carteira móvel), `docs/handoff/ws-c-comercial.md` §5 (POS sem cliente)
- PHC: [Descritivo PHC POS CS](https://www.phc.pt/enews/DescricaoCompletaPOS.pdf), [Descritivo PHC Contabilidade CS](https://web.trimatriz.com/SITE_12/UserFiles/Downloads/PHCContabilidade.pdf)
