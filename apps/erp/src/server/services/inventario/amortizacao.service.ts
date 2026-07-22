// Serviço de Amortização (WS A — Wave 2)
// Métodos suportados: LINEAR, DIGITOS_ANOS, SALDOS_DECRESCENTES, UNIDADES_PRODUCAO
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { GerarPlanoAmortizacaoInput } from '@/lib/validations/inventario-ativos';
import type { Ctx, TxClient } from '@/server/services/types';
import type {
  AmortizacaoCalculoDto,
  IAmortizacaoService,
  PlanoAmortizacaoDto,
} from './amortizacao.interface';

// ─── Cálculos ─────────────────────────────────────────────────────────────────

/** Calcula a amortização mensal por método. Retorna Decimal. */
function calcMensal(
  metodo: string,
  valorDepreciavel: Prisma.Decimal,
  vidaUtilAnos: number,
  mesIndex: number, // 0-based
): Prisma.Decimal {
  const totalMeses = vidaUtilAnos * 12;

  if (metodo === 'LINEAR') {
    return valorDepreciavel.div(totalMeses);
  }

  if (metodo === 'SALDOS_DECRESCENTES') {
    // Taxa dupla: 2/vidaUtil por ano, aplicada ao valor líquido do início do ano
    // Simplificado: taxa mensal constante sobre saldo decrescente
    const taxaAnual = new Prisma.Decimal(2).div(vidaUtilAnos);
    const taxaMensal = taxaAnual.div(12);
    // Valor acumulado até este mês: recalculado iterativamente — para eficiência
    // calculamos só a taxa aplicada ao valor inicial neste ponto
    // (o plano completo faz a iteração)
    return taxaMensal.times(valorDepreciavel);
  }

  if (metodo === 'DIGITOS_ANOS') {
    // Soma dos dígitos = n*(n+1)/2 em anos; converter para meses
    const somaDigitos = (vidaUtilAnos * (vidaUtilAnos + 1)) / 2;
    const anoActual = Math.floor(mesIndex / 12); // 0-based
    const fracaoAno = vidaUtilAnos - anoActual;
    return valorDepreciavel.times(fracaoAno).div(somaDigitos).div(12);
  }

  // UNIDADES_PRODUCAO — sem dados de produção, usa linear
  return valorDepreciavel.div(totalMeses);
}

function buildLinhas(
  ativoId: string,
  metodo: string,
  valorInicial: Prisma.Decimal,
  valorResidual: Prisma.Decimal,
  vidaUtilAnos: number,
  anoInicio: number,
  mesInicio: number, // 1-based
  contaDebitoId?: string | null,
  contaCreditoId?: string | null,
  userId = 'sistema',
  tenantId = '',
): AmortizacaoCalculoDto[] {
  const totalMeses = vidaUtilAnos * 12;
  const valorDepreciavel = valorInicial.minus(valorResidual);
  const linhas: AmortizacaoCalculoDto[] = [];
  let acumulado = new Prisma.Decimal(0);
  let vliq = valorInicial;
  let ano = anoInicio;
  let mes = mesInicio;

  for (let i = 0; i < totalMeses; i++) {
    let mensal = calcMensal(metodo, valorDepreciavel, vidaUtilAnos, i);

    if (metodo === 'SALDOS_DECRESCENTES') {
      // Saldo decrescente: aplicar taxa ao valor líquido actual
      const taxaAnual = new Prisma.Decimal(2).div(vidaUtilAnos);
      const taxaMensal = taxaAnual.div(12);
      mensal = vliq.times(taxaMensal);
    }

    // Não amortizar abaixo do valor residual
    if (acumulado.plus(mensal).greaterThan(valorDepreciavel)) {
      mensal = valorDepreciavel.minus(acumulado);
    }
    if (mensal.isNegative() || mensal.isZero()) {
      mensal = new Prisma.Decimal(0);
    }

    acumulado = acumulado.plus(mensal);
    vliq = valorInicial.minus(acumulado);

    linhas.push({
      id: `preview-${i}`,
      tenantId,
      ativoId,
      ano,
      mes,
      valorInicial: valorInicial.toString(),
      valorResidual: valorResidual.toString(),
      vidaUtilAnos,
      valorAmortizacaoMensal: mensal.toFixed(2),
      valorAmortizadoAcumulado: acumulado.toFixed(2),
      valorLiquidoContabilistico: vliq.toFixed(2),
      metodoAmortizacao: metodo,
      contaDebitoId: contaDebitoId ?? null,
      contaCreditoId: contaCreditoId ?? null,
      lancamentoContabilId: null,
      processadoPor: userId,
      processadoEm: new Date(),
      createdAt: new Date(),
    });

    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }

  return linhas;
}

