# ADR-0045 — Ciclo da despesa e controlo de disponibilidade orçamental

- **Estado**: Proposto
- **Data**: 2026-10-12
- **Contexto**: Spec 24 (Contabilidade Orçamental) · Épico WS-3
- **Depende de**: [ADR-0043](./ADR-0043-dominio-orcamental-financiamentos.md), [ADR-0044](./ADR-0044-imputacao-analitica-multipla.md)
- **Relacionados**: [ADR-0046](./ADR-0046-fundos-cambio-fifo-tranche.md) (conversão), [ADR-0036](./ADR-0036-projecao-tesouraria.md) (compromissos de tesouraria — conceito distinto), [ADR-0018](./ADR-0018-desempenho-capacidade.md)
- **Skills**: `engineering:architecture`, `domain-modeling`, `estado-com-escritor`, `tdd`

## Contexto

Controlar a despesa **antes** de ela acontecer exige fases que a contabilidade geral não regista: a
reserva de dotação quando alguém pede (cabimento) e a obrigação quando se encomenda (compromisso). As
fases seguintes, a execução (a despesa reconhecida) e o pagamento, já estão no razão.

O GestPro já tem a cadeia documental de compras (requisição → pedido → recepção → conta a pagar →
pagamento), o payroll a lançar via `registarLancamentoContabilistico` e os lançamentos manuais. O
alinhamento de 2026-10-12 pôs as quatro origens no MVP (compras, salários, adiantamentos de
actividade, lançamentos manuais) e fixou a regra «**bloqueia acima do saldo + tolerância**».

O termo «compromisso» já está ocupado pelo `CompromissoTesouraria` (ADR-0036), uma previsão de caixa.
Aqui o termo qualifica-se sempre: **compromisso orçamental**.

## Decisão

### 1. Livro append-only de movimentos orçamentais

```
MovimentoOrcamental {
  id, tenantId, financiamentoId, linhaControloId,
  fase   CABIMENTO | COMPROMISSO | EXECUCAO | PAGAMENTO | ADIANTAMENTO
  valorMzn Decimal(18,2), valorMoeda Decimal(18,2), taxa Decimal(18,6), provisorio Boolean,
  origemTipo, origemId, origemLinhaId?, lancamentoId?, movimentoAnuladoId?,
  data, criadoPorId, createdAt
}
@@index([tenantId, linhaControloId, fase]) @@index([tenantId, origemTipo, origemId])
```

- Os valores são **com sinal**: libertar um cabimento é um movimento `CABIMENTO` negativo. Não há
  `UPDATE` nem `DELETE`, e um gate novo (`gate-orcamental`, no molde do `gate-periodo`) recusa
  escritas fora de `orcamental/movimento.service.ts`.
- Os saldos por fase **derivam-se sempre** por `SUM`. Não há contador em lado nenhum. É a lição de
  `valorUtilizado` e de `ContaBancaria.saldoAtual`.
- Na cadeia cabimento → compromisso → execução, passar de fase são **dois movimentos na mesma
  transacção**: `COMPROMISSO +X` e `CABIMENTO −min(X, cabimentado da origem)`. `PAGAMENTO` e
  `ADIANTAMENTO` são medidas paralelas e não consomem a execução.
- **Moeda de medida**: as medidas em aberto e o disponível medem-se **na moeda do acordo**. O
  `valorMzn` dos movimentos de cabimento e compromisso é informativo. Ao consumir, o movimento
  negativo leva o `valorMoeda` consumido e o `valorMzn` proporcional ao seu movimento de origem. Ao
  libertar o último remanescente, leva o `valorMzn` exacto que falta, para não deixar resíduo.

Medidas por linha de controlo:

| Medida | Fórmula |
|---|---|
| Cabimentado em aberto | Σ `CABIMENTO` |
| Comprometido em aberto | Σ `COMPROMISSO` |
| Executado | Σ `EXECUCAO` |
| Pago | Σ `PAGAMENTO` |
| Adiantado por justificar | Σ `ADIANTAMENTO` |
| **Disponível** | Dotação vigente − cabimentado − comprometido − executado |

O pagamento e o adiantamento **não** consomem disponibilidade: o adiantamento já consumiu como
compromisso.

