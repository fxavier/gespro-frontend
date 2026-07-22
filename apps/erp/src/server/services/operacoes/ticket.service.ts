// Serviço de Tickets — WS F (Wave 3)
// Implementa ITicketService + ICategoriaTicketService + IEquipeSuporteService + IBaseConhecimentoService.
// Numeração via proximoNumeroSerie(tx, 'TICKET', ctx) de WS D (TKT/YYYY/000001).
// SLA calculado por prioridade (SLA_PADRAO_MIN) sobreposto pela CategoriaTicket.

import 'server-only';
import { prisma, prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { transitar } from './_helpers';
import { proximoNumeroSerie } from '@/server/services/financas';
import { TRANSICOES_TICKET, SLA_PADRAO_MIN } from './ticket.interface';
import type {
  ITicketService, ICategoriaTicketService, IEquipeSuporteService, IBaseConhecimentoService,
  EstadoTicket, TicketDetalhe, TicketResumo, AtividadeTicketRef,
  CategoriaTicketResumo, BaseConhecimentoResumo, CalcularSlaFn, RecalcularSlaEmAtrasaFn, SlaCalculado,
} from './ticket.interface';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  CriarTicketInput, AtualizarTicketInput, TransitarTicketInput, AtribuirTicketInput,
  AvaliarTicketInput, FiltrarTicketsInput, AdicionarComentarioTicketInput,
  CriarCategoriaTicketInput, AtualizarCategoriaTicketInput,
  CriarEquipeSuporteInput, AtualizarEquipeSuporteInput,
  CriarArtigoBaseConhecimentoInput, AtualizarArtigoBaseConhecimentoInput, FiltrarBaseConhecimentoInput,
} from '@/lib/validations/tickets';

// ============================================================
// SLA — funções puras (exportadas para testes)
// ============================================================

export const calcularSla: CalcularSlaFn = (
  prioridade,
  agora,
  categoriaTempos = null,
): SlaCalculado => {
  // Normalizar: categoriaTempos usa slaTempoResposta/slaTempoResolucao; SLA_PADRAO_MIN usa resposta/resolucao
  const tempos = categoriaTempos
    ? { resposta: categoriaTempos.slaTempoResposta, resolucao: categoriaTempos.slaTempoResolucao }
    : (SLA_PADRAO_MIN[prioridade] ?? SLA_PADRAO_MIN['NORMAL']);
  const slaDataLimiteResposta = new Date(agora.getTime() + tempos.resposta * 60_000);
  const slaDataLimiteResolucao = new Date(agora.getTime() + tempos.resolucao * 60_000);

  return {
    slaTempoResposta: tempos.resposta,
    slaTempoResolucao: tempos.resolucao,
    slaDataLimiteResposta,
    slaDataLimiteResolucao,
    slaEmAtraso: false,
  };
};

export const recalcularSlaEmAtraso: RecalcularSlaEmAtrasaFn = (
  estado,
  slaDataLimiteResolucao,
  agora,
): boolean => {
  const terminais: EstadoTicket[] = ['RESOLVIDO', 'FECHADO', 'CANCELADO'];
  if (terminais.includes(estado)) return false;
  return agora > slaDataLimiteResolucao;
};

// ============================================================
// Helpers de mapeamento
// ============================================================

const TICKET_RESUMO_SELECT = {
  id: true, tenantId: true, numero: true, titulo: true, tipo: true,
  categoriaId: true, prioridade: true, estado: true,
  solicitanteId: true, solicitanteNome: true,
  atribuidoParaId: true, atribuidoParaNome: true, equipeId: true,
  origemTipo: true, origemId: true,
  slaEmAtraso: true, slaDataLimiteResolucao: true,
  dataAbertura: true, createdAt: true, updatedAt: true,
} as const;

