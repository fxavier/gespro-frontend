// Serviço de Viatura & Motorista — WS F (Wave 2)
// Implementa IViaturaService + CRUD de Motorista sobre Prisma.

import 'server-only';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { transitar, assertTenant } from './_helpers';
import { TRANSICOES_VIATURA } from './viatura.interface';
import type { IViaturaService, EstadoViatura, ViaturaDetalhe, ViaturaResumo, DocumentoViaturaRef, ManutencaoViaturaRef, ChecklistRef } from './viatura.interface';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type { CriarViaturaInput, AtualizarViaturaInput, FiltrarViaturasInput, CriarDocumentoViaturaInput, CriarManutencaoViaturaInput, CriarChecklistInput } from '@/lib/validations/transporte';

// ============================================================
// Helpers de mapeamento
// ============================================================

function mapDocumento(d: {
  id: string; tipo: string; numero: string; dataEmissao: Date;
  dataValidade: Date; entidadeEmissora: string; estado: string; prazoAlertaDias: number;
}): DocumentoViaturaRef {
  return {
    id: d.id,
    tipo: d.tipo,
    numero: d.numero,
    dataEmissao: d.dataEmissao,
    dataValidade: d.dataValidade,
    entidadeEmissora: d.entidadeEmissora,
    estado: d.estado as 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO',
    prazoAlertaDias: d.prazoAlertaDias,
  };
}

function mapManutencao(m: {
  id: string; tipo: string; data: Date; quilometragem: number | null;
  descricao: string; custo: { toString(): string } | null; proximaManutencaoData: Date | null;
}): ManutencaoViaturaRef {
  return {
    id: m.id,
    tipo: m.tipo,
    data: m.data,
    quilometragem: m.quilometragem,
    descricao: m.descricao,
    custo: m.custo ? m.custo.toString() : null,
    proximaManutencaoData: m.proximaManutencaoData,
  };
}

function mapChecklist(c: {
  id: string; dataInspeccao: Date; responsavel: string;
  itens: Array<{ id: string; nome: string; categoria: string; estado: string; observacoes: string | null }>;
}): ChecklistRef {
  return {
    id: c.id,
    dataInspeccao: c.dataInspeccao,
    responsavel: c.responsavel,
    itens: c.itens.map((i) => ({
      id: i.id,
      nome: i.nome,
      categoria: i.categoria,
      estado: i.estado as 'OK' | 'AVARIA' | 'FALTA',
      observacoes: i.observacoes,
    })),
  };
}

const VIATURA_RESUMO_SELECT = {
  id: true, tenantId: true, matricula: true, marca: true, modelo: true,
  tipoViatura: true, capacidade: true, unidadeCapacidade: true,
  localActividade: true, dataInicioActividade: true,
  motoristaResponsavelId: true, estado: true, createdAt: true, updatedAt: true,
} as const;

const CHECKLIST_COM_ITENS_SELECT = {
  id: true, dataInspeccao: true, responsavel: true,
  itens: { select: { id: true, nome: true, categoria: true, estado: true, observacoes: true } },
} as const;

async function obterChecklistRecente(viaturaId: string, tenantId: string): Promise<ChecklistRef | null> {
  const checklist = await prisma.checklist.findFirst({
    where: { viaturaId, tenantId },
    orderBy: { dataInspeccao: 'desc' },
    select: CHECKLIST_COM_ITENS_SELECT,
  });
  return checklist ? mapChecklist(checklist) : null;
}

async function obterDetalhe(id: string, ctx: Ctx): Promise<ViaturaDetalhe> {
  const v = await prisma.viatura.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      ...VIATURA_RESUMO_SELECT,
      observacoes: true,
      documentos: { select: { id: true, tipo: true, numero: true, dataEmissao: true, dataValidade: true, entidadeEmissora: true, estado: true, prazoAlertaDias: true }, orderBy: { dataValidade: 'asc' } },
      manutencoes: { select: { id: true, tipo: true, data: true, quilometragem: true, descricao: true, custo: true, proximaManutencaoData: true }, orderBy: { data: 'desc' }, take: 10 },
    },
  });
  if (!v) throw new NotFoundError('Viatura não encontrada.');

  const checklistRecente = await obterChecklistRecente(id, ctx.tenantId);

  return {
    id: v.id, tenantId: v.tenantId, matricula: v.matricula, marca: v.marca,
    modelo: v.modelo, tipoViatura: v.tipoViatura, capacidade: v.capacidade.toString(),
    unidadeCapacidade: v.unidadeCapacidade, localActividade: v.localActividade,
    dataInicioActividade: v.dataInicioActividade,
    motoristaResponsavelId: v.motoristaResponsavelId,
    estado: v.estado as EstadoViatura,
    createdAt: v.createdAt, updatedAt: v.updatedAt,
    observacoes: v.observacoes,
    documentos: v.documentos.map(mapDocumento),
    manutencoes: v.manutencoes.map(mapManutencao),
    checklistRecente,
  };
}

