/**
 * Editar uma série de documento — Server Component (#149, ticket 7.2).
 *
 * Só enquanto a série não numerou nenhum documento (S3); usada, a página é só
 * de leitura e diz porquê. Alheia, apagada ou de um tipo operacional ⇒ 404.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ROTULO_TIPO_SERIE,
  documentosEmitidos,
  previsualizarNumero,
  serieUsada,
} from '@/lib/series-documento';
import { acessoSeries, listarSeriesGeriveis, SemPermissao } from '../../_components/acesso';
import { SerieForm } from '../../_components/serie-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

const BREADCRUMBS = [
  { label: 'Faturação', href: '/faturacao' },
  { label: 'Séries', href: '/faturacao/series' },
];

export default async function EditarSeriePage({ params }: PageProps) {
  const acesso = await acessoSeries();
  if (!acesso.podeEscrever) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Editar série" breadcrumbs={[...BREADCRUMBS, { label: 'Editar' }]} />
        <SemPermissao mensagem="Não tem permissão para configurar as séries de documento." />
      </div>
    );
  }
  const { id } = await params;
  const serie = (await listarSeriesGeriveis(acesso.ctx)).find((s) => s.id === id);
  if (!serie) notFound();

  const titulo = `Série ${serie.prefixo}/${serie.ano}`;
  const cabecalho = (
    <PageHeader
      title={titulo}
      description={ROTULO_TIPO_SERIE[serie.tipo]}
      breadcrumbs={[...BREADCRUMBS, { label: `${serie.prefixo}/${serie.ano}` }]}
    />
  );

  if (serieUsada(serie)) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <Card data-testid="serie-so-leitura">
          <CardContent className="space-y-4 pt-6 text-sm">
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3">
              Esta série já numerou {documentosEmitidos(serie)} documento(s): o prefixo e o número inicial deixaram de
              poder ser alterados, e a série não pode ser eliminada. Para mudar a numeração, desactive-a e crie uma
              série nova.
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="font-medium">{ROTULO_TIPO_SERIE[serie.tipo]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ano</dt>
                <dd className="font-medium tabular-nums">{serie.ano}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Prefixo</dt>
                <dd className="font-mono">{serie.prefixo}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Número inicial</dt>
                <dd className="tabular-nums">{serie.numeroInicial}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Próximo número</dt>
                <dd className="font-mono tabular-nums">
                  {previsualizarNumero(serie.prefixo, serie.ano, serie.proximoNumero)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd>
                  <StatusBadge status={serie.ativo ? 'ATIVA' : 'INACTIVA'} />
                </dd>
              </div>
            </dl>
            <Button asChild variant="outline" size="sm">
              <Link href="/faturacao/series">Voltar às séries</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {cabecalho}
      <SerieForm
        modo="editar"
        serie={{
          id: serie.id,
          tipo: serie.tipo,
          ano: serie.ano,
          prefixo: serie.prefixo,
          numeroInicial: serie.numeroInicial,
        }}
      />
    </div>
  );
}
