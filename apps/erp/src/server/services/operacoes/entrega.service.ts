// Serviço de Entrega — WS F (Wave 3)
// Implementa IEntregaService. Numeração via proximoNumeroSerie(tx, 'ENTREGA', ctx) de WS D.

import 'server-only';
import { prisma, prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { transitar } from './_helpers';
import { proximoNumeroSerie } from '@/server/services/financas';
import { TRANSICOES_ENTREGA } from './entrega.interface';
import type { IEntregaService, EstadoEntrega, EntregaDetalhe, EntregaResumo, ItemEntregaRef } from './entrega.interface';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type { CriarEntregaInput, AtualizarEntregaInput, TransitarEntregaInput, RegistarProvaEntregaInput, FiltrarEntregasInput } from '@/lib/validations/transporte';

// ============================================================
// Helpers
// ============================================================

function mapItem(i: {
  id: string; tenantId: string; entregaId: string; produtoId: string; produtoNome: string;
  quantidade: number; peso: { toString(): string }; volume: { toString(): string }; valor: { toString(): string };
}): ItemEntregaRef {
  return {
    id: i.id, tenantId: i.tenantId, entregaId: i.entregaId,
    produtoId: i.produtoId, produtoNome: i.produtoNome, quantidade: i.quantidade,
    peso: i.peso.toString(), volume: i.volume.toString(), valor: i.valor.toString(),
  };
}

const ENTREGA_RESUMO_SELECT = {
  id: true, tenantId: true, numero: true, vendaId: true,
  clienteId: true, clienteNome: true, enderecoEntrega: true, cidade: true,
  rotaId: true, viaturaId: true, motoristaId: true,
  dataAgendada: true, dataEntrega: true, estado: true, prioridade: true,
  taxaEntrega: true, createdAt: true, updatedAt: true,
} as const;

async function obterDetalhe(id: string, ctx: Ctx): Promise<EntregaDetalhe> {
  const e = await prisma.entrega.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      ...ENTREGA_RESUMO_SELECT,
      clienteTelefone: true, observacoes: true,
      pesoTotal: true, volumeTotal: true, valorCarga: true,
      comprovanteTipo: true, comprovanteDados: true,
      comprovanteDataHora: true, comprovanteRecebedor: true,
      motivoFalha: true, tentativasEntrega: true,
      itens: {
        select: { id: true, tenantId: true, entregaId: true, produtoId: true, produtoNome: true, quantidade: true, peso: true, volume: true, valor: true },
      },
    },
  });
  if (!e) throw new NotFoundError('Entrega não encontrada.');

  return {
    id: e.id, tenantId: e.tenantId, numero: e.numero,
    vendaId: e.vendaId, clienteId: e.clienteId, clienteNome: e.clienteNome,
    enderecoEntrega: e.enderecoEntrega, cidade: e.cidade,
    rotaId: e.rotaId, viaturaId: e.viaturaId, motoristaId: e.motoristaId,
    dataAgendada: e.dataAgendada, dataEntrega: e.dataEntrega,
    estado: e.estado as EstadoEntrega, prioridade: e.prioridade,
    taxaEntrega: e.taxaEntrega.toString(),
    createdAt: e.createdAt, updatedAt: e.updatedAt,
    clienteTelefone: e.clienteTelefone, observacoes: e.observacoes,
    pesoTotal: e.pesoTotal.toString(), volumeTotal: e.volumeTotal.toString(), valorCarga: e.valorCarga.toString(),
    comprovanteTipo: e.comprovanteTipo ?? null, comprovanteDados: e.comprovanteDados ?? null,
    comprovanteDataHora: e.comprovanteDataHora, comprovanteRecebedor: e.comprovanteRecebedor ?? null,
    motivoFalha: e.motivoFalha, tentativasEntrega: e.tentativasEntrega,
    itens: e.itens.map(mapItem),
  };
}

// ============================================================
// IEntregaService
// ============================================================

