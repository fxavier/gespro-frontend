import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterContaReconciliacao, obterMovimentosEscolhidos } from '@/server/services/reconciliacao/consulta.service';
import { Button } from '@/components/ui/button';
import { EmptyState, FormSection, PageHeader } from '@/components/patterns';
import { ManualForm } from './_components/manual-form';

const ids = (v?: string) => (v ?? '').split(',').filter(Boolean).slice(0, 50);
const sinal = (n: string) => (n === 'DEBITO' ? 1 : -1);

interface LinhaEscolhida {
  id: string;
  data: Date;
  ref: string | null;
  descricao: string;
  valor: Prisma.Decimal;
  natureza: string;
}

function Lista({ titulo, linhas }: { titulo: string; linhas: LinhaEscolhida[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <ul className="divide-y rounded-md border text-sm">
        {linhas.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
            <span className="tabular-nums text-muted-foreground">{formatarData(m.data)}</span>
            <span className="flex-1">{m.ref ? `${m.ref} · ` : ''}{m.descricao}</span>
            <span className="tabular-nums">{m.natureza === 'DEBITO' ? '+' : '−'} {formatMZN(m.valor.toString())}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ReconciliacaoManualPage({
  params,
  searchParams,
}: {
  params: Promise<{ contaId: string }>;
  searchParams: Promise<{ b?: string; c?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const { contaId } = await params;
  const sp = await searchParams;
  const base = `/contabilidade/reconciliacao/${contaId}`;

  const [conta, escolhidos] = await runWithTenantContext(ctx, () =>
    Promise.all([
      obterContaReconciliacao(contaId, ctx),
      obterMovimentosEscolhidos(contaId, { banco: ids(sp.b), contabilidade: ids(sp.c) }, ctx),
    ]),
  ).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const titulo = `${conta.banco} — ${conta.numeroConta}`;
  const { bancarios, contabilisticos } = escolhidos;

  const total = (ms: { valor: Prisma.Decimal; natureza: string }[]) =>
    ms.reduce((a, m) => a.plus(m.valor.times(sinal(m.natureza))), new Prisma.Decimal(0));
  const tb = total(bancarios);
  const tc = total(contabilisticos);

  const cabecalho = (
    <div className="p-6 pb-0">
      <PageHeader
        title="Reconciliação manual"
        description={titulo}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
          { label: titulo, href: base },
          { label: 'Reconciliação manual' },
        ]}
      />
    </div>
  );

  if (bancarios.length === 0 || contabilisticos.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        {cabecalho}
        <div className="p-6">
          <EmptyState
            title="Escolha movimentos dos dois lados"
            description="Volte às excepções e escolha pelo menos um movimento do extracto e um da contabilidade."
            action={<Button asChild size="sm"><Link href={base}>Voltar às excepções</Link></Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {cabecalho}
      <ManualForm contaBancariaId={contaId} bancarios={bancarios.map((m) => m.id)} contabilisticos={contabilisticos.map((m) => m.id)}>
        <FormSection title="Movimentos" description="O que vai ficar reconciliado. A diferença, se houver, fica registada.">
          <div className="grid gap-4 md:grid-cols-2">
            <Lista titulo="Extracto bancário" linhas={bancarios.map((m) => ({ ...m, data: m.dataMovimento, ref: m.referencia }))} />
            <Lista titulo="Contabilidade" linhas={contabilisticos.map((m) => ({ ...m, data: m.dataContabilistica, ref: m.documento ?? m.referencia }))} />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm tabular-nums">
            <div><dt className="text-muted-foreground">Extracto</dt><dd>{formatMZN(tb.toString())}</dd></div>
            <div><dt className="text-muted-foreground">Contabilidade</dt><dd>{formatMZN(tc.toString())}</dd></div>
            <div>
              <dt className="text-muted-foreground">Diferença</dt>
              <dd className={tb.equals(tc) ? '' : 'font-semibold text-destructive'}>{formatMZN(tb.minus(tc).toString())}</dd>
            </div>
          </dl>
        </FormSection>
      </ManualForm>
    </div>
  );
}
