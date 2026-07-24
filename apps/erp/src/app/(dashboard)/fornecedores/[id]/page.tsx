/**
 * Detalhe de Fornecedor — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft, Mail, Phone, MapPin, Users, FileUp, Download } from 'lucide-react';
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
import {
  PageHeader,
  StatusBadge,
  DetailShell,
  EmptyState,
} from '@/components/patterns';
import { FornecedorAcoes } from '../_components/fornecedor-acoes';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FornecedorDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let fornecedor;
  try {
    fornecedor = await runWithTenantContext({ tenantId, userId }, () =>
      fornecedorService.obter(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!fornecedor) notFound();

  // Aba: Informações
  const tabInfo = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">NUIT</p>
          <p className="font-medium tabular-nums">{fornecedor.nuit}</p>
        </div>
        {fornecedor.bi && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">BI/Passaporte</p>
            <p className="font-medium">{fornecedor.bi}</p>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</p>
          <p className="font-medium">
            {fornecedor.tipo === 'PESSOA_FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica'}
          </p>
        </div>
        {fornecedor.categoria && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categoria</p>
            <p className="font-medium">{fornecedor.categoria}</p>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dias de Pagamento</p>
          <p className="font-medium tabular-nums">{fornecedor.diasPagamento} dias</p>
        </div>
        {fornecedor.limiteCredito != null && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Limite de Crédito</p>
            <p className="font-medium tabular-nums">
              MT {fornecedor.limiteCredito.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
        {fornecedor.condicoesPagamento && (
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Condições de Pagamento</p>
            <p className="text-sm">{fornecedor.condicoesPagamento}</p>
          </div>
        )}
        {fornecedor.formasPagamento.length > 0 && (
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Formas de Pagamento</p>
            <p className="text-sm">{fornecedor.formasPagamento.join(', ')}</p>
          </div>
        )}
        {fornecedor.observacoes && (
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Observações</p>
            <p className="text-sm text-muted-foreground">{fornecedor.observacoes}</p>
          </div>
        )}
      </div>

      {/* Endereços */}
      {fornecedor.enderecos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Endereços
          </h3>
          <div className="space-y-2">
            {fornecedor.enderecos.map((end) => (
              <div key={end.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{end.tipo}</span>
                  {end.principal && (
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                      Principal
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {end.rua}, {end.numero}, {end.bairro}, {end.cidade}, {end.provincia}
                  {end.codigoPostal ? ` — ${end.codigoPostal}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Aba: Contactos
  const tabContactos = (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/fornecedores/${fornecedor.id}/contactos`}>
            <Users className="h-4 w-4 mr-1.5" />
            Gerir contactos
          </Link>
        </Button>
      </div>
      {fornecedor.contactos.length === 0 ? (
        <EmptyState
          title="Sem contactos registados"
          description="Use “Gerir contactos” para adicionar contactos a este fornecedor."
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {fornecedor.contactos.map((c) => (
                <TableRow key={c.id} className="h-10">
                  <TableCell className="font-medium">{c.nome}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  // Aba: Documentos
  const tabDocumentos = (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/fornecedores/${fornecedor.id}/documentos`}>
            <FileUp className="h-4 w-4 mr-1.5" />
            Gerir documentos
          </Link>
        </Button>
      </div>
      {fornecedor.documentos.length === 0 ? (
        <EmptyState
          title="Sem documentos"
          description="Use “Gerir documentos” para carregar ficheiros deste fornecedor."
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {fornecedor.documentos.map((doc) => (
                <TableRow key={doc.id} className="h-10">
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
                    {doc.dataValidade
                      ? new Date(doc.dataValidade).toLocaleDateString('pt-MZ')
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  // Metadados laterais
  const metadata = [
    { label: 'Código', value: <span className="font-medium tabular-nums">{fornecedor.codigo}</span> },
    { label: 'NUIT', value: <span className="tabular-nums">{fornecedor.nuit}</span> },
    { label: 'Email', value: <span className="text-sm break-all">{fornecedor.email}</span> },
    fornecedor.telefone
      ? { label: 'Telefone', value: <span className="tabular-nums">{fornecedor.telefone}</span> }
      : null,
    {
      label: 'Classificação',
      value: <StatusBadge status={fornecedor.classificacao} />,
    },
    {
      label: 'Total Compras',
      value: (
        <span className="font-semibold tabular-nums">
          MT {fornecedor.totalCompras.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    fornecedor.rating != null
      ? {
          label: 'Avaliação',
          value: <span className="tabular-nums font-medium">{fornecedor.rating.toFixed(1)} / 5</span>,
        }
      : null,
    fornecedor.ultimaCompra
      ? {
          label: 'Última Compra',
          value: (
            <span className="tabular-nums text-sm">
              {new Date(fornecedor.ultimaCompra).toLocaleDateString('pt-MZ')}
            </span>
          ),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: React.ReactNode }>;

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={fornecedor.nome}
            description={fornecedor.email}
            breadcrumbs={[
              { label: 'Fornecedores', href: '/fornecedores/lista' },
              { label: fornecedor.nome },
            ]}
            badge={<StatusBadge status={fornecedor.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/fornecedores/lista">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/fornecedores/${fornecedor.id}/editar`}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
                <FornecedorAcoes id={fornecedor.id} status={fornecedor.status} />
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'informacoes',
            label: 'Informações',
            content: tabInfo,
          },
          {
            key: 'contactos',
            label: 'Contactos',
            count: fornecedor.contactos.length,
            content: tabContactos,
          },
          {
            key: 'documentos',
            label: 'Documentos',
            count: fornecedor.documentos.length,
            content: tabDocumentos,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