function mapAtividadeTicket(a: {
  id: string; tipo: string; descricao: string; detalhes: string | null;
  autorId: string; autorNome: string; visibilidade: string; createdAt: Date;
}): AtividadeTicketRef {
  return { id: a.id, tipo: a.tipo, descricao: a.descricao, detalhes: a.detalhes, autorId: a.autorId, autorNome: a.autorNome, visibilidade: a.visibilidade, createdAt: a.createdAt };
}

async function obterDetalheTicket(id: string, ctx: Ctx): Promise<TicketDetalhe> {
  const t = await prisma.ticket.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      ...TICKET_RESUMO_SELECT,
      descricao: true, subcategoria: true, solicitanteEmail: true, solicitanteTelefone: true,
      slaTempoResposta: true, slaTempoResolucao: true, slaDataLimiteResposta: true,
      dataPrimeiraResposta: true, dataResolucao: true, dataFechamento: true,
      tempoRespostaMin: true, tempoResolucaoMin: true, tempoTotalMin: true,
      tags: true, avaliacaoNota: true, avaliacaoComentario: true, avaliacaoData: true,
      observacoes: true,
      atividades: {
        select: { id: true, tipo: true, descricao: true, detalhes: true, autorId: true, autorNome: true, visibilidade: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!t) throw new NotFoundError('Ticket não encontrado.');

  return {
    id: t.id, tenantId: t.tenantId, numero: t.numero, titulo: t.titulo, tipo: t.tipo,
    categoriaId: t.categoriaId, prioridade: t.prioridade, estado: t.estado as EstadoTicket,
    solicitanteId: t.solicitanteId, solicitanteNome: t.solicitanteNome,
    atribuidoParaId: t.atribuidoParaId, atribuidoParaNome: t.atribuidoParaNome,
    equipeId: t.equipeId, origemTipo: t.origemTipo, origemId: t.origemId,
    slaEmAtraso: t.slaEmAtraso, slaDataLimiteResolucao: t.slaDataLimiteResolucao,
    dataAbertura: t.dataAbertura, createdAt: t.createdAt, updatedAt: t.updatedAt,
    descricao: t.descricao, subcategoria: t.subcategoria,
    solicitanteEmail: t.solicitanteEmail, solicitanteTelefone: t.solicitanteTelefone ?? null,
    slaTempoResposta: t.slaTempoResposta, slaTempoResolucao: t.slaTempoResolucao,
    slaDataLimiteResposta: t.slaDataLimiteResposta,
    dataPrimeiraResposta: t.dataPrimeiraResposta, dataResolucao: t.dataResolucao,
    dataFechamento: t.dataFechamento,
    tempoRespostaMin: t.tempoRespostaMin, tempoResolucaoMin: t.tempoResolucaoMin, tempoTotalMin: t.tempoTotalMin,
    tags: t.tags, avaliacaoNota: t.avaliacaoNota, avaliacaoComentario: t.avaliacaoComentario,
    avaliacaoData: t.avaliacaoData, observacoes: t.observacoes,
    atividades: t.atividades.map(mapAtividadeTicket),
  };
}

// ============================================================
// ITicketService
// ============================================================

async function criarTicket(
  input: CriarTicketInput,
  solicitante: { id: string; nome: string; email: string; telefone?: string },
  ctx: Ctx,
): Promise<TicketDetalhe> {
  const agora = new Date();

  // Obter SLA da categoria se existir
  let categoriaTempos: { slaTempoResposta: number; slaTempoResolucao: number } | null = null;
  if (input.categoriaId) {
    const cat = await prisma.categoriaTicket.findFirst({
      where: { id: input.categoriaId, tenantId: ctx.tenantId },
      select: { slaTempoResposta: true, slaTempoResolucao: true },
    });
    if (cat) categoriaTempos = { slaTempoResposta: cat.slaTempoResposta, slaTempoResolucao: cat.slaTempoResolucao };
  }

  const sla = calcularSla(input.prioridade, agora, categoriaTempos);

  const ticket = await prismaBase.$transaction(async (tx) => {
    const numero = await proximoNumeroSerie(tx, 'TICKET', ctx);

    const created = await tx.ticket.create({
      data: {
        tenantId: ctx.tenantId,
        numero,
        titulo: input.titulo,
        descricao: input.descricao,
        tipo: input.tipo,
        categoriaId: input.categoriaId ?? null,
        subcategoria: input.subcategoria ?? null,
        prioridade: input.prioridade,
        solicitanteId: solicitante.id,
        solicitanteNome: solicitante.nome,
        solicitanteEmail: solicitante.email,
        solicitanteTelefone: solicitante.telefone ?? null,
        origemTipo: input.origemTipo ?? null,
        origemId: input.origemId ?? null,
        slaTempoResposta: sla.slaTempoResposta,
        slaTempoResolucao: sla.slaTempoResolucao,
        slaDataLimiteResposta: sla.slaDataLimiteResposta,
        slaDataLimiteResolucao: sla.slaDataLimiteResolucao,
        tags: input.tags ?? [],
        observacoes: input.observacoes ?? null,
      },
      select: { id: true },
    });

    // Registo inicial de actividade
    await tx.atividadeTicket.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: created.id,
        tipo: 'SISTEMA',
        descricao: 'Ticket criado.',
        autorId: solicitante.id,
        autorNome: solicitante.nome,
        visibilidade: 'PUBLICA',
      },
    });

    return created;
  });

  return obterDetalheTicket(ticket.id, ctx);
}