**Alternativa rejeitada — estado por documento («este pedido está comprometido»), com saldos
calculados por junção aos documentos.** Cada origem (requisição, pedido, folha, adiantamento,
lançamento) teria a sua regra de cálculo, e a disponibilidade seria uma `UNION` de cinco consultas
que se desalinham à primeira origem nova. O livro normaliza as origens.

**Alternativa rejeitada — lançar cabimento e compromisso no razão (contas de ordem).** O PGC-NIRF não
tem uma classe orçamental equivalente à da contabilidade pública. Pôr reservas no razão poluiria o
balancete, a DFC e o encerramento, que este repositório protege com testes golden.

### 2. Controlo de disponibilidade: transaccional e trancado

`verificarEReservar(tx, { linhas: [{ linhaControloId, fase, valorMzn, origem }] }, ctx)`:

1. Tranca pela **ordem global** do domínio: `Financiamento` por id crescente, depois `LinhaControlo`
   por id, depois `RecebimentoFundos` por `(data, id)` (ADR-0046 §2). É chamado **uma vez por
   transacção**, com todas as linhas do documento ou lançamento. A tranca do `Financiamento` é o que
   torna seguro o controlo do total (passo 3), porque dois pedidos em linhas diferentes do mesmo
   financiamento serializam aí. A ordem fixa evita deadlocks, mesmo com vários financiamentos no
   mesmo lançamento.
2. Converte o valor para a moeda do acordo (ADR-0046 §4).
3. Aplica a regra do financiamento:
   - **Linha**: `consumoExistente + novo ≤ dotação × (1 + tolerância)`
   - **Financiamento**: `Σ consumos + novo ≤ Σ dotações` (a tolerância realoca e nunca aumenta o total)
4. Falha → `BusinessRuleError('ORCAMENTO_INSUFICIENTE', { linhas: [...] })` com **todas** as linhas
   em défice (molde do `fecharPeriodo`: nunca uma de cada vez).
5. Com `regraBloqueio = ALERTA`, grava na mesma e devolve `avisos[]`. A UI mostra o aviso e o
   trilho guarda-o.

Não há permissão para «forçar». Uma permissão de bypass passa a ser usada por rotina no terreno, e um
bloqueio contornado por rotina é só um aviso. O caminho legítimo é a revisão orçamental (ADR-0043 §3).

**Alternativa rejeitada — verificação optimista (ler o saldo, gravar, verificar depois).** Dois
pedidos simultâneos passam ambos com o mesmo saldo. É o cenário típico do fim de mês, quando o
oficial de compras aprova um lote. O `FOR UPDATE` serializa só os pedidos sobre a mesma linha, e o
custo é desprezável perante a frequência.

### 3. Execução: escrita pelo razão, não pelo documento

A `EXECUCAO` é escrita na transacção que põe o lançamento em `LANCADO` (em
`registarLancamentoContabilistico`, ou na passagem de rascunho a lançado; um `RASCUNHO` nunca gera
movimentos), a partir das `ImputacaoPartida` (ADR-0044) das partidas em contas de gasto e de
investimento, com débito positivo e crédito negativo, pelo contrato
injectado `registarExecucaoEmTx`. O documento de origem (conta a pagar, folha, justificação) passa no
input do lançamento o `consumirDe` (o compromisso a consumir), e o serviço orçamental grava
`EXECUCAO +X` e `COMPROMISSO −min(X, aberto)`.

Daí resulta a invariante central do pedido («manter a ligação à contabilidade geral»):

> **`C1`** — por financiamento e `periodoId` do lançamento, Σ `EXECUCAO.valorMzn` = Σ `ImputacaoPartida.valor` das
> partidas de gasto/investimento com `FILTRO_LANCAMENTO_MAPA`, nesse financiamento.

O estorno de um lançamento grava `EXECUCAO` negativa com `movimentoAnuladoId` e **não** repõe
compromisso. Re-comprometer é um acto explícito. O teste `C1` corre no `pnpm check` sobre o seed e
como property test sobre sequências aleatórias de lançar, estornar, imputar e repartir.

### 4. Origens

