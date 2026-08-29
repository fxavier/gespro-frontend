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

/**
 * Parâmetros de URL — tudo chega como string.
 *
 * As datas usam a coerção que o `FiltroBalanceteSchema` já traz; sobrepô-las
 * com `z.string()` era o defeito D1 (ADR-0018 §6): as datas seguiam em string
 * para o serviço (daí o `as any`) e, pior, o `incluirZeradas` recebia a string
 * `"false"` num `z.boolean()`, o `safeParse` falhava e a página caía num
 * default SEM datas — varrendo o razão inteiro em cada pedido.
 *
 * `z.coerce.boolean()` não serve aqui: `Boolean("false") === true`.
 */
const BooleanoUrl = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((v) => v === 'true'),
]);

const FiltroUrlSchema = FiltroBalanceteSchema.extend({
  incluirZeradas: BooleanoUrl.default(false),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

/**
 * Sem `try/catch`: um erro aqui propaga para `app/error.tsx` e a resposta é
 * ≠ 200. O `catch` genérico anterior devolvia um cartão de erro com HTTP 200
 * (defeito D7) — mascarou o D2 durante toda a fase A da campanha e engana
 * igualmente as sondas de saúde e os cenários k6. Entrada malformada já não
 * chega aqui: é apanhada pelo `safeParse` da página.
 */
async function BalanceteSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  const result = await runWithTenantContext({ tenantId, userId }, () =>
    contabilidadeService.gerarBalancete(filtros, { tenantId, userId })
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
  // Sem fallback silencioso: filtros inválidos mostram a instrução, nunca um
  // balancete de um período que o utilizador não pediu (defeito D1).
  const parseResult = FiltroUrlSchema.safeParse(flat);

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

      {parseResult.success ? (
        <Suspense key={JSON.stringify(parseResult.data)} fallback={<TableSkeleton rows={12} cols={6} />}>
          <BalanceteSection filtros={parseResult.data} tenantId={tenantId} userId={userId} />
        </Suspense>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Adicione <code>?dataInicio=aaaa-mm-dd&amp;dataFim=aaaa-mm-dd</code> à URL para gerar o balancete.
        </div>
      )}
    </div>
  );
}
