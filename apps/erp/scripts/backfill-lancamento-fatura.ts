/**
 * Backfill do lançamento contabilístico de facturas emitidas sem ele.
 *
 * As facturas do seed de demonstração nasceram antes de `emitirFatura` passar a
 * gravar `Fatura.lancamentoId`: ficam a bloquear o apuramento do IVA e o fecho
 * do período com `DOCUMENTO_SEM_LANCAMENTO`.
 *
 * Escreve PELO SERVIÇO (`registarLancamentoContabilistico`), nunca por SQL: é o
 * que o `gate-periodo` impõe e é o que resolve o período, tranca-o e numera o
 * lançamento sem lacunas. Corre com `tsx -C react-server` (como o `db:seed`),
 * para que `server-only` resolva para vazio.
 *
 *   npx tsx -C react-server scripts/backfill-lancamento-fatura.ts <tenantSlug> <numero…>
 *
 * Idempotente: uma factura que já tenha `lancamentoId` é saltada.
 */
import { prismaBase } from '../src/server/db/client';
import { runWithTenantContext } from '../src/server/db/tenant-extension';
import { registarLancamentoContabilistico } from '../src/server/services/financas/contabilidade.service';
import { construirLancamentoFatura } from '../src/server/services/financas/faturacao.service';

const [slug, ...numeros] = process.argv.slice(2);
if (!slug || numeros.length === 0) {
  console.error('uso: backfill-lancamento-fatura.ts <tenantSlug> <numero…>');
  process.exit(1);
}

async function main() {
  const tenant = await prismaBase.tenant.findFirst({ where: { slug }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant "${slug}" não encontrado`);
  const utilizador = await prismaBase.user.findFirst({
    where: { tenantId: tenant.id, email: `admin@${slug}.mz` },
    select: { id: true },
  });
  if (!utilizador) throw new Error(`Utilizador admin do tenant "${slug}" não encontrado`);

  const ctx = { tenantId: tenant.id, userId: utilizador.id };

  await runWithTenantContext(ctx, async () => {
    for (const numero of numeros) {
      await prismaBase.$transaction(async (tx) => {
        const f = await tx.fatura.findFirst({ where: { numero, tenantId: ctx.tenantId } });
        if (!f) throw new Error(`Factura ${numero} não encontrada`);
        if (f.lancamentoId) {
          console.log(`· ${numero} já tem lançamento (${f.lancamentoId}) — saltado`);
          return;
        }

        // A receita creditada é a base tributável: o desconto comercial já a
        // reduziu (`total = subtotal − desconto + IVA`). Passar `subtotal` em
        // bruto desequilibra a partida dobrada em facturas com desconto.
        const lancamento = await registarLancamentoContabilistico(
          tx,
          construirLancamentoFatura({
            id: f.id,
            numero: f.numero,
            total: f.total,
            subtotal: f.subtotal.minus(f.descontoTotal),
            ivaTotal: f.ivaTotal,
            dataEmissao: f.dataEmissao,
          }),
          ctx,
        );
        await tx.fatura.update({ where: { id: f.id }, data: { lancamentoId: lancamento.id } });
        console.log(
          `✓ ${numero} → lançamento ${lancamento.numero} (${lancamento.periodoFiscal}), ${f.total} MT`,
        );
      });
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prismaBase.$disconnect());
