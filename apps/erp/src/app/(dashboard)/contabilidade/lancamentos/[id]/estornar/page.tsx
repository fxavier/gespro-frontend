/**
 * Estornar um lançamento — Server Component (shell).
 *
 * Só lançamentos em LANCADO se estornam: um rascunho ainda não produziu
 * efeito e um já estornado não se estorna duas vezes. A máquina de estados no
 * serviço recusa os dois casos; aqui evita-se que o formulário sequer apareça.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { acessoLancamentos } from '../../_lib/acesso';
import { EstornarForm } from './_components/estornar-form';

export default async function EstornarLancamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { ctx, podeEscrever } = await acessoLancamentos();
  const { id } = await params;

  const lancamento = await runWithTenantContext(ctx, () =>
    contabilidadeService.obterLancamento(id, ctx)
  );
  if (!lancamento) notFound();

  const detalhe = `/contabilidade/lancamentos/${lancamento.id}`;

  const cabecalho = (
    <PageHeader
      title={`Estornar ${lancamento.numero}`}
      description={lancamento.historico}
      breadcrumbs={[
        { label: 'Contabilidade', href: '/contabilidade' },
        { label: 'Lançamentos', href: '/contabilidade/lancamentos' },
        { label: lancamento.numero, href: detalhe },
        { label: 'Estornar' },
      ]}
    />
  );

  if (lancamento.status !== 'LANCADO') {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm">
          {lancamento.status === 'RASCUNHO' ? (
            <p>
              Este lançamento ainda está em rascunho: não produziu efeito nenhum, por isso não há
              nada a estornar. Confirme-o primeiro ou, enquanto não o confirmar,{' '}
              {podeEscrever ? (
                <>
                  <Link href={`${detalhe}/editar`} className="font-medium underline underline-offset-4">
                    Editar
                  </Link>{' '}
                  as partidas, o histórico e a data, ou{' '}
                  <Link href={`${detalhe}/anular`} className="font-medium underline underline-offset-4">
                    Anular
                  </Link>{' '}
                  o rascunho com um motivo.
                </>
              ) : (
                'pode ser editado ou anulado por quem tenha permissão de escrita nos lançamentos.'
              )}
            </p>
          ) : (
            <p>
              {lancamento.status === 'ANULADO'
                ? 'Este rascunho foi anulado: nunca produziu efeito, por isso não há nada a estornar.'
                : 'Este lançamento já foi estornado. Um documento contabilístico só se anula uma vez — o contra-lançamento está no detalhe.'}
            </p>
          )}
          <Button asChild size="sm" variant="outline" className="mt-4">
            <Link href={detalhe}>Voltar ao lançamento</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {cabecalho}

      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          {lancamento.numero} · {formatarData(lancamento.data)} ·{' '}
          {formatMZN(lancamento.valorTotal.toString())}
        </p>
        <p className="mt-1 text-muted-foreground">
          Vão ser criadas {lancamento.partidas.length} partidas invertidas, no mesmo diário e
          pelo mesmo valor. O original fica como está.
        </p>
      </div>

      <EstornarForm lancamentoId={lancamento.id} numero={lancamento.numero} />
    </div>
  );
}
