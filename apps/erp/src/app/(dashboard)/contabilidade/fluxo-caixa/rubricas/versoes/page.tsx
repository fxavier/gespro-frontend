/**
 * Histórico das versões do mapeamento (ADR-0037 E1) — Server Component.
 * Append-only: cada alteração é uma linha, e cada validação fica presa à sua
 * versão (estado, quem validou, quando, observação).
 */
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { historicoVersoes } from '@/server/services/financas/dfc.service';
import { formatarDataHora } from '@/lib/format-date';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { acessoDFC, SemPermissao } from '../_components/acesso';
import { BREADCRUMBS_BASE, ROTA_RUBRICAS } from '../_components/rotulos';

export default async function VersoesPage() {
  const acesso = await acessoDFC();
  if (!acesso.podeLer) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title="Versões do mapeamento" breadcrumbs={[...BREADCRUMBS_BASE, { label: 'Versões' }]} />
        <SemPermissao mensagem="Não tem permissão para consultar a configuração da DFC." />
      </div>
    );
  }
  const { ctx, podeValidar } = acesso;
  const versoes = await runWithTenantContext(ctx, () => historicoVersoes(ctx));
  const actual = versoes[0];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Versões do mapeamento"
        description="Cada alteração às rubricas, ao mapeamento ou às contas de caixa cria uma versão nova, por validar"
        breadcrumbs={[...BREADCRUMBS_BASE, { label: 'Versões' }]}
        actions={
          podeValidar && actual?.estado === 'PENDING' ? (
            <Button asChild size="sm">
              <Link href={`${ROTA_RUBRICAS}/validar`}>
                <ShieldCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Validar versão actual
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="pt-6">
          {versoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Mapeamento ainda não semeado neste tenant.</p>
          ) : (
            <Table data-testid="dfc-versoes">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Versão</TableHead>
                  <TableHead className="w-32">Estado</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Rubricas</TableHead>
                  <TableHead className="text-right">Contas</TableHead>
                  <TableHead>Validada por</TableHead>
                  <TableHead>Validada em</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versoes.map((v, i) => (
                  <TableRow key={v.id} data-testid={`versao-${v.numero}`}>
                    <TableCell className="tabular-nums font-medium">
                      {v.numero}
                      {i === 0 && <span className="ml-1 text-xs text-muted-foreground">(actual)</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={v.estado} />
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">{formatarDataHora(v.createdAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.rubricas}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.contas}</TableCell>
                    <TableCell className="text-sm">{v.validadoPorNome ?? (v.validadoPorId ? '—' : '')}</TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {v.validadoEm ? formatarDataHora(v.validadoEm) : ''}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-pre-wrap text-sm">{v.observacao ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
