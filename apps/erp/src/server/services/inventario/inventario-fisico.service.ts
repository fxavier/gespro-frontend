// Serviço de Inventário Físico de Ativos (WS A — Wave 2)
import 'server-only';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type {
  InventarioFisicoCreate,
  InventarioFisicoFilter,
  InventarioFisicoUpdate,
  JustificarDiscrepancia,
  RegistarContagem,
  TransicaoInventarioFisico,
} from '@/lib/validations/inventario-ativos';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import {
  TRANSICOES_INVENTARIO_FISICO,
  type ContagemInventarioDto,
  type IInventarioFisicoService,
  type InventarioFisicoDto,
  type MembroEquipeInventarioDto,
  type ResultadoReconciliacaoInventario,
} from './inventario-fisico.interface';
import { transitar } from './state-machine';

// ─── Mapeadores ───────────────────────────────────────────────────────────────

const INV_SEL = {
  id: true, tenantId: true, codigo: true, titulo: true, descricao: true, status: true,
  dataInicio: true, dataPrevistaConclusao: true, dataConclusao: true,
  localizacaoId: true, responsavelId: true, localizacoesIncluidas: true, categoriasIncluidas: true,
  totalAtivosEsperados: true, totalAtivosContados: true, totalDiscrepancias: true,
  ajustesRealizados: true, dataAjustes: true, observacoes: true, relatorio: true,
  motivoCancelamento: true, createdAt: true, updatedAt: true,
  membros: { select: { id: true, inventarioId: true, userId: true, localizacoesAtribuidas: true, createdAt: true } },
} as const;

function mapInv(i: {
  id: string; tenantId: string; codigo: string; titulo: string; descricao: string | null;
  status: string; dataInicio: Date; dataPrevistaConclusao: Date | null; dataConclusao: Date | null;
  localizacaoId: string | null; responsavelId: string; localizacoesIncluidas: string[];
  categoriasIncluidas: string[]; totalAtivosEsperados: number | null;
  totalAtivosContados: number | null; totalDiscrepancias: number | null;
  ajustesRealizados: boolean; dataAjustes: Date | null; observacoes: string | null;
  relatorio: string | null; motivoCancelamento: string | null; createdAt: Date; updatedAt: Date;
  membros: Array<{ id: string; inventarioId: string; userId: string; localizacoesAtribuidas: string[]; createdAt: Date }>;
}): InventarioFisicoDto {
  return {
    id: i.id, tenantId: i.tenantId, codigo: i.codigo, titulo: i.titulo, descricao: i.descricao,
    status: i.status, dataInicio: i.dataInicio, dataPrevistaConclusao: i.dataPrevistaConclusao,
    dataConclusao: i.dataConclusao, localizacaoId: i.localizacaoId, responsavelId: i.responsavelId,
    localizacoesIncluidas: i.localizacoesIncluidas, categoriasIncluidas: i.categoriasIncluidas,
    totalAtivosEsperados: i.totalAtivosEsperados, totalAtivosContados: i.totalAtivosContados,
    totalDiscrepancias: i.totalDiscrepancias, ajustesRealizados: i.ajustesRealizados,
    dataAjustes: i.dataAjustes, observacoes: i.observacoes, relatorio: i.relatorio,
    motivoCancelamento: i.motivoCancelamento, createdAt: i.createdAt, updatedAt: i.updatedAt,
    membros: i.membros,
  };
}

const CONT_SEL = {
  id: true, tenantId: true, inventarioId: true, ativoId: true,
  localizacaoEsperadaId: true, responsavelEsperadoId: true, estadoEsperado: true,
  encontrado: true, localizacaoEncontradaId: true, responsavelEncontradoId: true,
  estadoEncontrado: true, dataContagem: true, contadoPorId: true,
  observacoesContagem: true, fotoContagem: true, temDiscrepancia: true,
  tipoDiscrepancia: true, justificativaDiscrepancia: true,
  ajusteRealizado: true, dataAjuste: true, ajustadoPorId: true, createdAt: true,
} as const;