async function criarEntrega(input: CriarEntregaInput, ctx: Ctx): Promise<EntregaDetalhe> {
  const entrega = await prismaBase.$transaction(async (tx) => {
    const numero = await proximoNumeroSerie(tx, 'ENTREGA', ctx);

    const created = await tx.entrega.create({
      data: {
        tenantId: ctx.tenantId,
        numero,
        vendaId: input.vendaId ?? null,
        clienteId: input.clienteId,
        clienteNome: input.clienteNome,
        clienteTelefone: input.clienteTelefone,
        enderecoEntrega: input.enderecoEntrega,
        cidade: input.cidade,
        rotaId: input.rotaId ?? null,
        viaturaId: input.viaturaId ?? null,
        motoristaId: input.motoristaId ?? null,
        dataAgendada: input.dataAgendada,
        prioridade: input.prioridade,
        pesoTotal: input.pesoTotal,
        volumeTotal: input.volumeTotal,
        valorCarga: input.valorCarga,
        taxaEntrega: input.taxaEntrega,
        observacoes: input.observacoes ?? null,
        itens: {
          create: input.itens.map((item) => ({
            tenantId: ctx.tenantId,
            produtoId: item.produtoId,
            produtoNome: item.produtoNome,
            quantidade: item.quantidade,
            peso: item.peso,
            volume: item.volume,
            valor: item.valor,
          })),
        },
      },
      select: { id: true },
    });

    return created;
  });

  return obterDetalhe(entrega.id, ctx);
}

async function obterEntrega(id: string, ctx: Ctx): Promise<EntregaDetalhe> {
  return obterDetalhe(id, ctx);
}

async function listarEntregas(
  filtros: FiltrarEntregasInput,
  ctx: Ctx,
): Promise<PaginatedResult<EntregaResumo>> {
  const where = {
    tenantId: ctx.tenantId,
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.prioridade ? { prioridade: filtros.prioridade } : {}),
    ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
    ...(filtros.rotaId ? { rotaId: filtros.rotaId } : {}),
    ...(filtros.viaturaId ? { viaturaId: filtros.viaturaId } : {}),
    ...(filtros.motoristaId ? { motoristaId: filtros.motoristaId } : {}),
    ...(filtros.dataInicio || filtros.dataFim
      ? { dataAgendada: { ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}), ...(filtros.dataFim ? { lte: filtros.dataFim } : {}) } }
      : {}),
  };

  const page = await paginate(
    (args) => prisma.entrega.findMany({ where, orderBy: { [filtros.orderBy]: filtros.order }, select: ENTREGA_RESUMO_SELECT, ...args }),
    { cursor: filtros.cursor, take: filtros.take },
  );

  return {
    items: page.items.map((e) => ({
      id: e.id, tenantId: e.tenantId, numero: e.numero,
      vendaId: e.vendaId, clienteId: e.clienteId, clienteNome: e.clienteNome,
      enderecoEntrega: e.enderecoEntrega, cidade: e.cidade,
      rotaId: e.rotaId, viaturaId: e.viaturaId, motoristaId: e.motoristaId,
      dataAgendada: e.dataAgendada, dataEntrega: e.dataEntrega,
      estado: e.estado as EstadoEntrega, prioridade: e.prioridade,
      taxaEntrega: e.taxaEntrega.toString(),
      createdAt: e.createdAt, updatedAt: e.updatedAt,
    })),
    nextCursor: page.nextCursor,
  };
}

async function atualizarEntrega(id: string, input: AtualizarEntregaInput, ctx: Ctx): Promise<EntregaDetalhe> {
  const existente = await prisma.entrega.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Entrega não encontrada.');

  await prisma.entrega.update({
    where: { id },
    data: {
      ...(input.clienteNome ? { clienteNome: input.clienteNome } : {}),
      ...(input.clienteTelefone ? { clienteTelefone: input.clienteTelefone } : {}),
      ...(input.enderecoEntrega ? { enderecoEntrega: input.enderecoEntrega } : {}),
      ...(input.cidade ? { cidade: input.cidade } : {}),
      ...(input.dataAgendada ? { dataAgendada: input.dataAgendada } : {}),
      ...(input.prioridade ? { prioridade: input.prioridade } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes ?? null } : {}),
    },
  });

  return obterDetalhe(id, ctx);
}