// ─── Implementação ────────────────────────────────────────────────────────────

function mapCalculo(c: {
  id: string; tenantId: string; ativoId: string; ano: number; mes: number;
  valorInicial: { toString(): string }; valorResidual: { toString(): string };
  vidaUtilAnos: number; valorAmortizacaoMensal: { toString(): string };
  valorAmortizadoAcumulado: { toString(): string }; valorLiquidoContabilistico: { toString(): string };
  metodoAmortizacao: string; contaDebitoId: string | null; contaCreditoId: string | null;
  lancamentoContabilId: string | null; processadoPor: string; processadoEm: Date; createdAt: Date;
}): AmortizacaoCalculoDto {
  return {
    id: c.id, tenantId: c.tenantId, ativoId: c.ativoId, ano: c.ano, mes: c.mes,
    valorInicial: c.valorInicial.toString(), valorResidual: c.valorResidual.toString(),
    vidaUtilAnos: c.vidaUtilAnos,
    valorAmortizacaoMensal: c.valorAmortizacaoMensal.toString(),
    valorAmortizadoAcumulado: c.valorAmortizadoAcumulado.toString(),
    valorLiquidoContabilistico: c.valorLiquidoContabilistico.toString(),
    metodoAmortizacao: c.metodoAmortizacao,
    contaDebitoId: c.contaDebitoId, contaCreditoId: c.contaCreditoId,
    lancamentoContabilId: c.lancamentoContabilId,
    processadoPor: c.processadoPor, processadoEm: c.processadoEm, createdAt: c.createdAt,
  };
}

const CALC_SEL = {
  id: true, tenantId: true, ativoId: true, ano: true, mes: true,
  valorInicial: true, valorResidual: true, vidaUtilAnos: true,
  valorAmortizacaoMensal: true, valorAmortizadoAcumulado: true, valorLiquidoContabilistico: true,
  metodoAmortizacao: true, contaDebitoId: true, contaCreditoId: true,
  lancamentoContabilId: true, processadoPor: true, processadoEm: true, createdAt: true,
} as const;

async function calcularPlano(input: GerarPlanoAmortizacaoInput, ctx: Ctx): Promise<PlanoAmortizacaoDto> {
  const ativo = await prisma.ativo.findFirst({
    where: { id: input.ativoId, deletedAt: null },
    select: { valorCompra: true, valorResidual: true, vidaUtilAnos: true, metodoAmortizacao: true, dataAquisicao: true },
  });
  if (!ativo) throw new NotFoundError('Ativo não encontrado');

  const vi = new Prisma.Decimal(ativo.valorCompra.toString());
  const vr = new Prisma.Decimal(ativo.valorResidual?.toString() ?? '0');
  const anoInicio = input.anoInicio ?? ativo.dataAquisicao.getFullYear();
  const mesInicio = input.mesInicio ?? (ativo.dataAquisicao.getMonth() + 1);

  const linhas = buildLinhas(
    input.ativoId, ativo.metodoAmortizacao, vi, vr, ativo.vidaUtilAnos,
    anoInicio, mesInicio, input.contaDebitoId, input.contaCreditoId, ctx.userId, ctx.tenantId,
  );

  const total = linhas.reduce((acc, l) => acc.plus(l.valorAmortizacaoMensal), new Prisma.Decimal(0));
  return { ativoId: input.ativoId, totalMeses: linhas.length, totalAmortizacao: total.toFixed(2), linhas };
}

