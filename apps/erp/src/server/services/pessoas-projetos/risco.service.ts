import 'server-only';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import { transitar } from './rh.service';
import { TRANSICOES_RISCO } from '@/lib/state-machines';
import type {
  CreateRiscoInput,
  UpdateRiscoInput,
  FilterRiscoInput,
} from '@/lib/validations/projetos';

// ─────────────────────────────────────────────────────────────────────────────
// Cálculo de Severidade — função pura (testável sem DB)
// Matriz probabilidade × impacto (1-4) → severidade 1-16
// ─────────────────────────────────────────────────────────────────────────────

const PROB_PESO: Record<string, number> = {
  BAIXA: 1,
  MEDIA: 2,
  ALTA: 3,
  MUITO_ALTA: 4,
};

const IMPACTO_PESO: Record<string, number> = {
  BAIXO: 1,
  MEDIO: 2,
  ALTO: 3,
  MUITO_ALTO: 4,
};

/**
 * Deriva a severidade do risco a partir da probabilidade e do impacto.
 * Resultado: 1 (mínimo) a 16 (máximo).
 * Função pura exportada para testes de propriedade.
 */
export function calcularSeveridade(
  probabilidade: string,
  impacto: string,
): number {
  const prob = PROB_PESO[probabilidade];
  const imp = IMPACTO_PESO[impacto];
  if (!prob || !imp) {
    throw new BusinessRuleError('SEVERIDADE_INVALIDA', 'Probabilidade ou impacto inválido');
  }
  return prob * imp;
}

/**
 * Classifica a severidade em categoria textual.
 */
export function classificarSeveridade(severidade: number): 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO' {
  if (severidade <= 2) return 'BAIXO';
  if (severidade <= 6) return 'MEDIO';
  if (severidade <= 12) return 'ALTO';
  return 'CRITICO';
}

// ─────────────────────────────────────────────────────────────────────────────
// RiscoService
// ─────────────────────────────────────────────────────────────────────────────

export const RiscoService = {
  async criar(input: CreateRiscoInput, ctx: Ctx): Promise<{ id: string }> {
    // Verificar que o projecto pertence ao tenant
    const projeto = await prisma.projeto.findFirst({
      where: { id: input.projetoId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!projeto) throw new NotFoundError('Projecto não encontrado');

    // Severidade derivada no serviço — nunca aceite do cliente
    const severidade = calcularSeveridade(input.probabilidade, input.impacto);

    const risco = await prisma.riscoProjeto.create({
      data: {
        tenantId: ctx.tenantId,
        projetoId: input.projetoId,
        titulo: input.titulo,
        descricao: input.descricao,
        probabilidade: input.probabilidade as never,
        impacto: input.impacto as never,
        severidade,
        estrategiaResposta: input.estrategiaResposta as never,
        responsavelId: input.responsavelId,
        status: 'IDENTIFICADO',
        planoMitigacao: input.planoMitigacao,
      },
      select: { id: true },
    });
    return { id: risco.id };
  },

  async actualizar(id: string, input: UpdateRiscoInput, ctx: Ctx): Promise<void> {
    const existente = await prisma.riscoProjeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, probabilidade: true, impacto: true, status: true },
    });
    if (!existente) throw new NotFoundError('Risco não encontrado');
    if (existente.status === 'FECHADO') {
      throw new BusinessRuleError('RISCO_FECHADO', 'Não é possível editar um risco fechado');
    }

    // Recalcular severidade se probabilidade ou impacto mudaram
    const novaProbabilidade = (input.probabilidade ?? existente.probabilidade) as string;
    const novoImpacto = (input.impacto ?? existente.impacto) as string;
    const severidade = calcularSeveridade(novaProbabilidade, novoImpacto);

    await prisma.riscoProjeto.update({
      where: { id },
      data: {
        titulo: input.titulo,
        descricao: input.descricao,
        probabilidade: input.probabilidade as never,
        impacto: input.impacto as never,
        severidade,
        estrategiaResposta: input.estrategiaResposta as never,
        responsavelId: input.responsavelId,
        planoMitigacao: input.planoMitigacao,
      },
    });
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const risco = await prisma.riscoProjeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!risco) throw new NotFoundError('Risco não encontrado');

    transitar(TRANSICOES_RISCO, risco.status, novoStatus);

    await prisma.riscoProjeto.update({
      where: { id },
      data: { status: novoStatus as never },
    });
  },

  async listar(filter: FilterRiscoInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.riscoProjeto.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.projetoId ? { projetoId: filter.projetoId } : {}),
            ...(filter.status ? { status: filter.status as never } : {}),
            ...(filter.probabilidade ? { probabilidade: filter.probabilidade as never } : {}),
            ...(filter.impacto ? { impacto: filter.impacto as never } : {}),
            ...(filter.search
              ? { titulo: { contains: filter.search, mode: 'insensitive' as const } }
              : {}),
          },
          orderBy: [{ severidade: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            titulo: true,
            probabilidade: true,
            impacto: true,
            severidade: true,
            estrategiaResposta: true,
            status: true,
            responsavelId: true,
            projetoId: true,
            createdAt: true,
          },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const risco = await prisma.riscoProjeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        projeto: { select: { id: true, nome: true, codigo: true } },
      },
    });
    if (!risco) throw new NotFoundError('Risco não encontrado');
    return risco;
  },

  /**
   * Dados para a matriz de risco (probabilidade × impacto).
   * Agrupa riscos por probabilidade e impacto, contando por célula.
   */
  async matrizRisco(projetoId: string, ctx: Ctx) {
    const riscos = await prisma.riscoProjeto.findMany({
      where: { projetoId, tenantId: ctx.tenantId, status: { not: 'FECHADO' } },
      select: {
        id: true,
        titulo: true,
        probabilidade: true,
        impacto: true,
        severidade: true,
        status: true,
      },
    });
    return riscos;
  },

  /**
   * KPIs de riscos para o painel de relatórios.
   */
  async kpis(ctx: Ctx) {
    const [total, abertos, materializados, criticos] = await Promise.all([
      prisma.riscoProjeto.count({ where: { tenantId: ctx.tenantId } }),
      prisma.riscoProjeto.count({
        where: { tenantId: ctx.tenantId, status: { in: ['IDENTIFICADO', 'EM_MITIGACAO'] } },
      }),
      prisma.riscoProjeto.count({
        where: { tenantId: ctx.tenantId, status: 'MATERIALIZADO' },
      }),
      prisma.riscoProjeto.count({
        where: { tenantId: ctx.tenantId, severidade: { gte: 12 } },
      }),
    ]);
    return { total, abertos, materializados, criticos };
  },
};
