/**
 * Detalhe de Payroll / Recibo de Vencimento — Server Component (Spec 06).
 * Mostra proventos, descontos, encargos patronais e permite descarregar o PDF.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, FileDown } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { NotFoundError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge } from '@/components/patterns';
import type { ReciboDados } from '@/server/services/pessoas-projetos/payroll.interface';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function fmt(v: { toString(): string }): string {
  return Number(v.toString()).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
}

export default async function PayrollDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  let recibo: ReciboDados;
  try {
    recibo = await runWithTenantContext({ tenantId, userId }, () =>
      PayrollService.obterRecibo(id, { tenantId, userId })
    );
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const { payroll, colaborador, empresa, linhas } = recibo;
  const periodo = `${MESES[payroll.mesReferencia - 1]} ${payroll.anoReferencia}`;
  const proventos = linhas.filter((l) => l.tipo === 'PROVENTO');
  const descontos = linhas.filter((l) => l.tipo === 'DESCONTO');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Recibo de Vencimento — ${colaborador.nome}`}
        description={`${periodo} · ${empresa.nome} (NUIT ${empresa.nuit})`}
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários', href: '/rh/payroll' },
          { label: periodo },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/rh/payroll">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Voltar
              </Link>
            </Button>
            <Button size="sm" asChild>
              <a href={`/api/rh/payroll/${payroll.id}/recibo`}>
                <FileDown className="h-4 w-4 mr-1.5" />
                Descarregar PDF
              </a>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dados do colaborador */}
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Colaborador
          </h3>
          <dl className="space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Nome</dt>
              <dd className="font-medium text-right">{colaborador.nome}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Código</dt>
              <dd className="tabular-nums">{colaborador.codigo}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">NUIT</dt>
              <dd className="tabular-nums">{colaborador.nuit}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">NISS (INSS)</dt>
              <dd className="tabular-nums">{colaborador.niss ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Cargo</dt>
              <dd>{colaborador.cargo ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Departamento</dt>
              <dd>{colaborador.departamento ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">NIB</dt>
              <dd className="tabular-nums">{colaborador.bancoNib ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 pt-2 border-t">
              <dt className="text-muted-foreground">Estado</dt>
              <dd><StatusBadge status={payroll.status} /></dd>
            </div>
            {payroll.dataPagamento && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Data de pagamento</dt>
                <dd className="tabular-nums">
                  {payroll.dataPagamento.toLocaleDateString('pt-PT')}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Proventos */}
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Proventos
          </h3>
          <ul className="space-y-1">
            {proventos.map((l) => (
              <li key={l.id} className="flex justify-between gap-4">
                <span>
                  {l.descricao}
                  {l.manual && <span className="text-muted-foreground"> (ajuste)</span>}
                </span>
                <span className="tabular-nums">MT {fmt(l.valor)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-4 border-t pt-2 font-medium">
            <span>Total bruto</span>
            <span className="tabular-nums">MT {fmt(payroll.salarioBruto)}</span>
          </div>
        </div>

        {/* Descontos + totais */}
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Descontos
          </h3>
          <ul className="space-y-1">
            {descontos.map((l) => (
              <li key={l.id} className="flex justify-between gap-4">
                <span>
                  {l.descricao}
                  {l.manual && <span className="text-muted-foreground"> (ajuste)</span>}
                </span>
                <span className="tabular-nums text-destructive">− MT {fmt(l.valor)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t pt-2">
            <div className="flex justify-between gap-4 font-semibold">
              <span>Salário líquido</span>
              <span className="tabular-nums">MT {fmt(payroll.salarioLiquido)}</span>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <span>INSS entidade (encargo patronal)</span>
              <span className="tabular-nums">MT {fmt(payroll.encargoInssEntidade)}</span>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <span>Custo total da entidade</span>
              <span className="tabular-nums">MT {fmt(payroll.custoTotalEntidade)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
