/**
 * Cancelar proforma — Server Component (shell) (#148).
 *
 * Em RASCUNHO, ENVIADA ou ACEITE, conforme `TRANSICOES_PROFORMA`. O motivo vai
 * para `motivoCancelamento`; as observações ficam como estavam.
 */

import { notFound } from 'next/navigation';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_PROFORMA } from '@/server/services/financas/faturacao.interface';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { PERM, AvisoEstado, acessoDocumento } from '../../../_components/acesso-documento';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { CancelarDocumentoForm } from '../../../_components/cancelar-documento-form';

export default async function CancelarProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const proforma = await runWithTenantContext(ctx, () => faturacaoService.obterProforma(id, ctx));
  if (!proforma) notFound();

  const detalhe = `/faturacao/proforma/${proforma.id}`;
  const cabecalho = (
    <PageHeader
      title={`Cancelar ${proforma.numero}`}
      description="A proforma deixa de poder ser aceite ou convertida"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: 'Proformas', href: '/faturacao/proforma' },
        { label: proforma.numero, href: detalhe },
        { label: 'Cancelar' },
      ]}
      badge={<StatusBadge status={proforma.status} />}
    />
  );

  let bloqueio: React.ReactNode = null;
  if (!tem(PERM.proformaCancelar)) {
    bloqueio = (
      <SemPermissao testId="documento-sem-permissao" mensagem="Cancelar uma proforma exige a permissão faturacao:proforma:cancelar." voltar={{ href: detalhe, rotulo: 'Voltar ao documento' }} />
    );
  } else if (!TRANSICOES_PROFORMA[proforma.status].includes('CANCELADA')) {
    bloqueio = (
      <AvisoEstado
        mensagem={`Só se cancela uma proforma em rascunho, enviada ou aceite. Esta está ${proforma.status}.`}
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
              {proforma.numero} · {formatarData(proforma.dataEmissao)} ·{' '}
              {formatMZN(proforma.total.toString())}
            </p>
          </div>
          <CancelarDocumentoForm tipo="proforma" id={proforma.id} numero={proforma.numero} destino={detalhe} />
        </>
      )}
    </div>
  );
}
