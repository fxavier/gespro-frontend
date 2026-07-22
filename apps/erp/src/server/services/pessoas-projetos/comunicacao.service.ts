import 'server-only';
import { prisma } from '@/server/db/client';
import { NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import type {
  CreateComunicacaoInput,
  FilterComunicacaoInput,
} from '@/lib/validations/projetos';

// ─────────────────────────────────────────────────────────────────────────────
// ComunicacaoService — atas append-only
// ─────────────────────────────────────────────────────────────────────────────

export const ComunicacaoService = {
  /**
   * Regista uma comunicação de projecto (ata, reunião, decisão, etc.).
   * Documentos append-only: não se editam nem apagam (soft delete apenas para
   * remoção administrativa, nunca para correcção).
   */
  async registar(input: CreateComunicacaoInput, ctx: Ctx): Promise<{ id: string }> {
    const projeto = await prisma.projeto.findFirst({
      where: { id: input.projetoId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!projeto) throw new NotFoundError('Projecto não encontrado');

    const comunicacao = await prisma.comunicacaoProjeto.create({
      data: {
        tenantId: ctx.tenantId,
        projetoId: input.projetoId,
        tipo: input.tipo as never,
        data: input.data,
        participantes: input.participantes,
        resumo: input.resumo,
      },
      select: { id: true },
    });
    return { id: comunicacao.id };
  },

  async listar(filter: FilterComunicacaoInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.comunicacaoProjeto.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            ...(filter.projetoId ? { projetoId: filter.projetoId } : {}),
            ...(filter.tipo ? { tipo: filter.tipo as never } : {}),
            ...(filter.dataInicio ? { data: { gte: filter.dataInicio } } : {}),
            ...(filter.dataFim ? { data: { lte: filter.dataFim } } : {}),
          },
          orderBy: { data: 'desc' },
          select: {
            id: true,
            tipo: true,
            data: true,
            participantes: true,
            resumo: true,
            projetoId: true,
            createdAt: true,
          },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const comunicacao = await prisma.comunicacaoProjeto.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      include: {
        projeto: { select: { id: true, nome: true, codigo: true } },
      },
    });
    if (!comunicacao) throw new NotFoundError('Comunicação não encontrada');
    return comunicacao;
  },

  async kpis(ctx: Ctx) {
    const [total, reunioes, atas] = await Promise.all([
      prisma.comunicacaoProjeto.count({
        where: { tenantId: ctx.tenantId, deletedAt: null },
      }),
      prisma.comunicacaoProjeto.count({
        where: { tenantId: ctx.tenantId, deletedAt: null, tipo: 'REUNIAO' },
      }),
      prisma.comunicacaoProjeto.count({
        where: { tenantId: ctx.tenantId, deletedAt: null, tipo: 'ATA' },
      }),
    ]);
    return { total, reunioes, atas };
  },
};
