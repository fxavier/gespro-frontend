import 'server-only';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { NotFoundError } from '@/lib/errors';
import type { Ctx } from '../types';
import type { EstadoMovimento } from './reconciliacao.model';
import { obterMapaFecho } from './reconciliacao.service';

// ---------------------------------------------------------------------------
// Leituras do ecrã de reconciliação (ADR-0038, nó UI). Server Components chamam
// isto directamente, dentro de runWithTenantContext; nada aqui escreve.
// ---------------------------------------------------------------------------

/** O workspace mostra o trabalho por estado (RF §23), não por duas colunas. */
export const VISTAS = {
  excecoes: ['BANCO_SEM_CONTABILIZACAO', 'CONTABILIDADE_SEM_BANCO', 'DIFERENCA_VALOR', 'DIVERGENCIA'],
  transito: ['EM_TRANSITO', 'PENDENTE'],
  reconciliados: ['RECONCILIADO', 'RECONCILIADO_MANUALMENTE'],
  ignorados: ['IGNORADO'],
} as const satisfies Record<string, readonly EstadoMovimento[]>;
export type Vista = keyof typeof VISTAS | 'sugestoes';

const TAMANHO_PAGINA = 50;

export type ContagemPorEstado = Partial<Record<EstadoMovimento, number>>;

async function contagens(contaIds: string[], ctx: Ctx) {
  const where = { tenantId: ctx.tenantId, contaBancariaId: { in: contaIds } };
  const [bancos, contabs, sugestoes] = await Promise.all([
    prisma.movimentoBancario.groupBy({ by: ['contaBancariaId', 'estado'], where, _count: { _all: true } }),
    prisma.movimentoContabilistico.groupBy({ by: ['contaBancariaId', 'estado'], where, _count: { _all: true } }),
    prisma.correspondenciaBancaria.groupBy({
      by: ['contaBancariaId'],
      where: { ...where, confirmadaEm: null, revertida: false },
      _count: { _all: true },
    }),
  ]);
  const porConta = new Map<string, { banco: ContagemPorEstado; contabilidade: ContagemPorEstado; sugestoes: number }>();
  const de = (id: string) => {
    if (!porConta.has(id)) porConta.set(id, { banco: {}, contabilidade: {}, sugestoes: 0 });
    return porConta.get(id)!;
  };
  for (const g of bancos) de(g.contaBancariaId).banco[g.estado as EstadoMovimento] = g._count._all;
  for (const g of contabs) de(g.contaBancariaId).contabilidade[g.estado as EstadoMovimento] = g._count._all;
  for (const g of sugestoes) de(g.contaBancariaId).sugestoes = g._count._all;
  return (id: string) => porConta.get(id) ?? { banco: {}, contabilidade: {}, sugestoes: 0 };
}

/** Uma linha por conta bancária activa, com o que falta fazer em cada uma. */
export async function listarContasReconciliacao(ctx: Ctx) {
  const contas = await prisma.contaBancaria.findMany({
    where: { tenantId: ctx.tenantId, ativo: true },
    select: {
      id: true, banco: true, numeroConta: true, contaContabilId: true, toleranciaValor: true,
      contaContabil: { select: { codigo: true, nome: true } },
    },
    orderBy: [{ banco: 'asc' }, { numeroConta: 'asc' }],
  });
  const ids = contas.map((c) => c.id);
  const [contar, periodos] = await Promise.all([
    contagens(ids, ctx),
    prisma.periodoReconciliacao.findMany({
      where: { tenantId: ctx.tenantId, contaBancariaId: { in: ids }, estado: { in: ['ABERTO', 'EM_RECONCILIACAO'] } },
      select: { id: true, contaBancariaId: true, dataInicio: true, dataFim: true, estado: true },
    }),
  ]);
  const porPgc = new Map<string, number>();
  for (const c of contas) porPgc.set(c.contaContabilId, (porPgc.get(c.contaContabilId) ?? 0) + 1);
  return contas.map((c) => ({
    ...c,
    /** Duas contas na mesma conta PGC: o serviço recusa projectar e fechar (ADR-0038). */
    pgcPartilhada: (porPgc.get(c.contaContabilId) ?? 0) > 1,
    contagens: contar(c.id),
    periodoActivo: periodos.find((p) => p.contaBancariaId === c.id) ?? null,
  }));
}

