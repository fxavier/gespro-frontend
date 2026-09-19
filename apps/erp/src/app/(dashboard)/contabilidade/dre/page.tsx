/**
 * Demonstração do Resultado do Exercício (DRE) — Server Component.
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { FiltroDRESchema } from '@/lib/validations/contabilidade';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { SeletorPeriodo } from '../_components/seletor-periodo';
import { periodoPorOmissao } from '@/lib/periodo-fiscal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';

/**
 * Sobrepor as datas com `z.string().optional()` era o mesmo defeito que partiu
 * o razão (D2, ADR-0018 §6): seguiam em string para `gerarDRE` — daí o
 * `as any` —, o Prisma rejeitava antes de emitir SQL e o `catch` da secção
 * devolvia «Seleccione um período válido» com HTTP 200. A DRE nunca executou.
 * O schema base já faz `z.coerce.date()`; é ele que vale.
 */
const FiltroUrlSchema = FiltroDRESchema;

type FiltroUrl = z.infer<typeof FiltroUrlSchema>;

const fmtMZN = new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN' });

function DreRow({ label, value, indent = 0, bold = false, highlight = false }: {
  label: string; value: number; indent?: number; bold?: boolean; highlight?: boolean;
}) {
  const isNeg = value < 0;
  return (
    <TableRow className={highlight ? 'bg-muted/50 font-bold' : bold ? 'font-semibold' : ''}>
      <TableCell style={{ paddingLeft: `${16 + indent * 16}px` }}>{label}</TableCell>
      <TableCell className={`text-right tabular-nums ${isNeg ? 'text-destructive' : ''}`}>
        {isNeg ? `(${fmtMZN.format(Math.abs(value))})` : fmtMZN.format(value)}
      </TableCell>
    </TableRow>
  );
}

/**
 * Sem `try/catch`: um erro aqui propaga para `app/error.tsx` e a resposta é
 * ≠ 200, como no balancete. O `catch` que aqui estava devolvia «Seleccione um
 * período válido» com HTTP 200 e escondeu durante toda a campanha o facto de a
 * DRE nunca ter executado (D7). Entrada malformada é apanhada pelo `safeParse`
 * da página, antes de chegar aqui.
 */
async function DreSection({ filtros, tenantId, userId }: { filtros: FiltroUrl; tenantId: string; userId: string }) {
  const dre = await runWithTenantContext({ tenantId, userId }, () =>
    contabilidadeService.gerarDRE(filtros, { tenantId, userId })
  );

  const n = (v: any) => parseFloat(v?.toString() ?? '0');
  const periodo = `${dre.dataInicio ? new Date(dre.dataInicio).toLocaleDateString('pt-PT') : '?'} – ${dre.dataFim ? new Date(dre.dataFim).toLocaleDateString('pt-PT') : '?'}`;

  const lucroLiquido = n(dre.lucroLiquido);

  return (
    <Card>
      <CardHeader>
        <CardTitle>DRE — {periodo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableBody>
            <DreRow label="RECEITA BRUTA" value={n(dre.receitaBruta)} highlight />
            <DreRow label="(-) Deduções" value={-n(dre.deducoes)} indent={1} />
            <DreRow label="RECEITA LÍQUIDA" value={n(dre.receitaLiquida)} highlight />
            <DreRow label="(-) Custo dos Bens/Serviços Vendidos" value={-n(dre.custoProdutosVendidos)} indent={1} />
            <DreRow label="LUCRO BRUTO" value={n(dre.lucroBruto)} highlight />
            <DreRow label="DESPESAS OPERACIONAIS" value={-n(dre.totalDespesasOperacionais)} bold />
            <DreRow label="Gastos com o Pessoal" value={-n(dre.despesasVendas)} indent={1} />
            <DreRow label="Fornecimentos e Serviços de Terceiros" value={-n(dre.despesasAdministrativas)} indent={1} />
            <DreRow label="Outras Despesas Gerais" value={-n(dre.despesasGerais)} indent={1} />
            <DreRow label="LUCRO OPERACIONAL" value={n(dre.lucroOperacional)} highlight />
            <DreRow label="(+) Receitas Financeiras" value={n(dre.receitasFinanceiras)} indent={1} />
            <DreRow label="(-) Despesas Financeiras" value={-n(dre.despesasFinanceiras)} indent={1} />
            <DreRow label="RESULTADO FINANCEIRO" value={n(dre.resultadoFinanceiro)} bold />
            <DreRow label="LUCRO ANTES DE IMPOSTOS" value={n(dre.lucroAntesImpostos)} highlight />
            <DreRow label="(-) Impostos (IRPC)" value={-n(dre.impostos)} indent={1} />
            <TableRow className="bg-primary/10 font-bold text-lg">
              <TableCell>LUCRO LÍQUIDO</TableCell>
              <TableCell className={`text-right tabular-nums ${lucroLiquido < 0 ? 'text-destructive' : 'text-success'}`}>
                {fmtMZN.format(lucroLiquido)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DrePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;

  const rawParams = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  // Período ausente → exercício corrente. Data presente mas inválida continua
  // a falhar e a mostrar a instrução — o default cobre a ausência, não o erro.
  const omissao = periodoPorOmissao();
  const periodo = {
    dataInicio: typeof flat.dataInicio === 'string' ? flat.dataInicio : omissao.dataInicio,
    dataFim: typeof flat.dataFim === 'string' ? flat.dataFim : omissao.dataFim,
  };
  const parseResult = FiltroUrlSchema.safeParse({ ...flat, ...periodo });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Demonstração do Resultado do Exercício"
        description="Análise de rendimentos, custos e resultados — PGC-NIRF"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'DRE' },
        ]}
      />

      <SeletorPeriodo
        rota="/contabilidade/dre"
        dataInicio={periodo.dataInicio}
        dataFim={periodo.dataFim}
      />

      {parseResult.success ? (
        <Suspense key={JSON.stringify(parseResult.data)} fallback={<TableSkeleton rows={14} cols={2} />}>
          <DreSection filtros={parseResult.data} tenantId={tenantId} userId={userId} />
        </Suspense>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Período inválido. Escolha as datas acima para gerar a DRE.
        </div>
      )}
    </div>
  );
}
