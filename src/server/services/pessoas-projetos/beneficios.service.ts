import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import type {
  CreateBeneficioInput,
  UpdateBeneficioInput,
  AtribuirBeneficioInput,
  TerminarBeneficioInput,
  SuspenderBeneficioInput,
  FilterBeneficioInput,
  FilterAtribuicaoInput,
} from '@/lib/validations/beneficios';

// ─────────────────────────────────────────────────────────────────────────────
// BeneficioService — CRUD do catálogo
// ─────────────────────────────────────────────────────────────────────────────

export const BeneficioService = {
  async criar(input: CreateBeneficioInput, ctx: Ctx): Promise<{ id: string }> {
    const beneficio = await prisma.beneficio.create({
      data: {
        tenantId: ctx.tenantId,
        nome: input.nome,
        tipo: input.tipo,
        descricao: input.descricao,
        fornecedor: input.fornecedor,
        custoTotal: new Prisma.Decimal(String(input.custoTotal)),
        comparticipacaoEmpresa: new Prisma.Decimal(String(input.comparticipacaoEmpresa ?? '0')),
        descontoColaborador: new Prisma.Decimal(String(input.descontoColaborador ?? '0')),
        periodicidade: input.periodicidade,
        tributavel: input.tributavel ?? false,
        ativo: input.ativo ?? true,
        departamentosElegiveis: input.departamentosElegiveis ?? [],
        cargosElegiveis: input.cargosElegiveis ?? [],
      },
      select: { id: true },
    });
    return { id: beneficio.id };
  },

  async actualizar(id: string, input: UpdateBeneficioInput, ctx: Ctx): Promise<{ id: string }> {
    const existente = await prisma.beneficio.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Benefício não encontrado');

    await prisma.beneficio.update({
      where: { id },
      data: {
        ...(input.nome !== undefined && { nome: input.nome }),
        ...(input.tipo !== undefined && { tipo: input.tipo }),
        ...(input.descricao !== undefined && { descricao: input.descricao }),
        ...(input.fornecedor !== undefined && { fornecedor: input.fornecedor }),
        ...(input.custoTotal !== undefined && { custoTotal: new Prisma.Decimal(String(input.custoTotal)) }),
        ...(input.comparticipacaoEmpresa !== undefined && {
          comparticipacaoEmpresa: new Prisma.Decimal(String(input.comparticipacaoEmpresa)),
        }),
        ...(input.descontoColaborador !== undefined && {
          descontoColaborador: new Prisma.Decimal(String(input.descontoColaborador)),
        }),
        ...(input.periodicidade !== undefined && { periodicidade: input.periodicidade }),
        ...(input.tributavel !== undefined && { tributavel: input.tributavel }),
        ...(input.ativo !== undefined && { ativo: input.ativo }),
        ...(input.departamentosElegiveis !== undefined && {
          departamentosElegiveis: input.departamentosElegiveis,
        }),
        ...(input.cargosElegiveis !== undefined && { cargosElegiveis: input.cargosElegiveis }),
      },
    });
    return { id };
  },

  async arquivar(id: string, ctx: Ctx): Promise<void> {
    const existente = await prisma.beneficio.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existente) throw new NotFoundError('Benefício não encontrado');

    // Verificar se há atribuições activas
    const atribuicoesActivas = await prisma.beneficioColaborador.count({
      where: { beneficioId: id, tenantId: ctx.tenantId, status: 'ACTIVO' },
    });
    if (atribuicoesActivas > 0) {
      throw new BusinessRuleError(
        'BENEFICIO_COM_ATRIBUICOES_ACTIVAS',
        `Não é possível arquivar este benefício — tem ${atribuicoesActivas} atribuição(ões) activa(s)`,
      );
    }

    await prisma.beneficio.update({ where: { id }, data: { ativo: false } });
  },

  async listar(filter: FilterBeneficioInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.beneficio.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.ativo !== undefined && { ativo: filter.ativo }),
            ...(filter.tipo && { tipo: filter.tipo }),
            ...(filter.search && {
              OR: [
                { nome: { contains: filter.search, mode: 'insensitive' } },
                { fornecedor: { contains: filter.search, mode: 'insensitive' } },
              ],
            }),
          },
          orderBy: { nome: 'asc' },
          select: {
            id: true,
            nome: true,
            tipo: true,
            fornecedor: true,
            custoTotal: true,
            comparticipacaoEmpresa: true,
            descontoColaborador: true,
            periodicidade: true,
            tributavel: true,
            ativo: true,
            _count: { select: { atribuicoes: { where: { status: 'ACTIVO' } } } },
          },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obter(id: string, ctx: Ctx) {
    const b = await prisma.beneficio.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        atribuicoes: {
          where: { status: 'ACTIVO' },
          select: {
            id: true,
            colaboradorId: true,
            dataInicio: true,
            dataFim: true,
            comparticipacaoEmpresa: true,
            descontoColaborador: true,
            status: true,
          },
          take: 50,
          orderBy: { dataInicio: 'desc' },
        },
      },
    });
    if (!b) throw new NotFoundError('Benefício não encontrado');
    return b;
  },

  async relatorioCustos(
    ano: number,
    mes: number,
    ctx: Ctx,
  ): Promise<{ tipo: string; totalEmpresa: Prisma.Decimal; totalColaborador: Prisma.Decimal; count: number }[]> {
    // Data de referência: primeiro dia do mês até último dia do mês
    const dataInicio = new Date(ano, mes - 1, 1);
    const dataFim = new Date(ano, mes, 0, 23, 59, 59);

    // Agregação: JOIN com Beneficio para obter tipo, GROUP BY tipo
    const resultado = await prisma.$queryRaw<
      { tipo: string; total_empresa: string; total_colaborador: string; count: string }[]
    >`
      SELECT
        b.tipo,
        SUM(bc."comparticipacaoEmpresa")::text AS total_empresa,
        SUM(bc."descontoColaborador")::text AS total_colaborador,
        COUNT(*)::text AS count
      FROM "BeneficioColaborador" bc
      INNER JOIN "Beneficio" b ON b.id = bc."beneficioId"
      WHERE bc."tenantId" = ${ctx.tenantId}
        AND bc.status = 'ACTIVO'
        AND bc."dataInicio" <= ${dataFim}
        AND (bc."dataFim" IS NULL OR bc."dataFim" >= ${dataInicio})
      GROUP BY b.tipo
      ORDER BY b.tipo
    `;

    return resultado.map((r) => ({
      tipo: r.tipo,
      totalEmpresa: new Prisma.Decimal(r.total_empresa || '0'),
      totalColaborador: new Prisma.Decimal(r.total_colaborador || '0'),
      count: Number(r.count || '0'),
    }));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// BeneficioColaboradorService — gestão de atribuições
// ─────────────────────────────────────────────────────────────────────────────

export const BeneficioColaboradorService = {
  async atribuir(input: AtribuirBeneficioInput, ctx: Ctx): Promise<{ id: string }> {
    // 1. Verificar benefício existe e está activo no tenant
    const beneficio = await prisma.beneficio.findFirst({
      where: { id: input.beneficioId, tenantId: ctx.tenantId, ativo: true },
      select: {
        id: true,
        comparticipacaoEmpresa: true,
        descontoColaborador: true,
        departamentosElegiveis: true,
        cargosElegiveis: true,
      },
    });
    if (!beneficio) throw new NotFoundError('Benefício não encontrado ou inactivo');

    // 2. Verificar colaborador existe no tenant
    const colaborador = await prisma.colaborador.findFirst({
      where: { id: input.colaboradorId, tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, departamentoId: true, cargoId: true },
    });
    if (!colaborador) throw new NotFoundError('Colaborador não encontrado');

    // 3. Verificar elegibilidade (se configurada)
    if (beneficio.departamentosElegiveis.length > 0) {
      if (!colaborador.departamentoId || !beneficio.departamentosElegiveis.includes(colaborador.departamentoId)) {
        throw new BusinessRuleError(
          'COLABORADOR_NAO_ELEGIVEL',
          'O colaborador não pertence a um departamento elegível para este benefício',
        );
      }
    }
    if (beneficio.cargosElegiveis.length > 0) {
      if (!colaborador.cargoId || !beneficio.cargosElegiveis.includes(colaborador.cargoId)) {
        throw new BusinessRuleError(
          'COLABORADOR_NAO_ELEGIVEL',
          'O cargo do colaborador não é elegível para este benefício',
        );
      }
    }

    // 4. Verificar não-duplicação de período
    const dataFim = input.dataFim ?? null;
    const atribuicaoExistente = await prisma.beneficioColaborador.findFirst({
      where: {
        tenantId: ctx.tenantId,
        colaboradorId: input.colaboradorId,
        beneficioId: input.beneficioId,
        status: { in: ['ACTIVO', 'SUSPENSO'] },
        // Sobreposição de período: dataInicio2 <= dataFim1 && dataFim2 >= dataInicio1
        dataInicio: {
          lte: dataFim ?? new Date('9999-12-31'),
        },
        OR: [
          { dataFim: null },
          { dataFim: { gte: input.dataInicio } },
        ],
      },
      select: { id: true },
    });
    if (atribuicaoExistente) {
      throw new BusinessRuleError(
        'BENEFICIO_DUPLICADO',
        'O colaborador já possui este benefício activo ou suspenso no período indicado',
      );
    }

    // 5. Criar atribuição — usa valores do input se fornecidos, senão herda do benefício
    const atribuicao = await prisma.beneficioColaborador.create({
      data: {
        tenantId: ctx.tenantId,
        beneficioId: input.beneficioId,
        colaboradorId: input.colaboradorId,
        dataInicio: input.dataInicio,
        dataFim: dataFim,
        comparticipacaoEmpresa: input.comparticipacaoEmpresa !== undefined
          ? new Prisma.Decimal(String(input.comparticipacaoEmpresa))
          : beneficio.comparticipacaoEmpresa,
        descontoColaborador: input.descontoColaborador !== undefined
          ? new Prisma.Decimal(String(input.descontoColaborador))
          : beneficio.descontoColaborador,
        status: 'ACTIVO',
        observacoes: input.observacoes,
      },
      select: { id: true },
    });
    return { id: atribuicao.id };
  },

  async terminar(input: TerminarBeneficioInput, ctx: Ctx): Promise<void> {
    const atribuicao = await prisma.beneficioColaborador.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!atribuicao) throw new NotFoundError('Atribuição de benefício não encontrada');

    if (atribuicao.status === 'TERMINADO') {
      throw new BusinessRuleError('ATRIBUICAO_JA_TERMINADA', 'Esta atribuição já está terminada');
    }

    await prisma.beneficioColaborador.update({
      where: { id: input.id },
      data: {
        status: 'TERMINADO',
        dataFim: input.dataFim ?? new Date(),
        ...(input.observacoes !== undefined && { observacoes: input.observacoes }),
      },
    });
  },

  async suspender(input: SuspenderBeneficioInput, ctx: Ctx): Promise<void> {
    const atribuicao = await prisma.beneficioColaborador.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!atribuicao) throw new NotFoundError('Atribuição de benefício não encontrada');

    if (atribuicao.status !== 'ACTIVO') {
      throw new BusinessRuleError(
        'ATRIBUICAO_NAO_ACTIVA',
        'Só é possível suspender atribuições activas',
      );
    }

    await prisma.beneficioColaborador.update({
      where: { id: input.id },
      data: {
        status: 'SUSPENSO',
        ...(input.observacoes !== undefined && { observacoes: input.observacoes }),
      },
    });
  },

  async reactivar(id: string, ctx: Ctx): Promise<void> {
    const atribuicao = await prisma.beneficioColaborador.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!atribuicao) throw new NotFoundError('Atribuição de benefício não encontrada');

    if (atribuicao.status !== 'SUSPENSO') {
      throw new BusinessRuleError(
        'ATRIBUICAO_NAO_SUSPENSA',
        'Só é possível reactivar atribuições suspensas',
      );
    }

    await prisma.beneficioColaborador.update({
      where: { id },
      data: { status: 'ACTIVO' },
    });
  },

  async listarPorColaborador(
    colaboradorId: string,
    filter: { status?: string; cursor?: string; take?: number },
    ctx: Ctx,
  ) {
    return paginate(
      (a) =>
        prisma.beneficioColaborador.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            colaboradorId,
            ...(filter.status && { status: filter.status as never }),
          },
          orderBy: { dataInicio: 'desc' },
          include: {
            beneficio: {
              select: {
                id: true,
                nome: true,
                tipo: true,
                periodicidade: true,
                tributavel: true,
                fornecedor: true,
              },
            },
          },
        }),
      { cursor: filter.cursor, take: filter.take ?? 25 },
    );
  },

  async listar(filter: FilterAtribuicaoInput, ctx: Ctx) {
    return paginate(
      (a) =>
        prisma.beneficioColaborador.findMany({
          ...a,
          where: {
            tenantId: ctx.tenantId,
            ...(filter.colaboradorId && { colaboradorId: filter.colaboradorId }),
            ...(filter.beneficioId && { beneficioId: filter.beneficioId }),
            ...(filter.status && { status: filter.status }),
          },
          orderBy: { dataInicio: 'desc' },
          include: {
            beneficio: {
              select: { id: true, nome: true, tipo: true, periodicidade: true, tributavel: true },
            },
          },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Contrato de integração com o Payroll — spec 06
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera as linhas de payroll dos benefícios activos de um colaborador para
 * um mês de referência específico.
 *
 * Contrato consumido por `payroll.service` (spec 06) dentro da transacção de
 * processamento da folha salarial. Funciona autonomamente sem o payroll entregue.
 *
 * Regras:
 * - Inclui apenas atribuições ACTIVAS com periodicidade MENSAL que estejam
 *   vigentes no mês de referência (dataInicio <= último dia do mês e
 *   dataFim nula ou >= primeiro dia do mês).
 * - comparticipacaoEmpresa > 0 → gera PROVENTO (tributável conforme flag do benefício)
 * - descontoColaborador > 0 → gera DESCONTO (nunca tributável no colaborador)
 *
 * @param colaboradorId  ID do colaborador (cuid)
 * @param mesRef  Mês de referência no formato 'YYYY-MM' (ex: '2026-07')
 * @param ctx  Contexto de tenant/utilizador
 */
export async function linhasPayrollDeBeneficios(
  colaboradorId: string,
  mesRef: string,
  ctx: Ctx,
): Promise<import('./beneficios.interface').LinhaPayrollBeneficio[]> {
  const [ano, mes] = mesRef.split('-').map(Number);
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0, 23, 59, 59);

  const atribuicoes = await prisma.beneficioColaborador.findMany({
    where: {
      tenantId: ctx.tenantId,
      colaboradorId,
      status: 'ACTIVO',
      // Vigente no mês de referência
      dataInicio: { lte: ultimoDia },
      OR: [
        { dataFim: null },
        { dataFim: { gte: primeiroDia } },
      ],
    },
    include: {
      beneficio: {
        select: {
          nome: true,
          tipo: true,
          tributavel: true,
          periodicidade: true,
        },
      },
    },
  });

  const linhas: import('./beneficios.interface').LinhaPayrollBeneficio[] = [];

  for (const at of atribuicoes) {
    const b = at.beneficio;

    // Proventos mensais directos; para outras periodicidades — só MENSAL por defeito
    // (o payroll poderá implementar lógica pro-rata para TRIMESTRAL/ANUAL)
    if (b.periodicidade !== 'MENSAL') continue;

    // Comparticipação da empresa — gera PROVENTO se tributável
    if (at.comparticipacaoEmpresa.greaterThan(0)) {
      linhas.push({
        tipo: 'PROVENTO',
        natureza: b.tipo,
        descricao: `Benefício: ${b.nome}`,
        valor: at.comparticipacaoEmpresa,
        tributavel: b.tributavel,
      });
    }

    // Desconto do colaborador — gera DESCONTO (não tributável)
    if (at.descontoColaborador.greaterThan(0)) {
      linhas.push({
        tipo: 'DESCONTO',
        natureza: b.tipo,
        descricao: `Benefício: ${b.nome}`,
        valor: at.descontoColaborador,
        tributavel: false,
      });
    }
  }

  return linhas;
}
