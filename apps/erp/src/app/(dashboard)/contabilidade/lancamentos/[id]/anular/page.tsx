/**
 * Anular um lançamento em RASCUNHO — Server Component (#137, D1/D3).
 *
 * É uma rota com formulário, não um AlertDialog: anular pede um motivo, e
 * recolher dados é formulário (regra sem-modais). Um lançamento que já não
 * seja rascunho não mostra formulário — explica porquê.
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
import { AnularForm } from './_components/anular-form';

export default async function AnularLancamentoPage({
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
      title={`Anular ${lancamento.numero}`}
      description={lancamento.historico}
      breadcrumbs={[
        { label: 'Contabilidade', href: '/contabilidade' },
        { label: 'Lançamentos', href: '/contabilidade/lancamentos' },
        { label: lancamento.numero, href: detalhe },
        { label: 'Anular' },
      ]}
    />
  );

  const aviso = (texto: string) => (
    <div className="p-6 space-y-6">
      {cabecalho}
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm">
        <p>{texto}</p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link href={detalhe}>Voltar ao lançamento</Link>
        </Button>
      </div>
    </div>
  );

  if (lancamento.status !== 'RASCUNHO') {
    return aviso(
      lancamento.status === 'ANULADO'
        ? 'Este rascunho já foi anulado — o motivo está no detalhe.'
        : 'Só um lançamento em rascunho se anula. Este já foi confirmado: a correcção faz-se por estorno, a partir do detalhe.'
    );
  }
  if (!podeEscrever) {
    return aviso(
      'Não tem permissão para anular lançamentos. Peça a quem tenha «Criar e editar lançamentos» para anular este rascunho.'
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
          O rascunho passa a «Anulado»: nunca terá efeito contabilístico e deixa de aparecer na
          lista por omissão. A linha e o número ficam, para a numeração do diário não ter lacunas.
        </p>
      </div>

      <AnularForm lancamentoId={lancamento.id} numero={lancamento.numero} />
    </div>
  );
}