// ============================================================
// IViaturaService
// ============================================================

async function transitarViatura(
  viaturaId: string,
  estadoAlvo: EstadoViatura,
  ctx: Ctx,
  motivo?: string,
): Promise<ViaturaDetalhe> {
  const viatura = await prisma.viatura.findFirst({
    where: { id: viaturaId, tenantId: ctx.tenantId },
    select: { id: true, tenantId: true, estado: true, documentos: { select: { id: true, estado: true } } },
  });
  if (!viatura) throw new NotFoundError('Viatura não encontrada.');

  transitar(TRANSICOES_VIATURA, viatura.estado as EstadoViatura, estadoAlvo);

  // Regra adicional: ir para EM_ACTIVIDADE com documentos expirados é proibido
  if (estadoAlvo === 'EM_ACTIVIDADE') {
    const expirados = viatura.documentos.filter((d) => d.estado === 'EXPIRADO');
    if (expirados.length > 0) {
      throw new BusinessRuleError(
        'VIATURA_COM_DOCUMENTOS_EXPIRADOS',
        `A viatura tem ${expirados.length} documento(s) expirado(s). Renove antes de alocar.`,
        { expirados: expirados.map((d) => d.id) },
      );
    }
  }

  await prisma.viatura.update({
    where: { id: viaturaId },
    data: { estado: estadoAlvo },
  });

  return obterDetalhe(viaturaId, ctx);
}

async function criarViatura(input: CriarViaturaInput, ctx: Ctx): Promise<ViaturaDetalhe> {
  const viatura = await prisma.viatura.create({
    data: {
      tenantId: ctx.tenantId,
      matricula: input.matricula,
      marca: input.marca,
      modelo: input.modelo,
      tipoViatura: input.tipoViatura,
      capacidade: input.capacidade,
      unidadeCapacidade: input.unidadeCapacidade,
      localActividade: input.localActividade,
      dataInicioActividade: input.dataInicioActividade,
      motoristaResponsavelId: input.motoristaResponsavelId ?? null,
      observacoes: input.observacoes ?? null,
    },
    select: { id: true },
  });

  return obterDetalhe(viatura.id, ctx);
}

async function obterViatura(id: string, ctx: Ctx): Promise<ViaturaDetalhe> {
  return obterDetalhe(id, ctx);
}

async function listarViaturas(
  filtros: FiltrarViaturasInput,
  ctx: Ctx,
): Promise<PaginatedResult<ViaturaResumo>> {
  const where = {
    tenantId: ctx.tenantId,
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.tipoViatura ? { tipoViatura: filtros.tipoViatura } : {}),
    ...(filtros.motoristaResponsavelId ? { motoristaResponsavelId: filtros.motoristaResponsavelId } : {}),
  };

  const page = await paginate(
    (args) =>
      prisma.viatura.findMany({
        where,
        orderBy: { [filtros.orderBy]: filtros.order },
        select: VIATURA_RESUMO_SELECT,
        ...args,
      }),
    { cursor: filtros.cursor, take: filtros.take },
  );

  return {
    items: page.items.map((v) => ({
      id: v.id, tenantId: v.tenantId, matricula: v.matricula, marca: v.marca,
      modelo: v.modelo, tipoViatura: v.tipoViatura, capacidade: v.capacidade.toString(),
      unidadeCapacidade: v.unidadeCapacidade, localActividade: v.localActividade,
      dataInicioActividade: v.dataInicioActividade,
      motoristaResponsavelId: v.motoristaResponsavelId,
      estado: v.estado as EstadoViatura,
      createdAt: v.createdAt, updatedAt: v.updatedAt,
    })),
    nextCursor: page.nextCursor,
  };
}

