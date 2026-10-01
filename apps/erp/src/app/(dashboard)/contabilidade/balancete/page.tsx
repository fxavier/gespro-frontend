/**
 * Balancete de Verificação no modelo PHC — Server Component.
 *
 * URL: /contabilidade/balancete?exercicio=<codigo>&de=<ordem>&ate=<ordem>&p13=1
 *
 * ADR-0040, issue #280.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  gerarBalanceteVerificacao,
  listarExercicios,
  periodoFiscalDe,
} from '@/server/services/financas/contabilidade.service';
import { FiltroBalanceteVerificacaoSchema } from '@/lib/validations/contabilidade';
import { Button } from '@/components/ui/button';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatNumero } from '@/lib/format-currency';
import { SeletorBalanceteVerificacao } from './_components/seletor-balancete-verificacao';
import type { FiltroBalanceteVerificacaoInput } from '@/server/services/financas/contabilidade.interface';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Formatação de valores (sem símbolo MT — parsePtNum do E2E espera números puros)
// ---------------------------------------------------------------------------

function fmtBV(d: Prisma.Decimal): string {
  if (d.isZero()) return '—'; // «—»
  return formatNumero(d.toString());
}

// ---------------------------------------------------------------------------
// Secção da tabela (componente async — faz a fetch dentro do Suspense, m2)
// ---------------------------------------------------------------------------

async function TabelaBalancete({
  filtro,
  ctx,
}: {
  filtro: FiltroBalanceteVerificacaoInput;
  ctx: { tenantId: string; userId: string };
}) {
  const balancete = await runWithTenantContext(ctx, () =>
    gerarBalanceteVerificacao(filtro, ctx),
  );
  const eq = balancete.equilibrio;
  const equilibrado = eq.movimento && eq.acumulado && eq.saldo;

  return (
    <div className="space-y-4">
      {/* Tabela PHC */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="align-bottom border-r">
                Conta
              </TableHead>
              <TableHead rowSpan={2} className="align-bottom border-r">
                Descrição
              </TableHead>
              <TableHead colSpan={2} className="text-center border-r">
                Movimento do período
              </TableHead>
              <TableHead colSpan={2} className="text-center border-r">
                Acumulado
              </TableHead>
              <TableHead colSpan={2} className="text-center">
                Saldo
              </TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="text-right tabular-nums">Débito</TableHead>
              <TableHead className="text-right tabular-nums border-r">Crédito</TableHead>
              <TableHead className="text-right tabular-nums">Débito</TableHead>
              <TableHead className="text-right tabular-nums border-r">Crédito</TableHead>
              <TableHead className="text-right tabular-nums">Devedor</TableHead>
              <TableHead className="text-right tabular-nums">Credor</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {balancete.linhas.map((linha, idx) => {
              const key = linha.conta?.id ?? `sintetica-${idx}`;
              const codigo = linha.conta?.codigo ?? '';
              const descricao = linha.conta
                ? linha.conta.nome
                : 'Resultados de exercícios anteriores por encerrar';

              return (
                <TableRow
                  key={key}
                  className={
                    linha.implicita
                      ? 'italic text-muted-foreground'
                      : linha.contraNatureza
                        ? 'text-warning'
                        : ''
                  }
                >
                  <TableCell className="font-mono text-primary">{codigo}</TableCell>
                  <TableCell>
                    {descricao}
                    {linha.implicita && (
                      <span className="ml-2 text-xs text-muted-foreground">(implícita)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBV(linha.movD)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBV(linha.movC)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBV(linha.acumD)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtBV(linha.acumC)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtBV(linha.saldoDevedor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {fmtBV(linha.saldoCredor)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>

          <TableFooter>
            <TableRow className="font-bold">
              <TableCell colSpan={2}>Totais</TableCell>
              <TableCell className="text-right tabular-nums">{fmtBV(balancete.totais.movD)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtBV(balancete.totais.movC)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtBV(balancete.totais.acumD)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtBV(balancete.totais.acumC)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtBV(balancete.totais.saldoDevedor)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtBV(balancete.totais.saldoCredor)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Indicador de equilíbrio (m4: <ul>/<li aria-label>) */}
      <div
        className={`flex flex-wrap items-center gap-4 rounded-lg border p-4 ${
          equilibrado
            ? 'border-success/40 bg-success/10'
            : 'border-destructive/40 bg-destructive/10'
        }`}
      >
        <span className={`font-semibold ${equilibrado ? 'text-success' : 'text-destructive'}`}>
          {equilibrado ? 'Balancete equilibrado' : 'Balancete desequilibrado'}
        </span>
        <ul className="flex flex-wrap gap-4 list-none p-0 m-0">
          <li
            aria-label="Movimento"
            className={eq.movimento ? 'text-success' : 'text-destructive'}
          >
            {eq.movimento ? '✓' : '✗'} Movimento
          </li>
          <li
            aria-label="Acumulado"
            className={eq.acumulado ? 'text-success' : 'text-destructive'}
          >
            {eq.acumulado ? '✓' : '✗'} Acumulado
          </li>
          <li
            aria-label="Saldos"
            className={eq.saldo ? 'text-success' : 'text-destructive'}
          >
            {eq.saldo ? '✓' : '✗'} Saldos
          </li>
        </ul>
      </div>

      {/* Avisos informativos */}
      {balancete.temAberturaImplicita && (
        <div className="rounded-lg border border-info/40 bg-info/10 p-3 text-sm text-info">
          Este balancete inclui <strong>abertura implícita</strong> dos saldos do exercício
          anterior (saldos de balanço aplicados conta a conta; resultados agregados na linha
          sintética quando existente).
        </div>
      )}
      {balancete.temResultadosAnterioresPorEncerrar && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Existem <strong>exercícios anteriores por encerrar</strong>: o resultado líquido dos
          exercícios anteriores está reflectido na linha sintética «Resultados de exercícios
          anteriores por encerrar».
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BalancetePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const rawParams = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );

  // Exercícios disponíveis para o selector (ordenados por codigo desc — mais recente primeiro)
  const exercicios = await runWithTenantContext(ctx, () => listarExercicios(ctx));

  // M3: estado vazio quando não há exercícios contabilísticos
  if (exercicios.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader
          title="Balancete de Verificação"
          breadcrumbs={[
            { label: 'Contabilidade', href: '/contabilidade' },
            { label: 'Balancete' },
          ]}
        />
        <div className="rounded-lg border p-8 text-center space-y-3">
          <p className="text-muted-foreground">Sem exercício contabilístico</p>
          <p className="text-sm text-muted-foreground">
            Para gerar o balancete é necessário ter pelo menos um exercício contabilístico aberto.
          </p>
          <Button asChild size="sm">
            <Link href="/contabilidade/exercicios/novo">Abrir exercício</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Período corrente por omissão (Africa/Maputo)
  const periodoFiscalAtual = periodoFiscalDe(new Date());
  const mesAtual = parseInt(periodoFiscalAtual.split('-')[1] ?? '12', 10);

  // MAJOR-2: resolver o exercício na página (três tiers, sem lançar NotFoundError)
  // NIT: tratar ?exercicio= (string vazia) como ausente
  const codigoPedido =
    typeof flat.exercicio === 'string' && flat.exercicio !== '' ? flat.exercicio : null;
  const agora = new Date();
  const ex =
    (codigoPedido ? exercicios.find((e) => e.codigo === codigoPedido) : undefined) ??
    exercicios.find((e) => e.dataInicio <= agora && agora <= e.dataFim) ??
    exercicios[0]!;

  // Aviso quando o código pedido não foi encontrado
  const exercicioNaoEncontrado = codigoPedido !== null && ex.codigo !== codigoPedido;

  // m1: usar FiltroBalanceteVerificacaoSchema com safeParse + fallback
  const parsedFiltro = FiltroBalanceteVerificacaoSchema.safeParse({
    exercicioId: ex.id,
    periodoInicial: flat.de,
    periodoFinal: flat.ate ?? mesAtual, // default = período corrente
    incluir13: flat.p13 === '1',
  });

  const rawFiltro: FiltroBalanceteVerificacaoInput = parsedFiltro.success
    ? parsedFiltro.data
    : {
        exercicioId: ex.id,
        periodoInicial: 1,
        periodoFinal: mesAtual,
        incluir13: false,
      };

  // MAJOR-1: clamp na página (espelhado no serviço) para header e selector
  const periodoFinalEfetivo = rawFiltro.incluir13
    ? rawFiltro.periodoFinal
    : Math.min(rawFiltro.periodoFinal, 12);
  const periodoInicialEfetivo = Math.min(rawFiltro.periodoInicial, periodoFinalEfetivo);

  const filtro: FiltroBalanceteVerificacaoInput = {
    ...rawFiltro,
    exercicioId: ex.id, // sempre o ID resolvido, nunca undefined
    periodoInicial: periodoInicialEfetivo,
    periodoFinal: periodoFinalEfetivo,
  };

  const deDesc = String(filtro.periodoInicial).padStart(2, '0');
  const ateDesc = String(filtro.periodoFinal).padStart(2, '0');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Balancete de Verificação"
        description={`Exercício ${ex.codigo} — períodos ${deDesc}..${ateDesc}`}
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

      {/* MAJOR-2: aviso quando o exercício pedido não existe */}
      {exercicioNaoEncontrado && (
        <div className="rounded-lg border border-info/40 bg-info/10 p-3 text-sm text-info">
          Exercício <strong>{codigoPedido}</strong> não encontrado — a mostrar{' '}
          <strong>{ex.codigo}</strong>
        </div>
      )}

      <SeletorBalanceteVerificacao
        exercicios={exercicios.map((e) => ({ id: e.id, codigo: e.codigo }))}
        exercicioAtual={ex.codigo}
        periodoInicial={filtro.periodoInicial}
        periodoFinal={filtro.periodoFinal}
        incluir13={filtro.incluir13}
      />

      {/* m2: gerarBalanceteVerificacao dentro do filho do Suspense */}
      <Suspense
        key={`${ex.codigo}-${filtro.periodoInicial}-${filtro.periodoFinal}-${filtro.incluir13}`}
        fallback={<TableSkeleton rows={12} cols={8} />}
      >
        <TabelaBalancete filtro={filtro} ctx={ctx} />
      </Suspense>
    </div>
  );
}
