/**
 * Balancete de Verificação no modelo PHC — Server Component.
 *
 * URL: /contabilidade/balancete?exercicio=<codigo>&de=<ordem>&ate=<ordem>&p13=1
 *   S2: nivel=1..7, razao=1
 *   S3 (apresentação): ci, cf, classe=1..8, excluir=<códigos,>, zeradas=1, comSaldo=1,
 *   q, tipo=periodo|acumulado|ambos — inválidos são ignorados; nunca mudam «Totais».
 *
 * ADR-0040, issues #280, #281, #283.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  gerarBalanceteVerificacao,
  listarContas,
  listarExercicios,
  periodoFiscalDe,
} from '@/server/services/financas/contabilidade.service';
import {
  FiltroBalanceteVerificacaoSchema,
  codigoContaPGCValido,
} from '@/lib/validations/contabilidade';
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
import { cn } from '@/lib/utils';
import {
  SeletorBalanceteVerificacao,
  type FiltrosApresentacao,
  type TipoApresentacao,
} from './_components/seletor-balancete-verificacao';
import {
  filtrarBalancete,
  hierarquizarBalancete,
  type FiltrosBalancete,
  type LinhaHierarquica,
} from '@/server/services/financas/balancete-verificacao';
import type { FiltroBalanceteVerificacaoInput } from '@/server/services/financas/contabilidade.interface';
import type { ClassePGC, Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Formatação de valores (sem símbolo MT — parsePtNum do E2E espera números puros)
// ---------------------------------------------------------------------------

function fmtBV(d: Prisma.Decimal): string {
  if (d.isZero()) return '—'; // «—»
  return formatNumero(d.toString());
}

// ---------------------------------------------------------------------------
// S3: filtros de apresentação a partir do URL (inválidos → ignorados)
// ---------------------------------------------------------------------------

function lerFiltros(flat: Record<string, string | undefined>): FiltrosApresentacao {
  const texto = (v: string | undefined) => (v ?? '').trim();
  const codigo = (v: string | undefined) => (codigoContaPGCValido(texto(v)) ? texto(v) : '');
  const classe = texto(flat.classe);
  const tipo = texto(flat.tipo);
  return {
    contaInicial: codigo(flat.ci),
    contaFinal: codigo(flat.cf),
    classe: /^[1-8]$/.test(classe) ? classe : '',
    excluir: texto(flat.excluir).split(',').map((c) => c.trim()).filter(codigoContaPGCValido).join(','),
    zeradas: flat.zeradas === '1',
    comSaldo: flat.comSaldo === '1',
    pesquisa: texto(flat.q).slice(0, 100),
    tipo: tipo === 'periodo' || tipo === 'acumulado' ? tipo : 'ambos',
  };
}

function paraFiltrosBalancete(f: FiltrosApresentacao): FiltrosBalancete {
  return {
    contaInicial: f.contaInicial || undefined,
    contaFinal: f.contaFinal || undefined,
    classe: f.classe ? (`CLASSE_${f.classe}` as ClassePGC) : undefined,
    excluir: f.excluir ? f.excluir.split(',') : undefined,
    apenasComSaldo: f.comSaldo || undefined,
    pesquisa: f.pesquisa || undefined,
  };
}

/*
 * Linhas do corpo em <tr>/<td> nativos, com as classes de `ui/table`: com «Ver contas
 * sem movimento e saldo» são centenas de linhas, e cada componente servidor por célula
 * leva ao payload RSC a sua informação de depuração (≈ 11 KB por linha em dev).
 */
const TR = 'border-b transition-colors hover:bg-accent/40 data-[state=selected]:bg-accent/60';
const TD = 'p-4 align-middle';
const TD_NUM = `${TD} text-right tabular-nums`;

type ValoresLinha = Pick<
  LinhaHierarquica,
  'movD' | 'movC' | 'acumD' | 'acumC' | 'saldoDevedor' | 'saldoCredor' | 'contraNatureza'
>;

/** Células de valor de uma linha, segundo o tipo de apresentação (Saldo sempre). */
function celulasValor(linha: ValoresLinha, tipo: TipoApresentacao, saldoClassName = '') {
  const saldo = (d: Prisma.Decimal, chave: string) => {
    const aviso = linha.contraNatureza && !d.isZero();
    return (
      <td key={chave} className={cn(TD_NUM, saldoClassName, aviso && 'text-warning')}>
        {aviso && (
          <span
            role="img"
            aria-label="Saldo contra natureza"
            title="Saldo contra natureza"
            className="mr-1 inline-flex align-[-2px]"
          >
            <TriangleAlert aria-hidden="true" className="size-3.5" />
          </span>
        )}
        {fmtBV(d)}
      </td>
    );
  };
  return [
    ...(tipo !== 'acumulado'
      ? [
          <td key="movD" className={TD_NUM}>{fmtBV(linha.movD)}</td>,
          <td key="movC" className={TD_NUM}>{fmtBV(linha.movC)}</td>,
        ]
      : []),
    ...(tipo !== 'periodo'
      ? [
          <td key="acumD" className={TD_NUM}>{fmtBV(linha.acumD)}</td>,
          <td key="acumC" className={TD_NUM}>{fmtBV(linha.acumC)}</td>,
        ]
      : []),
    saldo(linha.saldoDevedor, 'sD'),
    saldo(linha.saldoCredor, 'sC'),
  ];
}

// ---------------------------------------------------------------------------
// Secção da tabela (componente async — faz a fetch dentro do Suspense, m2)
// ---------------------------------------------------------------------------