async function obterTicket(id: string, ctx: Ctx): Promise<TicketDetalhe> {
  return obterDetalheTicket(id, ctx);
}

async function listarTickets(
  filtros: FiltrarTicketsInput,
  ctx: Ctx,
): Promise<PaginatedResult<TicketResumo>> {
  const where = {
    tenantId: ctx.tenantId,
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.prioridade ? { prioridade: filtros.prioridade } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
    ...(filtros.solicitanteId ? { solicitanteId: filtros.solicitanteId } : {}),
    ...(filtros.atribuidoParaId ? { atribuidoParaId: filtros.atribuidoParaId } : {}),
    ...(filtros.equipeId ? { equipeId: filtros.equipeId } : {}),
    ...(filtros.slaEmAtraso !== undefined ? { slaEmAtraso: filtros.slaEmAtraso } : {}),
    ...(filtros.dataInicio || filtros.dataFim
      ? { dataAbertura: { ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}), ...(filtros.dataFim ? { lte: filtros.dataFim } : {}) } }
      : {}),
    ...(filtros.pesquisa
      ? { OR: [
          { titulo: { contains: filtros.pesquisa, mode: 'insensitive' as const } },
          { numero: { contains: filtros.pesquisa, mode: 'insensitive' as const } },
        ] }
      : {}),
  };

  const page = await paginate(
    (args) => prisma.ticket.findMany({ where, orderBy: { [filtros.orderBy]: filtros.order }, select: TICKET_RESUMO_SELECT, ...args }),
    { cursor: filtros.cursor, take: filtros.take },
  );

  return {
    items: page.items.map((t) => ({
      id: t.id, tenantId: t.tenantId, numero: t.numero, titulo: t.titulo, tipo: t.tipo,
      categoriaId: t.categoriaId, prioridade: t.prioridade, estado: t.estado as EstadoTicket,
      solicitanteId: t.solicitanteId, solicitanteNome: t.solicitanteNome,
      atribuidoParaId: t.atribuidoParaId, atribuidoParaNome: t.atribuidoParaNome,
      equipeId: t.equipeId, origemTipo: t.origemTipo, origemId: t.origemId,
      slaEmAtraso: t.slaEmAtraso, slaDataLimiteResolucao: t.slaDataLimiteResolucao,
      dataAbertura: t.dataAbertura, createdAt: t.createdAt, updatedAt: t.updatedAt,
    })),
    nextCursor: page.nextCursor,
  };
}

