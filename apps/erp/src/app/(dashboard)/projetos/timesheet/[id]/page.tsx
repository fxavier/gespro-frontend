/**
 * Detalhe de Registo de Tempo (#167) — Server Component (NUNCA 'use client').
 * Por aprovar: aprovar ou rejeitar (com motivo). Aprovado ou rejeitado: só leitura.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { formatarData, formatarDataHora } from '@/lib/format-date';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { Button } from '@/components/ui/button';
import { DetailShell, PageHeader, StatusBadge } from '@/components/patterns';
import { DecisaoTimesheet } from './_components/decisao-timesheet';

export default async function TimesheetDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;

  const ts = await runWithTenantContext({ tenantId, userId }, () =>
    prisma.timesheet.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        data: true,
        horaInicio: true,
        horaFim: true,
        duracaoHoras: true,
        descricao: true,
        tipo: true,
        faturavel: true,
        aprovado: true,
        dataAprovacao: true,
        motivoRejeicao: true,
        projeto: { select: { id: true, codigo: true, nome: true } },
        tarefa: { select: { id: true, codigo: true, titulo: true } },
        colaborador: { select: { nome: true } },
      },
    }),
  );
  if (!ts) notFound();

  const rejeitado = ts.motivoRejeicao !== null;
  const estado = ts.aprovado ? 'APROVADO' : rejeitado ? 'REJEITADO' : 'PENDENTE';
  const podeDecidir = !ts.aprovado && !rejeitado && permissions.includes('projetos:timesheets:aprovar');

  const metadata = [
    { label: 'Colaborador', value: ts.colaborador.nome },
    {
      label: 'Projecto',
      value: (
        <Link href={`/projetos/lista/${ts.projeto.id}`} className="hover:underline">
          {ts.projeto.codigo} — {ts.projeto.nome}
        </Link>
      ),
    },
    ...(ts.tarefa
      ? [{
          label: 'Tarefa',
          value: (
            <Link href={`/projetos/tarefas/${ts.tarefa.id}`} className="hover:underline">
              {ts.tarefa.codigo} — {ts.tarefa.titulo}
            </Link>
          ),
        }]
      : []),
    { label: 'Data', value: <span className="tabular-nums">{formatarData(ts.data)}</span> },
    {
      label: 'Horário',
      value: (
        <span className="tabular-nums">
          {formatarDataHora(ts.horaInicio)} – {formatarDataHora(ts.horaFim)}
        </span>
      ),
    },
    { label: 'Duração', value: <span className="tabular-nums">{Number(ts.duracaoHoras).toFixed(2)}h</span> },
    { label: 'Tipo', value: <span className="capitalize">{ts.tipo.toLowerCase().replace(/_/g, ' ')}</span> },
    { label: 'Facturável', value: ts.faturavel ? 'Sim' : 'Não' },
    { label: 'Estado', value: <StatusBadge status={estado} /> },
    ...(ts.dataAprovacao
      ? [{ label: 'Aprovado em', value: <span className="tabular-nums">{formatarDataHora(ts.dataAprovacao)}</span> }]
      : []),
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title="Registo de Tempo"
            description={`${ts.colaborador.nome} · ${formatarData(ts.data)}`}
            breadcrumbs={[
              { label: 'Projectos', href: '/projetos/lista' },
              { label: 'Timesheet', href: '/projetos/timesheet' },
              { label: formatarData(ts.data) },
            ]}
            badge={<StatusBadge status={estado} />}
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href="/projetos/timesheet">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Voltar
                </Link>
              </Button>
            }
          />
        }
        tabs={[
          {
            key: 'registo',
            label: 'Registo',
            content: (
              <div className="space-y-4">
                <p className="text-sm whitespace-pre-wrap">
                  {ts.descricao || <span className="text-muted-foreground">Sem descrição.</span>}
                </p>
                {rejeitado && (
                  <div className="rounded-lg border border-destructive/40 p-3 text-sm space-y-1">
                    <p className="font-medium">Registo rejeitado</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{ts.motivoRejeicao}</p>
                  </div>
                )}
                {podeDecidir && <DecisaoTimesheet id={ts.id} />}
              </div>
            ),
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
