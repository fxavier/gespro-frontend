/**
 * Detalhe de Cliente — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, Mail, Phone, MapPin } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { ClienteAcoes } from '../_components/cliente-acoes';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClienteDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;

  let cliente;
  try {
    cliente = await runWithTenantContext({ tenantId, userId }, () =>
      clienteService.buscarPorId(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }

  if (!cliente) notFound();

  // Aba: Informações
  const tabInformacoes = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contactos</h3>
          {cliente.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${cliente.email}`} className="text-primary hover:underline">
                {cliente.email}
              </a>
            </div>
          )}
          {cliente.telefone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${cliente.telefone}`} className="hover:underline tabular-nums">
                {cliente.telefone}
              </a>
            </div>
          )}
          {cliente.telefoneSec && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${cliente.telefoneSec}`} className="hover:underline tabular-nums">
                {cliente.telefoneSec}
              </a>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Crédito</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Limite</p>
              <p className="font-semibold tabular-nums">
                MT {parseFloat(cliente.limiteCreditoMT).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Utilizado</p>
              <p className="font-semibold tabular-nums">
                MT {parseFloat(cliente.creditoUtilizadoMT).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          {parseFloat(cliente.limiteCreditoMT) > 0 && (
            <div className="space-y-1">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min((parseFloat(cliente.creditoUtilizadoMT) / parseFloat(cliente.limiteCreditoMT)) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {((parseFloat(cliente.creditoUtilizadoMT) / parseFloat(cliente.limiteCreditoMT)) * 100).toFixed(1)}% utilizado
              </p>
            </div>
          )}
        </div>
      </div>

      {cliente.observacoes && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Observações</h3>
          <p className="text-sm text-muted-foreground">{cliente.observacoes}</p>
        </div>
      )}
    </div>
  );

  // Aba: Endereços
  const tabEnderecos = (
    <div className="space-y-3">
      {(cliente.enderecos ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum endereço registado.</p>
      ) : (
        (cliente.enderecos ?? []).map((end) => (
          <div key={end.id} className="flex items-start gap-3 rounded-lg border p-4">
            <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={end.tipo} />
                {end.principal && (
                  <span className="text-xs text-muted-foreground">(principal)</span>
                )}
              </div>
              <p className="text-sm font-medium">{end.rua}, {end.numero}</p>
              <p className="text-sm text-muted-foreground">{end.bairro}, {end.cidade}</p>
              <p className="text-sm text-muted-foreground">{end.provincia}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );

  // Aba: Contactos
  const tabContactos = (
    <div>
      {(cliente.contactos ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum contacto registado.</p>
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
              {(cliente.contactos ?? []).map((c) => (
                <TableRow key={c.id} className="h-10">
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{c.cargo ?? '—'}</TableCell>
                  <TableCell>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-primary hover:underline text-sm">
                        {c.email}
                      </a>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">{c.telefone ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={c.tipo} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  const metadata = [
    { label: 'Código', value: <span className="font-medium tabular-nums">{cliente.codigo}</span> },
    { label: 'Tipo', value: <StatusBadge status={cliente.tipo} /> },
    { label: 'Categoria', value: <StatusBadge status={cliente.categoria} /> },
    cliente.nuit ? { label: 'NUIT', value: <span className="tabular-nums">{cliente.nuit}</span> } : null,
    { label: 'Dias de Pagamento', value: <span className="tabular-nums">{cliente.diasPagamento} dias</span> },
    {
      label: 'Registado em',
      value: new Date(cliente.createdAt).toLocaleDateString('pt-MZ', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    },
  ].filter(Boolean) as Array<{ label: string; value: React.ReactNode }>;

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={cliente.nome}
            description={cliente.email ?? `Código: ${cliente.codigo}`}
            breadcrumbs={[
              { label: 'Clientes', href: '/clientes' },
              { label: cliente.nome },
            ]}
            badge={<StatusBadge status={cliente.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/clientes">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/clientes/${cliente.id}/editar`}>
                    <Edit className="h-4 w-4 mr-1.5" />
                    Editar
                  </Link>
                </Button>
                <ClienteAcoes id={cliente.id} status={cliente.status} />
              </div>
            }
          />
        }
        tabs={[
          { key: 'informacoes', label: 'Informações', content: tabInformacoes },
          {
            key: 'enderecos',
            label: 'Endereços',
            count: (cliente.enderecos ?? []).length,
            content: tabEnderecos,
          },
          {
            key: 'contactos',
            label: 'Contactos',
            count: (cliente.contactos ?? []).length,
            content: tabContactos,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