async function atualizarTicket(id: string, input: AtualizarTicketInput, ctx: Ctx): Promise<TicketDetalhe> {
  const existente = await prisma.ticket.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Ticket não encontrado.');

  await prisma.ticket.update({
    where: { id },
    data: {
      ...(input.titulo ? { titulo: input.titulo } : {}),
      ...(input.descricao ? { descricao: input.descricao } : {}),
      ...(input.subcategoria !== undefined ? { subcategoria: input.subcategoria ?? null } : {}),
      ...(input.prioridade ? { prioridade: input.prioridade } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes ?? null } : {}),
    },
  });

  return obterDetalheTicket(id, ctx);
}

async function transitarTicket(
  input: TransitarTicketInput,
  autorNome: string,
  ctx: Ctx,
): Promise<TicketDetalhe> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: input.ticketId, tenantId: ctx.tenantId },
    select: {
      id: true, tenantId: true, estado: true,
      atribuidoParaId: true, slaDataLimiteResolucao: true,
      dataAbertura: true,
    },
  });
  if (!ticket) throw new NotFoundError('Ticket não encontrado.');

  const estadoActual = ticket.estado as EstadoTicket;
  transitar(TRANSICOES_TICKET, estadoActual, input.estadoAlvo as EstadoTicket);

  // Regra: ABERTO → EM_PROGRESSO requer agente atribuído
  if (estadoActual === 'ABERTO' && input.estadoAlvo === 'EM_PROGRESSO') {
    if (!ticket.atribuidoParaId) {
      throw new BusinessRuleError(
        'TICKET_SEM_AGENTE',
        'O ticket precisa de ter um agente atribuído antes de entrar em progresso.',
      );
    }
  }

  const agora = new Date();
  const dataUpdate: Record<string, unknown> = { estado: input.estadoAlvo };

  // Registar datas de resolução/fechamento/reabertura
  if (input.estadoAlvo === 'RESOLVIDO') {
    dataUpdate.dataResolucao = agora;
    const dataAbertura = new Date(ticket.dataAbertura);
    dataUpdate.tempoResolucaoMin = Math.round((agora.getTime() - dataAbertura.getTime()) / 60_000);
  }
  if (input.estadoAlvo === 'FECHADO') {
    dataUpdate.dataFechamento = agora;
    const dataAbertura = new Date(ticket.dataAbertura);
    dataUpdate.tempoTotalMin = Math.round((agora.getTime() - dataAbertura.getTime()) / 60_000);
  }
  // Recalcular SLA em atraso
  dataUpdate.slaEmAtraso = recalcularSlaEmAtraso(
    input.estadoAlvo as EstadoTicket,
    ticket.slaDataLimiteResolucao,
    agora,
  );

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: input.ticketId }, data: dataUpdate });
    await tx.atividadeTicket.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: input.ticketId,
        tipo: 'MUDANCA_STATUS',
        descricao: `Estado alterado de ${estadoActual} para ${input.estadoAlvo}. ${input.descricao}`,
        detalhes: JSON.stringify({ de: estadoActual, para: input.estadoAlvo }),
        autorId: ctx.userId,
        autorNome,
        visibilidade: 'PUBLICA',
      },
    });
  });

  return obterDetalheTicket(input.ticketId, ctx);
}

async function atribuirTicket(
  input: AtribuirTicketInput,
  autorNome: string,
  ctx: Ctx,
): Promise<TicketDetalhe> {
  const ticket = await prisma.ticket.findFirst({ where: { id: input.ticketId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!ticket) throw new NotFoundError('Ticket não encontrado.');

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: input.ticketId },
      data: {
        atribuidoParaId: input.atribuidoParaId,
        atribuidoParaNome: input.atribuidoParaNome,
        equipeId: input.equipeId ?? null,
      },
    });
    await tx.atividadeTicket.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: input.ticketId,
        tipo: 'ATRIBUICAO',
        descricao: input.atribuidoParaNome
          ? `Ticket atribuído a ${input.atribuidoParaNome}.`
          : 'Atribuição de agente removida.',
        autorId: ctx.userId,
        autorNome,
        visibilidade: 'PUBLICA',
      },
    });
  });

  return obterDetalheTicket(input.ticketId, ctx);
}

