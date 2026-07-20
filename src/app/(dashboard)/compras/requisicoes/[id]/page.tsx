/**
 * Detalhe de Requisição de Compra — Server Component (NUNCA 'use client').
 *
 * Renderiza quando:
 * a) Acesso directo ao URL /compras/requisicoes/[id] (refresh/link directo)
 * b) Slot children quando não há interceptação activa do @panel
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft, CheckCircle, XCircle as XCircleIcon, Clock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PageHeader,
  StatusBadge,
  DetailShell,
  Timeline,
} from '@/components/patterns';
import type { TimelineItem } from '@/components/patterns';
import { RequisicaoAcoes } from '../_components/requisicao-acoes';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequisicaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let requisicao;
  try {
    requisicao = await runWithTenantContext({ tenantId, userId }, () =>
      comprasService.obterRequisicao(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!requisicao) notFound();

  const podeEditar = requisicao.status === 'RASCUNHO' || requisicao.status === 'PENDENTE';

  // Linha de tempo de aprovações → Timeline items
  const timelineItems: TimelineItem[] = (requisicao.aprovacoes ?? []).map((ap) => ({
    id: ap.id,
    title:
      ap.status === 'APROVADO'
        ? `Aprovado por ${ap.aprovadorNome}`
        : ap.status === 'REJEITADO'
          ? `Rejeitado por ${ap.aprovadorNome}`
          : `Aguardando decisão de ${ap.aprovadorNome}`,
    description: ap.observacoes ?? undefined,
    date: ap.data ?? undefined,
    icon:
      ap.status === 'APROVADO' ? (
        <CheckCircle className="h-3.5 w-3.5" />
      ) : ap.status === 'REJEITADO' ? (
        <XCircleIcon className="h-3.5 w-3.5" />
      ) : (
        <Clock className="h-3.5 w-3.5" />
      ),
    variant:
      ap.status === 'APROVADO'
        ? 'success'
        : ap.status === 'REJEITADO'
          ? 'destructive'
          : 'default',
  }));

  // Aba: Itens
  const tabItens = (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Descrição</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Qtd.</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Unidade</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Preço Est.</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Subtotal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requisicao.itens.map((item) => (
            <TableRow key={item.id} className="h-10">
              <TableCell className="font-medium">{item.descricao}</TableCell>
              <TableCell className="text-right tabular-nums">{item.quantidade}</TableCell>
              <TableCell className="text-muted-foreground">{item.unidadeMedida}</TableCell>
              <TableCell className="text-right tabular-nums">
                MT {item.precoEstimado.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                MT {item.subtotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="border-t bg-muted/30 px-4 py-3 flex justify-end">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Valor Total</p>
          <p className="text-lg font-bold tabular-nums">
            MT {requisicao.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </div>
  );

  // Aba: Aprovações
  const tabAprovacoes = (
    <div className="space-y-3">
      {requisicao.aprovacoes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nenhum processo de aprovação iniciado.
        </p>
      ) : (
        requisicao.aprovacoes.map((ap) => (
          <div key={ap.id} className="flex items-start gap-3 rounded-lg border p-4">
            <div className="flex-shrink-0 mt-0.5">
              {ap.status === 'APROVADO' && <CheckCircle className="h-5 w-5 text-success" />}
              {ap.status === 'REJEITADO' && <XCircleIcon className="h-5 w-5 text-destructive" />}
              {ap.status === 'PENDENTE' && <Clock className="h-5 w-5 text-warning" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Nível {ap.nivel}</p>
                  <p className="text-xs text-muted-foreground">{ap.aprovadorNome}</p>
                </div>
                <StatusBadge status={ap.status} />
              </div>
              {ap.data && (
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {new Date(ap.data).toLocaleDateString('pt-MZ', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
              {ap.observacoes && (
                <p className="text-sm text-muted-foreground mt-1.5 italic">{ap.observacoes}</p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  // Aba: Histórico
  const tabHistorico = <Timeline items={timelineItems} />;

  // Metadados laterais — prioridade usa StatusBadge (mapa global, sem mapa local)
  const metadata = [
    { label: 'Número', value: <span className="font-medium tabular-nums">{requisicao.numero}</span> },
    {
      label: 'Data',
      value: new Date(requisicao.data).toLocaleDateString('pt-MZ', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    },
    { label: 'Solicitante', value: requisicao.solicitanteNome },
    { label: 'Departamento', value: requisicao.departamento },
    {
      label: 'Prioridade',
      // StatusBadge.STATUS_MAP inclui URGENTE/ALTA/MEDIA/BAIXA — sem mapa local
      value: <StatusBadge status={requisicao.prioridade} />,
    },
    requisicao.dataEntregaDesejada
      ? {
          label: 'Entrega Desejada',
          value: new Date(requisicao.dataEntregaDesejada).toLocaleDateString('pt-MZ'),
        }
      : null,
    {
      label: 'Valor Total',
      value: (
        <span className="font-semibold tabular-nums">
          MT {requisicao.valorTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      label: 'Aprovação',
      value: (
        <span className="tabular-nums text-sm">
          {requisicao.nivelAprovacaoActual}/{requisicao.totalNiveis} níveis
        </span>
      ),
    },
  ].filter(Boolean) as Array<{ label: string; value: React.ReactNode }>;

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Requisição ${requisicao.numero}`}
            description={
              requisicao.justificativa.slice(0, 100) +
              (requisicao.justificativa.length > 100 ? '…' : '')
            }
            breadcrumbs={[
              { label: 'Compras', href: '/compras/requisicoes' },
              { label: 'Requisições', href: '/compras/requisicoes' },
              { label: requisicao.numero },
            ]}
            badge={<StatusBadge status={requisicao.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/compras/requisicoes">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                {podeEditar && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/compras/requisicoes/${requisicao.id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
                {/* RequisicaoAcoes: componente canónico de mutação de estado */}
                <RequisicaoAcoes id={requisicao.id} status={requisicao.status} />
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'itens',
            label: 'Itens',
            count: requisicao.itens.length,
            content: tabItens,
          },
          {
            key: 'aprovacoes',
            label: 'Aprovações',
            count: requisicao.aprovacoes.length,
            content: tabAprovacoes,
          },
          {
            key: 'historico',
            label: 'Histórico',
            content: tabHistorico,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
