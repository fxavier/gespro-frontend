# ADR-0036 — Projecção de tesouraria

- **Estado**: Proposto
- **Data**: 2026-09-21
- **Contexto**: Spec 22 (Fluxo de Caixa) · Épico WS-1
- **Depende de**: [ADR-0033](./ADR-0033-exercicio-contabilistico.md) (período e dia fiscal `Africa/Maputo`), [ADR-0032](./ADR-0032-aplicacao-da-leitura.md) (modo de Leitura nas actions)
- **Relacionados**: [ADR-0037](./ADR-0037-demonstracao-fluxos-caixa.md) (a DFC olha para trás; esta olha para a frente), [ADR-0018](./ADR-0018-desempenho-capacidade.md) (orçamento de latência)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `api-conventions`, `fluxo-de-caixa-conventions`

## Contexto

O GestPro sabe tudo sobre o dinheiro que já se moveu e nada sobre o que está prestes a mover-se. O
módulo `/caixa` controla sessões de balcão (`SessaoCaixa`, `MovimentoCaixa`, máquina
`ABERTA → FECHADA | CANCELADA`), a contabilidade produz balancete, razão, DRE, apuramento de IVA e
reconciliação bancária. Todos estes mapas respondem à pergunta «o que aconteceu». Nenhum responde
àquela que decide se a empresa sobrevive ao mês: **tenho dinheiro no dia 25 para a folha salarial?**

Quatro factos verificados no código condicionam a decisão.

**1. Os dados de entrada já existem e estão indexados para isto.** `ContaPagar` tem
`dataVencimento`, `valorRestante` e `status`, com `@@index([tenantId, dataVencimento])`
(`compras.prisma:736-782`). `Fatura` tem `dataVencimento`, `total`, `totalPago` e
`@@index([tenantId, dataVencimento, status])` (`financas.prisma:639-678`). `Payroll` tem
`salarioLiquido`, `custoTotalEntidade`, `dataPagamento` e `status`
(`pessoas-projetos.prisma:708-740`). Não é preciso inventar uma origem de dados — é preciso agregá-la.

**2. `ContaBancaria.saldoAtual` é estado morto.** A coluna existe (`financas.prisma:543`,
`DEFAULT 0` desde a migração inicial) e **não tem um único escritor em código de produção**: um
`git grep saldoAtual` sobre `src/` e `prisma/` devolve apenas leituras de balancete (outro
`saldoAtual`, homónimo, calculado em memória), o formulário que explicitamente a declara não-editável
e o seed de inventário (terceiro homónimo). Uma projecção que abrisse com esta coluna começaria
sempre com zero, em todos os tenants, sem erro nenhum. É exactamente o defeito que a skill
`estado-com-escritor` existe para apanhar: uma coluna lida por um predicado de decisão sem escritor
em produção.

**3. A folha salarial é o maior compromisso de uma PME moçambicana e não está em `ContaPagar`.**
Vive em `Payroll`/`FolhaPagamento`, com semântica própria (INSS 3 %/4 %, IRPS por escalões,
`custoTotalEntidade` ≠ soma dos líquidos). Uma projecção que só olhe para contas a pagar de
fornecedores omite a maior saída do mês.

**4. Há compromissos que o ERP nunca vai conhecer.** Renda, IVA a entregar antes do apuramento
estar lançado, prestação de leasing, impostos. Sem um lugar para os registar, o utilizador ajusta
os números numa folha de cálculo paralela — e a partir desse momento a projecção do ERP é
decorativa.

## Decisão

**1. Motor directo, derivado, sem persistir resultados.** A projecção é uma função pura sobre o
estado actual: nada do que ela calcula é gravado. Não há tabela de «projecção», não há job nocturno,
não há cache materializada. Recalcula-se a cada pedido. A única razão para isto não ser ingénuo é a
§5 (orçamento de latência); a razão para ser correcto é que uma projecção gravada fica obsoleta em
silêncio e ninguém sabe dizer de que momento é.

