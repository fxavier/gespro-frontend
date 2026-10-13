/**
 * Detalhe de Contrato de Serviço — Server Component (NUNCA 'use client').
 * Ligado pela listagem de contratos (#114).
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

const periodicidadeLabels: Record<string, string> = {
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

export default async function ContratoServicoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let contrato;
  try {
    contrato = await runWithTenantContext(ctx, () => servicoService.obterContrato(id, ctx));
  } catch {
    notFound();
  }

  // Nomes dos serviços incluídos (só os do próprio tenant: obterServico recusa os outros).
  const servicos = await runWithTenantContext(ctx, () =>
    Promise.all(
      contrato.servicosIds.map((sid) =>
        servicoService.obterServico(sid, ctx).then(
          (s) => ({ id: s.id, nome: s.nome, codigo: s.codigo }),
          () => null,
        ),
      ),
    ),
  );
  const servicosIncluidos = servicos.filter((s): s is NonNullable<typeof s> => s !== null);

  const tabInfo = (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
      {[
        { label: 'Cliente', value: contrato.clienteNome || '—' },
        { label: 'Periodicidade', value: periodicidadeLabels[contrato.periodicidade] ?? contrato.periodicidade },
        { label: 'Início', value: formatarData(contrato.dataInicio) },
        { label: 'Fim', value: formatarData(contrato.dataFim) },
        { label: 'Renovação automática', value: contrato.renovacaoAutomatica ? 'Sim' : 'Não' },
        {
          label: 'Dias para expirar',
          value: contrato.diasParaExpirar <= 0 ? 'Expirado' : String(contrato.diasParaExpirar),
        },
      ].map(({ label, value }) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );

  const tabServicos =
    servicosIncluidos.length === 0 ? (
      <p className="text-sm text-muted-foreground">Sem serviços associados.</p>
    ) : (
      <ul className="space-y-2 text-sm">
        {servicosIncluidos.map((s) => (
          <li key={s.id}>
            <Link href={`/servicos/lista/${s.id}`} className="text-primary hover:underline">
              {s.codigo} — {s.nome}
            </Link>
          </li>
        ))}
      </ul>
    );

  const metadata = [
    { label: 'Código', value: <span className="font-medium tabular-nums">{contrato.codigo}</span> },
    { label: 'Estado', value: <StatusBadge status={contrato.status} /> },
    {
      label: 'Valor mensal',
      value: <span className="font-semibold tabular-nums">{formatMZN(contrato.valorMensal)}</span>,
    },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Contrato ${contrato.codigo}`}
            description={contrato.clienteNome || undefined}
            breadcrumbs={[
              { label: 'Serviços', href: '/servicos/lista' },
              { label: 'Contratos', href: '/servicos/contratos' },
              { label: contrato.codigo },
            ]}
            badge={<StatusBadge status={contrato.status} />}
            actions={
              <Button variant="outline" size="sm" asChild>
                <Link href="/servicos/contratos">
                  <ArrowLeft className="h-4 w-4 mr-1.5" />
                  Voltar
                </Link>
              </Button>
            }
          />
        }
        tabs={[
          { key: 'informacoes', label: 'Informações', content: tabInfo },
          { key: 'servicos', label: 'Serviços', count: servicosIncluidos.length, content: tabServicos },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
