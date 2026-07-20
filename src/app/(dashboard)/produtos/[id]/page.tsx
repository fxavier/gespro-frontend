/**
 * Detalhe de Produto — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterProduto } from '@/server/services/inventario/catalogo.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProdutoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let produto;
  try {
    produto = await runWithTenantContext(ctx, () =>
      obterProduto(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!produto) notFound();

  const metadata = [
    { label: 'SKU', value: <span className="font-medium tabular-nums">{produto.sku}</span> },
    ...(produto.codigoBarras ? [{ label: 'Cód. Barras', value: produto.codigoBarras }] : []),
    ...(produto.categoria ? [{ label: 'Categoria', value: produto.categoria.nome }] : []),
    ...(produto.marca ? [{ label: 'Marca', value: produto.marca }] : []),
    { label: 'Unidade', value: produto.unidadeMedida },
    {
      label: 'Estado',
      value: <StatusBadge status={produto.ativo ? 'ATIVO' : 'INATIVO'} label={produto.ativo ? 'Activo' : 'Inactivo'} />,
    },
    {
      label: 'Preço Venda',
      value: <span className="font-semibold tabular-nums">MT {Number(produto.precoVenda).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>,
    },
    {
      label: 'Preço Compra',
      value: <span className="tabular-nums">MT {Number(produto.precoCompra).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>,
    },
    {
      label: 'Margem',
      value: <span className="tabular-nums">{(Number(produto.margemLucro) * 100).toFixed(1)}%</span>,
    },
    {
      label: 'IVA',
      value: <span className="tabular-nums">{(Number(produto.taxaIva) * 100).toFixed(0)}%</span>,
    },
    {
      label: 'Stock Mínimo',
      value: <span className="tabular-nums">{Number(produto.stockMinimo).toFixed(0)}</span>,
    },
    ...(produto.stockMaximo
      ? [{ label: 'Stock Máximo', value: <span className="tabular-nums">{Number(produto.stockMaximo).toFixed(0)}</span> }]
      : []),
    ...(produto.dataValidade
      ? [{
          label: 'Validade',
          value: new Date(produto.dataValidade).toLocaleDateString('pt-MZ', {
            day: '2-digit', month: 'long', year: 'numeric',
          }),
        }]
      : []),
    {
      label: 'Criado em',
      value: new Date(produto.createdAt).toLocaleDateString('pt-MZ'),
    },
  ];

  // Tab: Variantes
  const tabVariantes = (
    <div>
      {produto.variantes.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Sem variantes definidas.
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Nome</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Valor</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Preço Adicional</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produto.variantes.map((v) => (
                <TableRow key={v.id} className="h-10">
                  <TableCell className="font-medium">{v.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{v.valor || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(v.precoAdicional) !== 0
                      ? `MT ${Number(v.precoAdicional).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={produto.nome}
            description={produto.descricao ?? produto.sku}
            breadcrumbs={[
              { label: 'Produtos', href: '/produtos' },
              { label: produto.sku },
            ]}
            badge={
              <StatusBadge
                status={produto.ativo ? 'ATIVO' : 'INATIVO'}
                label={produto.ativo ? 'Activo' : 'Inactivo'}
              />
            }
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/produtos">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                {produto.ativo && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/produtos/${id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'variantes',
            label: 'Variantes',
            count: produto.variantes.length,
            content: tabVariantes,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
