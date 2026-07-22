/**
 * Balancete de Verificação — Server Component.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { FiltroBalanceteSchema } from '@/lib/validations/contabilidade';
import { Button } from '@/components/ui/button';
import { PageHeader, FilterBar, TableSkeleton } from '@/components/patterns';
import type { FilterConfig } from '@/components/patterns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FiltroUrlSchema = FiltroBalanceteSchema.extend({
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;
const FILTROS_DEFAULT: FiltroUrl = { incluirZeradas: false };

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

async function BalanceteSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  try {
    const result = await runWithTenantContext({ tenantId, userId }, () =>
      contabilidadeService.gerarBalancete(filtros as any, { tenantId, userId })
    );

    const n = (v: any) => parseFloat(v?.toString() ?? '0');
    const periodo = `${result.dataInicio ? new Date(result.dataInicio).toLocaleDateString('pt-PT') : '?'} – ${result.dataFim ? new Date(result.dataFim).toLocaleDateString('pt-PT') : '?'}`;
    const totalDeb = n(result.totalDebitos);
    const totalCred = n(result.totalCreditos);
    const diferenca = totalDeb - totalCred;

    return (
      <Card>
        <CardHeader>
          <CardTitle>Balancete — {periodo}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right tabular-nums">Saldo Anterior</TableHead>
                <TableHead className="text-right tabular-nums">Débitos</TableHead>
                <TableHead className="text-right tabular-nums">Créditos</TableHead>
                <TableHead className="text-right tabular-nums">Saldo Actual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.contas.map((linha) => {
                const saldoAtual = n(linha.saldoAtual);
                return (
                  <TableRow key={linha.conta.codigo}>
                    <TableCell className="font-mono text-primary">{linha.conta.codigo}</TableCell>
                    <TableCell className="font-medium">{linha.conta.nome}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMZN.format(n(linha.saldoAnterior))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMZN.format(n(linha.debitos))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMZN.format(n(linha.creditos))}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${saldoAtual < 0 ? 'text-destructive' : ''}`}>
                      {fmtMZN.format(saldoAtual)}
                    </TableCell>
                  </TableRow>
                );
              })}

              <TableRow className="font-bold bg-muted/50">
                <TableCell colSpan={3}>TOTAIS</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMZN.format(totalDeb)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMZN.format(totalCred)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMZN.format(totalDeb - totalCred)}</TableCell>
              </TableRow>

              <TableRow className={`font-bold ${Math.abs(diferenca) < 0.01 ? 'text-success' : 'text-destructive'}`}>
                <TableCell colSpan={5}>DIFERENÇA (deve ser zero)</TableCell>
                <TableCell className="text-right tabular-nums text-lg">{fmtMZN.format(diferenca)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  } catch {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        Erro ao gerar balancete. Seleccione um período válido.
      </div>
    );
  }
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    key: 'incluirZeradas',
    label: 'Contas Zeradas',
    options: [
      { label: 'Excluir zeradas', value: 'false' },
      { label: 'Incluir zeradas', value: 'true' },
    ],
  },
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BalancetePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const parseResult = FiltroUrlSchema.safeParse(flat);
  const filtros: FiltroUrl = parseResult.success ? parseResult.data : FILTROS_DEFAULT;

  const hasFilter = !!(flat.dataInicio || flat.dataFim);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Balancete de Verificação"
        description="Verificação de débitos e créditos por conta — PGC-NIRF"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Balancete' },
        ]}
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/contabilidade/balancete/nova">Registar Balancete Oficial</Link>
          </Button>
        }
      />

      <div className="flex gap-4">
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Data Início</label>
          {/* ponytail: date inputs handled via plain HTML; FilterBar only supports select options */}
          <a href={`?${new URLSearchParams({ ...flat, dataInicio: flat.dataInicio ?? '' })}`}
            className="text-sm text-muted-foreground underline hidden">
          </a>
        </div>
      </div>

      <FilterBar
        searchPlaceholder="Pesquisar por conta…"
        searchKey="search"
        filters={FILTER_CONFIGS}
      />

      {hasFilter ? (
        <Suspense key={JSON.stringify(filtros)} fallback={<TableSkeleton rows={12} cols={6} />}>
          <BalanceteSection filtros={filtros} tenantId={tenantId} userId={userId} />
        </Suspense>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Adicione <code>?dataInicio=aaaa-mm-dd&amp;dataFim=aaaa-mm-dd</code> à URL para gerar o balancete.
        </div>
      )}
    </div>
  );
}
