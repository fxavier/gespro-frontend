/**
 * Implementação do serviço de Serviços — WS B (Wave 2)
 */
import 'server-only';

import { PrismaClient } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type {
  IServicoService,
  CategoriaServicoDto,
  ServicoResumo,
  ServicoDetalhe,
  TecnicoServicoDto,
  AgendamentoResumo,
  AgendamentoDetalhe,
  AvaliacaoServicoDto,
  ContratoServicoDto,
  StatusAgendamento,
} from './servico.service.interface';
import { TRANSICOES_AGENDAMENTO } from './servico.service.interface';
import type {
  CreateCategoriaServicoInput,
  CreateServicoInput,
  UpdateServicoInput,
  FilterServicoInput,
  CreateTecnicoServicoInput,
  CreateAgendamentoServicoInput,
  FilterAgendamentoServicoInput,
  CreateAvaliacaoServicoInput,
  CreateContratoServicoInput,
} from '@/lib/validations/servicos';
import type { Ctx } from '@/server/services/types';
import type { z } from 'zod';
import type {
  UpdateCategoriaServicoSchema,
  UpdateTecnicoServicoSchema,
  FilterTecnicoServicoSchema,
  UpdateAgendamentoServicoSchema,
  UpdateContratoServicoSchema,
  FilterContratoServicoSchema,
} from '@/lib/validations/servicos';

const db = prisma as unknown as PrismaClient;

