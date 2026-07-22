/**
 * VendedorService — WS-10 (Spec 10)
 *
 * CRUD de Vendedor + listagem de comissões via ComissaoService.
 * Serve de âncora para cálculo de comissões (entidade própria com metas e estado).
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import type {
  CreateVendedorInput,
  UpdateVendedorInput,
  FilterVendedorInput,
} from '@/lib/validations/vendas';

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export interface VendedorRow {
  id: string;
  tenantId: string;
  colaboradorId: string | null;
  userId: string | null;
  nome: string;
  email: string | null;
  telefone: string | null;
  metaMensal: string | null; // Decimal → string (ADR A9)
  status: string;
  observacoes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Helper Decimal
// ---------------------------------------------------------------------------

function dec(v: Prisma.Decimal | null | undefined): string | null {
  return v != null ? v.toString() : null;
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export class VendedorService {
  async criar(input: CreateVendedorInput, ctx: Ctx): Promise<VendedorRow> {
    // Verificar unicidade por userId dentro do tenant
    if (input.userId) {
      const existente = await prismaBase.vendedor.findFirst({
        where: { tenantId: ctx.tenantId, userId: input.userId, deletedAt: null },
        select: { id: true },
      });
      if (existente) {
        throw new BusinessRuleError(
          'VENDEDOR_DUPLICADO',
          'Já existe um vendedor associado a este utilizador neste tenant.',
        );
      }
    }

    const row = await prismaBase.vendedor.create({
      data: {
        tenantId: ctx.tenantId,
        colaboradorId: input.colaboradorId ?? null,
        userId: input.userId ?? null,
        nome: input.nome,
        email: input.email ?? null,
        telefone: input.telefone ?? null,
        metaMensal: input.metaMensal != null
          ? new Prisma.Decimal(input.metaMensal)
          : null,
        observacoes: input.observacoes ?? null,
      },
    });

    return { ...row, metaMensal: dec(row.metaMensal), status: row.status };
  }

  async atualizar(id: string, input: UpdateVendedorInput, ctx: Ctx): Promise<VendedorRow> {
    const existente = await prismaBase.vendedor.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Vendedor não encontrado');

    const row = await prismaBase.vendedor.update({
      where: { id },
      data: {
        ...(input.nome !== undefined && { nome: input.nome }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.telefone !== undefined && { telefone: input.telefone }),
        ...(input.metaMensal !== undefined && {
          metaMensal: input.metaMensal != null
            ? new Prisma.Decimal(input.metaMensal)
            : null,
        }),
        ...(input.status !== undefined && {
          status: input.status as 'ATIVO' | 'INATIVO' | 'SUSPENSO',
        }),
        ...(input.observacoes !== undefined && { observacoes: input.observacoes }),
      },
    });

    return { ...row, metaMensal: dec(row.metaMensal), status: row.status };
  }

  async obter(id: string, ctx: Ctx): Promise<VendedorRow> {
    const row = await prismaBase.vendedor.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Vendedor não encontrado');
    return { ...row, metaMensal: dec(row.metaMensal), status: row.status };
  }

  async listar(
    filter: FilterVendedorInput,
    ctx: Ctx,
  ): Promise<{ items: VendedorRow[]; nextCursor: string | null }> {
    const { take, cursor, q, status, orderBy, order } = filter;

    const where = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(status && { status: status as 'ATIVO' | 'INATIVO' | 'SUSPENSO' }),
      ...(q && {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const result = await paginate<{ id: string }>(
      (args) =>
        prismaBase.vendedor.findMany({
          ...args,
          where,
          orderBy: { [orderBy]: order },
        }) as Promise<{ id: string }[]>,
      { cursor, take },
    );

    return {
      items: result.items.map((r) => {
        const v = r as typeof r & { metaMensal?: Prisma.Decimal | null; status: string; tenantId: string; colaboradorId: string | null; userId: string | null; nome: string; email: string | null; telefone: string | null; observacoes: string | null; createdAt: Date; updatedAt: Date; deletedAt: Date | null };
        return { ...v, metaMensal: dec(v.metaMensal), status: v.status };
      }),
      nextCursor: result.nextCursor,
    };
  }

  async excluir(id: string, ctx: Ctx): Promise<void> {
    const existente = await prismaBase.vendedor.findFirst({
      where: { id, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Vendedor não encontrado');

    // Soft delete
    await prismaBase.vendedor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

export const vendedorService = new VendedorService();
