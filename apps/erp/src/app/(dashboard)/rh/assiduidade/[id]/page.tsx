/**
 * Detalhe de Registo de Assiduidade — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, User } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AssiduidadeService } from '@/server/services/pessoas-projetos/rh.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';

const TIPO_LABEL: Record<string, string> = {
  NORMAL: 'Normal',
  FERIADO: 'Feriado',
  FIM_SEMANA: 'Fim de Semana',
  FERIAS: 'Férias',
  AUSENCIA: 'Ausência',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AssiduidadeDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let registo;
  try {
    registo = await runWithTenantContext(ctx, () =>
      AssiduidadeService.obter(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!registo) notFound();

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('pt-MZ', { day: '2-digit', month: 'long', year: 'numeric' });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

  const metadata = [
    {
      label: 'Colaborador',
      value: (
        <span className="flex items-center gap-1 font-medium">
          <User className="h-3.5 w-3.5" />
          {registo.colaborador.nome}
        </span>
      ),
    },
    { label: 'Data', value: fmtDate(registo.data) },
    { label: 'Tipo', value: TIPO_LABEL[registo.tipo] ?? registo.tipo },
    {
      label: 'Entrada',
      value: (
        <span className="flex items-center gap-1 tabular-nums">
          <Clock className="h-3.5 w-3.5" />
          {fmtTime(registo.entrada)}
        </span>
      ),
    },
    {
      label: 'Saída',
      value: <span className="tabular-nums">{fmtTime(registo.saida)}</span>,
    },
    ...(registo.saidaAlmoco
      ? [{ label: 'Saída Almoço', value: <span className="tabular-nums">{fmtTime(registo.saidaAlmoco)}</span> }]
      : []),
    ...(registo.retornoAlmoco
      ? [{ label: 'Retorno Almoço', value: <span className="tabular-nums">{fmtTime(registo.retornoAlmoco)}</span> }]
      : []),
    {
      label: 'Horas Trabalhadas',
      value: <span className="font-semibold tabular-nums">{Number(registo.horasTrabalhadas).toFixed(1)}h</span>,
    },
    {
      label: 'Horas Extra',
      value: (
        <span className={`tabular-nums font-medium ${Number(registo.horasExtras) > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
          {Number(registo.horasExtras) > 0 ? `+${Number(registo.horasExtras).toFixed(1)}h` : '—'}
        </span>
      ),
    },
    ...(registo.atrasos > 0
      ? [{ label: 'Atrasos', value: <span className="tabular-nums text-destructive">{registo.atrasos} min</span> }]
      : []),
    ...(registo.observacoes
      ? [{ label: 'Observações', value: registo.observacoes }]
      : []),
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Assiduidade — ${registo.colaborador.nome}`}
            description={fmtDate(registo.data)}
            breadcrumbs={[
              { label: 'RH', href: '/rh' },
              { label: 'Assiduidade', href: '/rh/assiduidade' },
              { label: registo.colaborador.codigo },
            ]}
            badge={<StatusBadge status={registo.tipo} label={TIPO_LABEL[registo.tipo]} />}
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href="/rh/assiduidade">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Voltar
                </Link>
              </Button>
            }
          />
        }
        tabs={[
          {
            key: 'resumo',
            label: 'Resumo',
            content: (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Entrada</p>
                    <p className="font-medium tabular-nums">{fmtTime(registo.entrada)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Saída</p>
                    <p className="font-medium tabular-nums">{fmtTime(registo.saida)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Total de Horas</p>
                    <p className="font-bold tabular-nums">{Number(registo.horasTrabalhadas).toFixed(1)}h</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Horas Extra</p>
                    <p className={`font-medium tabular-nums ${Number(registo.horasExtras) > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                      {Number(registo.horasExtras) > 0 ? `+${Number(registo.horasExtras).toFixed(1)}h` : '—'}
                    </p>
                  </div>
                </div>
                {registo.observacoes && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground mb-1">Observações</p>
                    <p className="text-sm">{registo.observacoes}</p>
                  </div>
                )}
              </div>
            ),
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
