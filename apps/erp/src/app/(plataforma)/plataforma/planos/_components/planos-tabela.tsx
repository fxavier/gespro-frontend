'use client';

import Link from 'next/link';
import { DataTable, EmptyState, StatusBadge, type TableColumn } from '@/components/patterns';
import { formatarLimite, formatarUsd, type PlanoSerializado } from './plano-serializado';

const href = (p: PlanoSerializado) => `/plataforma/planos/${p.id}`;

const COLUNAS: TableColumn<PlanoSerializado>[] = [
  {
    key: 'codigo',
    label: 'Código',
    render: (p) => (
      <Link href={href(p)} className="font-mono text-xs font-medium text-primary hover:underline">
        {p.codigo}
      </Link>
    ),
  },
  { key: 'nome', label: 'Nome', render: (p) => p.nome },
  {
    key: 'precoMensal',
    label: 'Mensal',
    className: 'tabular-nums',
    render: (p) => formatarUsd(p.precoMensalUsd),
  },
  {
    key: 'precoAnual',
    label: 'Anual',
    className: 'tabular-nums',
    mobileHidden: true,
    render: (p) => formatarUsd(p.precoAnualUsd),
  },
  {
    key: 'limites',
    label: 'Utilizadores / armazéns',
    mobileHidden: true,
    className: 'tabular-nums',
    render: (p) => `${formatarLimite(p.limiteUtilizadores)} / ${formatarLimite(p.limiteArmazens)}`,
  },
  {
    key: 'assinaturas',
    label: 'Assinaturas',
    className: 'tabular-nums',
    render: (p) => p.assinaturas,
  },
  {
    key: 'estado',
    label: 'Estado',
    render: (p) => <StatusBadge status={p.arquivadoEm ? 'ARQUIVADO' : 'ATIVO'} />,
  },
];

export function PlanosTabela({ planos }: { planos: PlanoSerializado[] }) {
  return (
    <DataTable
      data={planos}
      columns={COLUNAS}
      rowHref={href}
      emptyState={<EmptyState title="Sem planos" description="Crie o primeiro plano do catálogo." />}
    />
  );
}
