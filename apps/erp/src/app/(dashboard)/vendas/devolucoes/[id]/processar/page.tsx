/**
 * Processar Devolução — Server Component (#130).
 *
 * Só uma APROVADA se processa; noutro estado volta ao detalhe. Processar emite a nota de crédito
 * da factura (se houver) e dá entrada do stock devolvido na localização escolhida aqui (rota
 * própria, sem modais). A série da NC não se escolhe: a numeração é a da série activa (#93).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { devolucaoService } from '@/server/services/comercial/index';
import { stockService } from '@/server/services/inventario/stock.service';
import { listarSeries } from '@/server/services/financas/faturacao.service';
import { obterSessaoAtual } from '@/server/services/financas/caixa.service';
import { PageHeader } from '@/components/patterns';
import { ProcessarDevolucaoForm } from '../../_components/processar-devolucao-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProcessarDevolucaoPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };
  const { id } = await params;

  const devolucao = await runWithTenantContext(ctx, () => devolucaoService.obter(id, ctx)).catch(
    () => null,
  );
  if (!devolucao) notFound();
  if (devolucao.status !== 'APROVADA') redirect(`/vendas/devolucoes/${id}`);

  const [localizacoes, series, sessaoCaixa] = await runWithTenantContext(ctx, () =>
    Promise.all([
      stockService.listarLocalizacoes({ take: 100, ativa: true }, ctx),
      listarSeries(ctx),
      // Reembolso ao cliente: o dinheiro sai da gaveta da sessão aberta e liquida a NC.
      devolucao.reembolso ? obterSessaoAtual(ctx) : Promise.resolve(null),
    ]),
  );
  // Com factura, o serviço exige uma série de NC: é a activa (a mais recente primeiro).
  const serieNotaCreditoId = devolucao.faturaId
    ? series.find((s) => s.tipo === 'NOTA_CREDITO' && s.ativo)?.id
    : undefined;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Processar Devolução ${devolucao.numero}`}
        description={
          devolucao.faturaId
            ? 'Emite a nota de crédito da factura e dá entrada do stock devolvido'
            : 'Dá entrada do stock devolvido'
        }
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Devoluções', href: '/vendas/devolucoes' },
          { label: devolucao.numero, href: `/vendas/devolucoes/${id}` },
          { label: 'Processar' },
        ]}
      />

      <ProcessarDevolucaoForm
        devolucaoId={devolucao.id}
        serieNotaCreditoId={serieNotaCreditoId}
        reembolso={devolucao.reembolso}
        sessaoCaixaId={sessaoCaixa?.id}
        localizacoes={localizacoes.items.map((l) => ({ id: l.id, codigo: l.codigo, nome: l.nome }))}
      />
    </div>
  );
}
