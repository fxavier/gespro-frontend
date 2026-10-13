# ADR-0047 — Reconhecimento contabilístico dos financiamentos

- **Estado**: Proposto (as contas e o enquadramento das entidades sem fins lucrativos esperam confirmação legal — ver Questões em aberto)
- **Data**: 2026-10-12
- **Contexto**: Spec 24 (Contabilidade Orçamental) · Épico WS-5
- **Depende de**: [ADR-0045](./ADR-0045-ciclo-despesa-controlo-disponibilidade.md) (execução), [ADR-0046](./ADR-0046-fundos-cambio-fifo-tranche.md) (recebimentos), [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (fecho)
- **Relacionados**: [ADR-0035](./ADR-0035-encerramento-exercicio.md) (encerramento), [ADR-0037](./ADR-0037-demonstracao-fluxos-caixa.md) (DFC), [ADR-0048](./ADR-0048-prestacao-contas-evidencia.md) (elegibilidade)
- **Skills**: `engineering:architecture`, `fluxo-de-caixa-conventions`, `tdd`

## Contexto

Receber 1 000 000 USD de um doador para um projecto de três anos **não é** rendimento do mês em que o
dinheiro chega. Se fosse, a DRE do primeiro mês mostraria um lucro enorme e as dos 35 meses seguintes
um prejuízo, e o encerramento (ADR-0035) apuraria um resultado sem significado económico.

O princípio usado pelos normativos de base IFRS, de onde deriva o PGC-NIRF (Decreto 70/2009), é o
de reconhecer os subsídios **nos períodos em que se reconhecem os gastos que compensam**. Até lá, o
recebido é um passivo (rendimento diferido). O dinheiro gasto acima do recebido é um activo
(subsídio a receber).

Mas nem todo o financiamento é um subsídio. Para uma empresa, o «financiador» pode ser um cliente com
um contrato, e então a receita vem da facturação, que já lança. Ou pode ser a própria empresa, e
então não há receita nenhuma.

## Decisão

### 1. A natureza contabilística é um atributo do financiamento

| `naturezaContabilistica` | Recebimento | Reconhecimento | Típico |
|---|---|---|---|
| `SUBSIDIO_EXPLORACAO` | D banco / C **rendimento diferido** | Periódico, pela execução elegível (§2) | ONG com doador |
| `CONTRATO_RECEITA` | Pela facturação normal (`Fatura` ao `Cliente` ligado ao financiador) | Pela facturação, já existente | Empresa com contrato |
| `FUNDOS_PROPRIOS` | — | — | Projecto interno, empresa ou ONG |

Só o `SUBSIDIO_EXPLORACAO` introduz lançamentos novos. Os outros dois usam o orçamento como controlo e
não tocam na receita.

### 2. Reconhecimento periódico pela execução elegível

No fim de cada período, por financiamento `SUBSIDIO_EXPLORACAO` activo:

```
R = execução elegível acumulada até ao fim do período − rendimento reconhecido acumulado
    (MZN, ADR-0045 §3; elegibilidade lida no fecho — ADR-0048 §2)
D rendimento diferido        min(R, saldo diferido disponível)
D subsídio a receber         R − min(R, saldo diferido)          (pré-financiamento)
  C subsídios à exploração   R
```

E, quando chega uma tranche com subsídio a receber em aberto, o recebimento credita primeiro o
subsídio a receber e só o excedente vai para o diferido.

- `R` é cumulativo **de propósito**. Uma execução que se torna elegível tarde, ou que é marcada
  inelegível depois de reconhecida, corrige-se sozinha no fecho seguinte. Se `R < 0`, o lançamento é
  o inverso: D subsídios à exploração / C rendimento diferido, ou C subsídio a receber, até ao saldo
  dele.
- O lançamento é gerado por `registarLancamentoContabilistico`, com origem `RECONHECIMENTO_SUBSIDIO`
  (valor novo de `OrigemLancamento`, em duas migrações, como manda a regra dos enums), um por
  financiamento e período, com as imputações ao financiamento (ADR-0044) na conta de rendimento.
- É **idempotente**: o lançamento guarda-se em `ReconhecimentoFinanciamento { financiamentoId,
  periodoId, lancamentoId, valor }` com `@@unique([tenantId, financiamentoId, periodoId])`. Quem gera
  guarda o lançamento que criou (a lição do `DOCUMENTO_SEM_LANCAMENTO`).
- **Reabertura do período**: o reconhecimento é estornado e regenerado no fecho seguinte. Nunca é
  editado.
- **Pré-condição do fecho**: `fecharPeriodo` acrescenta o impedimento
  `RECONHECIMENTO_SUBSIDIO_EM_FALTA` por cada financiamento em curso (`ACTIVO`, `SUSPENSO`, `EM_ENCERRAMENTO`) sem reconhecimento no
  período.
  Segue o padrão da casa: todos os impedimentos devolvidos de uma vez.

A diferença cambial **não** entra em `R`: `R` é a execução em MZN. A revalorização da conta em moeda
fica nas contas de câmbio (ADR-0046 §5). Isto mantém o rendimento reconhecido igual ao gasto
compensado, que é o que o princípio pede.

**Alternativa rejeitada — rendimento no recebimento (base de caixa).** É mais simples e é o que muitas
ONGs fazem em folha de cálculo. Mas viola o acréscimo, distorce a DRE e o encerramento, e faz o
resultado do exercício depender do calendário das transferências do doador.

**Alternativa rejeitada — reconhecimento a cada execução (no lançamento da despesa).** Duplica o
número de lançamentos (um de rendimento por cada factura) e acopla a elegibilidade, que pode ser
decidida semanas depois, ao momento do lançamento. O lote periódico lê a elegibilidade no fecho, e é
aí que ela tem de estar decidida.

### 3. Contas configuráveis, omissão confirmada

`ContaNaturezaFinanciamento { tenantId, papel, contaId }` com os papéis `RENDIMENTO_DIFERIDO`,
`SUBSIDIO_A_RECEBER`, `SUBSIDIOS_EXPLORACAO`, `ADIANTAMENTOS_PESSOAL`, `DIFERENCAS_CAMBIO_FAV` e
`DIFERENCAS_CAMBIO_DESFAV`. É o molde do `ContaNaturezaNotaDebito` (ADR-0039): omissão no
`tenant-bootstrap` **e** `INSERT … SELECT … ON CONFLICT DO NOTHING` na migração para os tenants
existentes.

**Os códigos de omissão não são fixados neste ADR.** Têm de ser lidos no
`prisma/seed/data/plano-contas-pgc.json`, com a natureza conta a conta (a classe 4 não tem regra
única, #295), antes de `Aceite`. Uma decisão escrita contra a memória do plano erra, como a errata do
README já documenta.

## Consequências

**Positivas**
- A DRE de uma ONG passa a mostrar gastos e rendimentos casados por período. O resultado tende para
  zero nos projectos integralmente financiados, que é a verdade económica.
- O balanço mostra o que se deve ao doador (diferido) e o que o doador deve (a receber).
- As empresas não pagam nada por isto: `CONTRATO_RECEITA` e `FUNDOS_PROPRIOS` não lançam.

**Negativas**
- O fecho mensal fica mais longo para tenants com subsídios, porque o reconhecimento passa a
  pré-condição.
- O reconhecimento depende da elegibilidade marcada a tempo. Uma marcação tardia gera um ajuste no
  período seguinte, e não reabre o anterior.

**Riscos**
- **Enquadramento das entidades sem fins lucrativos**: não está confirmado se as associações e ONGs
  clientes aplicam o PGC-NIRF integral, o regime das pequenas entidades ou outro normativo, nem se há
  contas próprias para «fundos» ou «subsídios». É a mesma lacuna documental que o
  `docs/research/mocambique-quadro-legal.md` regista para o IVA. O motor não muda: mudam as contas.

## Questões em aberto

1. Normativo contabilístico aplicável a ONGs e associações clientes (parecer externo).
2. **Subsídios ao investimento** (activos fixos financiados): reconhecimento pela amortização. Fora
   do MVP. Até lá, a imputação de contas de activo fixo a financiamentos `SUBSIDIO_EXPLORACAO` é
   recusada com `INVESTIMENTO_NAO_SUPORTADO`, para não produzir um reconhecimento errado em
   silêncio.
3. Juros sobre fundos do doador: aumentam o diferido (pertencem ao doador) ou são rendimento da
   organização? Parâmetro por acordo.