export async function obterContaReconciliacao(contaBancariaId: string, ctx: Ctx) {
  const contas = await listarContasReconciliacao(ctx);
  const conta = contas.find((c) => c.id === contaBancariaId);
  if (!conta) throw new NotFoundError('Conta bancária não encontrada');
  return conta;
}

const selectBanco = {
  id: true, dataMovimento: true, dataValor: true, referencia: true, descricao: true,
  valor: true, natureza: true, estado: true, correspondenciaAtivaId: true, origem: true,
} as const;
const selectContab = {
  id: true, dataContabilistica: true, documento: true, referencia: true, descricao: true,
  valor: true, natureza: true, estado: true, correspondenciaAtivaId: true,
} as const;

/** Movimentos dos dois lados numa vista, cada lado paginado por cursor. */
export async function listarMovimentos(
  contaBancariaId: string,
  vista: keyof typeof VISTAS,
  cursores: { banco?: string; contabilidade?: string },
  ctx: Ctx,
) {
  const where = { tenantId: ctx.tenantId, contaBancariaId, estado: { in: [...VISTAS[vista]] } };
  const [bancarios, contabilisticos] = await Promise.all([
    paginate(
      (a) => prisma.movimentoBancario.findMany({ ...a, where, select: selectBanco, orderBy: [{ dataMovimento: 'desc' }, { id: 'desc' }] }),
      { cursor: cursores.banco, take: TAMANHO_PAGINA },
    ),
    paginate(
      (a) => prisma.movimentoContabilistico.findMany({ ...a, where, select: selectContab, orderBy: [{ dataContabilistica: 'desc' }, { id: 'desc' }] }),
      { cursor: cursores.contabilidade, take: TAMANHO_PAGINA },
    ),
  ]);
  return { bancarios, contabilisticos };
}

/** Sugestões do motor por confirmar, com a regra, a confiança e os dois lados. */
export async function listarSugestoes(contaBancariaId: string, cursor: string | undefined, ctx: Ctx) {
  return paginate(
    (a) =>
      prisma.correspondenciaBancaria.findMany({
        ...a,
        where: { tenantId: ctx.tenantId, contaBancariaId, confirmadaEm: null, revertida: false },
        select: {
          id: true, tipo: true, regra: true, confianca: true, diferencaValor: true, diferencaDias: true,
          valorBanco: true, valorContabilistico: true, createdAt: true,
          linhasBanco: { select: { movimentoBancario: { select: selectBanco } } },
          linhasContabilidade: { select: { movimentoContabilistico: { select: selectContab } } },
        },
        orderBy: [{ confianca: 'desc' }, { id: 'asc' }],
      }),
    { cursor, take: TAMANHO_PAGINA },
  );
}

export async function listarPeriodos(contaBancariaId: string, ctx: Ctx) {
  return prisma.periodoReconciliacao.findMany({
    where: { tenantId: ctx.tenantId, contaBancariaId },
    orderBy: { dataInicio: 'desc' },
  });
}

/** Os movimentos escolhidos para uma reconciliação manual — só os da conta e do tenant. */
export async function obterMovimentosEscolhidos(
  contaBancariaId: string,
  ids: { banco: string[]; contabilidade: string[] },
  ctx: Ctx,
) {
  const where = { tenantId: ctx.tenantId, contaBancariaId };
  const [bancarios, contabilisticos] = await Promise.all([
    prisma.movimentoBancario.findMany({ where: { ...where, id: { in: ids.banco } }, select: selectBanco }),
    prisma.movimentoContabilistico.findMany({ where: { ...where, id: { in: ids.contabilidade } }, select: selectContab }),
  ]);
  return { bancarios, contabilisticos };
}

/**
 * O mapa de fecho de um período (RF §17): GRAVADO se o período está fechado —
 * é o que foi aprovado, e não se recalcula — ou calculado agora se ainda está
 * em curso. A página e a exportação leem daqui, para mostrarem o mesmo.
 */
export async function obterFechoPeriodo(periodoId: string, ctx: Ctx) {
  const periodo = await prisma.periodoReconciliacao.findFirst({ where: { id: periodoId, tenantId: ctx.tenantId } });
  if (!periodo) throw new NotFoundError('Período de reconciliação não encontrado');
  if (periodo.estado === 'RECONCILIADO' || periodo.estado === 'CANCELADO') {
    return { periodo, mapa: periodo, aoVivo: false as const };
  }
  const { mapa } = await obterMapaFecho(periodoId, ctx);
  return { periodo, mapa, aoVivo: true as const };
}
