/**
 * Documentos de Motoristas — Server Component (NUNCA 'use client').
 * Vista global de todos os documentos, ordenados por criticidade.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FileText, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prismaBase } from '@/server/db/client';
import { EstadoDocumento } from '@prisma/client';
import { PageHeader } from '@/components/patterns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const TIPO_LABELS: Record<string, string> = {
  CARTA_CONDUCAO: 'Carta de Condução',
  BI: 'Bilhete de Identidade',
  OUTRO: 'Outro',
};

const ESTADO_CONFIG: Record<
  EstadoDocumento,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof FileText }
> = {
  VALIDO: { label: 'Válido', variant: 'default', icon: CheckCircle },
  PROXIMO_EXPIRAR: { label: 'A Expirar', variant: 'secondary', icon: AlertTriangle },
  EXPIRADO: { label: 'Expirado', variant: 'destructive', icon: XCircle },
};

const ESTADO_ORDER: Record<EstadoDocumento, number> = {
  EXPIRADO: 0,
  PROXIMO_EXPIRAR: 1,
  VALIDO: 2,
};

export default async function DocumentosMotoristasPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId } = session.user;

  const documentos = await prismaBase.documentoMotorista.findMany({
    where: { tenantId },
    select: {
      id: true,
      tipo: true,
      numero: true,
      dataEmissao: true,
      dataValidade: true,
      entidadeEmissora: true,
      estado: true,
      motoristaId: true,
      motorista: { select: { nomeCompleto: true } },
    },
    orderBy: { dataValidade: 'asc' },
  });

  const sorted = [...documentos].sort(
    (a, b) => ESTADO_ORDER[a.estado] - ESTADO_ORDER[b.estado]
  );

  const expirados = sorted.filter((d) => d.estado === 'EXPIRADO').length;
  const proximoExpirar = sorted.filter((d) => d.estado === 'PROXIMO_EXPIRAR').length;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Documentos de Motoristas"
        description={`${documentos.length} documento(s) — ${expirados} expirado(s), ${proximoExpirar} a expirar`}
        breadcrumbs={[
          { label: 'Transporte', href: '/transporte' },
          { label: 'Motoristas', href: '/transporte/motoristas' },
          { label: 'Documentos' },
        ]}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/transporte/motoristas">Ver Motoristas</Link>
          </Button>
        }
      />

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mb-4 opacity-40" />
          <p className="text-sm">Sem documentos registados.</p>
          <p className="text-xs mt-1">Aceda à ficha de um motorista para adicionar documentos.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Emitente</TableHead>
                <TableHead className="tabular-nums">Emissão</TableHead>
                <TableHead className="tabular-nums">Validade</TableHead>
                <TableHead className="sr-only">Acções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((doc) => {
                const cfg = ESTADO_CONFIG[doc.estado];
                const Icon = cfg.icon;
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {TIPO_LABELS[doc.tipo] ?? doc.tipo}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{doc.numero}</TableCell>
                    <TableCell>
                      <Link
                        href={`/transporte/motoristas/${doc.motoristaId}`}
                        className="text-sm font-medium hover:underline text-primary"
                      >
                        {doc.motorista.nomeCompleto}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.entidadeEmissora}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {new Date(doc.dataEmissao).toLocaleDateString('pt-MZ', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums font-medium">
                      {new Date(doc.dataValidade).toLocaleDateString('pt-MZ', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/transporte/motoristas/${doc.motoristaId}`}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Ver motorista
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