async function adicionarComentario(
  input: AdicionarComentarioTicketInput,
  autor: { id: string; nome: string },
  ctx: Ctx,
): Promise<AtividadeTicketRef> {
  const ticket = await prisma.ticket.findFirst({ where: { id: input.ticketId, tenantId: ctx.tenantId }, select: { id: true, dataPrimeiraResposta: true } });
  if (!ticket) throw new NotFoundError('Ticket não encontrado.');

  const agora = new Date();

  const atividade = await prisma.$transaction(async (tx) => {
    const a = await tx.atividadeTicket.create({
      data: {
        tenantId: ctx.tenantId,
        ticketId: input.ticketId,
        tipo: 'COMENTARIO',
        descricao: input.descricao,
        autorId: autor.id,
        autorNome: autor.nome,
        visibilidade: input.visibilidade ?? 'PUBLICA',
      },
      select: { id: true, tipo: true, descricao: true, detalhes: true, autorId: true, autorNome: true, visibilidade: true, createdAt: true },
    });

    // Registar data da primeira resposta se ainda não tiver
    if (!ticket.dataPrimeiraResposta) {
      await tx.ticket.update({
        where: { id: input.ticketId },
        data: { dataPrimeiraResposta: agora },
      });
    }

    return a;
  });

  return mapAtividadeTicket(atividade);
}

async function avaliarTicket(
  input: AvaliarTicketInput,
  avaliadorId: string,
  ctx: Ctx,
): Promise<TicketDetalhe> {
  const ticket = await prisma.ticket.findFirst({
    where: { id: input.ticketId, tenantId: ctx.tenantId },
    select: { id: true, estado: true },
  });
  if (!ticket) throw new NotFoundError('Ticket não encontrado.');

  if (ticket.estado !== 'FECHADO') {
    throw new BusinessRuleError('TICKET_NAO_FECHADO', 'Só é possível avaliar tickets FECHADOS.');
  }

  await prisma.ticket.update({
    where: { id: input.ticketId },
    data: {
      avaliacaoNota: input.nota,
      avaliacaoComentario: input.comentario ?? null,
      avaliacaoData: new Date(),
      avaliadoPorId: avaliadorId,
    },
  });

  return obterDetalheTicket(input.ticketId, ctx);
}

export const ticketService: ITicketService = {
  criarTicket,
  obterTicket,
  listarTickets,
  atualizarTicket,
  transitarTicket,
  atribuirTicket,
  adicionarComentario,
  avaliarTicket,
};

// ============================================================
// ICategoriaTicketService
// ============================================================

async function criarCategoria(input: CriarCategoriaTicketInput, ctx: Ctx): Promise<CategoriaTicketResumo> {
  const c = await prisma.categoriaTicket.create({
    data: {
      tenantId: ctx.tenantId,
      nome: input.nome,
      descricao: input.descricao ?? null,
      icone: input.icone ?? null,
      cor: input.cor ?? null,
      subcategorias: input.subcategorias ?? [],
      slaTempoResposta: input.slaTempoResposta,
      slaTempoResolucao: input.slaTempoResolucao,
    },
    select: { id: true, nome: true, descricao: true, slaTempoResposta: true, slaTempoResolucao: true, ativa: true },
  });
  return { id: c.id, nome: c.nome, descricao: c.descricao, slaTempoResposta: c.slaTempoResposta, slaTempoResolucao: c.slaTempoResolucao, ativa: c.ativa };
}

async function atualizarCategoria(id: string, input: AtualizarCategoriaTicketInput, ctx: Ctx): Promise<CategoriaTicketResumo> {
  const existente = await prisma.categoriaTicket.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Categoria não encontrada.');

  const c = await prisma.categoriaTicket.update({
    where: { id },
    data: {
      ...(input.nome ? { nome: input.nome } : {}),
      ...(input.descricao !== undefined ? { descricao: input.descricao ?? null } : {}),
      ...(input.slaTempoResposta !== undefined ? { slaTempoResposta: input.slaTempoResposta } : {}),
      ...(input.slaTempoResolucao !== undefined ? { slaTempoResolucao: input.slaTempoResolucao } : {}),
      ...(input.ativa !== undefined ? { ativa: input.ativa } : {}),
    },
    select: { id: true, nome: true, descricao: true, slaTempoResposta: true, slaTempoResolucao: true, ativa: true },
  });

  return { id: c.id, nome: c.nome, descricao: c.descricao, slaTempoResposta: c.slaTempoResposta, slaTempoResolucao: c.slaTempoResolucao, ativa: c.ativa };
}

