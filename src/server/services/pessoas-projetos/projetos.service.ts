import 'server-only';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import {
  TRANSICOES_PROJETO,
  TRANSICOES_TAREFA,
  TRANSICOES_MARCO,
  TRANSICOES_ORCAMENTO,
} from './projetos.interface';
import { transitar } from './rh.service';
import type {
  CreateProjetoInput,
  UpdateProjetoInput,
  FilterProjetoInput,
  CreateTarefaInput,
  UpdateTarefaInput,
  FilterTarefaInput,
  ReordenarTarefaInput,
  CreateTimesheetInput,
  FilterTimesheetInput,
  CreateMarcoInput,
  CreateOrcamentoProjetoInput,
  CreateEquipaInput,
  UpdateEquipaInput,
  AddMembroEquipaInput,
  FilterEquipaInput,
} from '@/lib/validations/projetos';

// ─────────────────────────────────────────────────────────────────────────────
// Utilitário: chave fraccional para kanban (N4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcula o ponto médio entre duas posições fraccionais (string decimal simples).
 * Invariante: se a < b, então a < midpoint(a,b) < b (ordem total preservada).
 * Exportado para testes.
 */
export function calcularMidpoint(a: string, b: string): string {
  const aNum = a === '' ? 0 : parseFloat(a);
  const bNum = b === '' ? 1 : parseFloat(b);
  if (isNaN(aNum) || isNaN(bNum)) throw new Error('Posição fraccional inválida');
  if (aNum >= bNum) throw new Error(`Posição A (${a}) deve ser menor que B (${b})`);
  const mid = (aNum + bNum) / 2;
  // 8 casas decimais → suficiente para ~10^8 inserções antes de colapsar
  return mid.toFixed(8).replace(/\.?0+$/, '') || '0.5';
}

/**
 * Calcula a posição de inserção num board kanban.
 * - Inserir no início: calcularPosicaoKanban(undefined, posicaoPrimeira)
 * - Inserir no fim:    calcularPosicaoKanban(posicaoUltima, undefined)
 * - Inserir entre A e B: calcularPosicaoKanban(A, B)
 */
