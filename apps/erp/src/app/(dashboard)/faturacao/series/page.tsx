/**
 * Séries de documento — Server Component (#149, ticket 6).
 *
 * Os 6 tipos geríveis (RECIBO incluído); as séries operacionais (VENDA,
 * ENCOMENDA…) ficam de fora. Filtros na URL: tipo, ano (por omissão o ano
 * corrente em Africa/Maputo; `todos` mostra todos), estado e prefixo.
 * «Nova série» e as acções por linha só com `faturacao:series:escrita`.
 */
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { z } from 'zod';
import { PageHeader, FilterBar } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { TipoSerieDocumentoEnum } from '@/lib/validations/faturacao';
import {
  ROTULO_TIPO_SERIE,
  anosPermitidos,
  documentosEmitidos,
  previsualizarNumero,
  serieUsada,
} from '@/lib/series-documento';
import { acessoSeries, listarSeriesGeriveis, SemPermissao } from './_components/acesso';
import { SeriesTable, type SerieLinha } from './_components/series-table';

const TODOS_OS_ANOS = 'todos';

const FiltroSchema = z.object({
  tipo: TipoSerieDocumentoEnum.optional().catch(undefined),
  ano: z
    .union([z.literal(TODOS_OS_ANOS), z.coerce.number().int().min(2000).max(2100)])
    .optional()
    .catch(undefined),
  estado: z.enum(['ATIVA', 'INACTIVA']).optional().catch(undefined),
  q: z.string().trim().max(20).optional().catch(undefined),
});

const CABECALHO = {
  title: 'Séries de documento',
  description: 'Numeração dos documentos de faturação: uma série activa por tipo e ano',
  breadcrumbs: [{ label: 'Faturação', href: '/faturacao' }, { label: 'Séries' }],
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SeriesPage({ searchParams }: PageProps) {
  const acesso = await acessoSeries();
  if (!acesso.podeLer) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader {...CABECALHO} />
        <SemPermissao mensagem="Não tem permissão para consultar as séries de documento. Contacte o administrador do sistema." />
      </div>
    );
  }

  const bruto = await searchParams;
  const filtros = FiltroSchema.parse(
    Object.fromEntries(Object.entries(bruto).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const [anoCorrente, anoSeguinte] = anosPermitidos(new Date());
  const anoFiltro = filtros.ano === TODOS_OS_ANOS ? null : (filtros.ano ?? anoCorrente);

  const series = await listarSeriesGeriveis(acesso.ctx);

  const activasAnoCorrente = (tipo: string) =>
    series.filter((s) => s.tipo === tipo && s.ano === anoCorrente && s.ativo).length;

  const linhas: SerieLinha[] = series
    .filter((s) => anoFiltro === null || s.ano === anoFiltro)
    .filter((s) => !filtros.tipo || s.tipo === filtros.tipo)
    .filter((s) => !filtros.estado || (filtros.estado === 'ATIVA') === s.ativo)
    .filter((s) => !filtros.q || s.prefixo.includes(filtros.q.toUpperCase()))
    .sort(
      (a, b) =>
        TipoSerieDocumentoEnum.options.indexOf(a.tipo) - TipoSerieDocumentoEnum.options.indexOf(b.tipo) ||
        b.ano - a.ano ||
        Number(b.ativo) - Number(a.ativo) ||
        a.prefixo.localeCompare(b.prefixo),
    )
    .map((s) => ({
      id: s.id,
      rotuloTipo: ROTULO_TIPO_SERIE[s.tipo],
      prefixo: s.prefixo,
      ano: s.ano,
      proximoNumero: previsualizarNumero(s.prefixo, s.ano, s.proximoNumero),
      ativo: s.ativo,
      emitidos: documentosEmitidos(s),
      usada: serieUsada(s),
      unicaActivaAnoCorrente: s.ativo && s.ano === anoCorrente && activasAnoCorrente(s.tipo) === 1,
      outraActiva: series.some((o) => o.id !== s.id && o.tipo === s.tipo && o.ano === s.ano && o.ativo),
    }));

  // Tipos sem série activa no ano filtrado: nesse ano não se emitem.
  const semActiva =
    anoFiltro === null
      ? []
      : TipoSerieDocumentoEnum.options.filter(
          (t) => !series.some((s) => s.tipo === t && s.ano === anoFiltro && s.ativo),
        );

  const anos = [...new Set([anoCorrente, anoSeguinte, ...series.map((s) => s.ano)])].sort((a, b) => b - a);
  const filtrosConfig: FilterConfig[] = [
    {
      key: 'tipo',
      label: 'Tipo',
      placeholder: 'Todos os tipos',
      options: TipoSerieDocumentoEnum.options.map((t) => ({ label: ROTULO_TIPO_SERIE[t], value: t })),
    },
    {
      key: 'ano',
      label: 'Ano',
      placeholder: `Ano corrente (${anoCorrente})`,
      options: [
        ...anos.map((a) => ({ label: String(a), value: String(a) })),
        { label: 'Todos os anos', value: TODOS_OS_ANOS },
      ],
    },
    {
      key: 'estado',
      label: 'Estado',
      placeholder: 'Todos os estados',
      options: [
        { label: 'Activa', value: 'ATIVA' },
        { label: 'Inactiva', value: 'INACTIVA' },
      ],
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        {...CABECALHO}
        actions={
          acesso.podeEscrever ? (
            <Button asChild size="sm">
              <Link href="/faturacao/series/nova">
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Nova série
              </Link>
            </Button>
          ) : undefined
        }
      />

      <FilterBar searchPlaceholder="Pesquisar por prefixo…" searchKey="q" filters={filtrosConfig} />

      {semActiva.length > 0 && (
        <p
          className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
          data-testid="tipos-sem-serie-activa"
        >
          Sem série activa em {anoFiltro}: {semActiva.map((t) => ROTULO_TIPO_SERIE[t]).join(', ')}. Estes documentos
          não podem ser emitidos nesse ano.
        </p>
      )}

      <SeriesTable data={linhas} podeEscrever={acesso.podeEscrever} />
    </div>
  );
}
