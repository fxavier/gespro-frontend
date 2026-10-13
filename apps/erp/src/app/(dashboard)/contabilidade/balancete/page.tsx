/**
 * Balancete de Verificação no modelo PHC — Server Component.
 *
 * URL: /contabilidade/balancete?exercicio=<codigo>&de=<ordem>&ate=<ordem>&p13=1
 *   S2: nivel=1..7, razao=1
 *   S3 (apresentação): ci, cf, classe=1..8, excluir=<códigos,>, zeradas=1, comSaldo=1,
 *   q, tipo=periodo|acumulado|ambos — inválidos são ignorados; nunca mudam «Totais».
 *   Os parâmetros lêem-se com `lerParametrosBalancete` (src/lib/balancete-params.ts),
 *   a mesma regra da exportação CSV/Excel (S5).
 *
 * ADR-0040, issues #280, #281, #283, #285.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Download, TriangleAlert } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  listarContas,
  listarExercicios,
  periodoFiscalDe,
} from '@/server/services/financas/contabilidade.service';
import { balanceteApresentado } from '@/server/services/financas/balancete-apresentado';
import {
  lerParametrosBalancete,
  queryBalancete,
  hrefRazaoPeriodos,
  type ParametrosBalancete,
} from '@/lib/balancete-params';
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
import type { LinhaHierarquica } from '@/server/services/financas/balancete-verificacao';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Formatação de valores (sem símbolo MT — parsePtNum do E2E espera números puros)
// ---------------------------------------------------------------------------

function fmtBV(d: Prisma.Decimal): string {
  if (d.isZero()) return '—'; // «—»
  return formatNumero(d.toString());
}

// ---------------------------------------------------------------------------
// S3: filtros de apresentação na forma que o selector usa
// ---------------------------------------------------------------------------

/** Os filtros de apresentação na forma do selector (texto, como no URL). */
function filtrosDoSelector(p: ParametrosBalancete): FiltrosApresentacao {
  const f = p.filtros;
  return {
    contaInicial: f.contaInicial ?? '',
    contaFinal: f.contaFinal ?? '',
    classe: f.classe ? f.classe.slice(-1) : '',
    excluir: (f.excluir ?? []).join(','),
    zeradas: p.opcoesHierarquia.incluirSemMovimento === true,
    comSaldo: f.apenasComSaldo === true,
    pesquisa: f.pesquisa ?? '',
    tipo: p.tipo.toLowerCase() as TipoApresentacao,
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

/**
 * Código da conta; numa folha (aceita lançamentos, não é contexto) é a ligação para
 * o razão da conta no intervalo mostrado (S4). Mães, subtotais e sintética não têm.
 */
function codigoConta({ codigo, nome, href }: { codigo: string; nome: string; href: string | null }) {
  if (!href) return codigo;
  return (
    <Link href={href} aria-label={`Razão da conta ${codigo} — ${nome}`} className="rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {codigo}
    </Link>
  );
}

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
  params,
  ctx,
}: {
  params: ParametrosBalancete;
  ctx: { tenantId: string; userId: string };
}) {
  const filtro = params.filtroServico;
  // Consulta → hierarquia → filtros: o mesmo caminho da exportação (S5). Filtros são
  // apresentação: totais, igualdades e subtotais vêm do balancete completo.
  const { balancete, linhas: linhasHierarquicas } = await runWithTenantContext(ctx, () =>
    balanceteApresentado(params, ctx),
  );
  // S4 + #297: drill-down para o razão por intervalo de períodos (não datas livres).
  const hrefRazao = (contaId: string): string =>
    hrefRazaoPeriodos(contaId, params.exercicio.codigo, {
      periodoInicial: filtro.periodoInicial,
      periodoFinal: filtro.periodoFinal,
      incluir13: filtro.incluir13,
    });
  const eq = balancete.equilibrio;
  const equilibrado = eq.movimento && eq.acumulado && eq.saldo;

  const tipo = params.tipo.toLowerCase() as TipoApresentacao;

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
                  <td className={cn(TD, 'font-mono text-primary')}>
                    {codigoConta({
                      codigo: conta.codigo,
                      nome: conta.nome,
                      href: conta.aceitaLancamento && !linha.contexto ? hrefRazao(conta.id) : null,
                    })}
                  </td>
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

  // Exercícios disponíveis para o selector (ordenados por codigo desc — mais recente primeiro)
  const [exercicios, contasNivel1] = await runWithTenantContext(ctx, () =>
    Promise.all([listarExercicios(ctx), listarContas({ nivel: 1, take: 50 }, ctx)]),
  );

  // Período corrente por omissão (Africa/Maputo)
  const periodoFiscalAtual = periodoFiscalDe(new Date());
  const mesAtual = parseInt(periodoFiscalAtual.split('-')[1] ?? '12', 10);

  // Exercício, períodos, hierarquia, filtros e tipo — a regra partilhada com a exportação.
  const params = lerParametrosBalancete(rawParams, { exercicios, mesAtual });

  // M3: estado vazio quando não há exercícios contabilísticos
  if ('semExercicio' in params) {
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

  const ex = params.exercicio;
  const codigoPedido = params.codigoPedidoNaoEncontrado;
  const filtro = params.filtroServico;
  const apresentacao = filtrosDoSelector(params);

  // S5: exportação com os parâmetros normalizados que a página está a mostrar.
  const hrefExportar = (formato: 'csv' | 'xlsx' | 'pdf') => {
    const q = queryBalancete(params);
    q.set('formato', formato);
    return `/api/contabilidade/balancete/export?${q.toString()}`;
  };

  // Opções do Select «Classe» (nome da conta de nível 1).
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
          <div className="flex flex-wrap gap-2">
            {/* `download` sem valor: o nome do ficheiro vem do Content-Disposition. */}
            <Button asChild size="sm" variant="outline">
              <a href={hrefExportar('csv')} download>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Exportar CSV
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={hrefExportar('xlsx')} download>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Exportar Excel
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={hrefExportar('pdf')} download>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                Exportar PDF
              </a>
            </Button>
          </div>
        }
      />

      {/* MAJOR-2: aviso quando o exercício pedido não existe */}
      {codigoPedido !== null && (
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
        nivelAtual={params.opcoesHierarquia.nivelMaximo}
        razaoAtual={params.opcoesHierarquia.apenasRazao === true}
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
        <TabelaBalancete params={params} ctx={ctx} />
      </Suspense>
    </div>
  );
}
