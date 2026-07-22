// Serviço de Motorista — WS F (Wave 2)
// CRUD de Motorista + gestão de disponibilidade + documentos.
// Sem máquina de estado formal (estado operacional é administrativo).

import 'server-only';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { NotFoundError } from '@/lib/errors';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type {
  CriarMotoristaInput,
  AtualizarMotoristaInput,
  AtualizarDisponibilidadeInput,
  FiltrarMotoristasInput,
  CriarDocumentoMotoristaInput,
} from '@/lib/validations/transporte';

// ============================================================
// Shapes de retorno
// ============================================================

export interface DocumentoMotoristaRef {
  id: string;
  tipo: string;
  numero: string;
  dataEmissao: Date;
  dataValidade: Date;
  entidadeEmissora: string;
  estado: 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO';
}

export interface DisponibilidadeRef {
  disponivel: boolean;
  motivo: string | null;
  dataInicio: Date | null;
  dataFim: Date | null;
  fonte: string;
}

export interface MotoristaResumo {
  id: string;
  tenantId: string;
  nomeCompleto: string;
  contacto: string;
  numeroCarta: string;
  categoriaCarta: string[];
  validadeCarta: Date;
  estadoOperacional: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MotoristaDetalhe extends MotoristaResumo {
  morada: string | null;
  numeroBI: string | null;
  dataEmissaoCarta: Date;
  localActividade: string | null;
  observacoes: string | null;
  documentos: DocumentoMotoristaRef[];
  disponibilidade: DisponibilidadeRef | null;
}

// ============================================================
// Helpers
// ============================================================

const MOTORISTA_RESUMO_SELECT = {
  id: true, tenantId: true, nomeCompleto: true, contacto: true,
  numeroCarta: true, categoriaCarta: true, validadeCarta: true,
  estadoOperacional: true, createdAt: true, updatedAt: true,
} as const;

async function obterDetalhe(id: string, ctx: Ctx): Promise<MotoristaDetalhe> {
  const m = await prisma.motorista.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      ...MOTORISTA_RESUMO_SELECT,
      morada: true, numeroBI: true, dataEmissaoCarta: true,
      localActividade: true, observacoes: true,
      documentos: {
        select: { id: true, tipo: true, numero: true, dataEmissao: true, dataValidade: true, entidadeEmissora: true, estado: true },
        orderBy: { dataValidade: 'asc' },
      },
      disponibilidade: {
        select: { disponivel: true, motivo: true, dataInicio: true, dataFim: true, fonte: true },
      },
    },
  });
  if (!m) throw new NotFoundError('Motorista não encontrado.');

  return {
    id: m.id, tenantId: m.tenantId, nomeCompleto: m.nomeCompleto,
    contacto: m.contacto, numeroCarta: m.numeroCarta,
    categoriaCarta: m.categoriaCarta, validadeCarta: m.validadeCarta,
    estadoOperacional: m.estadoOperacional, createdAt: m.createdAt, updatedAt: m.updatedAt,
    morada: m.morada, numeroBI: m.numeroBI, dataEmissaoCarta: m.dataEmissaoCarta,
    localActividade: m.localActividade, observacoes: m.observacoes,
    documentos: m.documentos.map((d) => ({
      id: d.id, tipo: d.tipo, numero: d.numero, dataEmissao: d.dataEmissao,
      dataValidade: d.dataValidade, entidadeEmissora: d.entidadeEmissora,
      estado: d.estado as 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO',
    })),
    disponibilidade: m.disponibilidade
      ? {
          disponivel: m.disponibilidade.disponivel,
          motivo: m.disponibilidade.motivo ?? null,
          dataInicio: m.disponibilidade.dataInicio,
          dataFim: m.disponibilidade.dataFim,
          fonte: m.disponibilidade.fonte,
        }
      : null,
  };
}

// ============================================================
// CRUD
// ============================================================

export async function criarMotorista(input: CriarMotoristaInput, ctx: Ctx): Promise<MotoristaDetalhe> {
  const motorista = await prisma.motorista.create({
    data: {
      tenantId: ctx.tenantId,
      nomeCompleto: input.nomeCompleto,
      contacto: input.contacto,
      morada: input.morada ?? null,
      numeroBI: input.numeroBI ?? null,
      numeroCarta: input.numeroCarta,
      categoriaCarta: input.categoriaCarta,
      dataEmissaoCarta: input.dataEmissaoCarta,
      validadeCarta: input.validadeCarta,
      localActividade: input.localActividade ?? null,
      observacoes: input.observacoes ?? null,
      // Disponibilidade criada com disponivel=true por defeito
      disponibilidade: {
        create: { tenantId: ctx.tenantId, disponivel: true, fonte: 'SISTEMA' },
      },
    },
    select: { id: true },
  });

  return obterDetalhe(motorista.id, ctx);
}

export async function obterMotorista(id: string, ctx: Ctx): Promise<MotoristaDetalhe> {
  return obterDetalhe(id, ctx);
}

