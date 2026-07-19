'use client';

/**
 * Tabela de benefícios — CLIENT COMPONENT.
 * Colunas com funções render vivem sempre num módulo Client Component.
 */

import Link from 'next/link';
import { Eye, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, StatusBadge, EmptyState } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';

export interface BeneficioRow {
  id: string;
  nome: string;
  tipo: string;
  fornecedor: string | null;
  custoTotal: string;
  comparticipacaoEmpresa: string;
  periodicidade: string;
  tributavel: boolean;
  ativo: boolean;
  atribuicoesActivas: number;
}

const TIPO_LABELS: Record<string, string> = {
  SEGURO_SAUDE: 'Seguro de Saúde',
  SEGURO_VIDA: 'Seguro de Vida',
  SUBSIDIO_ALIMENTACAO: 'Subsídio Alimentação',
  SUBSIDIO_TRANSPORTE: 'Subsídio Transporte',
  SUBSIDIO_HABITACAO: 'Subsídio Habitação',
  SUBSIDIO_COMUNICACOES: 'Subsídio Comunicações',
  PLANO_PENSOES: 'Plano de Pensões',
  OUTRO: 'Outro',
};

const PERIODICIDADE_LABELS: Record<string, string> = {
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
  PONTUAL: 'Pontual',
};

const columns: TableColumn<BeneficioRow>[] = [
  {
    key: 'nome',
    label: 'Nome',
    render: (row) => <span className="font-medium">{row.nome}</span>,
  },
  {
    key: 'tipo',
    label: 'Tipo',
    render: (row) => (
      <span className="text-muted-foreground text-sm">
        {TIPO_LABELS[row.tipo] ?? row.tipo}
      </span>
    ),
  },
  {
    key: 'periodicidade',
    label: 'Periodicidade',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm">{PERIODICIDADE_LABELS[row.periodicidade] ?? row.periodicidade}</span>
    ),
  },
  {
    key: 'comparticipacaoEmpresa',
    label: 'Empresa (MZN)',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm">
        {Number(row.comparticipacaoEmpresa).toLocaleString('pt-PT', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    ),
  },
  {
    key: 'atribuicoesActivas',
    label: 'Atribuídos',
    mobileHidden: true,
    render: (row) => (
      <span className="tabular-nums text-sm">{row.atribuicoesActivas}</span>
    ),
  },
  {
    key: 'tributavel',
    label: 'Tributável',
    mobileHidden: true,
    render: (row) => (
      <span className="text-sm">{row.tributavel ? 'Sim' : 'Não'}</span>
    ),
  },
  {
    key: 'ativo',
    label: 'Estado',
    render: (row) => <StatusBadge status={row.ativo ? 'ACTIVO' : 'INACTIVO'} />,
  },
  {
    key: 'acoes',
    label: '',
    className: 'w-10',
    render: (row) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={`Acções para ${row.nome}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/rh/beneficios/${row.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalhe
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

interface BeneficiosTableProps {
  data: BeneficioRow[];
  nextCursor?: string | null;
}

export function BeneficiosTable({ data, nextCursor }: BeneficiosTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      rowHref={(row) => `/rh/beneficios/${row.id}`}
      nextCursor={nextCursor}
      emptyState={
        <EmptyState
          title="Sem benefícios"
          description="Crie o primeiro benefício para começar a gerir as regalias dos colaboradores."
        />
      }
    />
  );
}