function mapCont(c: {
  id: string; tenantId: string; inventarioId: string; ativoId: string;
  localizacaoEsperadaId: string; responsavelEsperadoId: string | null; estadoEsperado: string;
  encontrado: boolean; localizacaoEncontradaId: string | null;
  responsavelEncontradoId: string | null; estadoEncontrado: string | null;
  dataContagem: Date | null; contadoPorId: string | null; observacoesContagem: string | null;
  fotoContagem: string | null; temDiscrepancia: boolean; tipoDiscrepancia: string | null;
  justificativaDiscrepancia: string | null; ajusteRealizado: boolean;
  dataAjuste: Date | null; ajustadoPorId: string | null; createdAt: Date;
}): ContagemInventarioDto {
  return {
    id: c.id, inventarioId: c.inventarioId, ativoId: c.ativoId,
    localizacaoEsperadaId: c.localizacaoEsperadaId, responsavelEsperadoId: c.responsavelEsperadoId,
    estadoEsperado: c.estadoEsperado, encontrado: c.encontrado,
    localizacaoEncontradaId: c.localizacaoEncontradaId,
    responsavelEncontradoId: c.responsavelEncontradoId, estadoEncontrado: c.estadoEncontrado,
    dataContagem: c.dataContagem, contadoPorId: c.contadoPorId,
    observacoesContagem: c.observacoesContagem, fotoContagem: c.fotoContagem,
    temDiscrepancia: c.temDiscrepancia, tipoDiscrepancia: c.tipoDiscrepancia,
    justificativaDiscrepancia: c.justificativaDiscrepancia,
    ajusteRealizado: c.ajusteRealizado, dataAjuste: c.dataAjuste,
    ajustadoPorId: c.ajustadoPorId, createdAt: c.createdAt,
  };
}

// ─── Implementação ────────────────────────────────────────────────────────────

async function listarInventarios(filter: InventarioFisicoFilter, ctx: Ctx): Promise<PaginatedResult<InventarioFisicoDto>> {
  const page = await paginate(
    (args) => prisma.inventarioFisico.findMany({
      ...args,
      where: {
        tenantId: ctx.tenantId,
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.responsavelId ? { responsavelId: filter.responsavelId } : {}),
        ...(filter.localizacaoId ? { localizacaoId: filter.localizacaoId } : {}),
        ...(filter.dataInicio || filter.dataFim ? {
          dataInicio: {
            ...(filter.dataInicio ? { gte: filter.dataInicio } : {}),
            ...(filter.dataFim ? { lte: filter.dataFim } : {}),
          },
        } : {}),
      },
      select: INV_SEL, orderBy: { createdAt: 'desc' },
    }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapInv), nextCursor: page.nextCursor };
}

async function obterInventario(id: string, ctx: Ctx): Promise<InventarioFisicoDto> {
  const i = await prisma.inventarioFisico.findFirst({ where: { id, tenantId: ctx.tenantId }, select: INV_SEL });
  if (!i) throw new NotFoundError('Inventário físico não encontrado');
  return mapInv(i);
}

async function criarInventario(data: InventarioFisicoCreate, ctx: Ctx): Promise<InventarioFisicoDto> {
  const i = await prisma.inventarioFisico.create({
    data: {
      tenantId: ctx.tenantId,
      codigo: data.codigo, titulo: data.titulo, descricao: data.descricao ?? null,
      dataInicio: data.dataInicio, dataPrevistaConclusao: data.dataPrevistaConclusao ?? null,
      localizacaoId: data.localizacaoId ?? null, responsavelId: data.responsavelId,
      localizacoesIncluidas: data.localizacoesIncluidas,
      categoriasIncluidas: data.categoriasIncluidas,
      observacoes: data.observacoes ?? null,
      criadoPor: ctx.userId,
    },
    select: INV_SEL,
  });
  return mapInv(i);
}

async function actualizarInventario(id: string, data: InventarioFisicoUpdate, ctx: Ctx): Promise<InventarioFisicoDto> {
  await obterInventario(id, ctx);
  const i = await prisma.inventarioFisico.update({
    where: { id },
    data: { ...data, atualizadoPor: ctx.userId },
    select: INV_SEL,
  });
  return mapInv(i);
}

