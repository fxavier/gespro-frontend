'use client';

/**
 * Tabela de solicitações de férias — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados SolicitacaoRow são objectos planos e serializam bem.
 */

import Link from 'next/link';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/format-date';
import { AprovarFerias } from './aprovar-ferias';
import { CancelarFerias } from './cancelar-ferias';

export interface SolicitacaoRow {
  id: string;
  colaboradorNome: string;
  dataInicio: Date;
  dataFim: Date;
  diasSolicitados: number;
  tipo: string;
  status: string;
  /** #156 — PENDENTE e submetido pelo utilizador da sessão. */
  podeCancelar: boolean;
}

const columns: TableColumn<SolicitacaoRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'dataInicio',
    label: 'Início',
    render: (row) => formatarData(row.dataInicio),
  },
  {
    key: 'dataFim',
    label: 'Fim',
    render: (row) => formatarData(row.dataFim),
    mobileHidden: true,
  },
  {
    key: 'diasSolicitados',
    label: 'Dias',
    render: (row) => <span className="tabular-nums">{row.diasSolicitados}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => <span className="capitalize">{row.tipo.toLowerCase().replace(/_/g, ' ')}</span>,
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

function colunaAcoes(podeAprovar: boolean): TableColumn<SolicitacaoRow> {
  return {
    key: 'acoes',
    label: 'Acções',
    render: (row) =>
      row.status === 'PENDENTE' && (podeAprovar || row.podeCancelar) ? (
        <div className="flex items-center gap-2">
          {podeAprovar && (
            <>
              <AprovarFerias
                solicitacaoId={row.id}
                colaboradorNome={row.colaboradorNome}
                diasSolicitados={row.diasSolicitados}
              />
              <Button size="sm" variant="outline" asChild>
                <Link href={`/rh/ferias/${row.id}/rejeitar`}>Rejeitar</Link>
              </Button>
            </>
          )}
          {row.podeCancelar && <CancelarFerias solicitacaoId={row.id} />}
        </div>
      ) : null,
  };
}

interface FeriasTableProps {
  data: SolicitacaoRow[];
  nextCursor?: string | null;
  /** Sessão com `rh:ferias:aprovar`. */
  podeAprovar?: boolean;
}

export function FeriasTable({ data, nextCursor, podeAprovar = false }: FeriasTableProps) {
  const temAcoes = podeAprovar || data.some((r) => r.podeCancelar);
  return (
    <DataTable
      data={data}
      columns={temAcoes ? [...columns, colunaAcoes(podeAprovar)] : columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem solicitações de férias"
          description="Crie a primeira solicitação para começar a gerir as férias dos colaboradores."
        />
      }
    />
  );
}