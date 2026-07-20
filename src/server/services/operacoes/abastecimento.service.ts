// Serviço de Abastecimento — WS F (Wave 2)
// Implementa IAbastecimentoService. Registos append-only (imutáveis após persistência).

import 'server-only';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { IAbastecimentoService, AbastecimentoResumo, EficienciaViatura } from './abastecimento.interface';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import type { RegistarAbastecimentoInput, FiltrarAbastecimentosInput } from '@/lib/validations/transporte';

// ============================================================
// Helpers
// ============================================================

const ABASTECIMENTO_SELECT = {
  id: true, tenantId: true, viaturaId: true, motoristaId: true, data: true,
  kmVeiculo: true, tipoCombustivel: true, litros: true, valorLitro: true,
  valorTotal: true, posto: true, notaFiscal: true, kmPercorrido: true,
  consumoMedio: true, rotaId: true, createdAt: true,
} as const;

function mapAbastecimento(a: {
  id: string; tenantId: string; viaturaId: string; motoristaId: string; data: Date;
  kmVeiculo: number; tipoCombustivel: string;
  litros: { toString(): string }; valorLitro: { toString(): string }; valorTotal: { toString(): string };
  posto: string | null; notaFiscal: string | null; kmPercorrido: number | null;
  consumoMedio: { toString(): string } | null; rotaId: string | null; createdAt: Date;
}): AbastecimentoResumo {
  return {
    id: a.id, tenantId: a.tenantId, viaturaId: a.viaturaId, motoristaId: a.motoristaId,
    data: a.data, kmVeiculo: a.kmVeiculo, tipoCombustivel: a.tipoCombustivel,
    litros: a.litros.toString(), valorLitro: a.valorLitro.toString(), valorTotal: a.valorTotal.toString(),
    posto: a.posto, notaFiscal: a.notaFiscal, kmPercorrido: a.kmPercorrido,
    consumoMedio: a.consumoMedio ? a.consumoMedio.toString() : null,
    rotaId: a.rotaId, createdAt: a.createdAt,
  };
}

// ============================================================
// IAbastecimentoService
// ============================================================

async function registarAbastecimento(
  input: RegistarAbastecimentoInput,
  ctx: Ctx,
): Promise<AbastecimentoResumo> {
  // Validar consistência (redundância — Zod já verifica, mas serve como guard)
  if (Math.abs(input.valorTotal - input.litros * input.valorLitro) >= 0.1) {
    throw new BusinessRuleError(
      'ABASTECIMENTO_VALOR_INCONSISTENTE',
      'Valor total inconsistente com litros × valor/litro.',
      { valorTotal: input.valorTotal, litros: input.litros, valorLitro: input.valorLitro },
    );
  }

  // Calcular consumo médio se kmPercorrido estiver disponível
  let consumoMedio: number | null = null;
  if (input.kmPercorrido && input.kmPercorrido > 0 && input.litros > 0) {
    consumoMedio = input.kmPercorrido / input.litros;
  }

  const a = await prisma.abastecimento.create({
    data: {
      tenantId: ctx.tenantId,
      viaturaId: input.viaturaId,
      motoristaId: input.motoristaId,
      data: input.data,
      kmVeiculo: input.kmVeiculo,
      tipoCombustivel: input.tipoCombustivel,
      litros: input.litros,
      valorLitro: input.valorLitro,
      valorTotal: input.valorTotal,
      posto: input.posto ?? null,
      notaFiscal: input.notaFiscal ?? null,
      kmPercorrido: input.kmPercorrido ?? null,
      consumoMedio,
      rotaId: input.rotaId ?? null,
      observacoes: input.observacoes ?? null,
    },
    select: ABASTECIMENTO_SELECT,
  });

  return mapAbastecimento(a);
}

async function obterAbastecimento(id: string, ctx: Ctx): Promise<AbastecimentoResumo> {
  const a = await prisma.abastecimento.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: ABASTECIMENTO_SELECT,
  });
  if (!a) throw new NotFoundError('Abastecimento não encontrado.');

  return mapAbastecimento(a);
}

async function listarAbastecimentos(
  filtros: FiltrarAbastecimentosInput,
  ctx: Ctx,
): Promise<PaginatedResult<AbastecimentoResumo>> {
  const where = {
    tenantId: ctx.tenantId,
    ...(filtros.viaturaId ? { viaturaId: filtros.viaturaId } : {}),
    ...(filtros.motoristaId ? { motoristaId: filtros.motoristaId } : {}),
    ...(filtros.tipoCombustivel ? { tipoCombustivel: filtros.tipoCombustivel } : {}),
    ...(filtros.dataInicio || filtros.dataFim
      ? { data: { ...(filtros.dataInicio ? { gte: filtros.dataInicio } : {}), ...(filtros.dataFim ? { lte: filtros.dataFim } : {}) } }
      : {}),
  };

  const page = await paginate(
    (args) => prisma.abastecimento.findMany({ where, orderBy: { [filtros.orderBy]: filtros.order }, select: ABASTECIMENTO_SELECT, ...args }),
    { cursor: filtros.cursor, take: filtros.take },
  );

  // ponytail: cast necessário — paginate<T> infere T={id:string} com select complexo
  return { items: (page.items as Parameters<typeof mapAbastecimento>[0][]).map(mapAbastecimento), nextCursor: page.nextCursor };
}

async function calcularEficiencia(
  viaturaId: string,
  dataInicio: Date,
  dataFim: Date,
  ctx: Ctx,
): Promise<EficienciaViatura> {
  const abastecimentos = await prisma.abastecimento.findMany({
    where: { viaturaId, tenantId: ctx.tenantId, data: { gte: dataInicio, lte: dataFim } },
    select: { litros: true, valorTotal: true, kmPercorrido: true, consumoMedio: true },
  });

  const totalAbastecimentos = abastecimentos.length;
  let totalLitrosRaw = 0;
  let custoTotalRaw = 0;
  let totalKm = 0;

  for (const a of abastecimentos) {
    totalLitrosRaw += Number(a.litros.toString());
    custoTotalRaw += Number(a.valorTotal.toString());
    if (a.kmPercorrido) totalKm += a.kmPercorrido;
  }

  const consumoMedioKmL = totalLitrosRaw > 0 && totalKm > 0
    ? totalKm / totalLitrosRaw
    : 0;

  return {
    viaturaId,
    consumoMedioKmL: consumoMedioKmL.toFixed(2),
    custoTotalCombustivel: custoTotalRaw.toFixed(2),
    totalAbastecimentos,
    totalLitros: totalLitrosRaw.toFixed(3),
    totalKm,
  };
}

async function custosPorRota(
  rotaId: string,
  ctx: Ctx,
): Promise<{ total: string; litros: string }> {
  const abastecimentos = await prisma.abastecimento.findMany({
    where: { rotaId, tenantId: ctx.tenantId },
    select: { valorTotal: true, litros: true },
  });

  let totalRaw = 0;
  let litrosRaw = 0;

  for (const a of abastecimentos) {
    totalRaw += Number(a.valorTotal.toString());
    litrosRaw += Number(a.litros.toString());
  }

  return { total: totalRaw.toFixed(2), litros: litrosRaw.toFixed(3) };
}

export const abastecimentoService: IAbastecimentoService = {
  registarAbastecimento,
  obterAbastecimento,
  listarAbastecimentos,
  calcularEficiencia,
  custosPorRota,
};
