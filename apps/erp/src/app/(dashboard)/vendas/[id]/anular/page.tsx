/**
 * Anular uma venda POS — Server Component (shell). ADR-0041 §8.
 *
 * Rota e não AlertDialog porque recolhe um motivo (um campo de texto é formulário, logo é
 * rota). Só uma venda POS paga com documento se anula aqui; as outras mostram porquê, e o
 * serviço recusa-as na mesma.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { trocaService, vendaService } from '@/server/services/comercial/index';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { AnularVendaForm } from './_components/anular-venda-form';

function razaoParaNaoAnular(
  venda: { origem: string; status: string; faturaId: string | null },
  troca: { numero: string } | null,
): string | null {
  if (venda.status === 'CANCELADA') return 'Esta venda já está anulada.';
  if (troca) {
    return `Esta é a venda de troca ${troca.numero}: não se anula pelo POS. Corrija em Facturação, por nota de crédito.`;
  }
  if (venda.origem !== 'POS' || !venda.faturaId) {
    return 'Esta venda não tem documento fiscal de venda POS: não há nota de crédito a emitir.';
  }
  if (venda.status === 'FATURADA') {
    return 'Esta venda foi a crédito: anula-se pela nota de crédito sobre a factura, em Facturação, liquidada por compensação.';
  }
  if (venda.status !== 'CONCLUIDA') return `Uma venda no estado ${venda.status} não se anula.`;
  return null;
}

export default async function AnularVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  let venda;
  try {
    venda = await runWithTenantContext(ctx, () => vendaService.buscarPorId(id, ctx));
  } catch {
    notFound();
  }
  if (!venda) notFound();

  const detalhe = `/vendas/${venda.id}`;
  const troca = await runWithTenantContext(ctx, () => trocaService.trocaDaVenda(venda.id, ctx));
  const razao = razaoParaNaoAnular(venda, troca);
  const dinheiro = (venda.pagamentos ?? [])
    .filter((p) => p.tipo === 'DINHEIRO')
    .reduce((a, p) => a + parseFloat(p.valor), 0);

  const cabecalho = (
    <PageHeader
      title={`Anular venda ${venda.numero}`}
      breadcrumbs={[
        { label: 'Vendas', href: '/vendas' },
        { label: venda.numero, href: detalhe },
        { label: 'Anular' },
      ]}
      badge={<StatusBadge status={venda.status} />}
    />
  );

  if (razao) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-6 text-sm">
          <p>{razao}</p>
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href={detalhe}>Voltar à venda</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium">Total {formatMZN(venda.total)}</p>
        <p className="mt-1 text-muted-foreground">
          A factura-recibo fica como está. É emitida uma nota de crédito de todas as linhas, o valor é
          devolvido pelos meios com que foi pago e os artigos voltam ao stock.
          {dinheiro > 0
            ? ` Saem ${formatMZN(dinheiro)} em dinheiro da gaveta da sessão de caixa da venda, que tem de estar aberta.`
            : ' Não há dinheiro a devolver da gaveta.'}
        </p>
      </div>

      <AnularVendaForm vendaId={venda.id} numero={venda.numero} />
    </div>
  );
}