async function TabelaBalancete({
  filtro,
  ctx,
  nivel,
  razao,
  apresentacao,
}: {
  filtro: FiltroBalanceteVerificacaoInput;
  ctx: { tenantId: string; userId: string };
  nivel?: number;
  razao?: boolean;
  apresentacao: FiltrosApresentacao;
}) {
  const balancete = await runWithTenantContext(ctx, () =>
    gerarBalanceteVerificacao(filtro, ctx),
  );
  const eq = balancete.equilibrio;
  const equilibrado = eq.movimento && eq.acumulado && eq.saldo;

  // Filtros são apresentação: totais, igualdades e subtotais vêm do balancete completo.
  const tipo = apresentacao.tipo;
  const linhasHierarquicas = filtrarBalancete(
    hierarquizarBalancete(balancete, balancete.contas, {
      nivelMaximo: nivel,
      apenasRazao: razao,
      incluirSemMovimento: apresentacao.zeradas,
    }),
    paraFiltrosBalancete(apresentacao),
  );

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
              {tipo !== 'acumulado' && (
                <TableHead colSpan={2} className="text-center border-r">
                  Movimento do período
                </TableHead>
              )}
              {tipo !== 'periodo' && (
                <TableHead colSpan={2} className="text-center border-r">
                  Acumulado
                </TableHead>
              )}
              <TableHead colSpan={2} className="text-center">
                Saldo
              </TableHead>
            </TableRow>
            <TableRow>
              {Array.from({ length: tipo === 'ambos' ? 2 : 1 }, (_, i) => [
                <TableHead key={`d${i}`} className="text-right tabular-nums">Débito</TableHead>,
                <TableHead key={`c${i}`} className="text-right tabular-nums border-r">Crédito</TableHead>,
              ])}
              <TableHead className="text-right tabular-nums">Devedor</TableHead>
              <TableHead className="text-right tabular-nums">Credor</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {linhasHierarquicas.map((linha, idx) => {
              if (linha.tipo === 'SUBTOTAL_CLASSE') {
                return (
                  <tr key={`sub-${linha.classe}`} data-tipo="subtotal" className={cn(TR, 'font-semibold bg-muted/30')}>
                    <td className={TD}></td>
                    <td className={TD}>Total da classe {linha.classe.slice(-1)}</td>
                    {celulasValor(linha, tipo)}
                  </tr>
                );
              }

              if (linha.tipo === 'SINTETICA') {
                return (
                  <tr key={`sintetica-${idx}`} data-tipo="sintetica" className={cn(TR, 'italic text-muted-foreground')}>
                    <td className={TD}></td>
                    <td className={TD}>
                      Resultados de exercícios anteriores por encerrar
                      <span className="ml-2 text-xs text-muted-foreground">(implícita)</span>
                    </td>
                    {celulasValor(linha, tipo, 'font-semibold')}
                  </tr>
                );
              }

              // CONTA — linha.conta sempre definida
              if (!linha.conta) return null;
              const conta = linha.conta;
              return (
                <tr
                  key={conta.id}
                  data-nivel={String(linha.nivel)}
                  data-contexto={linha.contexto ? '1' : undefined}
                  className={cn(
                    TR,
                    linha.agregadora && 'font-semibold',
                    linha.contexto && 'text-muted-foreground',
                  )}
                >
                  <td className={cn(TD, 'font-mono text-primary')}>{conta.codigo}</td>
                  <td className={TD} style={{ paddingLeft: `calc(1rem + ${linha.profundidade * 1.25}rem)` }}>
                    {conta.nome}
                  </td>
                  {celulasValor(linha, tipo, 'font-semibold')}
                </tr>
              );
            })}
          </TableBody>

          <TableFooter>
            <TableRow className="font-bold">
              <TableCell colSpan={2}>Totais</TableCell>
              {celulasValor({ ...balancete.totais, contraNatureza: false }, tipo)}
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
  const [exercicios, contasNivel1] = await runWithTenantContext(ctx, () =>
    Promise.all([listarExercicios(ctx), listarContas({ nivel: 1, take: 50 }, ctx)]),
  );

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

  // S2: nível e razão (só apresentação — não afectam a query)
  const nivelRaw = typeof flat.nivel === 'string' ? parseInt(flat.nivel, 10) : NaN;
  const nivel = !isNaN(nivelRaw) && nivelRaw >= 1 && nivelRaw <= 7 ? nivelRaw : undefined;
  const razao = flat.razao === '1';

  // S3: filtros de apresentação e opções do Select «Classe» (nome da conta de nível 1).
  const apresentacao = lerFiltros(flat);
  const classes = Array.from({ length: 8 }, (_, i) => {
    const n = String(i + 1);
    // O seed nomeia o nível 1 «Classe N — <nome>»: o prefixo sai para não repetir o número.
    const nome = contasNivel1.items
      .find((c) => c.classe === `CLASSE_${n}`)
      ?.nome.replace(/^Classe\s+\d+\s*[—–-]\s*/i, '')
      .trim();
    return { value: n, label: nome ? `${n} — ${nome}` : `Classe ${n}` };
  });

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
        nivelAtual={nivel}
        razaoAtual={razao}
        classes={classes}
        filtrosAtuais={apresentacao}
      />

      {/* m2: gerarBalanceteVerificacao dentro do filho do Suspense. A key é só a consulta
          (exercício, períodos, p13): mudar a apresentação (grau, razão, filtros S3) é uma
          navegação em transição — a tabela actual fica até a nova estar pronta. */}
      <Suspense
        key={`${ex.codigo}-${filtro.periodoInicial}-${filtro.periodoFinal}-${filtro.incluir13}`}
        fallback={<TableSkeleton rows={12} cols={apresentacao.tipo === 'ambos' ? 8 : 6} />}
      >
        <TabelaBalancete
          filtro={filtro}
          ctx={ctx}
          nivel={nivel}
          razao={razao}
          apresentacao={apresentacao}
        />
      </Suspense>
    </div>
  );
}
