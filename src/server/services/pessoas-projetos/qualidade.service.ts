import 'server-only';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import { transitar } from './rh.service';
import { TRANSICOES_QUALIDADE } from '@/lib/state-machines';
import type {
  CreateQualidadeInput,
  UpdateQualidadeInput,
  FilterQualidadeInput,
} from '@/lib/validations/projetos';

// ─────────────────────────────────────────────────────────────────────────────
// QualidadeService
// ─────────────────────────────────────────────────────────────────────────────

export const QualidadeService = {
  async criar(input: CreateQualidadeInput, ctx: Ctx): Promise<{ id: string }> {
    const projeto = await prisma.projeto.findFirst({
      where: { id: input.projetoId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!projeto) throw new NotFoundError('Projecto não encontrado');

    const registo = await prisma.registoQualidade.create({
      data: {
        tenantId: ctx.tenantId,
        projetoId: input.projetoId,
        tarefaId: input.tarefaId,
        marcoId: input.marcoId,
        tipo: input.tipo as never,
        descricao: input.descricao,
        acaoCorretiva: input.acaoCorretiva,
        status: 'ABERTA',
        responsavelId: input.responsavelId,
      },
      select: { id: true },
    });
    return { id: registo.id };
  },

  async actualizar(id: string, input: UpdateQualidadeInput, ctx: Ctx): Promise<void> {
    const existente = await prisma.registoQualidade.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!existente) throw new NotFoundError('Registo de qualidade não encontrado');
    if (existente.status === 'FECHADA') {
      throw new BusinessRuleError('QUALIDADE_FECHADA', 'Não é possível editar um registo fechado');
    }

    await prisma.registoQualidade.update({
      where: { id },
      data: {
        tipo: input.tipo as never,
        descricao: input.descricao,
        acaoCorretiva: input.acaoCorretiva,
        responsavelId: input.responsavelId,
        tarefaId: input.tarefaId,
        marcoId: input.marcoId,
      },
    });
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const registo = await prisma.registoQualidade.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!registo) throw new NotFoundError('Registo de qualidade não encontrado');

    transitar(TRANSICOES_QUALIDADE, registo.status, novoStatus);

    await prisma.registoQualidade.update({
      where: { id },
      data: { status: novoStatus as never },
    });
  },

  async listar(filter: FilterQualidadeInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.registoQualidade.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.projetoId ? { projetoId: filter.projetoId } : {}),
            ...(filter.status ? { status: filter.status as never } : {}),
            ...(filter.tipo ? { tipo: filter.tipo as never } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            tipo: true,
            descricao: true,
            status: true,
            acaoCorretiva: true,
            responsavelId: true,
            projetoId: true,
            tarefaId: true,
            marcoId: true,
            createdAt: true,
          },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const registo = await prisma.registoQualidade.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        projeto: { select: { id: true, nome: true, codigo: true } },
      },
    });
    if (!registo) throw new NotFoundError('Registo de qualidade não encontrado');
    return registo;
  },

  async kpis(ctx: Ctx) {
    const [total, abertas, resolvidas, emAnalise] = await Promise.all([
      prisma.registoQualidade.count({ where: { tenantId: ctx.tenantId } }),
      prisma.registoQualidade.count({ where: { tenantId: ctx.tenantId, status: 'ABERTA' } }),
      prisma.registoQualidade.count({ where: { tenantId: ctx.tenantId, status: 'RESOLVIDA' } }),
      prisma.registoQualidade.count({ where: { tenantId: ctx.tenantId, status: 'EM_ANALISE' } }),
    ]);
    return { total, abertas, resolvidas, emAnalise };
  },
};