async function listarCategorias(ctx: Ctx, ativa?: boolean): Promise<CategoriaTicketResumo[]> {
  const cats = await prisma.categoriaTicket.findMany({
    where: { tenantId: ctx.tenantId, ...(ativa !== undefined ? { ativa } : {}) },
    select: { id: true, nome: true, descricao: true, slaTempoResposta: true, slaTempoResolucao: true, ativa: true },
    orderBy: { nome: 'asc' },
  });
  return cats.map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao, slaTempoResposta: c.slaTempoResposta, slaTempoResolucao: c.slaTempoResolucao, ativa: c.ativa }));
}

async function obterCategoria(id: string, ctx: Ctx): Promise<CategoriaTicketResumo> {
  const c = await prisma.categoriaTicket.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, nome: true, descricao: true, slaTempoResposta: true, slaTempoResolucao: true, ativa: true },
  });
  if (!c) throw new NotFoundError('Categoria não encontrada.');
  return { id: c.id, nome: c.nome, descricao: c.descricao, slaTempoResposta: c.slaTempoResposta, slaTempoResolucao: c.slaTempoResolucao, ativa: c.ativa };
}

export const categoriaTicketService: ICategoriaTicketService = {
  criarCategoria,
  atualizarCategoria,
  listarCategorias,
  obterCategoria,
};

// ============================================================
// IEquipeSuporteService
// ============================================================

async function criarEquipe(input: CriarEquipeSuporteInput, ctx: Ctx): Promise<{ id: string; nome: string }> {
  const e = await prisma.equipeSuporte.create({
    data: {
      tenantId: ctx.tenantId,
      nome: input.nome,
      descricao: input.descricao ?? null,
      categorias: input.categorias ?? [],
      horarioInicio: input.horarioInicio,
      horarioFim: input.horarioFim,
      diasSemana: input.diasSemana,
    },
    select: { id: true, nome: true },
  });
  return { id: e.id, nome: e.nome };
}

async function atualizarEquipe(id: string, input: AtualizarEquipeSuporteInput, ctx: Ctx): Promise<{ id: string; nome: string }> {
  const existente = await prisma.equipeSuporte.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Equipe não encontrada.');

  const e = await prisma.equipeSuporte.update({
    where: { id },
    data: {
      ...(input.nome ? { nome: input.nome } : {}),
      ...(input.descricao !== undefined ? { descricao: input.descricao ?? null } : {}),
      ...(input.estado ? { estado: input.estado } : {}),
    },
    select: { id: true, nome: true },
  });
  return { id: e.id, nome: e.nome };
}

async function listarEquipes(ctx: Ctx): Promise<Array<{ id: string; nome: string; estado: string }>> {
  const equipes = await prisma.equipeSuporte.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, nome: true, estado: true },
    orderBy: { nome: 'asc' },
  });
  return equipes;
}

export const equipeSuporteService: IEquipeSuporteService = {
  criarEquipe,
  atualizarEquipe,
  listarEquipes,
};

// ============================================================
// IBaseConhecimentoService
// ============================================================

function mapArtigo(a: {
  id: string; titulo: string; resumo: string | null; categoria: string;
  visibilidade: string; estado: string; util: number; visualizacoes: number; createdAt: Date;
}): BaseConhecimentoResumo {
  return { id: a.id, titulo: a.titulo, resumo: a.resumo, categoria: a.categoria, visibilidade: a.visibilidade, estado: a.estado, util: a.util, visualizacoes: a.visualizacoes, createdAt: a.createdAt };
}

