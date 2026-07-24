/**
 * Gestão de documentos de um fornecedor — Server Component (NUNCA 'use client').
 * Lista com download (presigned GET) + remoção; upload em sub-rota `novo`.
 */
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, ArrowLeft, Download } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { fornecedorService } from '@/server/services/compras/fornecedor.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, StatusBadge, EmptyState } from '@/components/patterns';
import { DocumentoRemover } from './_components/documento-remover';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DocumentosFornecedorPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let fornecedor;
  try {
    fornecedor = await runWithTenantContext({ tenantId, userId }, () =>
      fornecedorService.obter(id, { tenantId, userId }),
    );
  } catch {
    notFound();
  }
  if (!fornecedor) notFound();

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Documentos"
        description={fornecedor.nome}
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: fornecedor.nome, href: `/fornecedores/${fornecedor.id}` },
          { label: 'Documentos' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/fornecedores/${fornecedor.id}`}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Voltar
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/fornecedores/${fornecedor.id}/documentos/novo`}>
                <Plus className="h-4 w-4 mr-1.5" />
                Carregar documento
              </Link>
            </Button>
          </div>
        }
      />

      {fornecedor.documentos.length === 0 ? (
        <EmptyState
          title="Sem documentos"
          description="Carregue o primeiro documento deste fornecedor."
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Nome</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Data Upload</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Validade</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">Acções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fornecedor.documentos.map((doc) => (
                <TableRow key={doc.id} className="h-11">
                  <TableCell>
                    <a
                      href={`/api/documentos/${doc.id}/download?recurso=fornecedor`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {doc.nome}
                    </a>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={doc.tipo} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground text-sm">
                    {new Date(doc.dataUpload).toLocaleDateString('pt-MZ')}
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {doc.dataValidade ? (
                      new Date(doc.dataValidade).toLocaleDateString('pt-MZ')
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DocumentoRemover documentoId={doc.id} nome={doc.nome} />
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