function transitarAgendamento(atual: StatusAgendamento, alvo: StatusAgendamento): void {
  const permitidos = TRANSICOES_AGENDAMENTO[atual] ?? [];
  if (!permitidos.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida de Agendamento: ${atual} → ${alvo}`,
    );
  }
}

async function gerarCodigoServico(ctx: Ctx): Promise<string> {
  const count = await db.servico.count({ where: { tenantId: ctx.tenantId } });
  return `SRV-${String(count + 1).padStart(4, '0')}`;
}

async function gerarCodigoAgendamento(ctx: Ctx): Promise<string> {
  const count = await db.agendamentoServico.count({ where: { tenantId: ctx.tenantId } });
  return `AGD-${String(count + 1).padStart(5, '0')}`;
}

async function gerarCodigoContrato(ctx: Ctx): Promise<string> {
  const count = await db.contratoServico.count({ where: { tenantId: ctx.tenantId } });
  return `CTRT-${String(count + 1).padStart(4, '0')}`;
}

function toCategoriaDto(c: any): CategoriaServicoDto {
  return {
    id: c.id, nome: c.nome, descricao: c.descricao ?? null,
    cor: c.cor ?? '#6B7280', icone: c.icone ?? null, ativo: c.ativo,
    ordem: c.ordem ?? null, totalServicos: c._count?.servicos ?? 0,
  };
}

function toServicoResumo(s: any): ServicoResumo {
  const preco = Number(s.preco ?? 0);
  const taxaIva = Number(s.taxaIva ?? 0.16);
  return {
    id: s.id, codigo: s.codigo, nome: s.nome,
    categoriaServicoId: s.categoriaServicoId ?? null,
    categoriaNome: s.categoriaServico?.nome ?? null,
    tipoServico: s.tipoServico, preco, taxaIva,
    precoComIva: Math.round(preco * (1 + taxaIva) * 100) / 100,
    disponivel: s.disponivel, ativo: s.ativo,
    avaliacaoMedia: s.avaliacaoMedia ? Number(s.avaliacaoMedia) : null,
    totalVendas: s.totalVendas ?? 0,
  };
}

function toServicoDetalhe(s: any): ServicoDetalhe {
  return {
    ...toServicoResumo(s),
    descricao: s.descricao ?? null, subcategoria: s.subcategoria ?? null,
    precoMinimo: s.precoMinimo ? Number(s.precoMinimo) : null,
    precoMaximo: s.precoMaximo ? Number(s.precoMaximo) : null,
    duracaoEstimada: s.duracaoEstimada ?? 60,
    unidadeMedida: s.unidadeMedida ?? 'hora',
    incluiMaterial: s.incluiMaterial ?? false,
    materialIncluido: s.materialIncluido ?? null,
    requerAgendamento: s.requerAgendamento ?? true,
    requerTecnico: s.requerTecnico ?? false,
    nivelTecnicoRequerido: s.nivelTecnicoRequerido ?? null,
    diasDisponibilidade: s.diasDisponibilidade ?? [],
    horaInicio: s.horaInicio ?? null, horaFim: s.horaFim ?? null,
    imagem: s.imagem ?? null, observacoes: s.observacoes ?? null,
    faturamentoTotal: Number(s.faturamentoTotal ?? 0),
    ultimaVenda: s.ultimaVenda ?? null,
    numeroAvaliacoes: s.numeroAvaliacoes ?? 0,
  };
}

function toAgendamentoResumo(a: any): AgendamentoResumo {
  return {
    id: a.id, codigo: a.codigo,
    servicoId: a.servicoId, servicoNome: a.servico?.nome ?? a.servicoId,
    clienteId: a.clienteId, clienteNome: a.clienteNome,
    tecnicoId: a.tecnicoServicoId ?? null, tecnicoNome: a.tecnicoNome ?? null,
    dataAgendamento: a.dataAgendamento,
    horaInicio: a.horaInicio, horaFim: a.horaFim,
    status: a.status, total: Number(a.total ?? 0),
  };
}

function toAgendamentoDetalhe(a: any): AgendamentoDetalhe {
  return {
    ...toAgendamentoResumo(a),
    clienteEmail: a.clienteEmail ?? '', clienteTelefone: a.clienteTelefone ?? '',
    duracaoEstimada: a.duracaoEstimada ?? 60,
    local: a.local ?? '', endereco: a.endereco ?? '',
    cidade: a.cidade ?? '', provincia: a.provincia ?? '',
    precoServico: Number(a.precoServico ?? 0),
    desconto: a.desconto ? Number(a.desconto) : null,
    taxaIva: Number(a.taxaIva ?? 0.16),
    observacoes: a.observacoes ?? null, notasConclusao: a.notasConclusao ?? null,
  };
}

export const servicoService: IServicoService = {
  // ---- Categorias ----

  async criarCategoria(input: CreateCategoriaServicoInput, ctx: Ctx) {
    const cat = await db.categoriaServico.create({
      data: { ...input, tenantId: ctx.tenantId },
    });
    return toCategoriaDto(cat);
  },

  async listarCategorias(ctx: Ctx) {
    const cats = await db.categoriaServico.findMany({
      where: { tenantId: ctx.tenantId },
      include: { _count: { select: { servicos: true } } },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
    return cats.map(toCategoriaDto);
  },

  async actualizarCategoria(id: string, input: z.infer<typeof UpdateCategoriaServicoSchema>, ctx: Ctx) {
    const cat = await db.categoriaServico.findUnique({ where: { id } });
    if (!cat || cat.tenantId !== ctx.tenantId) throw new NotFoundError('Categoria não encontrada');
    const updated = await db.categoriaServico.update({ where: { id }, data: input });
    return toCategoriaDto(updated);
  },

  // ---- Serviços ----

  async criarServico(input: CreateServicoInput, ctx: Ctx) {
    const codigo = await gerarCodigoServico(ctx);
    const s = await db.servico.create({
      data: { tenantId: ctx.tenantId, ...input, codigo, totalVendas: 0, faturamentoTotal: 0, numeroAvaliacoes: 0 },
    });
    return toServicoDetalhe(s);
  },

  async actualizarServico(id: string, input: UpdateServicoInput, ctx: Ctx) {
    const s = await db.servico.findUnique({ where: { id } });
    if (!s || s.tenantId !== ctx.tenantId) throw new NotFoundError('Serviço não encontrado');
    const updated = await db.servico.update({
      where: { id }, data: input,
      include: { categoriaServico: { select: { nome: true } } },
    });
    return toServicoDetalhe(updated);
  },

  async obterServico(id: string, ctx: Ctx) {
    const s = await db.servico.findUnique({
      where: { id },
      include: { categoriaServico: { select: { nome: true } } },
    });
    if (!s || s.tenantId !== ctx.tenantId) throw new NotFoundError('Serviço não encontrado');
    return toServicoDetalhe(s);
  },

  async listarServicos(filtros: FilterServicoInput, ctx: Ctx) {
    const { ativo, disponivel, categoriaServicoId, cursor, take = 25 } = filtros as any;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(typeof ativo === 'boolean' ? { ativo } : {}),
      ...(typeof disponivel === 'boolean' ? { disponivel } : {}),
      ...(categoriaServicoId ? { categoriaServicoId } : {}),
    };
    return paginate(
      (a) => db.servico.findMany({
        ...a, where,
        include: { categoriaServico: { select: { nome: true } } },
        orderBy: { nome: 'asc' },
      }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toServicoResumo), nextCursor: p.nextCursor }));
  },

  async arquivarServico(id: string, ctx: Ctx) {
    const s = await db.servico.findUnique({ where: { id } });
    if (!s || s.tenantId !== ctx.tenantId) throw new NotFoundError('Serviço não encontrado');
    await db.servico.update({ where: { id }, data: { ativo: false, disponivel: false } });
  },

  // ---- Técnicos ----

  async criarTecnico(input: CreateTecnicoServicoInput, ctx: Ctx) {
    const t = await db.tecnicoServico.create({ data: { ...input, tenantId: ctx.tenantId, agendamentosAtivos: 0 } });
    return toTecnicoDto(t);
  },

  async actualizarTecnico(id: string, input: z.infer<typeof UpdateTecnicoServicoSchema>, ctx: Ctx) {
    const t = await db.tecnicoServico.findUnique({ where: { id } });
    if (!t || t.tenantId !== ctx.tenantId) throw new NotFoundError('Técnico não encontrado');
    const updated = await db.tecnicoServico.update({ where: { id }, data: input });
    return toTecnicoDto(updated);
  },

  async listarTecnicos(filtros: z.infer<typeof FilterTecnicoServicoSchema>, ctx: Ctx) {
    const { disponivel, cursor, take = 25 } = filtros as any;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(typeof disponivel === 'boolean' ? { disponivel } : {}),
    };
    return paginate(
      (a) => db.tecnicoServico.findMany({ ...a, where, orderBy: { nome: 'asc' } }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toTecnicoDto), nextCursor: p.nextCursor }));
  },

  async tecnicosDisponiveis(dataAgendamento: Date, horaInicio: string, horaFim: string, ctx: Ctx) {
    // Simplificado para Wave 2: retorna técnicos disponíveis sem verificar conflitos
    // Wave 3: verificar AgendamentoServico no mesmo horário
    const tecnicos = await db.tecnicoServico.findMany({
      where: { tenantId: ctx.tenantId, disponivel: true },
    });
    return tecnicos.map(toTecnicoDto);
  },

  // ---- Agendamentos ----

  async criarAgendamento(input: CreateAgendamentoServicoInput, ctx: Ctx) {
    const codigo = await gerarCodigoAgendamento(ctx);
    const servico = await db.servico.findUnique({ where: { id: (input as any).servicoId } });
    const precoServico = servico ? Number(servico.preco) : 0;
    const taxaIva = servico ? Number(servico.taxaIva) : 0.16;
    const desconto = Number((input as any).desconto ?? 0);
    const total = (precoServico - desconto) * (1 + taxaIva);

    const a = await db.agendamentoServico.create({
      data: {
        ...input, codigo, precoServico, total,
        tenantId: ctx.tenantId,
      },
      include: { servico: { select: { nome: true } } },
    });
    return toAgendamentoDetalhe(a);
  },

  async actualizarAgendamento(id: string, input: z.infer<typeof UpdateAgendamentoServicoSchema>, ctx: Ctx) {
    const a = await db.agendamentoServico.findUnique({ where: { id } });
    if (!a || a.tenantId !== ctx.tenantId) throw new NotFoundError('Agendamento não encontrado');
    const updated = await db.agendamentoServico.update({ where: { id }, data: input });
    return toAgendamentoDetalhe(updated);
  },

  async obterAgendamento(id: string, ctx: Ctx) {
    const a = await db.agendamentoServico.findUnique({
      where: { id },
      include: { servico: { select: { nome: true } } },
    });
    if (!a || a.tenantId !== ctx.tenantId) throw new NotFoundError('Agendamento não encontrado');
    return toAgendamentoDetalhe(a);
  },

  async listarAgendamentos(filtros: FilterAgendamentoServicoInput, ctx: Ctx) {
    const { status, servicoId, cursor, take = 25 } = filtros as any;
    const where: any = {
      tenantId: ctx.tenantId,
      ...(status ? { status } : {}),
      ...(servicoId ? { servicoId } : {}),
    };
    return paginate(
      (a) => db.agendamentoServico.findMany({
        ...a, where,
        include: { servico: { select: { nome: true } } },
        orderBy: { dataAgendamento: 'asc' },
      }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toAgendamentoResumo), nextCursor: p.nextCursor }));
  },

  async transitarAgendamento(id: string, novoStatus: StatusAgendamento, notasConclusao: string | undefined, ctx: Ctx) {
    const a = await db.agendamentoServico.findUnique({ where: { id } });
    if (!a || a.tenantId !== ctx.tenantId) throw new NotFoundError('Agendamento não encontrado');
    transitarAgendamento(a.status as StatusAgendamento, novoStatus);
    const updated = await db.agendamentoServico.update({
      where: { id },
      data: { status: novoStatus, ...(notasConclusao ? { notasConclusao } : {}) },
      include: { servico: { select: { nome: true } } },
    });
    return toAgendamentoDetalhe(updated);
  },

  // ---- Avaliações ----

  async registarAvaliacao(input: CreateAvaliacaoServicoInput, ctx: Ctx) {
    const ag = await db.agendamentoServico.findUnique({ where: { id: input.agendamentoServicoId } });
    if (!ag || ag.tenantId !== ctx.tenantId) throw new NotFoundError('Agendamento não encontrado');
    if (ag.status !== 'CONCLUIDO') throw new BusinessRuleError('ESTADO_INVALIDO', 'Só pode avaliar agendamentos concluídos');

    const av = await db.avaliacaoServico.create({
      data: {
        ...input,
        tenantId: ctx.tenantId,
        servicoId: ag.servicoId,
        clienteId: ag.clienteId,
        clienteNome: ag.clienteNome,
      },
    });

    // Actualizar média de avaliações do serviço
    const avaliacoes = await db.avaliacaoServico.findMany({
      where: { tenantId: ctx.tenantId, servicoId: ag.servicoId },
    });
    const media = avaliacoes.reduce((s: number, a: any) => s + a.nota, 0) / avaliacoes.length;
    await db.servico.update({
      where: { id: ag.servicoId },
      data: { avaliacaoMedia: Math.round(media * 10) / 10, numeroAvaliacoes: avaliacoes.length },
    });

    return toAvaliacaoDto(av);
  },

  async listarAvaliacoes(servicoId: string, ctx: Ctx) {
    const avs = await db.avaliacaoServico.findMany({
      where: { tenantId: ctx.tenantId, servicoId },
      orderBy: { createdAt: 'desc' },
    });
    return avs.map(toAvaliacaoDto);
  },

  // ---- Contratos ----

  async criarContrato(input: CreateContratoServicoInput, ctx: Ctx) {
    const codigo = await gerarCodigoContrato(ctx);
    const c = await db.contratoServico.create({
      data: { ...input, codigo, tenantId: ctx.tenantId, status: 'ATIVO' },
    });
    return toContratoDto(c);
  },

  async actualizarContrato(id: string, input: z.infer<typeof UpdateContratoServicoSchema>, ctx: Ctx) {
    const c = await db.contratoServico.findUnique({ where: { id } });
    if (!c || c.tenantId !== ctx.tenantId) throw new NotFoundError('Contrato não encontrado');
    const updated = await db.contratoServico.update({ where: { id }, data: input });
    return toContratoDto(updated);
  },

  async listarContratos(filtros: z.infer<typeof FilterContratoServicoSchema>, ctx: Ctx) {
    const { status, cursor, take = 25 } = filtros as any;
    const where: any = { tenantId: ctx.tenantId, ...(status ? { status } : {}) };
    return paginate(
      (a) => db.contratoServico.findMany({ ...a, where, orderBy: { dataFim: 'asc' } }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toContratoDto), nextCursor: p.nextCursor }));
  },

  async renovarContrato(id: string, ctx: Ctx) {
    const c = await db.contratoServico.findUnique({ where: { id } });
    if (!c || c.tenantId !== ctx.tenantId) throw new NotFoundError('Contrato não encontrado');
    if (c.status !== 'ATIVO') throw new BusinessRuleError('ESTADO_INVALIDO', 'Apenas contratos activos podem ser renovados');

    const meses: Record<string, number> = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };
    const n = meses[c.periodicidade] ?? 1;
    const novaFim = new Date(c.dataFim);
    novaFim.setMonth(novaFim.getMonth() + n);

    const updated = await db.contratoServico.update({ where: { id }, data: { dataFim: novaFim } });
    return toContratoDto(updated);
  },

  async contratosAExpirar(diasAntecedencia: number, ctx: Ctx) {
    const limite = new Date(Date.now() + diasAntecedencia * 86_400_000);
    const contratos = await db.contratoServico.findMany({
      where: {
        tenantId: ctx.tenantId, status: 'ATIVO',
        dataFim: { lte: limite },
      },
    });
    return contratos.map(toContratoDto);
  },
};

// =====================================================================
// Helpers DTO
// =====================================================================

function toTecnicoDto(t: any): TecnicoServicoDto {
  return {
    id: t.id, colaboradorId: t.colaboradorId,
    nome: t.nome, email: t.email, telefone: t.telefone,
    especialidades: t.especialidades ?? [],
    nivelTecnico: t.nivelTecnico, disponivel: t.disponivel,
    agendamentosAtivos: t.agendamentosAtivos ?? 0,
    avaliacaoMedia: t.avaliacaoMedia ? Number(t.avaliacaoMedia) : null,
    custoHora: Number(t.custoHora ?? 0),
  };
}

function toAvaliacaoDto(a: any): AvaliacaoServicoDto {
  return {
    id: a.id, agendamentoServicoId: a.agendamentoServicoId,
    servicoId: a.servicoId, clienteId: a.clienteId,
    clienteNome: a.clienteNome ?? '', nota: a.nota,
    comentario: a.comentario ?? null,
    aspectosPositivos: a.aspectosPositivos ?? [],
    aspectosNegativos: a.aspectosNegativos ?? [],
    recomendaria: a.recomendaria ?? true,
    createdAt: a.createdAt,
  };
}

function toContratoDto(c: any): ContratoServicoDto {
  const agora = new Date();
  const diasParaExpirar = Math.floor((new Date(c.dataFim).getTime() - agora.getTime()) / 86_400_000);
  return {
    id: c.id, codigo: c.codigo, clienteId: c.clienteId, clienteNome: c.clienteNome ?? '',
    servicosIds: c.servicosIds ?? [],
    dataInicio: c.dataInicio, dataFim: c.dataFim,
    renovacaoAutomatica: c.renovacaoAutomatica ?? false,
    periodicidade: c.periodicidade, valorMensal: Number(c.valorMensal ?? 0),
    status: c.status, diasParaExpirar,
  };
}
