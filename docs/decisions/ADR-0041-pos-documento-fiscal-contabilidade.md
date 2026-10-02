# ADR-0041 — Venda POS emite documento fiscal e lança na contabilidade

- **Estado**: Proposto (a decisão 1 espera confirmação legal, como a #64 para o ADR-0034)
- **Data**: 2026-10-02
- **Contexto**: Uma venda POS dá baixa ao stock e regista caixa, mas não emite documento fiscal nem lança na contabilidade — o IVA liquidado, o caixa (111) e a receita (711) das vendas de balcão não existem para o apuramento, o balancete, a DRE nem a DFC
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (períodos), [ADR-0034](./ADR-0034-apuramento-iva.md) (apuramento do IVA)
- **Relacionados**: [ADR-0037](./ADR-0037-demonstracao-fluxos-caixa.md) (DFC), [ADR-0039](./ADR-0039-nota-debito-contabilidade.md) (ND e anulação por estorno)

## Contexto

`VendaService.criar` (origem `POS`) cria a `Venda`, dá baixa ao stock e grava um `MovimentoCaixa` pelo
**total**, qualquer que seja o meio de pagamento. Não há `Fatura`, `Venda.faturaId` fica `null` e nada
chega ao razão. O ADR-0034 apura o IVA a partir do razão e exige que cada documento tenha lançamento
(`DOCUMENTO_SEM_LANCAMENTO`); a venda POS escapa aos dois. O PHC CS resolve isto emitindo um documento
de facturação no POS e integrando-o na contabilidade quando é gravado.

## Decisão

### 1. Tipo de documento — Factura-Recibo e Factura

- Venda paga no acto: **Factura-Recibo**, uma `Fatura` numerada na série nova
  `TipoSerieDocumento.FATURA_RECIBO` (prefixo `FR`), nascida `PAGA` (`totalPago = total`).
- Venda a crédito (pagamento `CREDITO`, sozinho ou com outros meios): **Factura** na série `FATURA`,
  nascida `EMITIDA`, com o valor em dívida em 411. Exige cliente identificado (`CLIENTE_OBRIGATORIO_CREDITO`).
- A designação do documento vem do tipo da série (como já faz o PDF via `ROTULO_TIPO_SERIE`); não se
  acrescenta `Fatura.tipo`.
- Série por tenant, não por ponto de venda: o GestPro não tem a entidade «ponto de venda».
- **Por confirmar** (issue `[HUMANO]`): se o regime moçambicano aceita a Factura-Recibo a consumidor final
  sem NUIT e qual o limite. Até lá o desenho não muda; muda, quando muito, o rótulo.

### 2. Consumidor final — cliente técnico

`Fatura.clienteId` continua obrigatório. Cada tenant tem um cliente técnico **Consumidor Final**
(código `CF-000000`, NUIT `999999999`), criado no `tenant-bootstrap` e, para os tenants que já existem, na
migração. Uma venda POS sem cliente factura contra ele. Não se abre excepção no mapa de IVA nem na
integridade referencial.

O cliente técnico é **protegido**: `ClienteService.atualizar` e `desativar` recusam-no com
`CLIENTE_TECNICO_PROTEGIDO` e não mudam nada. O NUIT `999999999` é uma sentinela que o validador
`nuit()` recusa de propósito — nunca entra por formulário, só pelo bootstrap e pela migração. A confirmar
com a questão legal do §1.

### 3. Lançamento por documento, na mesma transacção

Cada documento lança o seu (`Fatura.lancamentoId`), no diário `VENDAS`, `origem: VENDA` — é o que a
pré-condição `DOCUMENTO_SEM_LANCAMENTO` já assume. Venda, documento, lançamento, stock e caixa ficam numa
**única** `$transaction`; uma falha em qualquer passo não deixa nada gravado.

| Conta | D/C | Valor |
|---|---|---|
| meio de pagamento (§4), por linha de pagamento | D | valor aplicado à venda |
| 711 Vendas — Mercadorias | C | base tributável |
| 44331 IVA liquidado — operações gerais | C | IVA |

Invariante: `Σ débitos = Σ créditos = total`. As linhas da factura e o IVA saem do mesmo cálculo de
totais da facturação (por linha, a 2 casas), não do cálculo antigo do POS.

O núcleo `emitirDocumentoEmTx(tx, …)` passa a ser partilhado por `emitirFatura`,
`converterProformaEmFatura` (que até aqui não lançava — corrigido) e o POS. O travão de e-mail
confirmado fica **fora** do núcleo, em quem tem sessão; no POS aplica-se na abertura da sessão (§6).
O núcleo grava também `Fatura.nuitCliente` (NUIT congelado).

### 4. Conta por meio de pagamento

`PagamentoVenda.valor` é o valor **aplicado à venda** (líquido de troco); `troco` é informativo.
`Σ pagamentos.valor = total`, senão `PAGAMENTOS_NAO_BATEM_TOTAL`.

| Meio | Conta a débito |
|---|---|
| `DINHEIRO` | 111 Caixa; gera `MovimentoCaixa` pelo valor (só esta parte) |
| `CARTAO`, `TRANSFERENCIA`, `MPESA`, `EMOLA` | a `ContaBancaria` configurada para o meio (`ContaMeioPagamentoPOS`); sem configuração, **121 Depósitos à ordem** |
| `CREDITO` | 411 Clientes c/c |

A conta de omissão segue o princípio do `PGC_FATURACAO`: os códigos fixos são o fallback, a configuração
por tenant manda. A configuração valida a compatibilidade com `TIPOS_CONTA_POR_FORMA` (M-Pesa e e-Mola
só em `CARTEIRA_MOVEL`).

Configura-se em `/contabilidade/configuracoes/meios-pagamento-pos` com a permissão existente
`financas:configurar` (não uma permissão própria: uma permissão nova não chega aos papéis dos tenants
existentes sem novo seed). Desactivar uma `ContaBancaria` configurada **não** muda o débito — a conta PGC
continua válida e o dinheiro entrou lá; recusar a venda ao balcão ou cair em silêncio na 121 seriam
piores. A página avisa por linha e a configuração corrige-se lá.

### 5. Idempotência

O terminal gera uma chave por tentativa de venda; `Venda.chaveIdempotencia` com
`@@unique([tenantId, chaveIdempotencia])`. Um retry com a mesma chave devolve a venda já gravada e não
emite segundo documento.

### 6. Período e e-mail falham na abertura da sessão POS

`abrirSessaoPOS` recusa se o período contabilístico de hoje não estiver aberto (`PERIODO_FECHADO`) ou se
o e-mail não estiver confirmado (`EMAIL_POR_CONFIRMAR_EMISSAO`), e confirma que a sessão de caixa existe,
está aberta e é do utilizador. A venda continua a ser recusada pelo lançamento se o período fechar entretanto.

### 7. Estados da venda POS

A venda POS nasce `CONCLUIDA` quando paga e `FATURADA` quando a crédito — deixa de ficar `PENDENTE`
para sempre, que impedia o fecho da sessão POS.

### 8. Ciclo de vida

Nunca se altera nem apaga o documento. Anular uma venda POS, devolver ou trocar emite **nota de crédito**
pelo núcleo em transacção (`emitirNotaCreditoEmTx`) com o estorno contabilístico do
`construirLancamentoNotaCredito`, reentrada de stock e, quando houve dinheiro devolvido, saída de caixa e
liquidação da NC por devolução. A troca emite nova Factura-Recibo pelo mesmo caminho da venda. O fecho de
sessão não gera lançamentos.

### 9. Fora de âmbito (issues próprias)

- **Custo das vendas** (D 611 / C inventário) e a conta folha de mercadorias em armazém (D4): sem custo de
  saída (não há custo médio; `MovimentoStock` não guarda custo), um lançamento a `precoCompra` seria um
  número inventado com aspecto de contabilidade. Fica para uma issue com custo médio ponderado; a conta
  folha entra com o primeiro escritor.
- **Conta de vendas por artigo/família**: hoje não há modelo; 711 é a omissão.
- **Modo de integração diferido**: só o modo imediato é implementado.
- **Vendas POS históricas sem documento**: lacuna aceite e documentada; a regularização por script é
  issue própria. O seed de demonstração não muda (as golden da DFC e da projecção dependem dele).
- **QR/hash** do documento fiscal: nenhuma `Fatura` os tem hoje; é transversal.

## Consequências

- O apuramento do IVA passa a ver as vendas POS no razão **e** nos documentos (base 44331 coerente).
- O balancete, a DRE e a DFC reflectem 111/121/711/44331 das vendas de balcão; a DFC não precisa de
  alterações (classifica por variação de saldo de conta).
- O fecho de caixa bate certo com vendas mistas: só o dinheiro entra na gaveta.
- A transacção da venda ganha um punhado de inserções e nenhuma leitura pesada.