async function transitarEntrega(input: TransitarEntregaInput, ctx: Ctx): Promise<EntregaDetalhe> {
  const entrega = await prisma.entrega.findFirst({
    where: { id: input.entregaId, tenantId: ctx.tenantId },
    select: {
      id: true, tenantId: true, estado: true, tentativasEntrega: true,
      comprovanteDados: true,
    },
  });
  if (!entrega) throw new NotFoundError('Entrega não encontrada.');

  const estadoActual = entrega.estado as EstadoEntrega;
  transitar(TRANSICOES_ENTREGA, estadoActual, input.estadoAlvo as EstadoEntrega);

  // Regra: EM_TRANSITO → ENTREGUE requer comprovante
  if (estadoActual === 'EM_TRANSITO' && input.estadoAlvo === 'ENTREGUE') {
    if (!entrega.comprovanteDados) {
      throw new BusinessRuleError(
        'COMPROVANTE_OBRIGATORIO',
        'É necessário registar prova de entrega antes de marcar como ENTREGUE.',
      );
    }
  }

  // Regra: EM_TRANSITO → FALHADA requer motivo
  if (estadoActual === 'EM_TRANSITO' && input.estadoAlvo === 'FALHADA') {
    if (!input.motivoFalha) {
      throw new BusinessRuleError(
        'MOTIVO_OBRIGATORIO',
        'É necessário indicar o motivo de falha.',
      );
    }
  }

  const dataUpdate: Record<string, unknown> = { estado: input.estadoAlvo };
  if (input.estadoAlvo === 'ENTREGUE') dataUpdate.dataEntrega = new Date();
  if (input.estadoAlvo === 'FALHADA') {
    dataUpdate.motivoFalha = input.motivoFalha;
    dataUpdate.tentativasEntrega = entrega.tentativasEntrega + 1;
  }

  await prisma.entrega.update({ where: { id: input.entregaId }, data: dataUpdate });

  return obterDetalhe(input.entregaId, ctx);
}

async function registarProvaEntrega(input: RegistarProvaEntregaInput, ctx: Ctx): Promise<EntregaDetalhe> {
  const entrega = await prisma.entrega.findFirst({
    where: { id: input.entregaId, tenantId: ctx.tenantId },
    select: { id: true, estado: true },
  });
  if (!entrega) throw new NotFoundError('Entrega não encontrada.');

  const estadoActual = entrega.estado as EstadoEntrega;

  // Valida transição pelo mapa — impede registar prova a partir de PENDENTE/CANCELADA etc.
  transitar(TRANSICOES_ENTREGA, estadoActual, 'ENTREGUE');

  // Regista prova e transita para ENTREGUE atomicamente
  await prisma.$transaction(async (tx) => {
    await tx.entrega.update({
      where: { id: input.entregaId },
      data: {
        comprovanteTipo: input.tipo,
        comprovanteDados: input.dados,
        comprovanteDataHora: input.dataHora,
        comprovanteRecebedor: input.recebedor,
        estado: 'ENTREGUE',
        dataEntrega: input.dataHora,
      },
    });
  });

  return obterDetalhe(input.entregaId, ctx);
}

async function atribuirRecursos(
  entregaId: string,
  viaturaId: string | null,
  motoristaId: string | null,
  rotaId: string | null,
  ctx: Ctx,
): Promise<EntregaDetalhe> {
  const entrega = await prisma.entrega.findFirst({
    where: { id: entregaId, tenantId: ctx.tenantId },
    select: { id: true, estado: true },
  });
  if (!entrega) throw new NotFoundError('Entrega não encontrada.');

  if (entrega.estado !== 'PENDENTE' && entrega.estado !== 'AGENDADA') {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      'Só é possível atribuir recursos a entregas PENDENTE ou AGENDADA.',
    );
  }

  await prisma.entrega.update({
    where: { id: entregaId },
    data: {
      ...(viaturaId !== null ? { viaturaId } : {}),
      ...(motoristaId !== null ? { motoristaId } : {}),
      ...(rotaId !== null ? { rotaId } : {}),
    },
  });

  return obterDetalhe(entregaId, ctx);
}

export const entregaService: IEntregaService = {
  criarEntrega,
  obterEntrega,
  listarEntregas,
  atualizarEntrega,
  transitarEntrega,
  registarProvaEntrega,
  atribuirRecursos,
};