**2. O saldo de abertura vem do razão, nunca de `ContaBancaria.saldoAtual`.**

```
saldoAbertura(d) = Σ saldoContabilAte(conta.contaContabilId, d)   ∀ ContaBancaria ativa
                 + Σ (fundoInicial + totalEntradas − totalSaidas)  ∀ SessaoCaixa ABERTA
```

`saldoContabilAte` já existe (`contabilidade.service.ts:1177`) e já filtra por
`FILTRO_LANCAMENTO_MAPA`. `ContaBancaria.saldoAtual` fica marcada como morta neste ADR; quem lhe
quiser dar um escritor fá-lo noutro ADR, não nas costas deste.

**3. Quatro origens de compromisso, com precedência explícita.**

| Origem | Modelo | Sinal | Data | Valor |
|---|---|---|---|---|
| Recebimentos de clientes | `Fatura` (`EMITIDA`, `PARCIALMENTE_PAGA`, `VENCIDA`) | entrada | `dataVencimento` | `total − totalPago` |
| Pagamentos a fornecedores | `ContaPagar` (`ABERTA`, `PARCIALMENTE_PAGA`, `VENCIDA`) | saída | `dataVencimento` | `valorRestante` |
| Folha salarial | `Payroll` (`PROCESSADO`) | saída | `dataPagamento ?? último dia útil do mês de referência` | `custoTotalEntidade` |
| Compromissos manuais | `CompromissoTesouraria` (novo) | ambos | `dataPrevista` | `valor` |

`CANCELADA`, `PAGA` e `RASCUNHO` nunca entram. `RASCUNHO` é deliberado: uma factura por emitir não
é um direito de cobrança.

**4. Um único modelo novo: `CompromissoTesouraria`.** É o lugar do que o ERP não sabe. Campos:
`tenantId`, `descricao`, `tipo` (`ENTRADA`/`SAIDA`), `valor Decimal(18,2)`, `dataPrevista`,
`recorrencia` (`UNICA`/`MENSAL`/`TRIMESTRAL`/`ANUAL`), `dataFimRecorrencia?`, `categoriaId?` →
`RubricaFluxoCaixa` (partilhada com o ADR-0037), `contaContabilId?`, `ativo`, soft delete.
Índice `@@index([tenantId, dataPrevista, ativo])`. Expansão da recorrência é feita em memória no
horizonte pedido — não se materializam ocorrências futuras em linhas.

**5. Horizonte, granularidade e orçamento de latência.** Horizonte máximo **365 dias**;
granularidade `DIARIA` (≤ 90 dias), `SEMANAL` (≤ 180) ou `MENSAL` (≤ 365), validada no schema Zod —
uma projecção diária a 365 dias são 365 pontos numa tabela que ninguém lê. Orçamento: **p95 < 400 ms**
no tenant `perf-medio` do `db:seed:volume`, medido por cenário k6 em `perf/k6`. Quatro agregações
indexadas por `dataVencimento`/`dataPrevista` e uma soma de saldos; se falhar o orçamento, o
problema é uma query, não a ausência de cache.

**6. Cenários por multiplicador de cobrança, não por modelo estatístico.** Três cenários fixos —
`OTIMISTA` (100 % das entradas na data), `BASE` (entradas com atraso médio histórico do tenant,
calculado sobre facturas liquidadas nos últimos 180 dias) e `PESSIMISTA` (atraso médio + 1 desvio
padrão, entradas vencidas há mais de 90 dias excluídas). Saídas nunca se descontam em cenário
nenhum: o fornecedor não atrasa o recebimento dele por simpatia. Sem ARIMA, sem ML, sem previsão de
vendas futuras — o que se projecta é o que já está contratado.

**7. Alertas por ruptura, calculados no mesmo passo.** O serviço devolve `primeiroDiaNegativo` e
`menorSaldoProjetado`. O aviso na UI é derivado, não persistido; a notificação (`notificacao.service`)
fica fora deste épico.

