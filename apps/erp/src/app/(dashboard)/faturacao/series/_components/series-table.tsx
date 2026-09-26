'use client';

/**
 * Tabela das séries de documento (#149, ticket 6). As colunas têm `render`,
 * por isso vivem neste módulo cliente; os dados chegam já calculados do
 * Server Component (pré-visualização, emitidos, «usada»), sem relógio aqui.
 */
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, StatusBadge } from '@/components/patterns';
import type { TableColumn } from '@/components/patterns';
import { AccaoSerie } from './accao-serie';

export interface SerieLinha {
  id: string;
  rotuloTipo: string;
  prefixo: string;
  ano: number;
  proximoNumero: string;
  ativo: boolean;
  emitidos: number;
  usada: boolean;
  /** Única activa do tipo no ano corrente: desactivá-la trava a emissão. */
  unicaActivaAnoCorrente: boolean;
  /** S1: outra série do mesmo tipo e ano está activa — «Activar» seria recusado. */
  outraActiva: boolean;
}

const rotulo = (s: SerieLinha) => `${s.prefixo}/${s.ano} (${s.rotuloTipo})`;

function Accoes({ serie }: { serie: SerieLinha }) {
  return (
    <div className="flex justify-end gap-1" data-testid={`accoes-serie-${serie.prefixo}-${serie.ano}`}>
      {!serie.usada && (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/faturacao/series/${serie.id}/editar`} prefetch={false}>
            Editar
          </Link>
        </Button>
      )}
      {serie.ativo ? (
        <AccaoSerie
          tipo="desactivar"
          id={serie.id}
          rotulo={rotulo(serie)}
          descricao="Os documentos já numerados não mudam. A série pode voltar a ser activada enquanto não houver outra activa do mesmo tipo e ano."
          aviso={
            serie.unicaActivaAnoCorrente
              ? `Deixa de ser possível emitir ${serie.rotuloTipo} em ${serie.ano} até activar outra série.`
              : undefined
          }
        />
      ) : serie.outraActiva ? (
        <span className="self-center px-2 text-xs text-muted-foreground">Outra série activa em {serie.ano}</span>
      ) : (
        <AccaoSerie
          tipo="activar"
          id={serie.id}
          rotulo={rotulo(serie)}
          descricao={`A série passa a numerar os documentos de ${serie.rotuloTipo} de ${serie.ano}. Só pode haver uma série activa por tipo e ano.`}
        />
      )}
      {!serie.usada && (
        <AccaoSerie
          tipo="eliminar"
          id={serie.id}
          rotulo={rotulo(serie)}
          descricao="A série ainda não numerou nenhum documento e é apagada definitivamente."
        />
      )}
    </div>
  );
}

export function SeriesTable({ data, podeEscrever }: { data: SerieLinha[]; podeEscrever: boolean }) {
  const columns: TableColumn<SerieLinha>[] = [
    { key: 'tipo', label: 'Tipo', render: (s) => <span className="font-medium">{s.rotuloTipo}</span> },
    { key: 'prefixo', label: 'Prefixo', render: (s) => <span className="font-mono">{s.prefixo}</span> },
    { key: 'ano', label: 'Ano', className: 'tabular-nums', render: (s) => s.ano },
    {
      key: 'proximo',
      label: 'Próximo número',
      render: (s) => <span className="font-mono tabular-nums">{s.proximoNumero}</span>,
    },
    { key: 'estado', label: 'Estado', render: (s) => <StatusBadge status={s.ativo ? 'ATIVA' : 'INACTIVA'} /> },
    {
      key: 'emitidos',
      label: 'Emitidos',
      mobileHidden: true,
      className: 'text-right tabular-nums',
      headerClassName: 'text-right',
      render: (s) => s.emitidos,
    },
    ...(podeEscrever
      ? [
          {
            key: 'accoes',
            label: 'Acções',
            headerClassName: 'text-right',
            className: 'text-right',
            render: (s: SerieLinha) => <Accoes serie={s} />,
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
          title="Sem séries"
          description="Nenhuma série de documento corresponde aos filtros actuais."
        />
      }
    />
  );
}
