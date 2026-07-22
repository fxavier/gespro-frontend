'use client';

/**
 * RiscosTable — Client Component.
 * Tabela de riscos de projecto com colunas clicáveis (rowHref).
 * Funções de render e rowHref vivem neste módulo 'use client'.
 */

import { DataTable, type TableColumn } from '@/components/patterns/data-table';
import { StatusBadge } from '@/components/patterns/status-badge';

type Risco = {
  id: string;
  titulo: string;
  probabilidade: string;
  impacto: string;
  severidade: number;
  estrategiaResposta: string;
  status: string;
  projetoId: string;
  createdAt: Date;
};

function severidadeLabel(s: number): string {
  if (s <= 2) return 'Baixo';
  if (s <= 6) return 'Médio';
  if (s <= 12) return 'Alto';
  return 'Crítico';
}

function severidadeClasse(s: number): string {
  if (s <= 2) return 'text-success';
  if (s <= 6) return 'text-warning';
  if (s <= 12) return 'text-destructive/70';
  return 'text-destructive';
}

const COLUMNS: TableColumn<Risco>[] = [
  {
    key: 'titulo',
    label: 'Título',
    render: (r) => (
      <span className="font-medium text-sm">{r.titulo}</span>
    ),
  },
  {
    key: 'probabilidade',
    label: 'Probabilidade',
    render: (r) => <StatusBadge status={r.probabilidade} />,
    mobileHidden: true,
  },
  {
    key: 'impacto',
    label: 'Impacto',
    render: (r) => <StatusBadge status={r.impacto} />,
    mobileHidden: true,
  },
  {
    key: 'severidade',
    label: 'Severidade',
    render: (r) => (
      <span className={`text-sm font-semibold tabular-nums ${severidadeClasse(r.severidade)}`}>
        {r.severidade} — {severidadeLabel(r.severidade)}
      </span>
    ),
  },
  {
    key: 'estrategiaResposta',
    label: 'Estratégia',
    render: (r) => <StatusBadge status={r.estrategiaResposta} />,
    mobileHidden: true,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'createdAt',
    label: 'Criado em',
    render: (r) => (
      <span className="text-xs text-muted-foreground tabular-nums">
        {new Date(r.createdAt).toLocaleDateString('pt-MZ')}
      </span>
    ),
    mobileHidden: true,
  },
];

interface RiscosTableProps {
  data: Risco[];
  nextCursor: string | null;
}

export function RiscosTable({ data, nextCursor }: RiscosTableProps) {
  return (
    <DataTable
      columns={COLUMNS}
      data={data}
      rowHref={(r) => `/projetos/riscos/${r.id}`}
      nextCursor={nextCursor}
      emptyState={
        <div className="py-12 text-center text-muted-foreground text-sm">
          Nenhum risco registado. Clique em &ldquo;Novo Risco&rdquo; para começar.
        </div>
      }
    />
  );
}
