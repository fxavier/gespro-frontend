/**
 * Nova Troca — Server Component (#130).
 *
 * Uma troca nasce de uma devolução APROVADA com factura (`?devolucao=<id>`, a ligação «Criar
 * Troca» do detalhe). Sem devolução escolhida, a página lista as que podem dar troca. O
 * formulário (produto de substituição, localização de entrada do stock devolvido e, se houver
 * diferença a pagar, o meio) vive em `NovaTrocaForm`.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { devolucaoService } from '@/server/services/comercial/index';
import { stockService } from '@/server/services/inventario/stock.service';
import { listarProdutos } from '@/server/services/inventario/catalogo.service';
import { obterSessaoAtual } from '@/server/services/financas/caixa.service';
import { listarSeries } from '@/server/services/financas/faturacao.service';
import { PageHeader } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { NovaTrocaForm } from '../_components/nova-troca-form';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const BREADCRUMBS = [
  { label: 'Vendas', href: '/vendas' },
  { label: 'Trocas', href: '/vendas/trocas' },
  { label: 'Nova Troca' },
];

export default async function NovaTrocaPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };
  const sp = await searchParams;
  const devolucaoId = typeof sp.devolucao === 'string' ? sp.devolucao : undefined;

  const devolucao = devolucaoId
    ? await runWithTenantContext(ctx, () => devolucaoService.obter(devolucaoId, ctx)).catch(
        () => null,
      )
    : null;
  const elegivel = devolucao?.status === 'APROVADA' && !!devolucao.faturaId;

  if (!devolucao || !elegivel) {
    // Sem devolução (ou com uma que não dá troca): escolher entre as aprovadas com factura.
    const aprovadas = await runWithTenantContext(ctx, () =>
      devolucaoService.listar(
        { status: 'APROVADA', take: 50, orderBy: 'createdAt', order: 'desc' },
        ctx,
      ),
    );
    const candidatas = aprovadas.items.filter((d) => d.faturaId);

    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Nova Troca"
          description="Uma troca parte de uma devolução aprovada e ligada a uma factura"
          breadcrumbs={BREADCRUMBS}
        />
        {devolucao && (
          <p role="alert" className="text-sm text-destructive">
            A devolução {devolucao.numero} não pode dar origem a uma troca:{' '}
            {devolucao.status !== 'APROVADA'
              ? 'só uma devolução aprovada se troca.'
              : 'não está ligada a uma factura (sem nota de crédito não há crédito a abater).'}
          </p>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Devoluções aprovadas com factura</CardTitle>
          </CardHeader>
          <CardContent>
            {candidatas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Não há devoluções aprovadas com factura. Aprove uma em{' '}
                <Link href="/vendas/devolucoes" className="underline underline-offset-4">
                  Vendas &rsaquo; Devoluções
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {candidatas.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-4 py-2">
                    <span>
                      <span className="font-medium">{d.numero}</span>{' '}
                      <span className="text-muted-foreground">
                        · {formatarData(d.createdAt)} · {formatMZN(d.valorTotal)}
                      </span>
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/vendas/trocas/nova?devolucao=${d.id}`}>Escolher</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const [localizacoes, produtos, series, sessaoCaixa] = await runWithTenantContext(ctx, () =>
    Promise.all([
      stockService.listarLocalizacoes({ take: 100, ativa: true }, ctx),
      listarProdutos({ ativo: true, take: 20, orderBy: 'nome', orderDir: 'asc' }, ctx),
      listarSeries(ctx),
      obterSessaoAtual(ctx),
    ]),
  );
  // A troca exige uma série de NC; a numeração é a da série activa (#93), não se escolhe.
  const serieNotaCreditoId = series.find((s) => s.tipo === 'NOTA_CREDITO' && s.ativo)?.id;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Troca"
        description={`Troca a partir da devolução ${devolucao.numero}`}
        breadcrumbs={BREADCRUMBS}
      />

      <NovaTrocaForm
        devolucao={{
          id: devolucao.id,
          numero: devolucao.numero,
          valorTotal: devolucao.valorTotal,
          itens: devolucao.itens.map((i) => ({
            id: i.id,
            nomeProduto: i.nomeProduto,
            quantidade: i.quantidade,
            total: i.total,
          })),
        }}
        serieNotaCreditoId={serieNotaCreditoId}
        sessaoCaixaId={sessaoCaixa?.id}
        localizacoes={localizacoes.items.map((l) => ({ id: l.id, codigo: l.codigo, nome: l.nome }))}
        produtosIniciais={produtos.items.map((p) => ({
          id: p.id,
          nome: p.nome,
          sku: p.sku,
          precoVenda: p.precoVenda,
          taxaIva: p.taxaIva,
        }))}
      />
    </div>
  );
}