async function processarAmortizacaoMensal(
  ativoId: string,
  ano: number,
  mes: number,
  ctx: Ctx,
  tx?: TxClient,
): Promise<AmortizacaoCalculoDto> {
  const db = tx ?? prisma;

  // Verificar se já calculado
  const existe = await db.amortizacaoCalculo.findUnique({
    where: { tenantId_ativoId_ano_mes: { tenantId: ctx.tenantId, ativoId, ano, mes } },
  });
  if (existe) throw new BusinessRuleError('AMORTIZACAO_JA_CALCULADA', `Amortização de ${ano}/${mes} já calculada para este ativo`);

  const ativo = await db.ativo.findFirst({
    where: { id: ativoId, deletedAt: null },
    select: { valorCompra: true, valorResidual: true, vidaUtilAnos: true, metodoAmortizacao: true, dataAquisicao: true },
  });
  if (!ativo) throw new NotFoundError('Ativo não encontrado');

  const vi = new Prisma.Decimal(ativo.valorCompra.toString());
  const vr = new Prisma.Decimal(ativo.valorResidual?.toString() ?? '0');

  // Buscar acumulado até ao mês anterior
  const historico = await db.amortizacaoCalculo.aggregate({
    where: { tenantId: ctx.tenantId, ativoId, OR: [{ ano: { lt: ano } }, { ano, mes: { lt: mes } }] },
    _sum: { valorAmortizacaoMensal: true },
  });
  const acumuladoAnterior = new Prisma.Decimal(historico._sum.valorAmortizacaoMensal?.toString() ?? '0');

  // Calcular mês actual
  const mesIndex = (ano - ativo.dataAquisicao.getFullYear()) * 12 + (mes - (ativo.dataAquisicao.getMonth() + 1));
  let mensal = calcMensal(ativo.metodoAmortizacao, vi.minus(vr), ativo.vidaUtilAnos, Math.max(0, mesIndex));

  if (ativo.metodoAmortizacao === 'SALDOS_DECRESCENTES') {
    const vliq = vi.minus(acumuladoAnterior);
    const taxaMensal = new Prisma.Decimal(2).div(ativo.vidaUtilAnos).div(12);
    mensal = vliq.times(taxaMensal);
  }

  const totalDepreciavel = vi.minus(vr);
  if (acumuladoAnterior.plus(mensal).greaterThan(totalDepreciavel)) {
    mensal = totalDepreciavel.minus(acumuladoAnterior);
  }
  if (mensal.isNegative()) mensal = new Prisma.Decimal(0);

  const acumulado = acumuladoAnterior.plus(mensal);
  const vliq = vi.minus(acumulado);

  const calculo = await db.amortizacaoCalculo.create({
    data: {
      tenantId: ctx.tenantId, ativoId, ano, mes,
      valorInicial: vi, valorResidual: vr, vidaUtilAnos: ativo.vidaUtilAnos,
      valorAmortizacaoMensal: mensal, valorAmortizadoAcumulado: acumulado,
      valorLiquidoContabilistico: vliq, metodoAmortizacao: ativo.metodoAmortizacao as never,
      processadoPor: ctx.userId, processadoEm: new Date(),
    },
    select: CALC_SEL,
  });
  return mapCalculo(calculo);
}

async function processarAmortizacaoTenant(
  ano: number,
  mes: number,
  ctx: Ctx,
): Promise<{ processados: number; erros: { ativoId: string; erro: string }[] }> {
  const ativos = await prisma.ativo.findMany({
    where: { tenantId: ctx.tenantId, estado: 'EM_USO', deletedAt: null },
    select: { id: true },
  });

  let processados = 0;
  const erros: { ativoId: string; erro: string }[] = [];

  for (const a of ativos) {
    try {
      await processarAmortizacaoMensal(a.id, ano, mes, ctx);
      processados++;
    } catch (e) {
      erros.push({ ativoId: a.id, erro: e instanceof Error ? e.message : 'Erro desconhecido' });
    }
  }
  return { processados, erros };
}

async function listarAmortizacoes(ativoId: string, ctx: Ctx): Promise<AmortizacaoCalculoDto[]> {
  const calculos = await prisma.amortizacaoCalculo.findMany({
    where: { ativoId, tenantId: ctx.tenantId },
    select: CALC_SEL,
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
  });
  return calculos.map(mapCalculo);
}

async function registarAbate(
  ativoId: string,
  opts: { motivo: string; valorRealizado?: number },
  ctx: Ctx,
  tx?: TxClient,
): Promise<void> {
  const db = tx ?? prisma;
  const ativo = await db.ativo.findFirst({ where: { id: ativoId, deletedAt: null }, select: { estado: true } });
  if (!ativo) throw new NotFoundError('Ativo não encontrado');
  if (ativo.estado === 'BAIXADO') throw new BusinessRuleError('ATIVO_JA_BAIXADO', 'Ativo já foi baixado');

  await db.ativo.update({ where: { id: ativoId }, data: { estado: 'BAIXADO' as never } });
  await db.movimentacaoAtivo.create({
    data: {
      tenantId: ctx.tenantId, ativoId, tipo: 'BAIXA' as never,
      dataMovimentacao: new Date(), motivo: opts.motivo, criadoPor: ctx.userId,
    },
  });
}

export const amortizacaoService: IAmortizacaoService = {
  calcularPlano,
  processarAmortizacaoMensal,
  processarAmortizacaoTenant,
  listarAmortizacoes,
  registarAbate,
};
