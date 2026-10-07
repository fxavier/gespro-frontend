/**
 * Cancelar cotação comercial — Server Component (shell) (#148).
 *
 * Só em RASCUNHO (`TRANSICOES_COTACAO_COMERCIAL`): depois de enviada, o caminho
 * é «Rejeitar», que regista a recusa do cliente.
 */

import { notFound } from 'next/navigation';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as faturacaoService from '@/server/services/financas/faturacao.service';
import { TRANSICOES_COTACAO_COMERCIAL } from '@/server/services/financas/faturacao.interface';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { PERM, AvisoEstado, acessoDocumento } from '../../../_components/acesso-documento';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { CancelarDocumentoForm } from '../../../_components/cancelar-documento-form';

export default async function CancelarCotacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, tem } = await acessoDocumento();

  const cotacao = await runWithTenantContext(ctx, () => faturacaoService.obterCotacaoComercial(id, ctx));
  if (!cotacao) notFound();

  const detalhe = `/faturacao/cotacoes/${cotacao.id}`;
  const cabecalho = (
    <PageHeader
      title={`Cancelar ${cotacao.numero}`}
      description="Retira uma cotação que ainda não saiu para o cliente"
      breadcrumbs={[
        { label: 'Faturação', href: '/faturacao' },
        { label: 'Cotações', href: '/faturacao/cotacoes' },
        { label: cotacao.numero, href: detalhe },
        { label: 'Cancelar' },
      ]}
      badge={<StatusBadge status={cotacao.status} />}
    />
  );

  let bloqueio: React.ReactNode = null;
  if (!tem(PERM.cotacaoGerir)) {
    bloqueio = (
      <SemPermissao testId="documento-sem-permissao" mensagem="Cancelar uma cotação exige a permissão faturacao:cotacao:gerir." voltar={{ href: detalhe, rotulo: 'Voltar ao documento' }} />
    );
  } else if (!TRANSICOES_COTACAO_COMERCIAL[cotacao.status].includes('CANCELADA')) {
    bloqueio = (
      <AvisoEstado
        accao={cotacao.status === 'ENVIADA' ? { href: `/faturacao/cotacoes/${id}/rejeitar`, rotulo: 'Rejeitar cotação' } : undefined}
        mensagem={
          cotacao.status === 'ENVIADA'
            ? 'Esta cotação já foi enviada ao cliente: em vez de a cancelar, registe a recusa com «Rejeitar».'
            : `Só se cancela uma cotação em rascunho. Esta está ${cotacao.status}.`
        }
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
              {cotacao.numero} · {formatarData(cotacao.dataEmissao)} ·{' '}
              {formatMZN(cotacao.total.toString())}
            </p>
          </div>
          <CancelarDocumentoForm tipo="cotacao" id={cotacao.id} numero={cotacao.numero} destino={detalhe} />
        </>
      )}
    </div>
  );
}
