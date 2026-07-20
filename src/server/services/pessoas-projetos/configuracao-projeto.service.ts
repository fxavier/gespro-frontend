import 'server-only';
import { prisma } from '@/server/db/client';
import { NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import type { UpdateConfiguracaoProjetoInput } from '@/lib/validations/projetos';

// ─────────────────────────────────────────────────────────────────────────────
// ConfiguracaoProjetoService
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  politicaAprovacaoTimesheet: 'MANUAL',
  tiposTarefaAtivos: ['TAREFA', 'BUG', 'MELHORIA', 'DOCUMENTACAO', 'TESTE'],
  papeisEquipaAtivos: ['GERENTE', 'LIDER', 'DESENVOLVEDOR', 'DESIGNER', 'ANALISTA', 'TESTER', 'OUTRO'],
};

export const ConfiguracaoProjetoService = {
  /**
   * Obtém a configuração de um projecto. Se não existir, retorna os defaults
   * (sem criar registo — lazy-create em actualizar).
   */
  async obter(projetoId: string, ctx: Ctx) {
    const projeto = await prisma.projeto.findFirst({
      where: { id: projetoId, tenantId: ctx.tenantId },
      select: { id: true, nome: true },
    });
    if (!projeto) throw new NotFoundError('Projecto não encontrado');

    const config = await prisma.configuracaoProjeto.findUnique({
      where: { projetoId },
    });

    return config ?? {
      id: null,
      tenantId: ctx.tenantId,
      projetoId,
      ...DEFAULTS,
      observacoes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },

  /**
   * Cria ou actualiza (upsert) a configuração de um projecto.
   */
  async actualizar(input: UpdateConfiguracaoProjetoInput, ctx: Ctx): Promise<void> {
    const projeto = await prisma.projeto.findFirst({
      where: { id: input.projetoId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!projeto) throw new NotFoundError('Projecto não encontrado');

    await prisma.configuracaoProjeto.upsert({
      where: { projetoId: input.projetoId },
      create: {
        tenantId: ctx.tenantId,
        projetoId: input.projetoId,
        politicaAprovacaoTimesheet: input.politicaAprovacaoTimesheet,
        tiposTarefaAtivos: input.tiposTarefaAtivos as string[],
        papeisEquipaAtivos: input.papeisEquipaAtivos as string[],
        observacoes: input.observacoes,
      },
      update: {
        politicaAprovacaoTimesheet: input.politicaAprovacaoTimesheet,
        tiposTarefaAtivos: input.tiposTarefaAtivos as string[],
        papeisEquipaAtivos: input.papeisEquipaAtivos as string[],
        observacoes: input.observacoes,
      },
    });
  },

  /**
   * Lista projectos com as suas configurações (para a página de configurações global).
   */
  async listarProjetos(ctx: Ctx) {
    const projetos = await prisma.projeto.findMany({
      where: { tenantId: ctx.tenantId, status: { not: 'ARQUIVADO' } },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        codigo: true,
        status: true,
        configuracao: {
          select: {
            politicaAprovacaoTimesheet: true,
            tiposTarefaAtivos: true,
            papeisEquipaAtivos: true,
          },
        },
      },
    });
    return projetos;
  },
};
