/**
 * Razão Geral — Server Component.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { FiltroRazaoSchema } from '@/lib/validations/contabilidade';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FiltroUrlSchema = FiltroRazaoSchema.extend({
  contaId: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { take: 50, contaId: '', dataInicio: undefined, dataFim: undefined };

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

async function RazaoSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  try {
    const linhas = await runWithTenantContext({ tenantId, userId }, () =>
      contabilidadeService.razaoConta(filtros as any, { tenantId, userId })
    );

    if (!linhas || linhas.length === 0) {
      return (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Nenhum movimento encontrado para os filtros seleccionados.
        </div>
      );
    }

    const n = (v: any) => parseFloat(v?.toString() ?? '0');
    let saldoAcumulado = 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Movimentos da Conta</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Histórico</TableHead>
                <TableHead className="text-right tabular-nums">Débito</TableHead>
                <TableHead className="text-right tabular-nums">Crédito</TableHead>
                <TableHead className="text-right tabular-nums">Saldo Acum.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => {
                const debito = n(l.debito);
                const credito = n(l.credito);
                const saldoPartida = n(l.saldoAcumulado);
                saldoAcumulado = saldoPartida; // use server-computed saldo
                return (
                  <TableRow key={i}>
                    <TableCell className="text-sm">
                      {l.data ? new Date(l.data).toLocaleDateString('pt-PT') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{l.historico ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {debito > 0 ? fmtMZN.format(debito) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {credito > 0 ? fmtMZN.format(credito) : '—'}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold text-sm ${saldoPartida < 0 ? 'text-destructive' : ''}`}>
                      {fmtMZN.format(saldoPartida)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao carregar razão da conta.
      </div>
    );
  }
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RazaoGeralPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parseResult = FiltroUrlSchema.safeParse(flat);
  const filtros: FiltroUrl = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  const hasFilter = !!(flat.contaId);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Razão Geral"
        description="Movimentação detalhada por conta — filtre via URL: ?contaId=xxx&dataInicio=aaaa-mm-dd&dataFim=aaaa-mm-dd"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Razão Geral' },
        ]}
      />

      {hasFilter ? (
        <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={10} cols={5} />}>
          <RazaoSection filtros={filtros} tenantId={tenantId} userId={userId} />
        </Suspense>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Adicione <code>?contaId=&lt;id&gt;</code> à URL para consultar o razão de uma conta.
        </div>
      )}
    </div>
  );
}
