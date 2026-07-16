/**
 * Listagem de Categorias de Serviço — Server Component (NUNCA 'use client').
 * Sem Dialog: criação/edição em rotas dedicadas.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, Tag, CheckCircle, XCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { servicoService } from '@/server/services/compras/servico.service';
import { Button } from '@/components/ui/button';
import { PageHeader, EmptyState } from '@/components/patterns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default async function CategoriasPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const categorias = await runWithTenantContext(ctx, () =>
    servicoService.listarCategorias(ctx)
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Categorias de Serviço"
        description="Organização do catálogo de serviços por categoria"
        breadcrumbs={[
          { label: 'Serviços', href: '/servicos/lista' },
          { label: 'Categorias' },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/servicos/categorias/novo">
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Link>
          </Button>
        }
      />

      {categorias.length === 0 ? (
        <EmptyState
          title="Sem categorias"
          description="Crie a primeira categoria para organizar os seus serviços."
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Cor</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Nome</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground hidden md:table-cell">Descrição</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Serviços</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorias.map((cat) => (
                <TableRow key={cat.id} className="h-11">
                  <TableCell>
                    <span
                      className="inline-block h-4 w-4 rounded-full border"
                      style={{ backgroundColor: cat.cor }}
                      aria-label={cat.cor}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{cat.nome}</TableCell>
                  <TableCell className="text-muted-foreground text-sm hidden md:table-cell">
                    {cat.descricao ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{cat.totalServicos}</TableCell>
                  <TableCell>
                    {cat.ativo ? (
                      <span className="inline-flex items-center gap-1 text-sm text-success">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <XCircle className="h-3.5 w-3.5" />
                        Inactiva
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/servicos/categorias/${cat.id}/editar`}>
                        Editar
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