async function atualizarViatura(
  id: string,
  input: AtualizarViaturaInput,
  ctx: Ctx,
): Promise<ViaturaDetalhe> {
  const existente = await prisma.viatura.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Viatura não encontrada.');

  await prisma.viatura.update({
    where: { id },
    data: {
      ...(input.matricula ? { matricula: input.matricula } : {}),
      ...(input.marca ? { marca: input.marca } : {}),
      ...(input.modelo ? { modelo: input.modelo } : {}),
      ...(input.tipoViatura ? { tipoViatura: input.tipoViatura } : {}),
      ...(input.capacidade !== undefined ? { capacidade: input.capacidade } : {}),
      ...(input.unidadeCapacidade ? { unidadeCapacidade: input.unidadeCapacidade } : {}),
      ...(input.localActividade ? { localActividade: input.localActividade } : {}),
      ...(input.dataInicioActividade ? { dataInicioActividade: input.dataInicioActividade } : {}),
      ...(input.motoristaResponsavelId !== undefined ? { motoristaResponsavelId: input.motoristaResponsavelId ?? null } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes ?? null } : {}),
    },
  });

  return obterDetalhe(id, ctx);
}

async function adicionarDocumentoViatura(
  input: CriarDocumentoViaturaInput,
  ctx: Ctx,
): Promise<DocumentoViaturaRef> {
  const viatura = await prisma.viatura.findFirst({ where: { id: input.viaturaId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!viatura) throw new NotFoundError('Viatura não encontrada.');

  const doc = await prisma.documentoViatura.create({
    data: {
      tenantId: ctx.tenantId,
      viaturaId: input.viaturaId,
      tipo: input.tipo,
      numero: input.numero,
      dataEmissao: input.dataEmissao,
      dataValidade: input.dataValidade,
      entidadeEmissora: input.entidadeEmissora,
      prazoAlertaDias: input.prazoAlertaDias,
      anexo: input.anexo ?? null,
      observacoes: input.observacoes ?? null,
      // estado VALIDO é o default — será actualizado pelo cron F3
    },
    select: { id: true, tipo: true, numero: true, dataEmissao: true, dataValidade: true, entidadeEmissora: true, estado: true, prazoAlertaDias: true },
  });

  return mapDocumento(doc);
}

async function registarManutencao(
  input: CriarManutencaoViaturaInput,
  ctx: Ctx,
): Promise<ManutencaoViaturaRef> {
  const viatura = await prisma.viatura.findFirst({ where: { id: input.viaturaId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!viatura) throw new NotFoundError('Viatura não encontrada.');

  const m = await prisma.manutencaoViatura.create({
    data: {
      tenantId: ctx.tenantId,
      viaturaId: input.viaturaId,
      tipo: input.tipo,
      data: input.data,
      quilometragem: input.quilometragem ?? null,
      criterio: input.criterio ?? null,
      descricao: input.descricao,
      fornecedor: input.fornecedor ?? null,
      custo: input.custo ?? null,
      pecasSubstituidas: input.pecasSubstituidas ?? null,
      responsavel: input.responsavel,
      proximaManutencaoData: input.proximaManutencaoData ?? null,
      proximaManutencaoKm: input.proximaManutencaoKm ?? null,
      proximaManutencaoCriterio: input.proximaManutencaoCriterio ?? null,
    },
    select: { id: true, tipo: true, data: true, quilometragem: true, descricao: true, custo: true, proximaManutencaoData: true },
  });

  return mapManutencao(m);
}

async function registarChecklist(
  input: CriarChecklistInput,
  ctx: Ctx,
): Promise<ChecklistRef> {
  const viatura = await prisma.viatura.findFirst({ where: { id: input.viaturaId, tenantId: ctx.tenantId }, select: { id: true, tipoViatura: true } });
  if (!viatura) throw new NotFoundError('Viatura não encontrada.');

  const checklist = await prisma.checklist.create({
    data: {
      tenantId: ctx.tenantId,
      viaturaId: input.viaturaId,
      tipoViatura: viatura.tipoViatura,
      responsavel: input.responsavel,
      responsavelId: input.responsavelId ?? null,
      dataInspeccao: input.dataInspeccao,
      observacoes: input.observacoes ?? null,
      itens: {
        create: input.itens.map((item) => ({
          tenantId: ctx.tenantId,
          nome: item.nome,
          categoria: item.categoria,
          estado: item.estado,
          observacoes: item.observacoes ?? null,
        })),
      },
    },
    select: CHECKLIST_COM_ITENS_SELECT,
  });

  return mapChecklist(checklist);
}

export const viaturaService: IViaturaService = {
  transitarViatura,
  criarViatura,
  obterViatura,
  listarViaturas,
  atualizarViatura,
  adicionarDocumentoViatura,
  registarManutencao,
  registarChecklist,
};
