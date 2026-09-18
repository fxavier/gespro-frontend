/**
 * Estornar um lançamento — Server Component (shell).
 *
 * Só lançamentos em LANCADO se estornam: um rascunho ainda não produziu
 * efeito e um já estornado não se estorna duas vezes. A máquina de estados no
 * serviço recusa os dois casos; aqui evita-se que o formulário sequer apareça.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { EstornarForm } from './_components/estornar-form';

export default async function EstornarLancamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

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
          <p>
            {lancamento.status === 'RASCUNHO'
              ? 'Este lançamento ainda está em rascunho: não produziu efeito nenhum, por isso não há nada a estornar. Confirme-o primeiro, ou corrija-o à vontade enquanto não o confirmar.'
              : 'Este lançamento já foi estornado. Um documento contabilístico só se anula uma vez — o contra-lançamento está no detalhe.'}
          </p>
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
