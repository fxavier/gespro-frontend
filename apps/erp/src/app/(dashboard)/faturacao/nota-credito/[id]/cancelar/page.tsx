/**
 * Cancelar nota de crédito — Server Component (shell) (#148).
 *
 * Só a partir de EMITIDA. O serviço estorna o lançamento da NC na mesma
 * transacção, com a data de hoje — o aviso diz isso antes de o utilizador
 * confirmar.
 */

import { notFound } from 'next/navigation';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_NOTA_CREDITO } from '@/server/services/financas/faturacao.interface';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { PERM, AvisoEstado, SemPermissao, acessoDocumento } from '../../../_components/acesso-documento';
import { CancelarDocumentoForm } from '../../../_components/cancelar-documento-form';

export default async function CancelarNotaCreditoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const nc = await runWithTenantContext(ctx, () => faturacaoService.obterNotaCredito(id, ctx));
  if (!nc) notFound();

  const detalhe = `/faturacao/nota-credito/${nc.id}`;
  const cabecalho = (
    <PageHeader
      title={`Cancelar ${nc.numero}`}
      description="Anula a nota de crédito e estorna o lançamento dela"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: 'Notas de Crédito', href: '/faturacao/nota-credito' },
        { label: nc.numero, href: detalhe },
        { label: 'Cancelar' },
      ]}
      badge={<StatusBadge status={nc.status} />}
    />
  );

  let bloqueio: React.ReactNode = null;
  if (!tem(PERM.ncCancelar)) {
    bloqueio = (
      <SemPermissao mensagem="Cancelar uma nota de crédito exige a permissão faturacao:nc:cancelar." voltar={detalhe} />
    );
  } else if (!TRANSICOES_NOTA_CREDITO[nc.status].includes('CANCELADA')) {
    bloqueio = (
      <AvisoEstado
        mensagem={`Só se cancela uma nota de crédito EMITIDA. Esta está ${nc.status}.`}
        voltar={detalhe}
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {cabecalho}
      {bloqueio ?? (
        <>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              {nc.numero} · factura {nc.faturaOriginal.numero} · {formatarData(nc.dataEmissao)} ·{' '}
              {formatMZN(nc.total.toString())}
            </p>
            <p className="mt-1 text-muted-foreground">{nc.motivo}</p>
          </div>
          <CancelarDocumentoForm
            tipo="nota-credito"
            id={nc.id}
            numero={nc.numero}
            destino={detalhe}
            aviso="O lançamento contabilístico da nota de crédito será estornado com a data de hoje."
          />
        </>
      )}
    </div>
  );
}