async function transitarStatus(input: TransicaoInventarioFisico, ctx: Ctx): Promise<InventarioFisicoDto> {
  const inv = await obterInventario(input.inventarioId, ctx);
  transitar(TRANSICOES_INVENTARIO_FISICO as never, inv.status as never, input.novoStatus as never, 'InventarioFisico');

  const update: Record<string, unknown> = {
    status: input.novoStatus as never,
    atualizadoPor: ctx.userId,
    ...(input.observacoes ? { observacoes: input.observacoes } : {}),
    ...(input.motivoCancelamento ? { motivoCancelamento: input.motivoCancelamento } : {}),
  };

  // AGENDADO → EM_ANDAMENTO: gera lista de ContagemInventario
  if (input.novoStatus === 'EM_ANDAMENTO') {
    const whereAtivos: Record<string, unknown> = { tenantId: ctx.tenantId, deletedAt: null };
    if (inv.localizacoesIncluidas.length > 0) {
      whereAtivos.localizacaoId = { in: inv.localizacoesIncluidas };
    }
    if (inv.categoriasIncluidas.length > 0) {
      whereAtivos.categoriaId = { in: inv.categoriasIncluidas };
    }
    const ativos = await prisma.ativo.findMany({
      where: whereAtivos as never,
      select: { id: true, localizacaoId: true, responsavelId: true, estado: true },
    });

    if (ativos.length > 0) {
      // Criar contagens ignorando duplicados (upsert não disponível para createMany no Prisma)
      for (const a of ativos) {
        await prisma.contagemInventario.upsert({
          where: { inventarioId_ativoId: { inventarioId: inv.id, ativoId: a.id } },
          create: {
            tenantId: ctx.tenantId,
            inventarioId: inv.id, ativoId: a.id,
            localizacaoEsperadaId: a.localizacaoId,
            responsavelEsperadoId: a.responsavelId ?? null,
            estadoEsperado: a.estado as never,
          },
          update: {},
        });
      }
      update.totalAtivosEsperados = ativos.length;
    }
  }

  if (input.novoStatus === 'CONCLUIDO') {
    update.dataConclusao = new Date();
    // Verificar se todos contados
    const pendentes = await prisma.contagemInventario.count({
      where: { inventarioId: inv.id, dataContagem: null },
    });
    if (pendentes > 0) {
      throw new BusinessRuleError('CONTAGENS_PENDENTES', `Existem ${pendentes} ativos por contar`);
    }
  }

  const i = await prisma.inventarioFisico.update({
    where: { id: input.inventarioId },
    data: update as never,
    select: INV_SEL,
  });
  return mapInv(i);
}

async function adicionarMembro(inventarioId: string, userId: string, localizacoesAtribuidas: string[], ctx: Ctx): Promise<MembroEquipeInventarioDto> {
  await obterInventario(inventarioId, ctx);
  const m = await prisma.membroEquipeInventario.upsert({
    where: { inventarioId_userId: { inventarioId, userId } },
    create: { tenantId: ctx.tenantId, inventarioId, userId, localizacoesAtribuidas },
    update: { localizacoesAtribuidas },
    select: { id: true, inventarioId: true, userId: true, localizacoesAtribuidas: true, createdAt: true },
  });
  return { id: m.id, inventarioId: m.inventarioId, userId: m.userId, localizacoesAtribuidas: m.localizacoesAtribuidas, createdAt: m.createdAt };
}

async function removerMembro(inventarioId: string, userId: string, ctx: Ctx): Promise<void> {
  await obterInventario(inventarioId, ctx);
  await prisma.membroEquipeInventario.deleteMany({ where: { inventarioId, userId } });
}

async function listarContagens(inventarioId: string, ctx: Ctx): Promise<ContagemInventarioDto[]> {
  const cs = await prisma.contagemInventario.findMany({
    where: { inventarioId, tenantId: ctx.tenantId },
    select: CONT_SEL,
    orderBy: { createdAt: 'asc' },
  });
  return cs.map(mapCont);
}

