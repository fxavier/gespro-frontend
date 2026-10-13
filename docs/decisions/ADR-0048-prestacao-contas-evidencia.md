# ADR-0048 — Prestação de contas ao financiador, elegibilidade e evidência documental

- **Estado**: Proposto
- **Data**: 2026-10-12
- **Contexto**: Spec 24 (Contabilidade Orçamental) · Épico WS-6
- **Depende de**: [ADR-0045](./ADR-0045-ciclo-despesa-controlo-disponibilidade.md), [ADR-0046](./ADR-0046-fundos-cambio-fifo-tranche.md), [ADR-0015](./ADR-0015-auditoria-documentos-financeiros.md) (auditoria), [ADR-0017](./ADR-0017-ciclo-vida-armazenamento.md) (armazenamento), [ADR-0005-a](./0005-motor-pdf.md) (PDF/XLSX)
- **Relacionados**: [ADR-0035](./ADR-0035-encerramento-exercicio.md) (o arquivo do encerramento é o precedente de snapshot), [ADR-0047](./ADR-0047-reconhecimento-financiamentos.md)
- **Skills**: `engineering:architecture`, `api-conventions`, `tdd`

## Contexto

Prestar contas a um doador significa entregar um relatório que **não muda depois de entregue**. Uma
auditoria dois anos depois pede «o relatório que vocês nos mandaram em Julho de 2026 e as despesas
por trás de cada linha», e a resposta tem de ser idêntica ao que foi entregue, mesmo que entretanto
tenha havido estornos, facturas retroactivas, revisões de orçamento ou de mapeamento.

O alinhamento de 2026-10-12 escolheu um **motor genérico com mapeamento por acordo**, com os modelos
oficiais (UE, USAID, Global Fund…) para depois.

O ADR-0015 já audita os documentos financeiros, mas com um limite conhecido: a `audit-extension` só
vê escritas singulares. O ADR-0017 já dá armazenamento com prefixo de tenant.

## Decisão

### 1. O relatório é um snapshot imutável, não uma consulta

```
RelatorioFinanciamento {
  id, tenantId, financiamentoId, periodoInicioId, periodoFimId, versao,
  estado RASCUNHO | SUBMETIDO | ACEITE | DEVOLVIDO,
  versaoOrcamentoId, versaoMapeamentoId, dataCorte,
  hashConteudo (SHA-256 do JSON canónico das linhas), storageKeyXlsx, storageKeyPdf,
  submetidoPorId, submetidoEm, motivoDevolucao?
}
LinhaRelatorioFinanciamento { relatorioId, secao, rubricaId, actividadeId?, aprovado, revisto, periodo, acumulado, variancia, ... }
DespesaRelatorioFinanciamento { relatorioId, movimentoId, lancamentoId, data, documento, terceiro, rubricaId, valorMzn, taxa, valorMoeda, elegivel }
```

- Em `RASCUNHO` é recalculável à vontade. **Submeter** grava as linhas, calcula o hash e gera os
  ficheiros no armazenamento, tudo numa transacção (os ficheiros são escritos antes e confirmados
  pela transacção, como no arquivo do encerramento, ADR-0035).
- Depois de `SUBMETIDO`, as linhas são só de leitura (gate de escrita, molde do `gate-periodo`).
  Corrigir = nova `versao`. A anterior fica, com o estado que tinha.
- **Ajustamentos a períodos anteriores**: o relatório seguinte calcula o acumulado real até à data de
  corte e compara-o com o Σ da **última versão não substituída** de cada período já reportado
  (`SUBMETIDO` ou `ACEITE`). Versões corrigidas nunca se somam duas vezes. A diferença aparece numa secção própria,
  linha a linha. Um relatório submetido nunca é alterado para absorver o passado.

**Alternativa rejeitada — relatório como consulta parametrizada (gerar de novo quando pedido).** Uma
factura retroactiva, um estorno ou uma revisão do mapeamento mudam silenciosamente o que «foi
reportado». É exactamente a falha que uma auditoria de doador procura.

### 2. Elegibilidade é marcação, não exclusão do razão

