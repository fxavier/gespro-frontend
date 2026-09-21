---
name: fluxo-de-caixa-conventions
description: Convencoes obrigatorias do dominio de fluxo de caixa do GestPro - tesouraria vs caixa, projeccao derivada, rubricas e mapeamento da DFC, articulacao e invariantes. Usar ao implementar ou rever projeccao de tesouraria, DFC, compromissos ou qualquer calculo de saldo previsto.
---

# Convenções de Fluxo de Caixa — GestPro

Decisões vinculativas: [ADR-0036](../../docs/decisions/ADR-0036-projecao-tesouraria.md) ·
[ADR-0037](../../docs/decisions/ADR-0037-demonstracao-fluxos-caixa.md).

## Vocabulário — usar estes termos e só estes

| Termo | É | Não é |
|---|---|---|
| **Caixa** | Numerário numa `SessaoCaixa` | O saldo bancário |
| **Tesouraria** | Caixa + saldo contabilístico das contas bancárias | Contas a receber |
| **Compromisso** | Obrigação ou direito datado, por liquidar | Um lançamento |
| **Bucket** | Intervalo com entradas, saídas e saldo de fecho | Um período contabilístico |
| **Rubrica** | Linha da DFC, com actividade e sinal | Uma conta PGC |
| **Articulação** | OP+INV+FIN == Δcaixa, ao cêntimo | «bate aproximadamente» |

Misturar «caixa» e «tesouraria» numa assinatura de função é um defeito de domínio, não de estilo:
`saldoCaixa()` e `saldoTesourariaAte()` respondem a perguntas diferentes e quem chama a errada
obtém um número plausível e falso.

## Regras invioláveis deste domínio

**1. `ContaBancaria.saldoAtual` não se lê.** Não tem escritor em produção — existe com `DEFAULT 0`
desde a migração inicial. Saldo de abertura é sempre
`Σ saldoContabilAte(conta.contaContabilId, d)` + sessões `ABERTA`.

**2. Nada de projecção se grava.** Sem tabela de resultados, sem job nocturno, sem cache. Uma
projecção gravada fica obsoleta em silêncio e ninguém sabe de que momento é.

**3. A classificação da DFC vive em dados, não em código.** Nunca `codigo.startsWith('43')`. O
`@@unique([tenantId, contaId])` em `MapeamentoContaFluxo` é o que proíbe dupla contagem por
construção — a dupla contagem numa DFC soma certo em cada secção e errado no total.

**4. Conta não mapeada ⇒ `impedimentos`, nunca zero.** Todas de uma vez, à maneira do `fecharPeriodo`.

**5. `verificarArticulacao` corre em produção.** Divergência ⇒ `DFC_NAO_ARTICULA` com o delta em
`details`, e o mapa não sai do serviço.

**6. Núcleo puro primeiro.** `montarBuckets`, `expandirRecorrencia`, `distribuirCompromissos`,
`acumularSaldos`, `classificarVariacoes`, `montarSeccoesDFC` são funções puras exportadas, sem
Prisma e sem `Date.now()` — a data de referência é sempre parâmetro. É onde vivem os invariantes e
onde os property tests correm em milissegundos. Precedente: `montarLinhasBalancete`, `calcularLinhasDRE`.

**7. Estados que contam.** Facturas: `EMITIDA`, `PARCIALMENTE_PAGA`, `VENCIDA` (nunca `RASCUNHO` —
uma factura por emitir não é um direito de cobrança). Contas a pagar: `ABERTA`,
`PARCIALMENTE_PAGA`, `VENCIDA`. Payroll: `PROCESSADO`, pelo `custoTotalEntidade` (não
`salarioLiquido` — o INSS patronal é custo da entidade). Vencidos em aberto entram no primeiro
bucket, assinalados; omiti-los torna a projecção optimista e inútil.

**8. Cenários afectam entradas, nunca saídas.** O fornecedor não atrasa o recebimento dele por
simpatia.

**9. O âmbito declara-se na própria página.** A projecção não inclui vendas futuras não facturadas,
logo é estruturalmente conservadora do lado das entradas. Isto vai num componente visível, não só
na documentação.

## Dinheiro e datas

`Prisma.Decimal` de ponta a ponta; `.equals()` para comparar; `.toString()` na fronteira SC→CC
(o `createSafeAction` já serializa o retorno). Nenhuma asserção monetária com tolerância de vírgula
flutuante. Fronteiras de dia por `diaCivilEmMaputo`; `<input type="date">` por
`new Date(ano, mes-1, dia, 12)`; apresentação por `format-date.ts` e `formatMZN`.

## Invariantes (property tests obrigatórios)

`I1` horizonte zero == balancete · `I2` conservação de buckets · `I3` monotonia de cenário ·
`I4` isolamento multi-tenant · `I5` idempotência de recorrência · `I6` articulação ·
`I7` cobertura de mapeamento · `I8` aditividade de períodos · `I9` coerência com a DRE ·
`I10` isolamento de rubricas.

Quem escreve o invariante não é quem escreve a implementação (`verificador-fluxo-caixa`).

## O que nenhum teste automático prova

Que cada conta está na actividade **certa** face ao Decreto 70/2009. A articulação prova que o mapa
fecha. A classificação exige validação humana antes de qualquer cliente real ver a DFC — spec 22,
task 15.3.