async function registarContagem(data: RegistarContagem, ctx: Ctx): Promise<ContagemInventarioDto> {
  const item = await prisma.contagemInventario.findFirst({ where: { id: data.itemId, tenantId: ctx.tenantId } });
  if (!item) throw new NotFoundError('Item de contagem não encontrado');

  const temDiscrepancia = !data.encontrado ||
    (data.localizacaoEncontradaId != null && data.localizacaoEncontradaId !== item.localizacaoEsperadaId) ||
    (data.estadoEncontrado != null && data.estadoEncontrado !== item.estadoEsperado);

  const updated = await prisma.contagemInventario.update({
    where: { id: data.itemId },
    data: {
      encontrado: data.encontrado,
      localizacaoEncontradaId: data.localizacaoEncontradaId ?? null,
      responsavelEncontradoId: data.responsavelEncontradoId ?? null,
      estadoEncontrado: (data.estadoEncontrado ?? null) as never,
      dataContagem: new Date(),
      contadoPorId: ctx.userId,
      observacoesContagem: data.observacoesContagem ?? null,
      fotoContagem: data.fotoContagem ?? null,
      temDiscrepancia,
    },
    select: CONT_SEL,
  });

  // Actualiza total contados no inventário
  const contados = await prisma.contagemInventario.count({
    where: { inventarioId: item.inventarioId, dataContagem: { not: null } },
  });
  const discrepancias = await prisma.contagemInventario.count({
    where: { inventarioId: item.inventarioId, temDiscrepancia: true },
  });
  await prisma.inventarioFisico.update({
    where: { id: item.inventarioId },
    data: { totalAtivosContados: contados, totalDiscrepancias: discrepancias },
  });

  return mapCont(updated);
}

async function justificarDiscrepancia(data: JustificarDiscrepancia, ctx: Ctx): Promise<ContagemInventarioDto> {
  const item = await prisma.contagemInventario.findFirst({ where: { id: data.itemId, tenantId: ctx.tenantId } });
  if (!item) throw new NotFoundError('Item de contagem não encontrado');
  if (!item.temDiscrepancia) throw new BusinessRuleError('SEM_DISCREPANCIA', 'Item não tem discrepância registada');

  const updated = await prisma.contagemInventario.update({
    where: { id: data.itemId },
    data: {
      tipoDiscrepancia: data.tipoDiscrepancia as never,
      justificativaDiscrepancia: data.justificativaDiscrepancia,
    },
    select: CONT_SEL,
  });
  return mapCont(updated);
}

async function reconciliar(inventarioId: string, ctx: Ctx): Promise<ResultadoReconciliacaoInventario> {
  const inv = await obterInventario(inventarioId, ctx);
  if (inv.status !== 'CONCLUIDO') {
    throw new BusinessRuleError('INVENTARIO_NAO_CONCLUIDO', 'Inventário deve estar CONCLUIDO para reconciliar');
  }

  const contagens = await prisma.contagemInventario.findMany({
    where: { inventarioId, tenantId: ctx.tenantId },
    select: { id: true, ativoId: true, temDiscrepancia: true, encontrado: true,
      localizacaoEncontradaId: true, estadoEncontrado: true, ajusteRealizado: true },
  });

  let ajustesGerados = 0;
  const movimentosGerados: string[] = [];

  for (const c of contagens) {
    if (!c.temDiscrepancia || c.ajusteRealizado) continue;

    if (c.localizacaoEncontradaId) {
      // Ajustar localização do ativo
      await prisma.ativo.update({
        where: { id: c.ativoId },
        data: { localizacaoId: c.localizacaoEncontradaId },
      });
      await prisma.movimentacaoAtivo.create({
        data: {
          tenantId: ctx.tenantId, ativoId: c.ativoId, tipo: 'AJUSTE' as never,
          dataMovimentacao: new Date(),
          motivo: `Ajuste de inventário ${inventarioId}`,
          criadoPor: ctx.userId,
          localizacaoDestinoId: c.localizacaoEncontradaId,
        },
        select: { id: true },
      }).then((m) => movimentosGerados.push(m.id));
    }

    await prisma.contagemInventario.update({
      where: { id: c.id },
      data: { ajusteRealizado: true, dataAjuste: new Date(), ajustadoPorId: ctx.userId },
    });
    ajustesGerados++;
  }

  if (ajustesGerados > 0) {
    await prisma.inventarioFisico.update({
      where: { id: inventarioId },
      data: { ajustesRealizados: true, dataAjustes: new Date() },
    });
  }

  return {
    inventarioId,
    totalAtivos: contagens.length,
    encontrados: contagens.filter((c) => c.encontrado).length,
    naoEncontrados: contagens.filter((c) => !c.encontrado).length,
    comDiscrepancias: contagens.filter((c) => c.temDiscrepancia).length,
    ajustesGerados,
    movimentosGerados,
  };
}

export const inventarioFisicoService: IInventarioFisicoService = {
  listarInventarios, obterInventario, criarInventario, actualizarInventario, transitarStatus,
  adicionarMembro, removerMembro, listarContagens, registarContagem, justificarDiscrepancia, reconciliar,
};
