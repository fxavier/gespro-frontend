/**
 * Gestão de contactos de um fornecedor — Server Component (NUNCA 'use client').
 * Lista + acções (novo / editar / remover) via sub-rotas dedicadas e actions.
 */
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, ArrowLeft, Edit, Mail, Phone } from 'lucide-react';
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
import { ContactoRemover } from './_components/contacto-remover';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ContactosFornecedorPage({ params }: Props) {
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
        title="Contactos"
        description={fornecedor.nome}
        breadcrumbs={[
          { label: 'Fornecedores', href: '/fornecedores/lista' },
          { label: fornecedor.nome, href: `/fornecedores/${fornecedor.id}` },
          { label: 'Contactos' },
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
              <Link href={`/fornecedores/${fornecedor.id}/contactos/novo`}>
                <Plus className="h-4 w-4 mr-1.5" />
                Novo contacto
              </Link>
            </Button>
          </div>
        }
      />

      {fornecedor.contactos.length === 0 ? (
        <EmptyState
          title="Sem contactos registados"
          description="Adicione o primeiro contacto deste fornecedor."
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Nome</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Cargo</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Email</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Telefone</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">Acções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fornecedor.contactos.map((c) => (
                <TableRow key={c.id} className="h-11">
                  <TableCell className="font-medium">
                    {c.nome}
                    {!c.ativo && (
                      <span className="ml-2 text-xs text-muted-foreground">(inactivo)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.cargo ?? '—'}</TableCell>
                  <TableCell>
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {c.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.telefone ? (
                      <a
                        href={`tel:${c.telefone}`}
                        className="flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {c.telefone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.tipo} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/fornecedores/${fornecedor.id}/contactos/${c.id}/editar`}>
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Editar contacto</span>
                        </Link>
                      </Button>
                      <ContactoRemover contactoId={c.id} nome={c.nome} />
                    </div>
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
