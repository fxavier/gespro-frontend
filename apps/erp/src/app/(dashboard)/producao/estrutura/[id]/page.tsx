/**
 * Detalhe da Estrutura de Produto (BOM) — Server Component (NUNCA 'use client').
 *
 * #165: liga as transições existentes (`transitarStatusBOMAction`, mapa `TRANSICOES_BOM`) —
 * «Activar» quando o mapa permite ATIVO, «Desactivar» em ATIVO; SUBSTITUIDO é terminal.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { TRANSICOES_BOM } from '@/server/services/pessoas-projetos/producao.interface';
import { formatMZN, formatNumero } from '@/lib/format-currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { ActivarDesactivar } from '../../_components/activar-desactivar';
import { alvoActivarDesactivar } from '../../_components/alvo-activar-desactivar';

interface Props {
  params: Promise<{ id: string }>;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function EstruturaDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  const bom = await runWithTenantContext(ctx, () =>
    prisma.estruturaProduto.findFirst({
      where: { id, tenantId },
      include: { componentes: { orderBy: { nivel: 'asc' } } },
    }),
  );
  if (!bom) notFound();

  const produto = await runWithTenantContext(ctx, () =>
    prisma.produto.findFirst({ where: { id: bom.produtoId, tenantId }, select: { sku: true, nome: true } }),
  );

  const alvo = permissions.includes('producao:bom:update')
    ? alvoActivarDesactivar(TRANSICOES_BOM, bom.status)
    : null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Estrutura ${bom.codigo}`}
        description={bom.nome}
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Estrutura de Produto', href: '/producao/estrutura' },
          { label: bom.codigo },
        ]}
        badge={<StatusBadge status={bom.status} />}
        actions={
          <div className="flex items-center gap-2">
            <ActivarDesactivar entidade="bom" id={bom.id} alvo={alvo} />
            <Button variant="outline" size="sm" asChild>
              <Link href="/producao/estrutura">
                <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Voltar
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da estrutura</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Campo rotulo="Código">{bom.codigo}</Campo>
            <Campo rotulo="Produto">{produto ? `${produto.sku} — ${produto.nome}` : '—'}</Campo>
            <Campo rotulo="Versão">{bom.versao}</Campo>
            <Campo rotulo="Unidade de produção">{bom.unidadeProducao}</Campo>
          </dl>
          {bom.observacoes && (
            <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{bom.observacoes}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Componentes</CardTitle>
        </CardHeader>
        <CardContent>
          {bom.componentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta estrutura ainda não tem componentes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Código</th>
                  <th className="py-2 font-medium">Componente</th>
                  <th className="py-2 font-medium text-right">Quantidade</th>
                  <th className="py-2 font-medium text-right">Custo unitário</th>
                </tr>
              </thead>
              <tbody>
                {bom.componentes.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2 tabular-nums">{c.codigoComponente}</td>
                    <td className="py-2">{c.nomeComponente}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatNumero(c.quantidade.toString())} {c.unidadeMedida}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatMZN(c.custoUnitario.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
