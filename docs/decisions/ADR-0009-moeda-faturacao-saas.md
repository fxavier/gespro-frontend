# ADR-0009 — Moeda de faturação da subscrição SaaS (Stripe)

- **Estado**: Proposto
- **Data**: 2026-07-21
- **Contexto**: Spec 19 (Onboarding, Provisionamento e Faturação por Subscrição)
- **Skills**: `engineering:architecture`, `api-conventions`, `fiscalidade-mz`

> Stub para ratificação. Decisão sinalizada como obrigatória no spec 19 (Requisito 3.4).

## Contexto

A faturação da subscrição foi fixada em **Stripe** (ADR de billing implícito no spec 19). O
Stripe **não liquida em MZN** (metical moçambicano): a moeda de cobrança tem de ser uma moeda
suportada e liquidável pela conta Stripe da GestPro. Ao mesmo tempo, a contabilidade de cada
tenant opera em **MZN** (`ConfiguracaoFiscal.moedaBase="MZN"`, PGC-NIRF). É preciso decidir em
que moeda se cobra a subscrição e como isso coexiste com o livro-razão do cliente.

## Decisão

Cobrar a subscrição SaaS em **USD** (alternativa: EUR), independentemente da `moedaBase=MZN` da
contabilidade do tenant. A receita da subscrição é **receita da plataforma GestPro** e **não** é
lançada no livro-razão (PGC-NIRF) do tenant. O Stripe é a **fonte de verdade** do valor cobrado;
a conversão `Decimal`↔cêntimos ocorre **apenas** na fronteira da API Stripe.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Stripe em USD** ✅ | Moeda estável, amplamente liquidável; previsível para preços internacionais | Cliente paga em moeda estrangeira; exposição cambial do lado do cliente |
| Stripe em EUR | Igual a USD; útil se a entidade faturante for UE | Mesma exposição cambial; depende da entidade legal |
| Gateway móvel local (M-Pesa/e-Mola via agregador) | Cobra em MZN; penetração móvel alta em MZ | Fora do Stripe; novo contrato de webhooks/reconciliação; adiado para pós-MVP |
| Faturação manual (transferência/factura) | Sem gateway; simples de arrancar | Não é self-service; não escala; sem automação de dunning |

Racional: para o MVP self-service, o Stripe em USD entrega Checkout/Portal/dunning/trial sem
cartão prontos, ao custo de o cliente pagar em moeda estrangeira. O gateway móvel local (MZN) é
o caminho natural de evolução para reduzir atrito no mercado moçambicano, mas acrescenta um
contrato de integração próprio — fica **fora do âmbito do MVP** e será um ADR futuro.

## Consequências

- Preços do catálogo (`src/lib/planos.ts`) expressos em USD (`{ valor, moeda: "USD" }`); o site
  (spec 18) mostra a moeda tal como servida por `GET /api/publico/planos`, podendo exibir uma
  estimativa informativa em MZN (nunca vinculativa).
- A subscrição **não** guarda montantes em `Decimal` local — evita dupla contabilidade; o valor
  cobrado vive no Stripe.
- Implicações fiscais (IVA/retenção sobre serviço estrangeiro, faturação da própria GestPro ao
  cliente) a validar com a skill `fiscalidade-mz` antes de produção.
- Evolução: avaliar agregador de pagamento móvel local (MZN) como segunda via de cobrança —
  novo ADR quando priorizado.
