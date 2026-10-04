/**
 * Razão Geral — Server Component.
 *
 * Dois modos, seleccionados pelo URL:
 *   Por períodos: ?contaId=<id>&exercicio=<código>&de=<n>&ate=<n>[&p13=1]
 *   Por datas:    ?contaId=<id>&dataInicio=<aaaa-mm-dd>&dataFim=<aaaa-mm-dd>
 *
 * Issue #297, ADR-0040 §7.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  arvoreContas,
  listarExercicios,
  periodoFiscalDe,
  razaoConta,
} from '@/server/services/financas/contabilidade.service';
import { FiltroRazaoDatasSchema, FiltroRazaoPeriodosSchema } from '@/lib/validations/contabilidade';
import { lerParametrosBalancete, exercicioCorrente } from '@/lib/balancete-params';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { SeletorConta } from './_components/seletor-conta';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RazaoConta as RazaoContaTipo } from '@/server/services/financas/contabilidade.interface';

// ---------------------------------------------------------------------------
// Secção de resultado (async — dentro do Suspense)
// ---------------------------------------------------------------------------

function fmtVal(d: { toString(): string } | null | undefined): string {
  if (d == null) return '—';
  return formatMZN(d.toString());
}

function fmtSaldo(d: { toString(): string; isZero?(): boolean }): string {
  if (typeof d.isZero === 'function' && d.isZero()) return formatMZN('0');
  return formatMZN(d.toString());
}

async function RazaoSection({
  filtros,
  ctx,
  intervaloTexto,
}: {
  filtros: Parameters<typeof razaoConta>[0];
  ctx: { tenantId: string; userId: string };
  intervaloTexto: string;
}) {
  const resultado: RazaoContaTipo = await runWithTenantContext(ctx, () =>
    razaoConta(filtros, ctx),
  );

  const { conta, saldoAnterior, totais, linhas, saldoFinal } = resultado;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {conta.codigo} — {conta.nome}
          {intervaloTexto && (
            <span
              data-testid="razao-intervalo"
              className="ml-2 text-sm font-normal text-muted-foreground"
            >
              {intervaloTexto}
            </span>
          )}
        </CardTitle>
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
            {/* Linha «Saldo anterior» — sempre presente */}
            <TableRow className="bg-muted/40 font-medium">
              <TableCell colSpan={2} className="text-sm">Saldo anterior</TableCell>
              <TableCell className="text-right tabular-nums text-sm">—</TableCell>
              <TableCell className="text-right tabular-nums text-sm">—</TableCell>
              <TableCell
                className="text-right tabular-nums text-sm font-semibold"
                data-testid="razao-saldo-anterior"
              >
                {fmtSaldo(saldoAnterior)}
              </TableCell>
            </TableRow>

            {/* Linhas de movimento */}
            {linhas.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">{formatarData(l.data)}</TableCell>
                <TableCell className="text-sm">{l.historico ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{fmtVal(l.debito)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">{fmtVal(l.credito)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm font-medium">
                  {fmtSaldo(l.saldoAcumulado)}
                </TableCell>
              </TableRow>
            ))}

            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">
                  Nenhum movimento no intervalo seleccionado.
                </TableCell>
              </TableRow>
            )}

            {/* Linha «Saldo final» — totais D/C e saldo final */}
            <TableRow className="bg-muted/40 font-semibold border-t-2">
              <TableCell colSpan={2} className="text-sm">Saldo final</TableCell>
              <TableCell
                className="text-right tabular-nums text-sm"
                data-testid="razao-total-debito"
              >
                {fmtVal(totais.debito)}
              </TableCell>
              <TableCell
                className="text-right tabular-nums text-sm"
                data-testid="razao-total-credito"
              >
                {fmtVal(totais.credito)}
              </TableCell>
              <TableCell
                className="text-right tabular-nums text-sm font-bold"
                data-testid="razao-saldo-final"
              >
                {fmtSaldo(saldoFinal)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Primeiro valor de um parâmetro multi-valor. */
function umValor(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function RazaoGeralPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const rawParams = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, umValor(v)]),
  );

  // Contas para o combobox — só folhas (aceitam lançamentos)
  const [todasContas, exercicios] = await runWithTenantContext(ctx, () =>
    Promise.all([
      arvoreContas(ctx),
      listarExercicios(ctx),
    ]),
  );
  const contas = todasContas
    .filter((c) => c.aceitaLancamento)
    .map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }));

  // Período corrente (Africa/Maputo) — ano fiscal para omissões de data
  const periodoFiscalAtual = periodoFiscalDe(new Date());
  const mesAtual = parseInt(periodoFiscalAtual.split('-')[1] ?? '12', 10);
  const anoFiscal = parseInt(periodoFiscalAtual.split('-')[0] ?? '2026', 10);

  const contaIdUrl = flat.contaId;

  // ── Modo por períodos — activado quando a chave «exercicio» está presente no URL ──
  // (mesmo que vazia: lerParametrosBalancete faz fallback para o exercício corrente)
  if (flat.exercicio !== undefined) {
    const params = lerParametrosBalancete(flat, { exercicios, mesAtual });

    if ('semExercicio' in params) {
      return (
        <div className="p-6 space-y-6">
          <PageHeader
            title="Razão Geral"
            breadcrumbs={[
              { label: 'Contabilidade', href: '/contabilidade' },
              { label: 'Razão Geral' },
            ]}
          />
          <div className="rounded-lg border p-8 text-center space-y-3">
            <p className="text-muted-foreground">Sem exercício contabilístico</p>
            <p className="text-sm text-muted-foreground">
              Para ver o razão geral é necessário ter pelo menos um exercício contabilístico aberto.
            </p>
            <Button asChild size="sm">
              <Link href="/contabilidade/exercicios/novo">Abrir exercício</Link>
            </Button>
          </div>
        </div>
      );
    }

    const filtroServico = params.filtroServico;
    const codigoPedido = params.codigoPedidoNaoEncontrado;

    const parseFiltro = FiltroRazaoPeriodosSchema.safeParse({
      contaId: contaIdUrl,
      exercicioId: filtroServico.exercicioId,
      periodoInicial: filtroServico.periodoInicial,
      periodoFinal: filtroServico.periodoFinal,
      incluir13: filtroServico.incluir13,
    });

    const intervaloTexto = `exercício ${params.exercicio.codigo} — períodos ${filtroServico.periodoInicial} a ${filtroServico.periodoFinal}`;

    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Razão Geral"
          description="Movimentação detalhada por conta, com saldo anterior e saldo final"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Razão Geral' },
          ]}
        />

        {codigoPedido !== null && (
          <div className="rounded-lg border border-info/40 bg-info/10 p-3 text-sm text-info">
            Exercício <strong>{codigoPedido}</strong> não encontrado — a mostrar{' '}
            <strong>{params.exercicio.codigo}</strong>
          </div>
        )}

        <SeletorConta
          contas={contas}
          exercicios={exercicios.map((e) => ({ codigo: e.codigo }))}
          contaId={contaIdUrl}
          modo="periodos"
          exercicio={params.exercicio.codigo}
          exercicioOmissao={params.exercicio.codigo}
          periodoInicial={filtroServico.periodoInicial}
          periodoFinal={filtroServico.periodoFinal}
          incluir13={filtroServico.incluir13}
        />

        {parseFiltro.success ? (
          <Suspense
            key={JSON.stringify(parseFiltro.data)}
            fallback={<TableSkeleton rows={10} cols={5} />}
          >
            <RazaoSection
              filtros={parseFiltro.data}
              ctx={ctx}
              intervaloTexto={intervaloTexto}
            />
          </Suspense>
        ) : (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            Escolha uma conta acima para ver o respectivo razão.
          </div>
        )}
      </div>
    );
  }

  // ── Modo por datas ─────────────────────────────────────────────────────────
  const inicioPorOmissao = `${anoFiscal}-01-01`;
  const fimPorOmissao = `${anoFiscal}-12-31`;

  const dataInicioUrl = typeof flat.dataInicio === 'string' ? flat.dataInicio : inicioPorOmissao;
  const dataFimUrl = typeof flat.dataFim === 'string' ? flat.dataFim : fimPorOmissao;

  // Datas `aaaa-mm-dd` ⇒ dia civil de Maputo inteiro (o schema normaliza, #88)
  const parseFiltro = FiltroRazaoDatasSchema.safeParse({
    contaId: contaIdUrl,
    dataInicio: dataInicioUrl,
    dataFim: dataFimUrl,
  });

  const intervaloTexto = parseFiltro.success
    ? `${formatarData(dataInicioUrl)} a ${formatarData(dataFimUrl)}`
    : '';

  // Exercício corrente (contém hoje → primeiro), para omissão do seletor quando muda para «Por períodos»
  const exercicioOmissao = exercicios.length > 0 ? exercicioCorrente(exercicios).codigo : '';

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Razão Geral"
        description="Movimentação detalhada por conta, com saldo anterior e saldo final"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Razão Geral' },
        ]}
      />

      <SeletorConta
        contas={contas}
        exercicios={exercicios.map((e) => ({ codigo: e.codigo }))}
        contaId={contaIdUrl}
        modo="datas"
        exercicioOmissao={exercicioOmissao}
        dataInicio={dataInicioUrl}
        dataFim={dataFimUrl}
      />

      {parseFiltro.success ? (
        <Suspense
          key={JSON.stringify(parseFiltro.data)}
          fallback={<TableSkeleton rows={10} cols={5} />}
        >
          <RazaoSection
            filtros={parseFiltro.data}
            ctx={ctx}
            intervaloTexto={intervaloTexto}
          />
        </Suspense>
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          Escolha uma conta acima para ver o respectivo razão.
        </div>
      )}
    </div>
  );
}
