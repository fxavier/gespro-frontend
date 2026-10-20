/**
 * Cancelar nota de débito — Server Component (shell) (#565, ADR-0039 §3).
 *
 * Só a partir de EMITIDA. O serviço estorna o lançamento da ND na mesma
 * transacção, com a data de hoje, e recusa se o período já tiver o IVA apurado.
 */

import { notFound } from 'next/navigation';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_NOTA_DEBITO } from '@/server/services/financas/faturacao.interface';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { PERM, AvisoEstado, acessoDocumento } from '../../../../faturacao/_components/acesso-documento';
import { CancelarDocumentoForm } from '../../../../faturacao/_components/cancelar-documento-form';

export default async function CancelarNotaDebitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const nd = await runWithTenantContext(ctx, () => faturacaoService.obterNotaDebito(id, ctx));
  if (!nd) notFound();

  const detalhe = `/vendas/notas-debito/${nd.id}`;

  let bloqueio: React.ReactNode = null;
  if (!tem(PERM.ndCancelar)) {
    bloqueio = (
      <SemPermissao
        testId="documento-sem-permissao"
        mensagem="Cancelar uma nota de débito exige a permissão faturacao:nd:cancelar."
        voltar={{ href: detalhe, rotulo: 'Voltar ao documento' }}
      />
    );
  } else if (!TRANSICOES_NOTA_DEBITO[nd.status].includes('CANCELADA')) {
    bloqueio = (
      <AvisoEstado mensagem={`Só se cancela uma nota de débito EMITIDA. Esta está ${nd.status}.`} voltar={detalhe} />
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Cancelar ${nd.numero}`}
        description="Anula a nota de débito e estorna o lançamento dela"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Notas de Débito', href: '/vendas/notas-debito' },
          { label: nd.numero, href: detalhe },
          { label: 'Cancelar' },
        ]}
        badge={<StatusBadge status={nd.status} />}
      />
      {bloqueio ?? (
        <>
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              {nd.numero} · {formatarData(nd.dataEmissao)} · {formatMZN(nd.total.toString())}
            </p>
            <p className="mt-1 text-muted-foreground">{nd.motivo}</p>
          </div>
          <CancelarDocumentoForm
            tipo="nota-debito"
            id={nd.id}
            numero={nd.numero}
            destino={detalhe}
            aviso={
              nd.lancamentoId
                ? 'O lançamento contabilístico da nota de débito será estornado com a data de hoje. Se o período da emissão já tiver o IVA apurado, o cancelamento é recusado: corrija com uma nota de crédito.'
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}
