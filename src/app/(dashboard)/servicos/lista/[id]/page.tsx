/**
 * Detalhe de Serviço — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { ServicoAcoes } from '../../_components/servico-acoes';

interface Props {
  params: Promise<{ id: string }>;
}

const diasLabels: Record<string, string> = {
  segunda: 'Segunda-feira',
  terca: 'Terça-feira',
  quarta: 'Quarta-feira',
  quinta: 'Quinta-feira',
  sexta: 'Sexta-feira',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

const tipoServicoLabels: Record<string, string> = {
  INSTALACAO: 'Instalação',
  MANUTENCAO: 'Manutenção',
  REPARACAO: 'Reparação',
  CONSULTORIA: 'Consultoria',
  LIMPEZA: 'Limpeza',
  TRANSPORTE: 'Transporte',
  OUTRO: 'Outro',
};

export default async function ServicoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let servico;
  try {
    servico = await runWithTenantContext({ tenantId, userId }, () =>
      servicoService.obterServico(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!servico) notFound();

  // Aba: Informações
  const tabInfo = (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
      {[
        { label: 'Descrição', value: servico.descricao ?? '—' },
        { label: 'Tipo', value: tipoServicoLabels[servico.tipoServico] ?? servico.tipoServico },
        { label: 'Duração estimada', value: `${servico.duracaoEstimada} min` },
        { label: 'Unidade de medida', value: servico.unidadeMedida },
        { label: 'Taxa IVA', value: `${servico.taxaIva}%` },
        { label: 'Preço c/ IVA', value: `MT ${servico.precoComIva.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}` },
        { label: 'Requer técnico', value: servico.requerTecnico ? 'Sim' : 'Não' },
        { label: 'Nível técnico', value: servico.nivelTecnicoRequerido ?? '—' },
        { label: 'Inclui material', value: servico.incluiMaterial ? 'Sim' : 'Não' },
        { label: 'Material incluído', value: servico.materialIncluido ?? '—' },
        { label: 'Requer agendamento', value: servico.requerAgendamento ? 'Sim' : 'Não' },
        {
          label: 'Dias disponíveis',
          value: servico.diasDisponibilidade.map((d) => diasLabels[d] ?? d).join(', ') || '—',
        },
        {
          label: 'Horário',
          value:
            servico.horaInicio && servico.horaFim
              ? `${servico.horaInicio} – ${servico.horaFim}`
              : '—',
        },
        { label: 'Observações', value: servico.observacoes ?? '—' },
      ].map(({ label, value }) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );

  // Aba: Avaliações (placeholder — listarAvaliacoes quando a aba for solicitada)
  const tabAvaliacoes = (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">Avaliação média:</span>
        <span className="font-semibold">
          {servico.avaliacaoMedia != null ? servico.avaliacaoMedia.toFixed(1) : '—'}
        </span>
        <span className="text-muted-foreground">({servico.numeroAvaliacoes} avaliações)</span>
      </div>
    </div>
  );

  const metadata = [
    { label: 'Código', value: <span className="font-medium tabular-nums">{servico.codigo}</span> },
    {
      label: 'Estado',
      value: <StatusBadge status={servico.ativo ? 'ATIVO' : 'INATIVO'} />,
    },
    {
      label: 'Disponível',
      value: <StatusBadge status={servico.disponivel ? 'DISPONIVEL' : 'INDISPONIVEL'} />,
    },
    { label: 'Categoria', value: servico.categoriaNome ?? '—' },
    {
      label: 'Preço base',
      value: (
        <span className="font-semibold tabular-nums">
          MT {servico.preco.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    { label: 'Total de vendas', value: String(servico.totalVendas) },
    {
      label: 'Última venda',
      value: servico.ultimaVenda
        ? new Date(servico.ultimaVenda).toLocaleDateString('pt-MZ')
        : '—',
    },
    {
      label: 'Faturamento total',
      value: (
        <span className="tabular-nums">
          MT {servico.faturamentoTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={servico.nome}
            description={servico.descricao?.slice(0, 100) ?? `Serviço ${servico.codigo}`}
            breadcrumbs={[
              { label: 'Serviços', href: '/servicos/lista' },
              { label: servico.nome },
            ]}
            badge={<StatusBadge status={servico.ativo ? 'ATIVO' : 'INATIVO'} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/servicos/lista">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/servicos/lista/${servico.id}/editar`}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
                <ServicoAcoes id={servico.id} ativo={servico.ativo} />
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'informacoes',
            label: 'Informações',
            content: tabInfo,
          },
          {
            key: 'avaliacoes',
            label: 'Avaliações',
            count: servico.numeroAvaliacoes,
            content: tabAvaliacoes,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
