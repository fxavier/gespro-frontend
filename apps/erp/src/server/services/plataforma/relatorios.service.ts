/**
 * Serviço de agregação de relatórios (camada G/plataforma).
 *
 * Segue o padrão de `analytics.service.ts`: leitura por `prismaBase` SEMPRE
 * filtrada explicitamente por `tenantId` (isolamento multi-tenant) e envolvida
 * em `unstable_cache` por-tenant com `ANALYTICS_TAGS`. Read-only. Decimais
 * serializados como string (SC→CC).
 */
import 'server-only';
import { unstable_cache } from 'next/cache';
import { prismaBase } from '@/server/db/client';
import type { Ctx } from '@/server/services/types';
import { ANALYTICS_TAGS } from './analytics.interface';

const REVALIDATE = 60;

function dec(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return Number(String(v));
}
const fmt = (v: number) => v.toFixed(2);

// ---------------------------------------------------------------------------
// Relatório de Produção
// ---------------------------------------------------------------------------

export interface RelatorioProducao {
  totalOrdens: number;
  porStatus: { status: string; total: number }[];
  custoEstimadoTotal: string;
  custoRealizadoTotal: string;
  ordensConcluidas: number;
  /** Percentagem de ordens concluídas com qualidade aprovada. */
  taxaQualidade: string;
  progressoMedio: string;
}

export async function relatorioProducaoImpl(tenantId: string): Promise<RelatorioProducao> {
  const [grupos, agg, concluidas, qualidadeOk, progresso] = await Promise.all([
    prismaBase.ordemProducao.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    }),
    prismaBase.ordemProducao.aggregate({
      where: { tenantId },
      _sum: { custoEstimado: true, custoRealizado: true },
      _count: { _all: true },
    }),
    prismaBase.ordemProducao.count({ where: { tenantId, status: 'CONCLUIDA' } }),
    prismaBase.ordemProducao.count({
      where: { tenantId, status: 'CONCLUIDA', qualidadeAprovada: true },
    }),
    prismaBase.ordemProducao.aggregate({ where: { tenantId }, _avg: { progresso: true } }),
  ]);

  const taxaQualidade = concluidas > 0 ? (qualidadeOk / concluidas) * 100 : 0;

  return {
    totalOrdens: agg._count._all,
    porStatus: grupos
      .map((g) => ({ status: String(g.status), total: g._count._all }))
      .sort((a, b) => b.total - a.total),
    custoEstimadoTotal: fmt(dec(agg._sum.custoEstimado)),
    custoRealizadoTotal: fmt(dec(agg._sum.custoRealizado)),
    ordensConcluidas: concluidas,
    taxaQualidade: fmt(taxaQualidade),
    progressoMedio: fmt(dec(progresso._avg.progresso)),
  };
}

// ---------------------------------------------------------------------------
// Relatório de Clientes
// ---------------------------------------------------------------------------

export interface RelatorioClientes {
  totalClientes: number;
  clientesAtivos: number;
  dividaTotal: string;
  limiteTotal: string;
  porCategoria: { categoria: string; total: number }[];
  topDivida: { nome: string; codigo: string; divida: string }[];
}

export async function relatorioClientesImpl(tenantId: string): Promise<RelatorioClientes> {
  const [total, ativos, agg, grupos, top] = await Promise.all([
    prismaBase.cliente.count({ where: { tenantId, deletedAt: null } }),
    prismaBase.cliente.count({ where: { tenantId, deletedAt: null, status: 'ATIVO' } }),
    prismaBase.cliente.aggregate({
      where: { tenantId, deletedAt: null },
      _sum: { creditoUtilizadoMT: true, limiteCreditoMT: true },
    }),
    prismaBase.cliente.groupBy({
      by: ['categoria'],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    }),
    prismaBase.cliente.findMany({
      where: { tenantId, deletedAt: null, creditoUtilizadoMT: { gt: 0 } },
      select: { nome: true, codigo: true, creditoUtilizadoMT: true },
      orderBy: { creditoUtilizadoMT: 'desc' },
      take: 5,
    }),
  ]);

  return {
    totalClientes: total,
    clientesAtivos: ativos,
    dividaTotal: fmt(dec(agg._sum.creditoUtilizadoMT)),
    limiteTotal: fmt(dec(agg._sum.limiteCreditoMT)),
    porCategoria: grupos
      .map((g) => ({ categoria: String(g.categoria), total: g._count._all }))
      .sort((a, b) => b.total - a.total),
    topDivida: top.map((c) => ({
      nome: c.nome,
      codigo: c.codigo,
      divida: fmt(dec(c.creditoUtilizadoMT)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Serviço público (cache por-tenant)
// ---------------------------------------------------------------------------

export const relatoriosService = {
  relatorioProducao(ctx: Ctx) {
    return unstable_cache(relatorioProducaoImpl, ['relatorio-producao'], {
      tags: [ANALYTICS_TAGS.rh],
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },
  relatorioClientes(ctx: Ctx) {
    return unstable_cache(relatorioClientesImpl, ['relatorio-clientes'], {
      tags: [ANALYTICS_TAGS.vendas],
      revalidate: REVALIDATE,
    })(ctx.tenantId);
  },
};
