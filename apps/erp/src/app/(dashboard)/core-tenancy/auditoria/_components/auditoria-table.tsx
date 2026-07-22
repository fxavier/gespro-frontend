'use client';

/**
 * Tabela de auditoria — CLIENT COMPONENT.
 * Colunas com funções render num módulo 'use client'.
 */

import { DataTable, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import type { AuditLogRow } from '@/server/services/plataforma/audit.interface';

// Serializable version for passing from Server to Client
interface AuditLogRowSerialized {
  id: string;
  tenantId: string;
  userId: string | null;
  userNome: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string; // ISO string
}

const columns: TableColumn<AuditLogRowSerialized>[] = [
  {
    key: 'createdAt',
    label: 'Data/Hora',
    render: (row) => (
      <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {new Date(row.createdAt).toLocaleString('pt-MZ', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    ),
  },
  {
    key: 'action',
    label: 'Acção',
    render: (row) => (
      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
        {row.action}
      </code>
    ),
  },
  {
    key: 'entity',
    label: 'Entidade',
    render: (row) => (
      <div>
        <span className="text-sm font-medium">{row.entity}</span>
        {row.entityId && (
          <span className="ml-1.5 text-xs text-muted-foreground tabular-nums font-mono">
            #{row.entityId.slice(0, 8)}
          </span>
        )}
      </div>
    ),
  },
  {
    key: 'user',
    label: 'Utilizador',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm text-muted-foreground">
        {row.userNome ?? 'Sistema'}
      </span>
    ),
  },
  {
    key: 'data',
    label: 'Dados',
    mobileHidden: true,
    render: (row) => (
      <span className="text-xs text-muted-foreground max-w-[200px] truncate block">
        {row.data ? JSON.stringify(row.data).slice(0, 60) + '…' : '—'}
      </span>
    ),
  },
];

interface AuditoriaTableProps {
  data: AuditLogRow[];
  nextCursor?: string | null;
}

export function AuditoriaTable({ data, nextCursor }: AuditoriaTableProps) {
  // Converter Date para string ISO para evitar erros de serialização
  const tableData: AuditLogRowSerialized[] = data.map((log) => ({
    ...log,
    createdAt: new Date(log.createdAt).toISOString(),
  }));

  return (
    <DataTable
      data={tableData}
      columns={columns}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem registos de auditoria"
          description="Ainda não existem registos de auditoria para os filtros seleccionados."
        />
      }
    />
  );
}