export function calcularPosicaoKanban(antes?: string, depois?: string): string {
  const a = antes ?? '0';
  const b = depois ?? String(parseFloat(a || '0') + 1);
  return calcularMidpoint(a, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// EquipaService
// ─────────────────────────────────────────────────────────────────────────────

export const EquipaService = {
  async listar(filter: FilterEquipaInput, ctx: Ctx) {
    return paginate(
      (args) =>
        prisma.equipa.findMany({
          ...args,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.search
              ? { nome: { contains: filter.search, mode: 'insensitive' as const } }
              : {}),
          },
          include: { _count: { select: { membros: true } } },
          orderBy: { nome: 'asc' },
        }),
      { cursor: filter.cursor, take: filter.take }
    );
  },

  async criar(input: CreateEquipaInput, ctx: Ctx): Promise<{ id: string }> {
    const equipa = await prisma.equipa.create({
      data: {
        tenantId: ctx.tenantId,
        nome: input.nome,
        descricao: input.descricao,
        status: input.status ?? 'ATIVA',
      },
      select: { id: true },
    });
    return { id: equipa.id };
  },

  async actualizar(id: string, input: UpdateEquipaInput, ctx: Ctx): Promise<void> {
    const existente = await prisma.equipa.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Equipa não encontrada');
    await prisma.equipa.update({ where: { id }, data: { nome: input.nome, descricao: input.descricao, status: input.status } });
  },

  async adicionarMembro(input: AddMembroEquipaInput, ctx: Ctx): Promise<{ id: string }> {
    const membro = await prisma.membroEquipa.create({
      data: {
        tenantId: ctx.tenantId,
        equipaId: input.equipaId,
        colaboradorId: input.colaboradorId,
        papel: input.papel,
        custoHora: input.custoHora,
        horasSemanais: input.horasSemanais,
        dataEntrada: input.dataEntrada,
        status: 'ATIVO',
      },
      select: { id: true },
    });
    return { id: membro.id };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ProjetoService
// ─────────────────────────────────────────────────────────────────────────────

export const ProjetoService = {
  async criar(input: CreateProjetoInput, ctx: Ctx): Promise<{ id: string }> {
    const projeto = await prisma.projeto.create({
      data: {
        tenantId: ctx.tenantId,
        codigo: input.codigo,
        nome: input.nome,
        descricao: input.descricao,
        clienteId: input.clienteId,
        tipo: input.tipo,
        status: 'PLANEAMENTO',
        prioridade: input.prioridade ?? 'MEDIA',
        dataInicio: input.dataInicio,
        dataFimPrevista: input.dataFimPrevista,
        orcamentoPlanejado: input.orcamentoPlanejado,
        horasEstimadas: input.horasEstimadas,
        gerenteId: input.gerenteId,
        tags: input.tags ?? [],
        cor: input.cor,
        observacoes: input.observacoes,
      },
      select: { id: true },
    });
    return { id: projeto.id };
  },

  async actualizar(id: string, input: UpdateProjetoInput, ctx: Ctx): Promise<void> {
    const existente = await prisma.projeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!existente) throw new NotFoundError('Projecto não encontrado');
    if (existente.status === 'ARQUIVADO') {
      throw new BusinessRuleError('PROJETO_ARQUIVADO', 'Não é possível editar um projecto arquivado');
    }

    await prisma.projeto.update({
      where: { id },
      data: {
        nome: input.nome,
        descricao: input.descricao,
        prioridade: input.prioridade,
        dataFimPrevista: input.dataFimPrevista,
        orcamentoPlanejado: input.orcamentoPlanejado,
        horasEstimadas: input.horasEstimadas,
        gerenteId: input.gerenteId,
        tags: input.tags,
        cor: input.cor,
        observacoes: input.observacoes,
      },
    });
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const projeto = await prisma.projeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!projeto) throw new NotFoundError('Projecto não encontrado');

    transitar(TRANSICOES_PROJETO, projeto.status, novoStatus);

    await prisma.projeto.update({
      where: { id },
      data: {
        status: novoStatus as never,
        ...(novoStatus === 'CONCLUIDO' ? { dataFimReal: new Date() } : {}),
      },
    });
  },

  async listar(filter: FilterProjetoInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.projeto.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.tipo ? { tipo: filter.tipo } : {}),
            ...(filter.prioridade ? { prioridade: filter.prioridade } : {}),
            ...(filter.clienteId ? { clienteId: filter.clienteId } : {}),
            ...(filter.gerenteId ? { gerenteId: filter.gerenteId } : {}),
            ...(filter.search
              ? { OR: [{ nome: { contains: filter.search, mode: 'insensitive' } }, { codigo: { contains: filter.search, mode: 'insensitive' } }] }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, codigo: true, nome: true, status: true, prioridade: true, dataFimPrevista: true, progresso: true },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const p = await prisma.projeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        equipas: { include: { equipa: { select: { id: true, nome: true } } } },
        marcos: { select: { id: true, nome: true, status: true, dataPrevista: true } },
        _count: { select: { tarefas: true, timesheets: true } },
      },
    });
    if (!p) throw new NotFoundError('Projecto não encontrado');
    return p;
  },

  async resumo(id: string, ctx: Ctx) {
    const p = await prisma.projeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, nome: true, progresso: true, horasEstimadas: true },
    });
    if (!p) throw new NotFoundError('Projecto não encontrado');

    const horas = await prisma.timesheet.aggregate({
      where: { projetoId: id, tenantId: ctx.tenantId },
      _sum: { duracaoHoras: true },
    });

    return { ...p, horasRegistadas: Number(horas._sum.duracaoHoras ?? 0) };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TarefaService — kanban com posicao fraccional
// ─────────────────────────────────────────────────────────────────────────────