**8. Leitura pura.** Todas as actions são de consulta e declaram `permiteEmLeitura: true`
(ADR-0032) — um tenant em modo de Leitura tem de poder ver a sua própria tesouraria. As mutações
são apenas o CRUD de `CompromissoTesouraria`, com permissões novas
`financas:tesouraria:leitura` e `financas:tesouraria:escrita`.

## Alternativas consideradas

**Projecção materializada com job nocturno.** Rejeitada. Resolve um problema de latência que não
temos (§5) e cria um de correcção que teríamos: uma linha materializada às 03h00 não sabe da
factura emitida às 09h00, e ninguém consegue distinguir «zero porque não há compromissos» de «zero
porque o job falhou».

**Usar `ContaBancaria.saldoAtual` e dar-lhe um escritor neste épico.** Rejeitada por âmbito. Dar
escritor a essa coluna significa reconciliar toda a escrita bancária existente com ela — é um épico
próprio, e fazê-lo aqui arrastaria a projecção para dentro de um refactor de contabilidade.
`saldoContabilAte` dá a mesma resposta a partir de estado que já tem escritor garantido.

**Previsão estatística de vendas futuras.** Rejeitada. Sem histórico multi-anual por tenant, um
modelo produz números com aparência de rigor e sem conteúdo — o pior resultado possível num mapa
que serve para decidir se se paga a folha. Reavaliar quando houver ≥ 24 meses de dados reais.

**Um `Compromisso` genérico que absorva também contas a pagar e facturas.** Rejeitada: duplicaria
estado com escritor noutro sítio e criaria duas verdades para a mesma dívida.

## Consequências

**Positivas.** Zero risco de obsolescência silenciosa (nada é gravado). Um único modelo novo, num
único ficheiro de schema (`financas.prisma`), o que mantém o mapa de conflitos de merge trivial. O
`RubricaFluxoCaixa` partilhado prepara o terreno para o ADR-0037 sem o antecipar.

**Negativas e aceites.** Recalcular a cada pedido põe um tecto no horizonte e na granularidade
(§5) — aceite. A projecção ignora vendas futuras não facturadas, o que a torna estruturalmente
conservadora do lado das entradas; isto tem de estar escrito **na própria página**, não só aqui.
O atraso médio histórico exige ≥ 20 facturas liquidadas no tenant para ser significativo; abaixo
disso o cenário `BASE` degrada para `OTIMISTA` e a UI di-lo explicitamente.

**Invariantes que trancam a implementação** (property tests, ver spec 22 §Testes):

- `I1` — Horizonte zero: `projeccao(hoje, hoje).saldoAbertura == saldoAbertura(hoje)` calculado
  independentemente pelo balancete. A projecção e a contabilidade não podem discordar sobre hoje.
- `I2` — Conservação: `saldoFinal(bucket_n) == saldoFinal(bucket_{n-1}) + entradas(n) − saidas(n)`,
  para toda a sequência de buckets, em `Decimal` exacto.
- `I3` — Monotonia de cenário: `saldo_PESSIMISTA(d) ≤ saldo_BASE(d) ≤ saldo_OTIMISTA(d)` ∀ d.
- `I4` — Isolamento: nenhum compromisso de outro tenant entra em qualquer bucket; cross-tenant em
  `CompromissoTesouraria` devolve `NotFoundError`.
- `I5` — Idempotência de recorrência: expandir uma recorrência duas vezes no mesmo horizonte produz
  o mesmo conjunto de ocorrências.

## Fontes

- Estado verificado: `apps/erp/prisma/schema/financas.prisma`, `compras.prisma`,
  `pessoas-projetos.prisma`; `apps/erp/src/server/services/financas/contabilidade.service.ts`
  (`saldoContabilAte:1177`, `FILTRO_LANCAMENTO_MAPA:97`).
- Decreto 70/2009 (PGC-NIRF) — classe 1 (meios financeiros líquidos) como âmbito do saldo.