| Origem | Cabimento | Compromisso | Execução | Pagamento |
|---|---|---|---|---|
| Requisição de compra (aprovada / rejeitada / cancelada) | +/− por item | — | — | — |
| Pedido de compra (aprovado / cancelado) | − (consome) | +/− | — | — |
| Conta a pagar (lançamento D gasto / C 421) | — | − (consome; excedente verificado) | + (via razão) | — |
| Pagamento de conta a pagar | — | — | — | + valor pago × execução da CP ÷ valor original (exclui IVA dedutível) |
| Folha de salários (processada) | — | — | + (via razão, chave de pessoal) | + no pagamento da folha |
| Adiantamento: aprovado | — | + | — | — |
| Adiantamento: pago (D adiantamentos / C banco) | — | — | — | `ADIANTAMENTO` + |
| Adiantamento: justificado (D gasto / C adiantamentos) | — | − | + (via razão) | `ADIANTAMENTO` −, `PAGAMENTO` + |
| Adiantamento: remanescente devolvido / fechado | — | − (remanescente) | — | `ADIANTAMENTO` − (devolvido) |
| Lançamento manual com imputação | — | — | + (via razão, verificado) | + se creditar meio monetário |

As transições de requisição, pedido e adiantamento chamam `verificarEReservar` **na mesma
transacção** da mudança de estado. Pela regra `estado-com-escritor` (ADR-0011 D9), cada transição tem
o seu teste nos dois sentidos (aprovar e reservar; cancelar e libertar).

### 5. Base do consumo

A execução é o que o razão põe em contas de gasto e de investimento, e daí decorre o tratamento
do IVA:

- O **IVA dedutível** vai para 443x e **nunca** é execução nem pagamento orçamental.
- O **IVA não dedutível** (comum em ONGs) o razão já o leva ao gasto. Conta para o financiamento só
  se `ivaNaoDedutivelElegivel = true`. Caso contrário, a parte de IVA é imputada a fundos próprios
  na geração das imputações. Esta parte vem do bloco fiscal da conta a pagar (ADR-0034 §1), e nunca
  se recalcula.
- Cabimentos e compromissos estimam pela mesma regra. A diferença entre a estimativa e a execução é
  absorvida na libertação do compromisso.

Com isto, `pago ≤ executado` (`C2`) é verdadeiro por construção.

### 6. Datas

Cabimento e compromisso só são aceites com data dentro de [`dataInicio`, `dataFim`] do financiamento
(`FORA_DO_PERIODO_DO_FINANCIAMENTO`). A **data nunca bloqueia uma execução**: o razão não pode recusar uma factura
real por estar fora de prazo. Fora da elegibilidade, a execução fica **inelegível** (ADR-0048 §2).
O que bloqueia uma execução é exaustivo: disponibilidade (sem compromisso suficiente, com
`BLOQUEIA_COM_TOLERANCIA`), financiamento `RASCUNHO` ou `ENCERRADO`, `TAXA_CAMBIO_EM_FALTA`
(ADR-0046 §2) e `INVESTIMENTO_NAO_SUPORTADO` (ADR-0047). Em `SUSPENSO` e `EM_ENCERRAMENTO` recusam-se
cabimentos e compromissos novos, e as execuções e pagamentos continuam.

## Consequências

**Positivas**
- A pergunta «posso gastar?» tem uma resposta única, transaccional e auditável.
- A execução orçamental **não pode** divergir do razão (`C1`), porque é escrita pelo mesmo serviço, na
  mesma transacção.
- Uma origem nova (contratos, viagens) é só mais uma linha na tabela do §4.

**Negativas**
- O `contabilidade.service` passa a chamar o orçamental em todos os lançamentos com imputação a
  financiamento. Isto alarga o raio de falha do serviço mais crítico. A mitigação é o contrato
  injectado, que é um no-op quando o tenant não tem o módulo, e a suite de integração inteira antes
  do merge.
- Compras ganha imputação por item: formulários de requisição e de pedido mais pesados.

**Riscos**
- **Desempenho do `SUM` sob tranca**: com 10⁵ movimentos por financiamento, o índice
  `(tenantId, linhaControloId, fase)` mantém a soma em milissegundos. O cenário k6 novo mede-o. Se o
  p95 passar 50 ms, materializa-se `SaldoLinhaControlo`, actualizado na mesma transacção, **com teste
  de equivalência contra a soma**. Nunca é um contador sem prova.
- **Folha recusada por falta de orçamento** num dia de pagamento de salários. A mitigação é a
  pré-verificação no ecrã de processamento, que lista os défices antes de submeter, e o compromisso
  anual de pessoal (requisito «deveria»).