export const TarefaService = {
  async criar(input: CreateTarefaInput, ctx: Ctx): Promise<{ id: string }> {
    // Posição inicial: última tarefa + delta (inserir no fim do kanban)
    const ultima = await prisma.tarefaProjeto.findFirst({
      where: { projetoId: input.projetoId, tenantId: ctx.tenantId, status: 'A_FAZER' },
      orderBy: { posicao: 'desc' },
      select: { posicao: true },
    });

    const posicao = ultima
      ? calcularMidpoint(ultima.posicao, String(parseFloat(ultima.posicao) + 1))
      : '0.5';

    const tarefa = await prisma.tarefaProjeto.create({
      data: {
        tenantId: ctx.tenantId,
        projetoId: input.projetoId,
        codigo: input.codigo,
        titulo: input.titulo,
        descricao: input.descricao,
        tipo: input.tipo ?? 'TAREFA',
        status: 'A_FAZER',
        prioridade: input.prioridade ?? 'MEDIA',
        posicao,
        dataFimPrevista: input.dataFimPrevista,
        horasEstimadas: input.horasEstimadas,
        responsavelId: input.responsavelId,
        criadoPorId: ctx.userId,
        tarefaPaiId: input.tarefaPaiId,
        dependencias: input.dependencias ?? [],
        tags: input.tags ?? [],
        observacoes: input.observacoes,
      },
      select: { id: true },
    });
    return { id: tarefa.id };
  },

  async actualizar(id: string, input: UpdateTarefaInput, ctx: Ctx): Promise<void> {
    const existente = await prisma.tarefaProjeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!existente) throw new NotFoundError('Tarefa não encontrada');

    await prisma.tarefaProjeto.update({
      where: { id },
      data: {
        titulo: input.titulo,
        descricao: input.descricao,
        prioridade: input.prioridade,
        dataFimPrevista: input.dataFimPrevista,
        horasEstimadas: input.horasEstimadas,
        responsavelId: input.responsavelId,
        tags: input.tags,
        observacoes: input.observacoes,
      },
    });
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const tarefa = await prisma.tarefaProjeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!tarefa) throw new NotFoundError('Tarefa não encontrada');

    transitar(TRANSICOES_TAREFA, tarefa.status, novoStatus);

    await prisma.tarefaProjeto.update({
      where: { id },
      data: {
        status: novoStatus as never,
        ...(novoStatus === 'CONCLUIDA' ? { dataFimReal: new Date(), progresso: 100 } : {}),
      },
    });
  },

  /**
   * Reordenação kanban com chave fraccional.
   * O cliente calcula a nova posição via calcularMidpoint e envia via ReordenarTarefaInput.
   * O serviço aceita a posição calculada pelo cliente (confiança) e persiste.
   */
  async reordenar(input: ReordenarTarefaInput, ctx: Ctx): Promise<void> {
    const tarefa = await prisma.tarefaProjeto.findFirst({
      where: { id: input.tarefaId, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!tarefa) throw new NotFoundError('Tarefa não encontrada');

    // Se muda de coluna, validar transição
    if (input.novoStatus && input.novoStatus !== tarefa.status) {
      transitar(TRANSICOES_TAREFA, tarefa.status, input.novoStatus);
    }

    await prisma.tarefaProjeto.update({
      where: { id: input.tarefaId },
      data: {
        posicao: input.novaPosicao,
        ...(input.novoStatus ? { status: input.novoStatus as never } : {}),
      },
    });
  },

  async listarKanban(projetoId: string, ctx: Ctx) {
    const tarefas = await prisma.tarefaProjeto.findMany({
      where: { projetoId, tenantId: ctx.tenantId },
      orderBy: { posicao: 'asc' },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        status: true,
        prioridade: true,
        posicao: true,
        responsavelId: true,
        dataFimPrevista: true,
        tags: true,
      },
    });

    // Agrupar por status (colunas kanban)
    const colunas: Record<string, typeof tarefas> = {};
    for (const t of tarefas) {
      if (!colunas[t.status]) colunas[t.status] = [];
      colunas[t.status].push(t);
    }
    return colunas;
  },

  async listar(filter: FilterTarefaInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.tarefaProjeto.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.projetoId ? { projetoId: filter.projetoId } : {}),
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.prioridade ? { prioridade: filter.prioridade } : {}),
            ...(filter.responsavelId ? { responsavelId: filter.responsavelId } : {}),
          },
          orderBy: [{ status: 'asc' }, { posicao: 'asc' }],
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TimesheetService
// ─────────────────────────────────────────────────────────────────────────────

export const TimesheetService = {
  async registar(input: CreateTimesheetInput, ctx: Ctx): Promise<{ id: string }> {
    const duracaoHoras =
      (input.horaFim.getTime() - input.horaInicio.getTime()) / (1000 * 60 * 60);

    if (duracaoHoras <= 0) {
      throw new BusinessRuleError('DURACAO_INVALIDA', 'Hora de fim deve ser posterior à hora de início');
    }

    const ts = await prisma.timesheet.create({
      data: {
        tenantId: ctx.tenantId,
        projetoId: input.projetoId,
        tarefaId: input.tarefaId,
        colaboradorId: input.colaboradorId,
        data: input.data,
        horaInicio: input.horaInicio,
        horaFim: input.horaFim,
        duracaoHoras,
        descricao: input.descricao,
        tipo: input.tipo ?? 'DESENVOLVIMENTO',
        faturavel: input.faturavel ?? false,
        aprovado: false,
      },
      select: { id: true },
    });
    return { id: ts.id };
  },

  async aprovar(id: string, ctx: Ctx): Promise<void> {
    const ts = await prisma.timesheet.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { aprovado: true },
    });
    if (!ts) throw new NotFoundError('Timesheet não encontrado');
    if (ts.aprovado) throw new BusinessRuleError('JA_APROVADO', 'Timesheet já aprovado');

    await prisma.timesheet.update({
      where: { id },
      data: { aprovado: true, aprovadoPorId: ctx.userId, dataAprovacao: new Date() },
    });

    // Actualizar horasTrabalhadas na tarefa se associada
    const atualizado = await prisma.timesheet.findFirst({
      where: { id },
      select: { tarefaId: true, duracaoHoras: true },
    });
    if (atualizado?.tarefaId) {
      await prisma.tarefaProjeto.update({
        where: { id: atualizado.tarefaId },
        data: { horasTrabalhadas: { increment: Math.round(Number(atualizado.duracaoHoras)) } },
      });
    }
  },

  async listar(filter: FilterTimesheetInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.timesheet.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.projetoId ? { projetoId: filter.projetoId } : {}),
            ...(filter.colaboradorId ? { colaboradorId: filter.colaboradorId } : {}),
            ...(filter.dataInicio ? { data: { gte: filter.dataInicio } } : {}),
            ...(filter.dataFim ? { data: { lte: filter.dataFim } } : {}),
          },
          orderBy: { data: 'desc' },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MarcoService
