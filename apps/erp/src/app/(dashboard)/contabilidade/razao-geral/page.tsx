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

/**
 * Parâmetros de URL — tudo chega como string.
 *
 * Sobrepor `contaId` e as datas com `z.string().optional()` era o defeito D2
 * (ADR-0018 §6): as datas seguiam em string para `razaoConta`, o Prisma
 * rejeitava antes de emitir SQL, e o `catch` da página devolvia um cartão de
 * erro com HTTP 200 — a razão NUNCA executou durante a campanha de desempenho,
 * e os 13,2 s registados eram congestão causada por outros cenários.
 *
 * Só o `take` precisa de coerção: o schema base espera número e o URL dá string.
 */
const FiltroUrlSchema = FiltroRazaoSchema.extend({
  take: z.coerce.number().int().min(1).max(200).default(50),
});

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

/**
 * Sem `try/catch`: um erro propaga para `app/error.tsx` e a resposta é ≠ 200.
 * O `catch` genérico devolvia HTTP 200 (defeito D7) e foi o que escondeu o D2.
 * Entrada malformada já não chega aqui — é apanhada pelo `safeParse` da página.
 */
async function RazaoSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  const linhas = await runWithTenantContext({ tenantId, userId }, () =>
    contabilidadeService.razaoConta(filtros, { tenantId, userId })
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
  // Sem fallback silencioso: filtros inválidos mostram a instrução. O default
  // anterior mandava `contaId: ''` ao serviço e produzia a página de erro-200
  // que escondeu o D2.
  const parseResult = FiltroUrlSchema.safeParse(flat);

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

      {parseResult.success ? (
        <Suspense key={JSON.stringify(parseResult.data)} fallback={<TableSkeleton rows={10} cols={5} />}>
          <RazaoSection filtros={parseResult.data} tenantId={tenantId} userId={userId} />
        </Suspense>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Adicione <code>?contaId=&lt;id&gt;</code> à URL para consultar o razão de uma conta.
        </div>
      )}
    </div>
  );
}
