# ADR-0009 — Moeda de faturação da subscrição SaaS (Stripe)

- **Estado**: Aceite
- **Data**: 2026-07-21 (proposto) · 2026-07-22 (aceite, implementado no spec 19)
- **Contexto**: Spec 19 (Onboarding, Provisionamento e Faturação por Subscrição)
- **Skills**: `engineering:architecture`, `api-conventions`, `fiscalidade-mz`

## Contexto

A faturação da subscrição foi fixada em **Stripe**. O Stripe **não liquida em MZN** (metical
moçambicano): a moeda de cobrança tem de ser suportada e liquidável pela conta Stripe da GestPro.
Ao mesmo tempo, a contabilidade de cada tenant opera em **MZN**
(`ConfiguracaoFiscal.moedaBase="MZN"`, PGC-NIRF, Decreto 70/2009). É preciso decidir em que moeda
se cobra a subscrição e como isso coexiste com o livro-razão do cliente.

O problema não é só de conversão cambial. São **dois livros diferentes**: o do tenant (MZN,
`Decimal`, append-only, sujeito a fiscalidade moçambicana) e o da plataforma (o que a GestPro
cobra aos seus clientes). Misturá-los seria lançar a factura da GestPro dentro da contabilidade
do próprio cliente.

## Decisão

1. Cobrar a subscrição SaaS em **USD**, independentemente da `moedaBase=MZN` do tenant.
2. A receita da subscrição é **receita da plataforma** e **não** é lançada no livro-razão
   (PGC-NIRF) do tenant.
3. O **Stripe é a fonte de verdade** do valor cobrado: o modelo `Assinatura` **não guarda
   montantes**. Guarda apenas plano, ciclo, estado e as referências Stripe
   (`stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`).
4. A conversão unidade principal ↔ cêntimos (`paraCentavos`/`deCentavos`) existe **apenas** em
   `src/server/billing/stripe-client.ts`, a fronteira da API Stripe. Nenhum `Prisma.Decimal`
   atravessa essa fronteira.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Stripe em USD** ✅ | Moeda estável e amplamente liquidável; Checkout/Portal/dunning/trial sem cartão prontos; preço previsível para venda internacional | Cliente paga em moeda estrangeira; exposição cambial do lado do cliente |
| Stripe em EUR | Igual a USD; útil se a entidade faturante for da UE | Mesma exposição cambial; depende da entidade legal, ainda não fixada |
| Gateway móvel local (M-Pesa/e-Mola via agregador) | Cobra em MZN; penetração móvel alta em MZ | Fora do Stripe; contrato de webhooks/reconciliação/dunning a construir de raiz; adiado para pós-MVP |
| Faturação manual (transferência/factura) | Sem gateway; arranca depressa | Não é self-service — mata o objectivo do spec 19; não escala; sem dunning |
| Guardar o montante cobrado em `Decimal` local | Relatórios de receita sem chamar o Stripe | Dupla contabilidade: dois números que divergem em cada proração, reembolso ou cupão — e o do Stripe é o que o cliente vê no cartão |

Racional: para o MVP self-service, o Stripe em USD entrega o ciclo de vida completo
(trial sem cartão → Checkout → dunning → Portal) sem construir nada, ao custo de o cliente pagar
em moeda estrangeira. O gateway móvel local em MZN é o caminho natural para reduzir atrito no
mercado moçambicano, mas acrescenta um contrato de integração próprio — fica **fora do âmbito do
MVP** e será um ADR futuro.

## Consequências

- Preços do catálogo (`src/lib/planos.ts`) expressos em USD (`{ valor, moeda: "USD" }`) e
  servidos por `GET /api/publico/planos`. O site (spec 18) mostra a moeda tal como servida e
  **nunca** hardcoda valores; pode exibir uma estimativa informativa em MZN, nunca vinculativa.
- `Assinatura` não tem colunas de dinheiro — não há `Decimal` local para divergir do Stripe.
  Relatórios de receita da plataforma leem-se do Stripe (Dashboard/Sigma), não da base de dados
  do produto.
- A regra «dinheiro é sempre `Prisma.Decimal`» do `CLAUDE.md` continua intacta: aplica-se ao
  livro-razão do tenant. A subscrição SaaS não é um documento do tenant.
- Alterar preço ou limites **não exige migração de schema**: muda-se `src/lib/planos.ts` e os
  `Price` no Stripe (`STRIPE_PRICE_<PLANO>_<CICLO>` em ambiente).
- Implicações fiscais (IVA/retenção sobre serviço prestado do estrangeiro, faturação da própria
  GestPro ao cliente moçambicano) ficam por validar com a skill `fiscalidade-mz` **antes de
  produção** — é o principal risco em aberto desta decisão.
- Evolução: avaliar agregador de pagamento móvel local (MZN) como segunda via de cobrança. Nessa
  altura, `Assinatura` ganha um discriminador de provedor de pagamento; o ciclo de estados
  (`EstadoAssinatura`) já é agnóstico ao Stripe e não precisa de mudar.
