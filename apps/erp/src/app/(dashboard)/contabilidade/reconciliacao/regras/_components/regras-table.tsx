'use client';

/**
 * Tabela das regras de sugestão de lançamento (issue #140). As colunas têm
 * `render`, por isso vivem neste módulo cliente; os dados chegam já resolvidos
 * do Server Component (conta bancária e contrapartida por extenso).
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { AccaoRegra } from './accao-regra';
import { ROTA_REGRAS } from './rotulos';

export interface RegraLinha {
  id: string;
  prioridade: number;
  padrao: string;
  descricao: string | null;
  /** «Saída» / «Entrada». */
  movimento: string;
  /** `null` = todas as contas bancárias. */
  contaBancaria: string | null;
  contrapartida: string;
  ativo: boolean;
}

const rotulo = (r: RegraLinha) => r.descricao ?? r.padrao;

function Accoes({ regra }: { regra: RegraLinha }) {
  return (
    <div className="flex justify-end gap-1">
      <Button asChild variant="ghost" size="sm">
        <Link href={`${ROTA_REGRAS}/${regra.id}/editar`} prefetch={false} aria-label={`Editar a regra ${rotulo(regra)}`}>
          Editar
        </Link>
      </Button>
      <AccaoRegra tipo={regra.ativo ? 'desactivar' : 'activar'} id={regra.id} rotulo={rotulo(regra)} />
    </div>
  );
}

export function RegrasTable({ data, podeEscrever }: { data: RegraLinha[]; podeEscrever: boolean }) {
  const columns: TableColumn<RegraLinha>[] = [
    {
      key: 'prioridade',
      label: 'Prioridade',
      className: 'tabular-nums',
      render: (r) => r.prioridade,
    },
    {
      key: 'padrao',
      label: 'Padrão',
      render: (r) => (
        <div className="min-w-0">
          <span className="font-mono text-sm break-words">{r.padrao.split('|').join(' | ')}</span>
          {r.descricao && <p className="text-xs text-muted-foreground">{r.descricao}</p>}
        </div>
      ),
    },
    { key: 'movimento', label: 'Movimento', render: (r) => r.movimento },
    {
      key: 'contaBancaria',
      label: 'Conta bancária',
      mobileHidden: true,
      render: (r) => r.contaBancaria ?? <span className="text-muted-foreground">Todas</span>,
    },
    { key: 'contrapartida', label: 'Contrapartida', render: (r) => r.contrapartida },
    { key: 'estado', label: 'Estado', render: (r) => <StatusBadge status={r.ativo ? 'ATIVA' : 'INACTIVA'} /> },
    ...(podeEscrever
      ? [
          {
            key: 'accoes',
            label: 'Acções',
            headerClassName: 'text-right',
            className: 'text-right',
            render: (r: RegraLinha) => <Accoes regra={r} />,
          },
        ]
      : []),
  ];

  return (
    <DataTable
      data={data}
      columns={columns}
      emptyState={
        <EmptyState
          title="Sem regras"
          description="Ainda não há regras de sugestão. Sem regras, a reconciliação não propõe lançamentos para os movimentos sem correspondência."
        />
      }
    />
  );
}
