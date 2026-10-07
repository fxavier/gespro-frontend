'use client';

/**
 * Tabela de ausências — CLIENT COMPONENT.
 *
 * REGRA: definições de colunas com funções `render` VIVEM SEMPRE num módulo
 * Client Component. Funções não serializam para o servidor ("Functions cannot
 * be passed directly to Client Components"). O Server Component pai importa
 * este wrapper; os dados AusenciaRow são objectos planos e serializam bem.
 */

import Link from 'next/link';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/format-date';
import { AprovarAusencia } from './aprovar-ausencia';

export interface AusenciaRow {
  id: string;
  colaboradorNome: string;
  tipo: string;
  dataInicio: Date;
  dataFim: Date;
  diasAusencia: number;
  justificada: boolean;
  status: string;
  /** #94 — já existe folha do mês da ausência: aprovar obriga a recalculá-la. */
  folhaDoMesExiste: boolean;
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
    render: (row) => formatarData(row.dataInicio),
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

const colunaAcoes: TableColumn<AusenciaRow> = {
  key: 'acoes',
  label: 'Acções',
  render: (row) =>
    row.status === 'PENDENTE' ? (
      <div className="flex items-center gap-2">
        <AprovarAusencia
          id={row.id}
          colaboradorNome={row.colaboradorNome}
          folhaDoMesExiste={row.folhaDoMesExiste}
        />
        <Button size="sm" variant="outline" asChild>
          <Link href={`/rh/ausencias/${row.id}/rejeitar`}>Rejeitar</Link>
        </Button>
      </div>
    ) : null,
};

interface AusenciasTableProps {
  data: AusenciaRow[];
  nextCursor?: string | null;
  /** Sessão com `rh:ausencias:aprovar`. */
  podeAprovar?: boolean;
}

export function AusenciasTable({ data, nextCursor, podeAprovar = false }: AusenciasTableProps) {
  return (
    <DataTable
      data={data}
      columns={podeAprovar ? [...columns, colunaAcoes] : columns}
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