/**
 * Detalhe de Agendamento de Serviço — Server Component (NUNCA 'use client').
 * Ligado pela listagem de agendamentos (#114).
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AgendamentoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let agendamento;
  try {
    agendamento = await runWithTenantContext(ctx, () => servicoService.obterAgendamento(id, ctx));
  } catch {
    notFound();
  }

  const local = [agendamento.local, agendamento.endereco, agendamento.cidade, agendamento.provincia]
    .filter(Boolean)
    .join(', ');

  const tabInfo = (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
      {[
        { label: 'Serviço', value: agendamento.servicoNome },
        { label: 'Cliente', value: agendamento.clienteNome },
        { label: 'E-mail do cliente', value: agendamento.clienteEmail || '—' },
        { label: 'Telefone do cliente', value: agendamento.clienteTelefone || '—' },
        { label: 'Técnico', value: agendamento.tecnicoNome ?? '—' },
        { label: 'Data', value: formatarData(agendamento.dataAgendamento) },
        { label: 'Horário', value: `${agendamento.horaInicio} – ${agendamento.horaFim}` },
        { label: 'Duração estimada', value: `${agendamento.duracaoEstimada} min` },
        { label: 'Local', value: local || '—' },
        { label: 'Observações', value: agendamento.observacoes ?? '—' },
        { label: 'Notas de conclusão', value: agendamento.notasConclusao ?? '—' },
      ].map(({ label, value }) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );

  const metadata = [
    { label: 'Código', value: <span className="font-medium tabular-nums">{agendamento.codigo}</span> },
    { label: 'Estado', value: <StatusBadge status={agendamento.status} /> },
    { label: 'Preço do serviço', value: <span className="tabular-nums">{formatMZN(agendamento.precoServico)}</span> },
    {
      label: 'Desconto',
      value: (
        <span className="tabular-nums">
          {agendamento.desconto != null ? formatMZN(agendamento.desconto) : '—'}
        </span>
      ),
    },
    { label: 'Taxa IVA', value: `${Math.round(agendamento.taxaIva * 100)}%` },
    {
      label: 'Total',
      value: <span className="font-semibold tabular-nums">{formatMZN(agendamento.total)}</span>,
    },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Agendamento ${agendamento.codigo}`}
            description={`${agendamento.servicoNome} · ${agendamento.clienteNome}`}
            breadcrumbs={[
              { label: 'Serviços', href: '/servicos/lista' },
              { label: 'Agendamentos', href: '/servicos/agendamentos' },
              { label: agendamento.codigo },
            ]}
            badge={<StatusBadge status={agendamento.status} />}
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href="/servicos/agendamentos">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Voltar
                </Link>
              </Button>
            }
          />
        }
        tabs={[{ key: 'informacoes', label: 'Informações', content: tabInfo }]}
        metadata={metadata}
      />
    </div>
  );
}