`ElegibilidadeExecucao { movimentoId, elegivel, motivo, marcadoPorId, marcadoEm, anulaId? }`,
append-only (a marcação vigente é a última). Uma execução é elegível por omissão quando:
data do documento ∈ [início, fim de elegibilidade], rubrica no orçamento vigente, documentos
obrigatórios presentes (§3). A marcação manual sobrepõe-se, sempre com motivo e permissão
`orcamental:elegibilidade:marcar`.

Uma despesa inelegível **continua no razão e no orçamental** (`C1` mantém-se). O que muda é que sai
do relatório, sai do reconhecimento de rendimento (ADR-0047 §2) e aparece num mapa de inelegíveis a
cobrir por fundos próprios. Reclassificá-la para um financiamento `PROPRIO` faz-se por estorno e
relançamento com nova imputação. Nunca se edita a imputação original.

### 3. Evidência: anexos com hash, obrigatórios por fase, nunca apagados

`DocumentoSuporte { tenantId, entidadeTipo, entidadeId, tipoDocumento, storageKey, sha256,
tamanho, mime, carregadoPorId, retiradoEm?, motivoRetirada? }`, sobre a porta de armazenamento do
ADR-0017, com prefixo de tenant asserido.

- `RegraEvidencia { financiamentoId, fase, tipoDocumento, obrigatorio }` decide o que cada fase exige
  (ex.: execução → factura; pagamento → comprovativo; adiantamento justificado → recibos).
- **Falta de evidência não bloqueia a operação**: torna a execução **inelegível-pendente**. Um
  bloqueio no lançamento de uma factura real afastaria o razão da realidade, e no terreno os
  comprovativos chegam com dias de atraso.
- Retirar um anexo marca `retiradoEm` com motivo. O objecto não é apagado do armazenamento enquanto o
  financiamento não for `ENCERRADO` e o prazo de conservação não passar. A regra de ciclo de vida do
  ADR-0017 ganha uma excepção por prefixo `orcamental/`.

### 4. Trilho de auditoria

- Os modelos novos com valores ou estados entram em `AUDIT_MODELS`. O gate do ADR-0015 passa a
  varrer `orcamental.prisma`.
- `ImputacaoPartida`, `MovimentoOrcamental`, `AlocacaoTranche`, `ElegibilidadeExecucao` e as linhas
  de relatório são
  **append-only**, e são eles próprios o trilho. Usam `createMany` sem perda, porque não há
  `UPDATE` a auditar.
- As transições de estado (versão de orçamento, financiamento, adiantamento, relatório) gravam
  `HistoricoEstadoOrcamental { entidadeTipo, entidadeId, de, para, motivo, porId, em }`. É a cronologia
  por financiamento pedida no requisito 23.3, sem *replay* do `AuditLog`.

### 5. Formato

O motor produz o snapshot. A exportação XLSX e PDF usa `lib/reporting` e `@react-pdf` (só runtime
Node, tecto de linhas como no balancete). A lista de despesas exporta-se só em XLSX acima do tecto,
porque o PDF com 5 000 linhas é CPU síncrona no pedido. Os modelos oficiais por financiador entram
depois como **formatadores** sobre o mesmo snapshot, sem recalcular nada.

## Consequências

**Positivas**
- O que foi entregue é reproduzível, byte a byte, pelo hash e pelos ficheiros guardados.
- As correcções retroactivas são visíveis como ajustamentos, que é o que os financiadores esperam.
- A falta de evidência é visível e mensurável (mapa de pendentes), sem bloquear o razão.

**Negativas**
- Armazenamento: cada submissão guarda linhas, despesas e dois ficheiros. É aceitável, porque são
  relatórios trimestrais ou semestrais por financiamento.
- A retenção de anexos por financiamento contraria a regra geral de ciclo de vida, e exige uma
  excepção explícita no ADR-0017.

**Riscos**
- **Hash instável** se o JSON canónico não fixar ordem de chaves, ordem de linhas e representação
  dos `Decimal`. A função de canonização é única e tem teste: o mesmo relatório gerado duas vezes
  tem de dar o mesmo hash.
