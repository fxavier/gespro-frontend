/**
 * ComissaoService — Wave 2 (WS C)
 * Portado de src/services/comissao.service.ts (arquivo mockado com localStorage)
 * para implementação real com Prisma.
 *
 * Lógica de negócio:
 *  - Escalões: substituem o percentualBase quando valor ≥ valorMinimo
 *  - Meta: adicionam percentualBonus ao percentual final
 *  - Categoria: substituem o percentualBase quando categoriaId coincide
 *  - Período: substitui percentualBase se hoje está dentro do intervalo
 *  - Regras ordenadas por prioridade (menor = mais prioritário)
 *  - Se meta mensal atingida (vendas do mês ≥ meta do vendedor), bónus de 10%
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx, TxClient } from '@/server/services/types';
import {
  TRANSICOES_COMISSAO,
  transitarComissao,
  type IComissaoService,
  type StatusComissao,
  type RegraComissaoRow,
  type ComissaoRow,
  type CalculoComissaoResult,
  type DashboardComissoes,
  type EstatisticasVendedor,
  type RelatorioComissoesPeriodo,
  type PaginatedComissoes,
  type PaginatedRegrasComissao,
} from './comissao.interface';
import type {
  CreateRegraComissaoInput,
  UpdateRegraComissaoInput,
  FilterRegraComissaoInput,
  FilterComissaoInput,
} from '@/lib/validations/vendas';

// ---------------------------------------------------------------------------
// Helpers (Decimal → string, ADR A9)
// ---------------------------------------------------------------------------

function dec(v: Prisma.Decimal | null | undefined): string {
  return v?.toString() ?? '0';
}

// ---------------------------------------------------------------------------
// Tipos Prisma locais
// ---------------------------------------------------------------------------

type PrismaRegra = Awaited<ReturnType<typeof prisma.regraComissao.findFirstOrThrow>>;
type PrismaComissao = Awaited<ReturnType<typeof prisma.comissao.findFirstOrThrow>>;

function mapRegraRow(r: PrismaRegra): RegraComissaoRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    nome: r.nome,
    tipo: r.tipo as RegraComissaoRow['tipo'],
    vendedorId: r.vendedorId,
    categoriaId: r.categoriaId,
    percentualBase: dec(r.percentualBase),
    percentualBonus: r.percentualBonus ? dec(r.percentualBonus) : null,
    valorMinimo: r.valorMinimo ? dec(r.valorMinimo) : null,
    valorMaximo: r.valorMaximo ? dec(r.valorMaximo) : null,
    quantidadeMinima: r.quantidadeMinima ? dec(r.quantidadeMinima) : null,
    metaPercentual: r.metaPercentual ? dec(r.metaPercentual) : null,
    dataInicio: r.dataInicio,
    dataFim: r.dataFim,
    prioridade: r.prioridade,
    descricao: r.descricao,
    ativa: r.ativa,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function mapComissaoRow(c: PrismaComissao): ComissaoRow {
  return {
    id: c.id,
    tenantId: c.tenantId,
    vendaId: c.vendaId,
    vendedorId: c.vendedorId,
    regraComissaoId: c.regraComissaoId,
    percentualAplicado: dec(c.percentualAplicado),
    valorBase: dec(c.valorBase),
    valorComissao: dec(c.valorComissao),
    regrasAplicadas: c.regrasAplicadas,
    detalhes: c.detalhes,
    status: c.status as StatusComissao,
    pagoEm: c.pagoEm,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export class ComissaoService implements IComissaoService {
  // --- Regras ---

  async criarRegra(input: CreateRegraComissaoInput, ctx: Ctx): Promise<RegraComissaoRow> {
    const criada = await prisma.regraComissao.create({
      data: {
        tenantId: ctx.tenantId,
        nome: input.nome,
        tipo: input.tipo,
        vendedorId: input.vendedorId ?? null,
        categoriaId: input.categoriaId ?? null,
        percentualBase: new Prisma.Decimal(input.percentualBase),
        percentualBonus: input.percentualBonus != null
          ? new Prisma.Decimal(input.percentualBonus)
          : null,
        valorMinimo: input.valorMinimo != null ? new Prisma.Decimal(input.valorMinimo) : null,
        valorMaximo: input.valorMaximo != null ? new Prisma.Decimal(input.valorMaximo) : null,
        quantidadeMinima: input.quantidadeMinima != null
          ? new Prisma.Decimal(input.quantidadeMinima)
          : null,
        metaPercentual: input.metaPercentual != null
          ? new Prisma.Decimal(input.metaPercentual)
          : null,
        dataInicio: input.dataInicio ?? null,
        dataFim: input.dataFim ?? null,
        prioridade: input.prioridade,
        descricao: input.descricao,
        ativa: input.ativa,
      },
    });
    return mapRegraRow(criada);
  }

  async atualizarRegra(
    id: string,
    input: UpdateRegraComissaoInput,
    ctx: Ctx,
  ): Promise<RegraComissaoRow> {
    const regra = await prisma.regraComissao.findUnique({ where: { id } });
    if (!regra || regra.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Regra de comissão ${id} não encontrada`);
    }

    const atualizada = await prisma.regraComissao.update({
      where: { id },
      data: {
        ...(input.nome !== undefined ? { nome: input.nome } : {}),
        ...(input.percentualBase !== undefined
          ? { percentualBase: new Prisma.Decimal(input.percentualBase) }
          : {}),
        ...(input.percentualBonus !== undefined
          ? { percentualBonus: input.percentualBonus != null ? new Prisma.Decimal(input.percentualBonus) : null }
          : {}),
        ...(input.valorMinimo !== undefined
          ? { valorMinimo: input.valorMinimo != null ? new Prisma.Decimal(input.valorMinimo) : null }
          : {}),
        ...(input.valorMaximo !== undefined
          ? { valorMaximo: input.valorMaximo != null ? new Prisma.Decimal(input.valorMaximo) : null }
          : {}),
        ...(input.quantidadeMinima !== undefined
          ? { quantidadeMinima: input.quantidadeMinima != null ? new Prisma.Decimal(input.quantidadeMinima) : null }
          : {}),
        ...(input.metaPercentual !== undefined
          ? { metaPercentual: input.metaPercentual != null ? new Prisma.Decimal(input.metaPercentual) : null }
          : {}),
        ...(input.dataInicio !== undefined ? { dataInicio: input.dataInicio } : {}),
        ...(input.dataFim !== undefined ? { dataFim: input.dataFim } : {}),
        ...(input.prioridade !== undefined ? { prioridade: input.prioridade } : {}),
        ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
        ...(input.ativa !== undefined ? { ativa: input.ativa } : {}),
      },
    });
    return mapRegraRow(atualizada);
  }

  async ativarDesativarRegra(id: string, ativa: boolean, ctx: Ctx): Promise<RegraComissaoRow> {
    const regra = await prisma.regraComissao.findUnique({ where: { id } });
    if (!regra || regra.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Regra de comissão ${id} não encontrada`);
    }
    const atualizada = await prisma.regraComissao.update({ where: { id }, data: { ativa } });
    return mapRegraRow(atualizada);
  }

  async buscarRegra(id: string, ctx: Ctx): Promise<RegraComissaoRow> {
    const regra = await prisma.regraComissao.findUnique({ where: { id } });
    if (!regra || regra.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Regra de comissão ${id} não encontrada`);
    }
    return mapRegraRow(regra);
  }

  async listarRegras(
    filtro: FilterRegraComissaoInput,
    ctx: Ctx,
  ): Promise<PaginatedRegrasComissao> {
    const page = await paginate<{ id: string }>(
      (args) =>
        prisma.regraComissao.findMany({
          ...args,
          where: {
            ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
            ...(filtro.vendedorId ? { vendedorId: filtro.vendedorId } : {}),
            ...(filtro.ativa !== undefined ? { ativa: filtro.ativa } : {}),
          },
          orderBy: { prioridade: 'asc' },
        }) as Promise<{ id: string }[]>,
      { cursor: filtro.cursor, take: filtro.take },
    );

    return {
      items: (page.items as unknown as PrismaRegra[]).map(mapRegraRow),
      nextCursor: page.nextCursor,
    };
  }

  // --- Cálculo ---

  async calcularComissao(
    vendedorId: string,
    vendaId: string,
    valorVenda: string,
    itens?: Array<{ categoriaId: string; valor: string }>,
    ctx?: Ctx,
  ): Promise<CalculoComissaoResult> {
    const valor = new Prisma.Decimal(valorVenda);
    const tenantId = ctx?.tenantId;

    // Buscar regras ativas, ordenadas por prioridade
    const regras = await prisma.regraComissao.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ativa: true,
        OR: [{ vendedorId }, { vendedorId: null }],
      },
      orderBy: { prioridade: 'asc' },
    });

    let percentualFinal = new Prisma.Decimal(5); // padrão 5%
    let valorComissao = new Prisma.Decimal(0);
    const regrasAplicadas: string[] = [];
    const detalhes: string[] = [];

    // Percentual base da primeira regra FIXA do vendedor
    const regraBase = regras.find((r) => r.tipo === 'FIXA' && r.vendedorId === vendedorId);
    if (regraBase) {
      percentualFinal = new Prisma.Decimal(dec(regraBase.percentualBase));
      regrasAplicadas.push(regraBase.nome);
      detalhes.push(`Base: ${percentualFinal.toFixed(2)}%`);
    }

    valorComissao = valor.mul(percentualFinal).div(100);
    if (regrasAplicadas.length === 0) {
      regrasAplicadas.push('Comissão Base Padrão');
      detalhes.push(`Padrão: ${percentualFinal.toFixed(2)}%`);
    }

    const hoje = new Date();

    for (const regra of regras) {
      const valorMinimo = regra.valorMinimo ? new Prisma.Decimal(dec(regra.valorMinimo)) : null;
      const valorMaximo = regra.valorMaximo ? new Prisma.Decimal(dec(regra.valorMaximo)) : null;
      const percentualBase = new Prisma.Decimal(dec(regra.percentualBase));
      const percentualBonus = regra.percentualBonus
        ? new Prisma.Decimal(dec(regra.percentualBonus))
        : null;

      if (valorMinimo && valor.lessThan(valorMinimo)) continue;
      if (valorMaximo && valor.greaterThan(valorMaximo)) continue;

      switch (regra.tipo) {
        case 'ESCALONADA':
          if (valorMinimo && valor.greaterThanOrEqualTo(valorMinimo)) {
            percentualFinal = percentualBase;
            valorComissao = valor.mul(percentualFinal).div(100);
            regrasAplicadas.push(regra.nome);
            detalhes.push(
              `${regra.nome}: ${percentualFinal.toFixed(2)}% (venda ≥ MT ${valorMinimo.toFixed(2)})`,
            );
          }
          break;

        case 'POR_META':
          if (percentualBonus) {
            // Verificar meta mensal do vendedor
            const metaAtingida = await this._calcularMetaMensal(vendedorId, tenantId);
            const metaMinima = regra.metaPercentual ? new Prisma.Decimal(dec(regra.metaPercentual)) : new Prisma.Decimal(100);
            if (new Prisma.Decimal(metaAtingida).greaterThanOrEqualTo(metaMinima)) {
              const bonus = valor.mul(percentualBonus).div(100);
              valorComissao = valorComissao.plus(bonus);
              percentualFinal = percentualFinal.plus(percentualBonus);
              regrasAplicadas.push(regra.nome);
              detalhes.push(
                `${regra.nome}: +${percentualBonus.toFixed(2)}% (meta ${metaAtingida.toFixed(0)}% ≥ ${metaMinima.toFixed(0)}%)`,
              );
            }
          }
          break;

        case 'POR_CATEGORIA':
          if (regra.categoriaId && itens) {
            const itemDaCategoria = itens.find((i) => i.categoriaId === regra.categoriaId);
            if (itemDaCategoria) {
              percentualFinal = percentualBase;
              valorComissao = new Prisma.Decimal(itemDaCategoria.valor)
                .mul(percentualFinal)
                .div(100);
              regrasAplicadas.push(regra.nome);
              detalhes.push(`${regra.nome}: ${percentualFinal.toFixed(2)}% por categoria`);
            }
          }
          break;

        case 'POR_PERIODO':
          if (
            regra.dataInicio && regra.dataFim &&
            hoje >= regra.dataInicio && hoje <= regra.dataFim
          ) {
            percentualFinal = percentualBase;
            valorComissao = valor.mul(percentualFinal).div(100);
            regrasAplicadas.push(regra.nome);
            detalhes.push(`${regra.nome}: ${percentualFinal.toFixed(2)}% (período especial)`);
          }
          break;
      }
    }

    return {
      vendedorId,
      vendaId,
      valorBase: valorVenda,
      percentualAplicado: percentualFinal.toString(),
      valorComissao: valorComissao.toString(),
      regrasAplicadas,
      detalhes: detalhes.join('\n'),
    };
  }

  async simularComissao(
    vendedorId: string,
    valorVenda: string,
    categoriaId?: string,
    ctx?: Ctx,
  ): Promise<Pick<CalculoComissaoResult, 'percentualAplicado' | 'valorComissao' | 'regrasAplicadas' | 'detalhes'>> {
    const calc = await this.calcularComissao(
      vendedorId,
      '__simulacao__',
      valorVenda,
      categoriaId ? [{ categoriaId, valor: valorVenda }] : undefined,
      ctx,
    );
    return {
      percentualAplicado: calc.percentualAplicado,
      valorComissao: calc.valorComissao,
      regrasAplicadas: calc.regrasAplicadas,
      detalhes: calc.detalhes,
    };
  }

  async registarComissao(
    tx: TxClient,
    calculo: CalculoComissaoResult,
    ctx: Ctx,
  ): Promise<ComissaoRow> {
    const txClient = tx as Prisma.TransactionClient;

    const criada = await txClient.comissao.create({
      data: {
        tenantId: ctx.tenantId,
        vendaId: calculo.vendaId,
        vendedorId: calculo.vendedorId,
        regraComissaoId: null,
        percentualAplicado: new Prisma.Decimal(calculo.percentualAplicado),
        valorBase: new Prisma.Decimal(calculo.valorBase),
        valorComissao: new Prisma.Decimal(calculo.valorComissao),
        regrasAplicadas: calculo.regrasAplicadas,
        detalhes: calculo.detalhes,
        status: 'PENDENTE',
      },
    });

    return mapComissaoRow(criada);
  }

  // --- Gestão ---

  async listar(filtro: FilterComissaoInput, ctx: Ctx): Promise<PaginatedComissoes> {
    const page = await paginate<{ id: string }>(
      (args) =>
        prisma.comissao.findMany({
          ...args,
          where: {
            ...(filtro.vendedorId ? { vendedorId: filtro.vendedorId } : {}),
            ...(filtro.status ? { status: filtro.status } : {}),
            ...(filtro.dataInicio || filtro.dataFim
              ? {
                  createdAt: {
                    ...(filtro.dataInicio ? { gte: filtro.dataInicio } : {}),
                    ...(filtro.dataFim ? { lte: filtro.dataFim } : {}),
                  },
                }
              : {}),
          },
          orderBy: { [filtro.orderBy]: filtro.order } as Prisma.ComissaoOrderByWithRelationInput,
        }) as Promise<{ id: string }[]>,
      { cursor: filtro.cursor, take: filtro.take },
    );

    return {
      items: (page.items as unknown as PrismaComissao[]).map(mapComissaoRow),
      nextCursor: page.nextCursor,
    };
  }

  async aprovar(id: string, ctx: Ctx): Promise<ComissaoRow> {
    const comissao = await prisma.comissao.findUnique({ where: { id } });
    if (!comissao || comissao.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Comissão ${id} não encontrada`);
    }
    transitarComissao(comissao.status as StatusComissao, 'APROVADA');

    const atualizada = await prisma.comissao.update({
      where: { id },
      data: { status: 'APROVADA' },
    });
    return mapComissaoRow(atualizada);
  }

  async marcarPaga(id: string, ctx: Ctx): Promise<ComissaoRow> {
    const comissao = await prisma.comissao.findUnique({ where: { id } });
    if (!comissao || comissao.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Comissão ${id} não encontrada`);
    }
    transitarComissao(comissao.status as StatusComissao, 'PAGA');

    const atualizada = await prisma.comissao.update({
      where: { id },
      data: { status: 'PAGA', pagoEm: new Date() },
    });
    return mapComissaoRow(atualizada);
  }

  async cancelar(id: string, motivo: string, ctx: Ctx): Promise<ComissaoRow> {
    const comissao = await prisma.comissao.findUnique({ where: { id } });
    if (!comissao || comissao.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Comissão ${id} não encontrada`);
    }
    transitarComissao(comissao.status as StatusComissao, 'CANCELADA');

    const atualizada = await prisma.comissao.update({
      where: { id },
      data: { status: 'CANCELADA', detalhes: motivo },
    });
    return mapComissaoRow(atualizada);
  }

  // --- Relatórios ---

  async dashboard(vendedorId: string | undefined, ctx: Ctx): Promise<DashboardComissoes> {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

    const [totMes, totPendente, totAprovado, totPago, numVendas] = await Promise.all([
      prisma.comissao.aggregate({
        where: {
          ...(vendedorId ? { vendedorId } : {}),
          createdAt: { gte: inicioMes },
          status: { not: 'CANCELADA' },
        },
        _sum: { valorComissao: true },
      }),
      prisma.comissao.aggregate({
        where: {
          ...(vendedorId ? { vendedorId } : {}),
          status: 'PENDENTE',
        },
        _sum: { valorComissao: true },
      }),
      prisma.comissao.aggregate({
        where: {
          ...(vendedorId ? { vendedorId } : {}),
          status: 'APROVADA',
        },
        _sum: { valorComissao: true },
      }),
      prisma.comissao.aggregate({
        where: {
          ...(vendedorId ? { vendedorId } : {}),
          status: 'PAGA',
        },
        _sum: { valorComissao: true },
      }),
      prisma.comissao.count({
        where: {
          ...(vendedorId ? { vendedorId } : {}),
          createdAt: { gte: inicioMes },
          status: { not: 'CANCELADA' },
        },
      }),
    ]);

    const meta = vendedorId
      ? await this._calcularMetaMensal(vendedorId, ctx.tenantId)
      : 0;

    return {
      totalMes: dec(totMes._sum.valorComissao),
      totalPendente: dec(totPendente._sum.valorComissao),
      totalAprovado: dec(totAprovado._sum.valorComissao),
      totalPago: dec(totPago._sum.valorComissao),
      percentualMeta: meta,
      ranking: 1, // simplificado — implementação completa na Wave 3
      numeroVendas: numVendas,
    };
  }

  async estatisticasVendedor(
    vendedorId: string,
    periodo?: { inicio: Date; fim: Date },
    ctx?: Ctx,
  ): Promise<EstatisticasVendedor> {
    const where = {
      vendedorId,
      ...(ctx?.tenantId ? { tenantId: ctx.tenantId } : {}),
      ...(periodo
        ? { createdAt: { gte: periodo.inicio, lte: periodo.fim } }
        : {}),
      status: { not: 'CANCELADA' } as { not: StatusComissao },
    };

    const [totalAgg, count] = await Promise.all([
      prisma.comissao.aggregate({
        where,
        _sum: { valorBase: true, valorComissao: true },
        _count: { id: true },
      }),
      prisma.comissao.count({ where }),
    ]);

    const totalVendas = new Prisma.Decimal(dec(totalAgg._sum.valorBase));
    const totalComissoes = new Prisma.Decimal(dec(totalAgg._sum.valorComissao));
    const ticketMedio = count > 0 ? totalVendas.div(count) : new Prisma.Decimal(0);
    const meta = await this._calcularMetaMensal(vendedorId, ctx?.tenantId);

    return {
      vendedorId,
      totalVendas: totalVendas.toString(),
      totalComissoes: totalComissoes.toString(),
      numeroVendas: count,
      ticketMedio: ticketMedio.toString(),
      metaAtingida: meta,
      ranking: 1,
    };
  }

  async relatorioPeriodo(
    periodo: { inicio: Date; fim: Date },
    vendedorId?: string,
    ctx?: Ctx,
  ): Promise<RelatorioComissoesPeriodo> {
    const where = {
      ...(ctx?.tenantId ? { tenantId: ctx.tenantId } : {}),
      ...(vendedorId ? { vendedorId } : {}),
      createdAt: { gte: periodo.inicio, lte: periodo.fim },
      status: { not: 'CANCELADA' } as { not: StatusComissao },
    };

    const [total, pago, pendente, porVendedor] = await Promise.all([
      prisma.comissao.aggregate({ where, _sum: { valorComissao: true } }),
      prisma.comissao.aggregate({
        where: { ...where, status: 'PAGA' },
        _sum: { valorComissao: true },
      }),
      prisma.comissao.aggregate({
        where: { ...where, status: 'PENDENTE' },
        _sum: { valorComissao: true },
      }),
      prisma.comissao.groupBy({
        by: ['vendedorId'],
        where,
        _sum: { valorComissao: true },
        _count: { vendaId: true },
      }),
    ]);

    const porVendedorPago = await prisma.comissao.groupBy({
      by: ['vendedorId'],
      where: { ...where, status: 'PAGA' },
      _sum: { valorComissao: true },
    });

    const pagoMap = new Map(porVendedorPago.map((p) => [p.vendedorId, dec(p._sum.valorComissao)]));

    return {
      dataInicio: periodo.inicio,
      dataFim: periodo.fim,
      vendedorId,
      totalComissoes: dec(total._sum.valorComissao),
      totalPago: dec(pago._sum.valorComissao),
      totalPendente: dec(pendente._sum.valorComissao),
      porVendedor: porVendedor.map((pv) => ({
        vendedorId: pv.vendedorId,
        totalComissoes: dec(pv._sum.valorComissao),
        totalPago: pagoMap.get(pv.vendedorId) ?? '0',
        totalPendente: new Prisma.Decimal(dec(pv._sum.valorComissao))
          .minus(new Prisma.Decimal(pagoMap.get(pv.vendedorId) ?? '0'))
          .toString(),
        numeroVendas: pv._count.vendaId,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async _calcularMetaMensal(
    vendedorId: string,
    tenantId?: string,
  ): Promise<number> {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

    const totalMes = await prisma.comissao.aggregate({
      where: {
        vendedorId,
        ...(tenantId ? { tenantId } : {}),
        createdAt: { gte: inicioMes },
        status: { not: 'CANCELADA' },
      },
      _sum: { valorBase: true },
    });

    const totalVendas = new Prisma.Decimal(dec(totalMes._sum.valorBase));

    // Meta padrão 100.000 MZN/mês — na Wave 3, buscar de config do tenant/user
    const META_PADRAO = new Prisma.Decimal(100000);
    if (META_PADRAO.isZero()) return 0;

    return totalVendas.div(META_PADRAO).mul(100).toNumber();
  }
}

export const comissaoService = new ComissaoService();

// Re-export state machine for tests
export { TRANSICOES_COMISSAO, transitarComissao };
