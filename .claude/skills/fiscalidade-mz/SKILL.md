---
name: fiscalidade-mz
description: Convencoes de payroll e fiscalidade mocambicana do GestPro - INSS, IRPS, tabelas versionadas por vigencia, calculo em Decimal e integracao contabilistica. Usar ao implementar processamento salarial, retencoes ou qualquer calculo fiscal MZ.
---

# Fiscalidade e Payroll — Moçambique (GestPro)

Regras normativas para qualquer cálculo salarial/fiscal. Complementa
`prisma-conventions` e `api-conventions` — não as substitui.

## Princípio inegociável: table-driven, nunca hardcoded

As taxas mudam por legislação. Toda a taxa/escalão vive em tabela paramétrica
versionada por vigência (`vigenciaInicio`/`vigenciaFim`), seedada de fonte oficial
com o decreto documentado. O cálculo de um mês usa a tabela vigente nesse mês.
Alterar uma lei = novo registo de tabela, **nunca** alterar código.

## INSS (Segurança Social)

- Trabalhador: **3%**; Entidade empregadora: **4%** (total 7%).
- O desconto do trabalhador (3%) sai do salário; a comparticipação patronal (4%)
  é **encargo da entidade**, não desconto — entra no custo total do colaborador e
  na contabilização, não no líquido.
- Fonte: INSS — https://www.inss.gov.mz/taxa-contributiva-tco/ (validar vigência).

## IRPS (rendimento de trabalho dependente)

- Imposto progressivo por escalões: `imposto = base × taxaEscalao − parcelaAbater`,
  onde o escalão é o da base tributável.
- Base tributável = bruto − INSS trabalhador − deduções aplicáveis (conforme o
  Código do IRPS vigente e a situação familiar/dependentes quando aplicável).
- A reforma de 2026 alterou mínimos e isenções — **confirmar os escalões no
  Boletim da República aplicável antes de seedar**. Não assumir tabelas antigas.
- Fontes: Autoridade Tributária —
  https://www.at.gov.mz/por/Processos-Fiscais/Imposto-sobre-o-Rendimento-de-Pessoas-Singulares-IRPS
  e https://www.at.gov.mz/por/Comercio-Internacional/Procedimento-Fiscais/Taxas-IRPS

## Cálculo (rigor)

- Tudo em `Prisma.Decimal` (`@db.Decimal(18,2)` para valores; `@db.Decimal(9,6)`
  para taxas). NUNCA `number`/`Float`. Arredondamento único, explícito e testado
  (2 casas no valor final).
- O motor de cálculo é uma **função pura sem I/O** (`payroll-calculo.ts`), testável
  isoladamente; o serviço só orquestra leituras/escritas.
- Invariantes obrigatórios (property tests, fast-check):
  - `liquido = bruto − inssTrabalhador − irps − outrosDescontos`.
  - `inssTrabalhador = baseInss × taxaTrabalhador` (3%).
  - IRPS monótono não-decrescente na base tributável.
  - Nenhum líquido negativo sem desconto explícito que o justifique.
- Golden tests: validar ≥3 escalões contra exemplos das fontes oficiais.

## Integração contabilística (partidas dobradas, contrato WS D)

Ao processar a folha, gerar o lançamento (diário `SALARIOS`) via
`registarLancamentoContabilistico`, com débito == crédito:

| Conta (classe PGC) | Débito | Crédito |
|---|---|---|
| Gastos com pessoal (6) | bruto + INSS entidade | |
| INSS a pagar (2) | | INSS trab. + INSS entidade |
| IRPS retido a pagar (2) | | IRPS |
| Remunerações a pagar (2) | | líquido |

Pagamento (`PAGO`) gera movimento de caixa/banco via `registarMovimentoCaixa`.

## Imutabilidade

Após `PROCESSADO`, os valores da folha são append-only; correcção por cancelar +
reprocessar. `@@unique([tenantId, colaboradorId, anoReferencia, mesReferencia])`
garante idempotência do lote mensal.