export async function listarMotoristas(
  filtros: FiltrarMotoristasInput,
  ctx: Ctx,
): Promise<PaginatedResult<MotoristaResumo>> {
  const where = {
    tenantId: ctx.tenantId,
    ...(filtros.estadoOperacional ? { estadoOperacional: filtros.estadoOperacional } : {}),
    ...(filtros.disponivel !== undefined
      ? { disponibilidade: { disponivel: filtros.disponivel } }
      : {}),
  };

  const page = await paginate(
    (args) =>
      prisma.motorista.findMany({
        where,
        orderBy: { [filtros.orderBy]: filtros.order },
        select: MOTORISTA_RESUMO_SELECT,
        ...args,
      }),
    { cursor: filtros.cursor, take: filtros.take },
  );

  return {
    items: page.items.map((m) => ({
      id: m.id, tenantId: m.tenantId, nomeCompleto: m.nomeCompleto,
      contacto: m.contacto, numeroCarta: m.numeroCarta,
      categoriaCarta: m.categoriaCarta, validadeCarta: m.validadeCarta,
      estadoOperacional: m.estadoOperacional, createdAt: m.createdAt, updatedAt: m.updatedAt,
    })),
    nextCursor: page.nextCursor,
  };
}

export async function atualizarMotorista(
  id: string,
  input: AtualizarMotoristaInput,
  ctx: Ctx,
): Promise<MotoristaDetalhe> {
  const existente = await prisma.motorista.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!existente) throw new NotFoundError('Motorista não encontrado.');

  await prisma.motorista.update({
    where: { id },
    data: {
      ...(input.nomeCompleto ? { nomeCompleto: input.nomeCompleto } : {}),
      ...(input.contacto ? { contacto: input.contacto } : {}),
      ...(input.morada !== undefined ? { morada: input.morada ?? null } : {}),
      ...(input.numeroBI !== undefined ? { numeroBI: input.numeroBI ?? null } : {}),
      ...(input.numeroCarta ? { numeroCarta: input.numeroCarta } : {}),
      ...(input.categoriaCarta ? { categoriaCarta: input.categoriaCarta } : {}),
      ...(input.dataEmissaoCarta ? { dataEmissaoCarta: input.dataEmissaoCarta } : {}),
      ...(input.validadeCarta ? { validadeCarta: input.validadeCarta } : {}),
      ...(input.localActividade !== undefined ? { localActividade: input.localActividade ?? null } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes ?? null } : {}),
      ...(input.estadoOperacional ? { estadoOperacional: input.estadoOperacional } : {}),
    },
  });

  return obterDetalhe(id, ctx);
}

export async function atualizarDisponibilidade(
  input: AtualizarDisponibilidadeInput,
  ctx: Ctx,
): Promise<{ disponivel: boolean }> {
  const motorista = await prisma.motorista.findFirst({ where: { id: input.motoristaId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!motorista) throw new NotFoundError('Motorista não encontrado.');

  await prisma.disponibilidadeMotorista.upsert({
    where: { motoristaId: input.motoristaId },
    create: {
      tenantId: ctx.tenantId,
      motoristaId: input.motoristaId,
      disponivel: input.disponivel,
      motivo: input.motivo ?? null,
      dataInicio: input.dataInicio ?? null,
      dataFim: input.dataFim ?? null,
      fonte: input.fonte,
    },
    update: {
      disponivel: input.disponivel,
      motivo: input.motivo ?? null,
      dataInicio: input.dataInicio ?? null,
      dataFim: input.dataFim ?? null,
      fonte: input.fonte,
    },
  });

  return { disponivel: input.disponivel };
}

export async function adicionarDocumentoMotorista(
  input: CriarDocumentoMotoristaInput,
  ctx: Ctx,
): Promise<DocumentoMotoristaRef> {
  const motorista = await prisma.motorista.findFirst({ where: { id: input.motoristaId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!motorista) throw new NotFoundError('Motorista não encontrado.');

  const doc = await prisma.documentoMotorista.create({
    data: {
      tenantId: ctx.tenantId,
      motoristaId: input.motoristaId,
      tipo: input.tipo,
      numero: input.numero,
      dataEmissao: input.dataEmissao,
      dataValidade: input.dataValidade,
      entidadeEmissora: input.entidadeEmissora,
      anexo: input.anexo ?? null,
      observacoes: input.observacoes ?? null,
    },
    select: { id: true, tipo: true, numero: true, dataEmissao: true, dataValidade: true, entidadeEmissora: true, estado: true },
  });

  return {
    id: doc.id, tipo: doc.tipo, numero: doc.numero,
    dataEmissao: doc.dataEmissao, dataValidade: doc.dataValidade,
    entidadeEmissora: doc.entidadeEmissora,
    estado: doc.estado as 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO',
  };
}

export const motoristaService = {
  criarMotorista,
  obterMotorista,
  listarMotoristas,
  atualizarMotorista,
  atualizarDisponibilidade,
  adicionarDocumentoMotorista,
};