// ─────────────────────────────────────────────────────────────────────────────

export const MarcoService = {
  async criar(input: CreateMarcoInput, ctx: Ctx): Promise<{ id: string }> {
    const marco = await prisma.marco.create({
      data: {
        tenantId: ctx.tenantId,
        projetoId: input.projetoId,
        nome: input.nome,
        descricao: input.descricao,
        dataPrevista: input.dataPrevista,
        status: 'PENDENTE',
      },
      select: { id: true },
    });
    return { id: marco.id };
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const marco = await prisma.marco.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!marco) throw new NotFoundError('Marco não encontrado');

    transitar(TRANSICOES_MARCO, marco.status, novoStatus);

    await prisma.marco.update({
      where: { id },
      data: {
        status: novoStatus as never,
        ...(novoStatus === 'CONCLUIDO' ? { dataReal: new Date(), progresso: 100 } : {}),
      },
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// OrcamentoProjetoService
// ─────────────────────────────────────────────────────────────────────────────

export const OrcamentoProjetoService = {
  async criar(input: CreateOrcamentoProjetoInput, ctx: Ctx): Promise<{ id: string }> {
    const ultimaVersao = await prisma.orcamentoProjeto.findFirst({
      where: { projetoId: input.projetoId, tenantId: ctx.tenantId },
      orderBy: { versao: 'desc' },
      select: { versao: true },
    });

    const versao = (ultimaVersao?.versao ?? 0) + 1;

    const totalPlanejado = input.categorias.reduce((s, c) => s + c.valorPlanejado, 0);

    const orcamento = await prisma.$transaction(async (tx) => {
      const orc = await tx.orcamentoProjeto.create({
        data: {
          tenantId: ctx.tenantId,
          projetoId: input.projetoId,
          versao,
          status: 'RASCUNHO',
          totalPlanejado,
          observacoes: input.observacoes,
        },
        select: { id: true },
      });

      for (const cat of input.categorias) {
        const categoria = await tx.categoriaOrcamento.create({
          data: {
            tenantId: ctx.tenantId,
            orcamentoProjetoId: orc.id,
            nome: cat.nome,
            tipo: cat.tipo,
            valorPlanejado: cat.valorPlanejado,
          },
          select: { id: true },
        });

        if (cat.itens?.length) {
          await tx.itemOrcamento.createMany({
            data: cat.itens.map((item) => ({
              tenantId: ctx.tenantId,
              categoriaOrcamentoId: categoria.id,
              descricao: item.descricao,
              quantidade: item.quantidade,
              valorUnitario: item.valorUnitario,
              valorTotal: item.quantidade * item.valorUnitario,
              fornecedor: item.fornecedor,
              dataCompra: item.dataCompra,
              observacoes: item.observacoes,
            })),
          });
        }
      }

      return orc;
    });

    return { id: orcamento.id };
  },

  async transitarStatus(id: string, novoStatus: string, ctx: Ctx): Promise<void> {
    const orcamento = await prisma.orcamentoProjeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { status: true },
    });
    if (!orcamento) throw new NotFoundError('Orçamento não encontrado');

    transitar(TRANSICOES_ORCAMENTO, orcamento.status, novoStatus);

    await prisma.orcamentoProjeto.update({
      where: { id },
      data: {
        status: novoStatus as never,
        ...(novoStatus === 'APROVADO' ? { aprovadoPorId: ctx.userId, dataAprovacao: new Date() } : {}),
      },
    });
  },

  async obter(id: string, ctx: Ctx) {
    const orc = await prisma.orcamentoProjeto.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        categorias: { include: { itens: true } },
      },
    });
    if (!orc) throw new NotFoundError('Orçamento não encontrado');
    return orc;
  },
};
