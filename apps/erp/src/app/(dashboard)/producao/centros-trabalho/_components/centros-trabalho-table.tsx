'use client';

/**
 * Tabela de centros de trabalho — CLIENT COMPONENT (colunas com `render`/`rowHref`). #165.
 * Cada linha abre a edição (é lá que se desactiva: não há apagar).
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { TIPOS_CENTRO } from './centro-trabalho-form';

export interface CentroTrabalhoRow {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  capacidadeHorasDia: string | null;
  custoHora: string;
  ativo: boolean;
}

const columns: TableColumn<CentroTrabalhoRow>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (row) => <span className="font-medium tabular-nums text-primary">{row.codigo}</span>,
  },
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => TIPOS_CENTRO.find((t) => t.value === row.tipo)?.label ?? row.tipo,
    mobileHidden: true,
  },
  {
    key: 'custoHora',
    label: 'Custo/hora',
    render: (row) => <span className="tabular-nums">{formatMZN(row.custoHora)}</span>,
    mobileHidden: true,
  },
  {
    key: 'capacidadeHorasDia',
    label: 'Capacidade (h/dia)',
    render: (row) => <span className="tabular-nums">{row.capacidadeHorasDia ?? '—'}</span>,
    mobileHidden: true,
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.ativo ? 'ATIVO' : 'INATIVO'} />,
  },
];

export function CentrosTrabalhoTable({
  data,
  nextCursor,
}: {
  data: CentroTrabalhoRow[];
  nextCursor?: string | null;
}) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/producao/centros-trabalho/${row.id}/editar`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem centros de trabalho"
          description="Registe o primeiro centro de trabalho para o usar nos roteiros."
        />
      }
    />
  );
}
