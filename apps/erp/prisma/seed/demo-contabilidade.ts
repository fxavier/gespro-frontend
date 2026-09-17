/**
 * Seed contabilístico do tenant demo — o reflexo das facturas nos livros.
 *
 * O `demo-vendas` cria 104 facturas e nenhuma delas chegava à contabilidade:
 * o balancete abria com sete contas vindas só das contas a pagar, e a receita
 * de 4,5 M MT não existia em lado nenhum. Isto fecha essa lacuna.
 *
 * Entra **pelo contrato do WS D** (`registarLancamentoContabilistico`) e reusa
 * o `construirLancamentoFatura` do próprio serviço de facturação — o mesmo
 * código que corre quando se emite uma factura pela aplicação. Escrever as
 * partidas à mão aqui era mais rápido e garantia que, no dia em que o serviço
 * mudasse de contas, o seed passava a mentir.
 *
 * Duas coisas que o contrato impõe e que valem por si:
 *  - **débitos = créditos**, verificado antes de gravar. Um desequilíbrio
 *    rebenta o seed em vez de produzir um balancete que não fecha.
 *  - **numeração por diário e período fiscal**, com bloqueio de linha. Por isso
 *    isto corre em série: é o mesmo caminho que a aplicação usa.
 *
 * Idempotente: só lança as facturas que ainda não têm lançamento de origem.
 */
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { runWithTenantContext } from '../../src/server/db/tenant-extension';
import { construirLancamentoFatura } from '../../src/server/services/financas/faturacao.service';
import { registarLancamentoContabilistico } from '../../src/server/services/financas/contabilidade.service';

/** 1.2.1 — Depósitos à ordem. O plano PGC semeado não tem folha de Caixa que
 *  aceite lançamento (`11 Caixa` é conta de agregação), por isso o dinheiro
 *  recebido entra no banco, como já acontece nos pagamentos a fornecedores. */
const PGC_BANCO = '121';
/** 4.1.1 — Clientes c/c. */
const PGC_CLIENTES = '411';

export async function seedDemoContabilidade(
  prisma: PrismaClient,
  tenantId: string,
  adminUserId: string,
): Promise<void> {
  const ctx = { tenantId, userId: adminUserId };

  const faturas = await prisma.fatura.findMany({
    where: { tenantId },
    select: {
      id: true, numero: true, total: true, baseIva: true, ivaTotal: true,
      totalPago: true, dataEmissao: true, dataPagamento: true, status: true,
    },
    orderBy: { dataEmissao: 'asc' },
  });
  if (faturas.length === 0) {
    console.log('[seed:demo-contabilidade] sem facturas — nada a lançar.');
    return;
  }

  // Já lançadas: qualquer lançamento que aponte para a factura como origem,
  // seja o da emissão ou o do recebimento.
  const existentes = await prisma.lancamento.findMany({
    where: { tenantId, documentoOrigemId: { in: faturas.map((f) => f.id) } },
    select: { documentoOrigemId: true, documentoOrigemTipo: true },
  });
  const lancado = new Set(existentes.map((l) => `${l.documentoOrigemTipo}:${l.documentoOrigemId}`));

  let emissoes = 0;
  let recebimentos = 0;

  for (const f of faturas) {
    await runWithTenantContext(ctx, async () => {
      if (!lancado.has(`Fatura:${f.id}`)) {
        await prisma.$transaction(async (tx) => {
          await registarLancamentoContabilistico(
            tx,
            construirLancamentoFatura({
              id: f.id,
              numero: f.numero,
              total: f.total,
              // `baseIva` e não `subtotal`: a base tributável já está líquida do
              // desconto comercial, e é ela que soma com o IVA para dar o total.
              // Passar o `subtotal` bruto desequilibrava a partida em todas as
              // facturas com desconto — e o contrato recusaria a gravação.
              subtotal: f.baseIva,
              ivaTotal: f.ivaTotal,
              dataEmissao: f.dataEmissao,
            }),
            ctx,
          );
        });
        emissoes++;
      }

      // Recebimento do cliente. A aplicação ainda não o lança (o
      // `registarPagamentoFatura` mexe no `totalPago` e mais nada) — sem isto,
      // a conta de clientes só cresce e o banco nunca recebe nada.
      const pago = new Prisma.Decimal(f.totalPago);
      if (pago.greaterThan(0) && !lancado.has(`Recebimento:${f.id}`)) {
        await prisma.$transaction(async (tx) => {
          await registarLancamentoContabilistico(
            tx,
            {
              data: f.dataPagamento ?? f.dataEmissao,
              diarioTipo: 'BANCO',
              origem: 'RECEBIMENTO',
              documentoOrigemId: f.id,
              documentoOrigemTipo: 'Recebimento',
              historico: `Recebimento da factura ${f.numero}`,
              partidas: [
                {
                  contaCodigo: PGC_BANCO,
                  tipo: 'DEBITO',
                  valor: pago.toFixed(2),
                  historico: `Factura ${f.numero} — entrada em depósitos à ordem`,
                },
                {
                  contaCodigo: PGC_CLIENTES,
                  tipo: 'CREDITO',
                  valor: pago.toFixed(2),
                  historico: `Factura ${f.numero} — liquidação de clientes c/c`,
                },
              ],
            },
            ctx,
          );
        });
        recebimentos++;
      }
    });
  }

  console.log(
    `[seed:demo-contabilidade] lançamentos: ${emissoes} emissões, ${recebimentos} recebimentos.`,
  );
}