async function criarArtigo(
  input: CriarArtigoBaseConhecimentoInput,
  autor: { id: string; nome: string },
  ctx: Ctx,
): Promise<BaseConhecimentoResumo> {
  const a = await prisma.baseConhecimento.create({
    data: {
      tenantId: ctx.tenantId,
      titulo: input.titulo,
      conteudo: input.conteudo,
      resumo: input.resumo ?? null,
      categoria: input.categoria,
      tags: input.tags ?? [],
      visibilidade: input.visibilidade ?? 'PUBLICA',
      autorId: autor.id,
      autorNome: autor.nome,
    },
    select: { id: true, titulo: true, resumo: true, categoria: true, visibilidade: true, estado: true, util: true, visualizacoes: true, createdAt: true },
  });
  return mapArtigo(a);
}

async function atualizarArtigo(id: string, input: AtualizarArtigoBaseConhecimentoInput, ctx: Ctx): Promise<BaseConhecimentoResumo> {
  const existente = await prisma.baseConhecimento.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Artigo não encontrado.');

  const a = await prisma.baseConhecimento.update({
    where: { id },
    data: {
      ...(input.titulo ? { titulo: input.titulo } : {}),
      ...(input.conteudo ? { conteudo: input.conteudo } : {}),
      ...(input.resumo !== undefined ? { resumo: input.resumo ?? null } : {}),
      ...(input.categoria ? { categoria: input.categoria } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.visibilidade ? { visibilidade: input.visibilidade } : {}),
      ...(input.estado ? { estado: input.estado } : {}),
    },
    select: { id: true, titulo: true, resumo: true, categoria: true, visibilidade: true, estado: true, util: true, visualizacoes: true, createdAt: true },
  });
  return mapArtigo(a);
}

async function listarArtigos(
  filtros: FiltrarBaseConhecimentoInput,
  ctx: Ctx,
): Promise<PaginatedResult<BaseConhecimentoResumo>> {
  const where = {
    tenantId: ctx.tenantId,
    ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
    ...(filtros.visibilidade ? { visibilidade: filtros.visibilidade } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.pesquisa ? { OR: [{ titulo: { contains: filtros.pesquisa, mode: 'insensitive' as const } }, { resumo: { contains: filtros.pesquisa, mode: 'insensitive' as const } }] } : {}),
  };

  const page = await paginate(
    (args) => prisma.baseConhecimento.findMany({
      where,
      orderBy: { [filtros.orderBy ?? 'createdAt']: filtros.order ?? 'desc' },
      select: { id: true, titulo: true, resumo: true, categoria: true, visibilidade: true, estado: true, util: true, visualizacoes: true, createdAt: true },
      ...args,
    }),
    { cursor: filtros.cursor, take: filtros.take },
  );

  return { items: page.items.map(mapArtigo), nextCursor: page.nextCursor };
}

async function registarVisualizacao(id: string, ctx: Ctx): Promise<void> {
  // updateMany com tenantId — garante que só o artigo do tenant correcto é incrementado
  await prisma.baseConhecimento.updateMany({
    where: { id, tenantId: ctx.tenantId },
    data: { visualizacoes: { increment: 1 } },
  });
}

async function votarArtigo(id: string, voto: 'util' | 'nao_util', ctx: Ctx): Promise<{ util: number; naoUtil: number }> {
  const artigo = await prisma.baseConhecimento.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!artigo) throw new NotFoundError('Artigo não encontrado.');

  const updated = await prisma.baseConhecimento.update({
    where: { id },
    data: voto === 'util' ? { util: { increment: 1 } } : { naoUtil: { increment: 1 } },
    select: { util: true, naoUtil: true },
  });

  return { util: updated.util, naoUtil: updated.naoUtil };
}

export const baseConhecimentoService: IBaseConhecimentoService = {
  criarArtigo,
  atualizarArtigo,
  listarArtigos,
  registarVisualizacao,
  votarArtigo,
};
