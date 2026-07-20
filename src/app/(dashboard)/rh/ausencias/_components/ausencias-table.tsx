'use client';

/**
 * Tabela de ausências — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados AusenciaRow são objectos planos e serializam bem.
 */

import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface AusenciaRow {
  id: string;
  colaboradorNome: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  diasAusencia: number;
  justificada: boolean;
  status: string;
}

const TIPO_LABEL: Record<string, string> = {
  FALTA: 'Falta',
  ATESTADO_MEDICO: 'Atestado Médico',
  LICENCA_MATERNIDADE: 'Licença Maternidade',
  LICENCA_PATERNIDADE: 'Licença Paternidade',
  LICENCA_SEM_VENCIMENTO: 'Licença s/ Vencimento',
  LICENCA_NOJO: 'Licença Nojo',
  LICENCA_CASAMENTO: 'Licença Casamento',
  OUTRO: 'Outro',
};

const columns: TableColumn<AusenciaRow>[] = [
  {
    key: 'colaboradorNome',
    label: 'Colaborador',
    render: (row) => <span className="font-medium">{row.colaboradorNome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => TIPO_LABEL[row.tipo] ?? row.tipo,
  },
  {
    key: 'dataInicio',
    label: 'Início',
    render: (row) => new Date(row.dataInicio).toLocaleDateString('pt-PT'),
  },
  {
    key: 'diasAusencia',
    label: 'Dias',
    render: (row) => <span className="tabular-nums">{row.diasAusencia}</span>,
    mobileHidden: true,
  },
  {
    key: 'justificada',
    label: 'Justificada',
    render: (row) => (row.justificada ? 'Sim' : 'Não'),
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
];

interface AusenciasTableProps {
  data: AusenciaRow[];
  nextCursor?: string | null;
}

export function AusenciasTable({ data, nextCursor }: AusenciasTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem ausências registadas"
          description="Registe a primeira ausência para começar a acompanhar o histórico dos colaboradores."
        />
      }
    />
  );
}