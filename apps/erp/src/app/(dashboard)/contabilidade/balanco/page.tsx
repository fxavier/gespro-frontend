/**
 * Balanço simples por classes — Server Component (ADR-0035 §8, issue #365).
 *
 * URL: /contabilidade/balanco?exercicio=<código>&ate=<1..13>
 *   exercício: o pedido, senão o que contém «agora», senão o mais recente (`exercicioCorrente`,
 *   a regra do balancete); `ate` ausente ou inválido ⇒ a omissão do serviço (13 com o exercício
 *   encerrado, 12 aberto).
 *
 * As três massas por conta de razão, os totais e a igualdade Activo = Capital próprio + Passivo.
 * «Exportar PDF» leva os mesmos parâmetros à rota `/api/contabilidade/balanco/export`.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarExercicios } from '@/server/services/financas/contabilidade.service';
import { gerarBalanco } from '@/server/services/financas/balanco.service';
import type { MassaBalanco } from '@/server/services/financas/balanco';
import { exercicioCorrente } from '@/lib/balancete-params';
import { periodoFinalPorOmissao } from '@/lib/state-machines';
import { formatNumero } from '@/lib/format-currency';
import { Button } from '@/components/ui/button';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { SeletorBalanco } from './_components/seletor-balanco';

type Ctx = { tenantId: string; userId: string };

function fmt(d: Prisma.Decimal): string {
  return d.isZero() ? '—' : formatNumero(d.toFixed(2));
}

function Massa({
  titulo,
  slug,
  massa,
  extra,
}: {
  titulo: string;
  /** id do título (sem espaços): `massa-activo`, `massa-capital-proprio`, `massa-passivo`. */
  slug: string;
  massa: MassaBalanco;
  extra?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card" aria-labelledby={slug}>
      <h2 id={slug} className="px-4 pt-4 pb-2 font-semibold">
        {titulo}
      </h2>
      <Table>
        <TableBody>
          {massa.linhas.length === 0 && !extra ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                Sem saldos.
              </TableCell>
            </TableRow>
          ) : null}
          {massa.linhas.map((l, i) => (
            <TableRow key={`${l.codigo}-${i}`}>
              <TableCell className="w-16 tabular-nums text-muted-foreground">{l.codigo}</TableCell>
              <TableCell>{l.nome}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(l.valor)}</TableCell>
            </TableRow>
          ))}
          {extra}
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell />
            <TableCell>Total — {titulo}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(massa.total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>
  );
}

async function BalancoSection({ exercicioId, periodoFinal, ctx }: { exercicioId: string; periodoFinal?: number; ctx: Ctx }) {
  const b = await runWithTenantContext(ctx, () => gerarBalanco({ exercicioId, periodoFinal }, ctx));
  const cpMaisPassivo = b.capitalProprio.total.plus(b.passivo.total);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Massa titulo="Activo" slug="massa-activo" massa={b.activo} />
        <div className="space-y-6">
          <Massa
            titulo="Capital próprio"
            slug="massa-capital-proprio"
            massa={b.capitalProprio}
            extra={
              b.resultadoDoPeriodo.isZero() ? null : (
                <TableRow>
                  <TableCell />
                  <TableCell>Resultado do período (por apurar)</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(b.resultadoDoPeriodo)}</TableCell>
                </TableRow>
              )
            }
          />
          <Massa titulo="Passivo" slug="massa-passivo" massa={b.passivo} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4 text-sm">
        <span>
          Activo <span className="font-semibold tabular-nums">{fmt(b.activo.total)}</span>
        </span>
        <span>
          Capital próprio + Passivo <span className="font-semibold tabular-nums">{fmt(cpMaisPassivo)}</span>
        </span>
        <span className={`font-semibold ${b.equilibrado ? 'text-success' : 'text-destructive'}`}>
          {b.equilibrado ? 'Equilibrado' : 'Desequilibrado'}
        </span>
      </div>
    </div>
  );
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BalancoPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const raw = await searchParams;
  const um = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]);
  const exercicios = await runWithTenantContext(ctx, () => listarExercicios(ctx));

  const breadcrumbs = [{ label: 'Contabilidade', href: '/contabilidade' }, { label: 'Balanço' }];
  if (exercicios.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Balanço" breadcrumbs={breadcrumbs} />
        <div className="rounded-lg border p-8 text-center space-y-3">
          <p className="text-muted-foreground">Sem exercício contabilístico</p>
          <Button asChild size="sm">
            <Link href="/contabilidade/exercicios/novo">Abrir exercício</Link>
          </Button>
        </div>
      </div>
    );
  }

  const ex = exercicioCorrente(exercicios, um('exercicio'));
  const ate = Number(um('ate'));
  const periodoPedido = Number.isInteger(ate) && ate >= 1 && ate <= 13 ? ate : undefined;
  const periodoFinal = periodoPedido ?? periodoFinalPorOmissao(ex.estado);

  const q = new URLSearchParams({ exercicioId: ex.id, periodoFinal: String(periodoFinal), formato: 'pdf' });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Balanço"
        description={`Exercício ${ex.codigo} — ${periodoFinal === 13 ? 'após o encerramento (período 13)' : `até ao período ${periodoFinal}`}`}
        breadcrumbs={breadcrumbs}
        actions={
          <Button asChild size="sm" variant="outline">
            {/* `download` sem valor: o nome do ficheiro vem do Content-Disposition. */}
            <a href={`/api/contabilidade/balanco/export?${q.toString()}`} download>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Exportar PDF
            </a>
          </Button>
        }
      />
      <SeletorBalanco exercicios={exercicios.map((e) => ({ codigo: e.codigo }))} exercicio={ex.codigo} periodoFinal={periodoFinal} />
      <Suspense key={`${ex.id}-${periodoFinal}`} fallback={<TableSkeleton rows={10} cols={3} />}>
        <BalancoSection exercicioId={ex.id} periodoFinal={periodoFinal} ctx={ctx} />
      </Suspense>
    </div>
  );
}
