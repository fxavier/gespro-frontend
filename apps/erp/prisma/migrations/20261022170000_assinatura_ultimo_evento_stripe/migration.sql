-- #561 — instante (`created` do Stripe) do último evento de estado aplicado pelo webhook.
-- Nulo nas assinaturas existentes: o primeiro evento seguinte aplica-se sempre.

-- AlterTable
ALTER TABLE "Assinatura" ADD COLUMN     "ultimoEventoStripeEm" TIMESTAMP(3);
