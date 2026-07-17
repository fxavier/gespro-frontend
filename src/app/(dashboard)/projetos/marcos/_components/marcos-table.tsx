'use client';

/**
 * Tabela de marcos — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados MarcoRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface MarcoRow {
  id: string;
  nome: string;
  projetoNome: string;
  dataPrevista: string;
  dataReal: string | null;
  status: string;
  progresso: number;
}

const columns: TableColumn<MarcoRow>[] = [
  {
    key: 'nome',
    label: 'Marco',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'projetoNome',
    label: 'Projecto',
    render: (row) => <span className="text-muted-foreground">{row.projetoNome}</span>,
    mobileHidden: true,
  },
  {
    key: 'dataPrevista',
    label: 'Data Prevista',
    render: (row) => <span className="tabular-nums">{row.dataPrevista}</span>,
    mobileHidden: true,
  },
  {
    key: 'dataReal',
    label: 'Data Real',
    render: (row) => (
      <span className="tabular-nums">
        {row.dataReal ?? <span className="text-muted-foreground">—</span>}
      </span>
    ),
    mobileHidden: true,
  },
  {
    key: 'progresso',
    label: 'Progresso',
    render: (row) => (
      <div className="flex items-center gap-2 min-w-[80px]">
        <div className="h-1.5 bg-muted rounded-full flex-1">
          <div
            className="h-1.5 bg-primary rounded-full"
            style={{ width: `${row.progresso}%` }}
          />
        </div>
        <span className="tabular-nums text-xs text-muted-foreground">{row.progresso}%</span>
      </div>
    ),
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface MarcosTableProps {
  data: MarcoRow[];
  nextCursor?: string | null;
}

export function MarcosTable({ data, nextCursor }: MarcosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem marcos"
          description="Defina marcos nos projectos para acompanhar as etapas mais importantes."
        />
      }
    />
  );
}