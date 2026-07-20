'use client';

/**
 * Demo do DataTable — CLIENT COMPONENT.
 * Colunas com `render`/`rowHref` (funções) não atravessam a fronteira RSC,
 * por isso a definição vive aqui e a page.tsx (Server Component) só a rende.
 */

import { DataTable, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

const sampleData = [
  { id: '1', numero: 'REQ-001', solicitante: 'Ana Silva', status: 'APROVADA', valor: 15000, prioridade: 'ALTA' },
  { id: '2', numero: 'REQ-002', solicitante: 'João Costa', status: 'PENDENTE', valor: 8500, prioridade: 'MEDIA' },
  { id: '3', numero: 'REQ-003', solicitante: 'Maria Santos', status: 'RASCUNHO', valor: 3200, prioridade: 'BAIXA' },
  { id: '4', numero: 'REQ-004', solicitante: 'Pedro Neto', status: 'REJEITADA', valor: 25000, prioridade: 'URGENTE' },
  { id: '5', numero: 'REQ-005', solicitante: 'Fátima Chaves', status: 'EM_APROVACAO', valor: 12000, prioridade: 'ALTA' },
];

const columns: TableColumn<(typeof sampleData)[0]>[] = [
  {
    key: 'numero',
    label: 'Número',
    sortKey: 'numero',
    render: (row) => <span className="font-medium tabular-nums">{row.numero}</span>,
  },
  {
    key: 'solicitante',
    label: 'Solicitante',
    render: (row) => row.solicitante,
  },
  {
    key: 'status',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: 'prioridade',
    label: 'Prioridade',
    mobileHidden: true,
    render: (row) => <StatusBadge status={row.prioridade} label={row.prioridade} />,
  },
  {
    key: 'valor',
    label: 'Valor (MZN)',
    className: 'text-right tabular-nums',
    headerClassName: 'text-right',
    render: (row) => (
      <span className="font-medium tabular-nums">
        {row.valor.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
      </span>
    ),
  },
];

export function PatternsDataTableDemo() {
  return (
    <DataTable
      data={sampleData}
      columns={columns}
      rowHref={(row) => `/compras/requisicoes/${row.id}`}
      nextCursor="cursor_abc123"
      currentOrderBy="numero"
      currentOrderDir="asc"
    />
  );
}
