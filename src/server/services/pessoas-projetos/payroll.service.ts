/**
 * Serviço de Processamento Salarial — Spec 06.
 *
 * Orquestra I/O em torno do motor puro (`payroll-calculo.ts`):
 *  - processarFolhaMes: lote mensal em $transaction, idempotente por
 *    @@unique([tenantId, colaboradorId, anoReferencia, mesReferencia]);
 *  - marcarProcessada: lançamento contabilístico da massa salarial (WS D,
 *    diário SALARIOS, débito == crédito por construção);
 *  - marcarPaga: lançamento de pagamento + movimento de caixa opcional (WS D);
 *  - cancelar: estorno do lançamento (append-only) + estados CANCELADO;
 *  - recalcularPayroll / ajustarLinhaManual: só com payroll PENDENTE
 *    (após PROCESSADO os valores são imutáveis).
 */
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import {
  registarLancamentoContabilistico,
  estornarLancamento,
  obterLancamento,
} from '@/server/services/financas/contabilidade.service';
import { registarMovimentoCaixa } from '@/server/services/financas/caixa.service';
import type { RegistarLancamentoContabilisticoInput } from '@/server/services/financas';
import {
  calcularPayroll,
  calcularDescontoFalta,
  valorizarHorasExtras,
  type EntradaCalculoPayroll,
  type ResultadoCalculoPayroll,
  type TabelaINSSVigente,
  type EscalaoIRPSVigente,
} from './payroll-calculo';
import { TRANSICOES_PAYROLL, type StatusPayroll, type ReciboDados } from './payroll.interface';
import { transitar } from './rh.service';
import type {
  ProcessarFolhaInput,
  MarcarPagaInput,
  AjusteLinhaInput,
  FilterPayrollInput,
  FilterFolhaInput,
  TabelaINSSInput,
  CriarEscaloesIRPSInput,
} from '@/lib/validations/payroll';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ZERO = new Prisma.Decimal(0);

// ---------------------------------------------------------------------------
// Contas PGC-NIRF usadas na contabilização da folha (códigos do seed
// plano-contas-pgc.json). Contas — não taxas — pelo que podem ser constantes;
// parametrizar por tenant é extensão futura (ConfiguracaoContabil).
// ---------------------------------------------------------------------------
export const PGC_PAYROLL = {
  /** 622 — Remunerações dos trabalhadores (gasto, débito: bruto) */
  GASTOS_REMUNERACOES: '622',
  /** 623 — Encargos sobre remunerações (gasto, débito: INSS entidade) */
  GASTOS_ENCARGOS: '623',
  /** 449 — Contribuições para o INSS (crédito: INSS trab. + entidade) */
  INSS_A_PAGAR: '449',
  /** 442 — Impostos retidos na fonte (crédito: IRPS) */
  IRPS_RETIDO_A_PAGAR: '442',
  /** 451 — Pessoal (crédito: outras retenções — adiantamentos, penhoras…) */
  OUTRAS_RETENCOES: '451',
  /** 4622 — Remunerações a pagar aos trabalhadores (crédito: líquido) */
  REMUNERACOES_A_PAGAR: '4622',
  /** 121 — Depósitos à ordem (crédito no pagamento; alinhado com conta-pagar) */
  BANCO_DEPOSITOS_ORDEM: '121',
} as const;

// ---------------------------------------------------------------------------
// Montagem dos lançamentos (funções puras — alvo dos property tests)
// ---------------------------------------------------------------------------

export interface TotaisFolha {
  totalBruto: Prisma.Decimal;
  totalInssTrabalhador: Prisma.Decimal;
  totalInssEntidade: Prisma.Decimal;
  totalIrps: Prisma.Decimal;
  totalOutrosDescontos: Prisma.Decimal;
}

/**
 * Lançamento da massa salarial (diário SALARIOS). O líquido é derivado dos
 * restantes totais (bruto − INSS trab. − IRPS − outros), pelo que
 * débito == crédito POR CONSTRUÇÃO:
 *   Débito : 622 (bruto) + 623 (INSS entidade)
 *   Crédito: 449 (INSS trab.+entidade) + 442 (IRPS) + 451 (outras retenções) + 4622 (líquido)
 */
export function montarLancamentoFolha(
  folha: { id: string; mesReferencia: number; anoReferencia: number },
  t: TotaisFolha,
  data: Date,
): RegistarLancamentoContabilisticoInput {
  const liquido = t.totalBruto
    .minus(t.totalInssTrabalhador)
    .minus(t.totalIrps)
    .minus(t.totalOutrosDescontos);
  const periodo = `${String(folha.mesReferencia).padStart(2, '0')}/${folha.anoReferencia}`;

  const partidas: RegistarLancamentoContabilisticoInput['partidas'] = [
    {
      contaCodigo: PGC_PAYROLL.GASTOS_REMUNERACOES,
      tipo: 'DEBITO',
      valor: t.totalBruto.toFixed(2),
      historico: `Remunerações brutas ${periodo}`,
    },
  ];
  if (t.totalInssEntidade.gt(ZERO)) {
    partidas.push({
      contaCodigo: PGC_PAYROLL.GASTOS_ENCARGOS,
      tipo: 'DEBITO',
      valor: t.totalInssEntidade.toFixed(2),
      historico: `Encargo patronal INSS ${periodo}`,
    });
  }
  const inssTotal = t.totalInssTrabalhador.plus(t.totalInssEntidade);
  if (inssTotal.gt(ZERO)) {
    partidas.push({
      contaCodigo: PGC_PAYROLL.INSS_A_PAGAR,
      tipo: 'CREDITO',
      valor: inssTotal.toFixed(2),
      historico: `INSS a pagar (trab. + entidade) ${periodo}`,
    });
  }
  if (t.totalIrps.gt(ZERO)) {
    partidas.push({
      contaCodigo: PGC_PAYROLL.IRPS_RETIDO_A_PAGAR,
      tipo: 'CREDITO',
      valor: t.totalIrps.toFixed(2),
      historico: `IRPS retido na fonte ${periodo}`,
    });
  }
  if (t.totalOutrosDescontos.gt(ZERO)) {
    partidas.push({
      contaCodigo: PGC_PAYROLL.OUTRAS_RETENCOES,
      tipo: 'CREDITO',
      valor: t.totalOutrosDescontos.toFixed(2),
      historico: `Outras retenções a pessoal ${periodo}`,
    });
  }
  partidas.push({
    contaCodigo: PGC_PAYROLL.REMUNERACOES_A_PAGAR,
    tipo: 'CREDITO',
    valor: liquido.toFixed(2),
    historico: `Remunerações líquidas a pagar ${periodo}`,
  });

  return {
    data,
    diarioTipo: 'SALARIOS',
    origem: 'MANUAL',
    documentoOrigemId: folha.id,
    documentoOrigemTipo: 'FolhaPagamento',
    historico: `Folha de salários ${periodo}`,
    partidas,
  };
}

/**
 * Lançamento do pagamento da folha: débito Remunerações a pagar (4622),
 * crédito Depósitos à ordem (121). Débito == crédito por construção.
 */
export function montarLancamentoPagamentoFolha(
  folha: { id: string; mesReferencia: number; anoReferencia: number },
  totalLiquido: Prisma.Decimal,
  data: Date,
): RegistarLancamentoContabilisticoInput {
  const periodo = `${String(folha.mesReferencia).padStart(2, '0')}/${folha.anoReferencia}`;
  return {
    data,
    diarioTipo: 'SALARIOS',
    origem: 'PAGAMENTO',
    documentoOrigemId: folha.id,
    documentoOrigemTipo: 'FolhaPagamento',
    historico: `Pagamento da folha de salários ${periodo}`,
    partidas: [
      {
        contaCodigo: PGC_PAYROLL.REMUNERACOES_A_PAGAR,
        tipo: 'DEBITO',
        valor: totalLiquido.toFixed(2),
        historico: `Liquidação de remunerações ${periodo}`,
      },
      {
        contaCodigo: PGC_PAYROLL.BANCO_DEPOSITOS_ORDEM,
        tipo: 'CREDITO',
        valor: totalLiquido.toFixed(2),
        historico: `Saída banco — salários ${periodo}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tabelas paramétricas vigentes
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

/** Data de referência do mês (dia 1, UTC) para resolver a vigência. */
export function dataReferencia(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1));
}

async function obterTabelasVigentes(
  tx: Tx,
  ref: Date,
  tenantId: string,
): Promise<{ inss: TabelaINSSVigente; irps: EscalaoIRPSVigente[] }> {
  const tabelaInss = await tx.tabelaINSS.findFirst({
    where: {
      tenantId,
      vigenciaInicio: { lte: ref },
      OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: ref } }],
    },
    orderBy: { vigenciaInicio: 'desc' },
  });
  if (!tabelaInss) {
    throw new BusinessRuleError('TABELA_INSS_EM_FALTA', 'Não existe tabela INSS vigente para o período');
  }

  const escaloes = await tx.escalaoIRPS.findMany({
    where: {
      tenantId,
      numeroDependentes: 0,
      vigenciaInicio: { lte: ref },
      OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: ref } }],
    },
    orderBy: [{ vigenciaInicio: 'desc' }, { ordem: 'asc' }],
  });
  if (escaloes.length === 0) {
    throw new BusinessRuleError('TABELA_IRPS_EM_FALTA', 'Não existem escalões IRPS vigentes para o período');
  }
  // Só a vigência mais recente aplicável
  const vigenciaTop = escaloes[0].vigenciaInicio.getTime();
  const vigentes = escaloes.filter((e) => e.vigenciaInicio.getTime() === vigenciaTop);

  return {
    inss: {
      taxaTrabalhador: tabelaInss.taxaTrabalhador,
      taxaEntidade: tabelaInss.taxaEntidade,
      tetoIncidencia: tabelaInss.tetoIncidencia,
    },
    irps: vigentes.map((e) => ({
      ordem: e.ordem,
      limiteInferior: e.limiteInferior,
      limiteSuperior: e.limiteSuperior,
      taxa: e.taxa,
      parcelaAbater: e.parcelaAbater,
    })),
  };
}

// ---------------------------------------------------------------------------
// Snapshot mensal por colaborador (assiduidade, ausências, comissões, ajustes)
// ---------------------------------------------------------------------------

interface ColaboradorSnapshot {
  id: string;
  salarioBase: Prisma.Decimal;
  subsidioAlimentacao: Prisma.Decimal | null;
  subsidioTransporte: Prisma.Decimal | null;
  subsidioHabitacao: Prisma.Decimal | null;
  subsidiosOutros: Prisma.Decimal | null;
  email: string;
}

interface LinhaManual {
  tipo: 'PROVENTO' | 'DESCONTO';
  natureza: string;
  descricao: string;
  valor: Prisma.Decimal;
}

// PONTO DE EXTENSÃO (Spec 08 — benefícios): proventos/descontos adicionais por
// colaborador entram como linhas manuais (`LinhaPayroll.manual=true`, via
// `ajustarLinhaManual`) e sobrevivem ao recálculo. Alternativa futura: o spec 08
// expõe um contrato `obterBeneficiosDoMes(colaboradorId, periodo)` que
// `montarEntrada` consome ao lado de assiduidade/comissões — sem dependência hoje.

/** Agregados mensais por colaborador (horas extras + dias de falta). */
interface AgregadosMes {
  horasExtras: Map<string, Prisma.Decimal>;
  diasFalta: Map<string, number>;
}

/**
 * Pré-agrega assiduidade e ausências do mês para TODOS os colaboradores em
 * 2 queries `groupBy` (evita N+1 dentro da transacção do lote).
 * Faltas não remuneradas: ausências APROVADAS não justificadas (FALTA) ou
 * licença sem vencimento, com início dentro do mês (simplificação documentada).
 */
async function agregadosDoMes(
  tx: Tx,
  colaboradorIds: string[],
  periodo: { inicio: Date; fim: Date },
  tenantId: string,
): Promise<AgregadosMes> {
  const assiduidade = await tx.registoAssiduidade.groupBy({
    by: ['colaboradorId'],
    where: {
      tenantId,
      colaboradorId: { in: colaboradorIds },
      data: { gte: periodo.inicio, lt: periodo.fim },
    },
    _sum: { horasExtras: true },
  });
  const ausencias = await tx.ausencia.groupBy({
    by: ['colaboradorId'],
    where: {
      tenantId,
      colaboradorId: { in: colaboradorIds },
      status: 'APROVADA',
      dataInicio: { gte: periodo.inicio, lt: periodo.fim },
      OR: [
        { tipo: 'FALTA', justificada: false },
        { tipo: 'LICENCA_SEM_VENCIMENTO' },
      ],
    },
    _sum: { diasAusencia: true },
  });

  return {
    horasExtras: new Map(
      assiduidade.map((a) => [a.colaboradorId, a._sum.horasExtras ?? ZERO]),
    ),
    diasFalta: new Map(
      ausencias.map((a) => [a.colaboradorId, a._sum.diasAusencia ?? 0]),
    ),
  };
}

/** Monta a entrada do motor a partir de snapshots pré-agregados — SEM I/O. */
function montarEntrada(
  col: ColaboradorSnapshot,
  tabelas: { inss: TabelaINSSVigente; irps: EscalaoIRPSVigente[] },
  snapshot: { horasExtras: Prisma.Decimal; diasFalta: number; comissoes: Prisma.Decimal },
  linhasManuais: LinhaManual[] = [],
): EntradaCalculoPayroll {
  // Horas extras do mês (RegistoAssiduidade), valorizadas com majoração 50%
  const valorHorasExtras = valorizarHorasExtras(col.salarioBase, snapshot.horasExtras);
  const { diasFalta } = snapshot;

  const descontosDiversos: EntradaCalculoPayroll['descontosDiversos'] = [];
  if (diasFalta > 0) {
    descontosDiversos.push({
      natureza: 'FALTA',
      descricao: `Faltas não remuneradas (${diasFalta} dia${diasFalta > 1 ? 's' : ''})`,
      valor: calcularDescontoFalta(col.salarioBase, diasFalta),
    });
  }

  // Ajustes manuais persistidos (sobrevivem ao recálculo)
  let bonusManual = ZERO;
  let proventosOutrosManual = ZERO;
  for (const l of linhasManuais) {
    if (l.tipo === 'PROVENTO') {
      if (l.natureza === 'BONUS') bonusManual = bonusManual.plus(l.valor);
      else proventosOutrosManual = proventosOutrosManual.plus(l.valor);
    } else {
      descontosDiversos.push({
        natureza: (['ADIANTAMENTO', 'PENHORA'].includes(l.natureza) ? l.natureza : 'OUTRO') as
          | 'ADIANTAMENTO'
          | 'PENHORA'
          | 'OUTRO',
        descricao: l.descricao,
        valor: l.valor,
      });
    }
  }

  return {
    salarioBase: col.salarioBase,
    subsidios: {
      alimentacao: col.subsidioAlimentacao ?? ZERO,
      transporte: col.subsidioTransporte ?? ZERO,
      habitacao: col.subsidioHabitacao ?? ZERO,
      outros: col.subsidiosOutros ?? ZERO,
    },
    variaveis: {
      horasExtras: valorHorasExtras,
      comissoes: snapshot.comissoes,
      bonus: bonusManual,
      outros: proventosOutrosManual,
    },
    descontosDiversos,
    tabelaInss: tabelas.inss,
    escaloesIrps: tabelas.irps,
  };
}

/**
 * Comissões aprovadas do mês por colaborador (WS C). O `Comissao.vendedorId`
 * referencia `User`; a correspondência Colaborador↔User faz-se por email
 * (único por tenant em ambos) — decisão documentada no handoff.
 */
async function comissoesPorColaborador(
  tx: Tx,
  colaboradores: ColaboradorSnapshot[],
  periodo: { inicio: Date; fim: Date },
  tenantId: string,
): Promise<Map<string, Prisma.Decimal>> {
  const emails = colaboradores.map((c) => c.email);
  const users = await tx.user.findMany({
    where: { tenantId, email: { in: emails } },
    select: { id: true, email: true },
  });
  const emailPorUserId = new Map(users.map((u) => [u.id, u.email]));
  if (users.length === 0) return new Map();

  const comissoes = await tx.comissao.findMany({
    where: {
      tenantId,
      vendedorId: { in: users.map((u) => u.id) },
      status: 'APROVADA',
      createdAt: { gte: periodo.inicio, lt: periodo.fim },
    },
    select: { vendedorId: true, valorComissao: true },
  });

  const porEmail = new Map<string, Prisma.Decimal>();
  for (const c of comissoes) {
    const email = emailPorUserId.get(c.vendedorId);
    if (!email) continue;
    porEmail.set(email, (porEmail.get(email) ?? ZERO).plus(c.valorComissao));
  }
  const porColaborador = new Map<string, Prisma.Decimal>();
  for (const col of colaboradores) {
    const v = porEmail.get(col.email);
    if (v) porColaborador.set(col.id, v);
  }
  return porColaborador;
}

// ---------------------------------------------------------------------------
// Persistência do resultado de cálculo
// ---------------------------------------------------------------------------

async function gravarPayroll(
  tx: Tx,
  params: {
    tenantId: string;
    folhaId: string;
    colaboradorId: string;
    mes: number;
    ano: number;
    entrada: EntradaCalculoPayroll;
    resultado: ResultadoCalculoPayroll;
    payrollExistenteId?: string;
    linhasManuais?: LinhaManual[];
  },
): Promise<string> {
  const { tenantId, resultado: r, entrada: e } = params;
  const data = {
    tenantId,
    colaboradorId: params.colaboradorId,
    mesReferencia: params.mes,
    anoReferencia: params.ano,
    folhaId: params.folhaId,
    salarioBruto: r.bruto,
    descontoInss: r.inssTrabalhador,
    descontoIrps: r.irps,
    descontoOutros: r.outrosDescontos,
    proventoHorasExtras: e.variaveis.horasExtras,
    proventoSubAlimentacao: e.subsidios.alimentacao,
    proventoSubTransporte: e.subsidios.transporte,
    proventoSubHabitacao: e.subsidios.habitacao,
    proventoComissoes: e.variaveis.comissoes,
    proventoBonus: e.variaveis.bonus,
    proventoOutros: e.subsidios.outros.plus(e.variaveis.outros),
    salarioLiquido: r.liquido,
    encargoInssEntidade: r.inssEntidade,
    custoTotalEntidade: r.custoTotalEntidade,
    status: 'PENDENTE' as const,
  };

  let payrollId: string;
  if (params.payrollExistenteId) {
    payrollId = params.payrollExistenteId;
    await tx.payroll.update({ where: { id: payrollId }, data });
    // Recalcular substitui as linhas calculadas; as manuais persistem
    await tx.linhaPayroll.deleteMany({ where: { tenantId, payrollId, manual: false } });
  } else {
    const criado = await tx.payroll.create({ data, select: { id: true } });
    payrollId = criado.id;
  }

  await tx.linhaPayroll.createMany({
    data: r.linhas
      // Linhas manuais já existem na BD (manual=true); os seus valores entram
      // no cálculo via `entrada`, mas as linhas calculadas que são apenas a
      // projecção de um ajuste manual são filtradas para não duplicar.
      .filter((l) => !isProjeccaoDeLinhaManual(l, params.linhasManuais ?? []))
      .map((l) => ({
        tenantId,
        payrollId,
        tipo: l.tipo,
        natureza: l.natureza,
        descricao: l.descricao,
        valor: l.valor,
        manual: false,
      })),
  });
  return payrollId;
}

/**
 * Evita duplicar na BD linhas calculadas que são apenas a projecção de um
 * ajuste manual: descontos manuais entram no cálculo com a mesma descrição;
 * proventos manuais (BONUS/OUTRO) agregam-se nas linhas genéricas 'Bónus' e
 * 'Outros proventos' — que só existem por via manual neste serviço.
 */
function isProjeccaoDeLinhaManual(
  linha: { tipo: string; natureza: string; descricao: string },
  manuais: LinhaManual[],
): boolean {
  if (manuais.some((m) => m.tipo === linha.tipo && m.descricao === linha.descricao)) return true;
  if (linha.tipo === 'PROVENTO' && linha.natureza === 'BONUS') {
    return manuais.some((m) => m.tipo === 'PROVENTO' && m.natureza === 'BONUS');
  }
  if (linha.tipo === 'PROVENTO' && linha.natureza === 'OUTRO') {
    return manuais.some((m) => m.tipo === 'PROVENTO' && m.natureza !== 'BONUS');
  }
  return false;
}

async function actualizarTotaisFolha(tx: Tx, folhaId: string, tenantId: string): Promise<void> {
  const agg = await tx.payroll.aggregate({
    where: { tenantId, folhaId, status: { in: ['PENDENTE', 'PROCESSADO', 'PAGO'] } },
    _sum: {
      salarioBruto: true,
      descontoInss: true,
      encargoInssEntidade: true,
      descontoIrps: true,
      descontoOutros: true,
      salarioLiquido: true,
      custoTotalEntidade: true,
    },
  });
  await tx.folhaPagamento.update({
    where: { id: folhaId },
    data: {
      totalBruto: agg._sum.salarioBruto ?? ZERO,
      totalInssTrabalhador: agg._sum.descontoInss ?? ZERO,
      totalInssEntidade: agg._sum.encargoInssEntidade ?? ZERO,
      totalIrps: agg._sum.descontoIrps ?? ZERO,
      totalOutrosDescontos: agg._sum.descontoOutros ?? ZERO,
      totalLiquido: agg._sum.salarioLiquido ?? ZERO,
      totalCustoEntidade: agg._sum.custoTotalEntidade ?? ZERO,
    },
  });
}

/**
 * Recalcula UM payroll dentro de uma transacção existente (partilhado por
 * `recalcularPayroll` e `ajustarLinhaManual`). Rejeita `LIQUIDO_NEGATIVO`
 * — um líquido negativo geraria crédito negativo na conta 4622.
 */
async function recalcularPayrollNoTx(tx: Tx, payrollId: string, ctx: Ctx): Promise<void> {
  const payroll = await tx.payroll.findFirst({
    where: { id: payrollId, tenantId: ctx.tenantId },
    include: {
      colaborador: {
        select: {
          id: true,
          salarioBase: true,
          subsidioAlimentacao: true,
          subsidioTransporte: true,
          subsidioHabitacao: true,
          subsidiosOutros: true,
          email: true,
        },
      },
    },
  });
  if (!payroll) throw new NotFoundError('Payroll não encontrado');
  if (payroll.status !== 'PENDENTE') {
    throw new BusinessRuleError(
      'PAYROLL_IMUTAVEL',
      'Só é possível recalcular um payroll pendente (após processamento os valores são imutáveis)',
    );
  }
  if (!payroll.folhaId) {
    throw new BusinessRuleError('PAYROLL_SEM_FOLHA', 'Payroll não pertence a nenhuma folha mensal');
  }

  const ref = dataReferencia(payroll.anoReferencia, payroll.mesReferencia);
  const periodo = { inicio: ref, fim: new Date(Date.UTC(payroll.anoReferencia, payroll.mesReferencia, 1)) };
  const tabelas = await obterTabelasVigentes(tx, ref, ctx.tenantId);
  const comissoes = await comissoesPorColaborador(tx, [payroll.colaborador], periodo, ctx.tenantId);
  const agregados = await agregadosDoMes(tx, [payroll.colaboradorId], periodo, ctx.tenantId);
  const linhasManuais = await tx.linhaPayroll.findMany({
    where: { tenantId: ctx.tenantId, payrollId, manual: true },
    select: { tipo: true, natureza: true, descricao: true, valor: true },
  });

  const entrada = montarEntrada(payroll.colaborador, tabelas, {
    horasExtras: agregados.horasExtras.get(payroll.colaboradorId) ?? ZERO,
    diasFalta: agregados.diasFalta.get(payroll.colaboradorId) ?? 0,
    comissoes: comissoes.get(payroll.colaboradorId) ?? ZERO,
  }, linhasManuais);
  const resultado = calcularPayroll(entrada);

  if (resultado.liquido.lt(ZERO)) {
    throw new BusinessRuleError(
      'LIQUIDO_NEGATIVO',
      `Os descontos excedem os proventos (líquido ${resultado.liquido.toFixed(2)}) — ajuste os descontos`,
    );
  }

  await gravarPayroll(tx, {
    tenantId: ctx.tenantId,
    folhaId: payroll.folhaId,
    colaboradorId: payroll.colaboradorId,
    mes: payroll.mesReferencia,
    ano: payroll.anoReferencia,
    entrada,
    resultado,
    payrollExistenteId: payroll.id,
    linhasManuais,
  });
  await actualizarTotaisFolha(tx, payroll.folhaId, ctx.tenantId);
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export const PayrollService = {
  /**
   * Processa a folha de TODOS os colaboradores activos do mês/ano.
   * Idempotente: payrolls PENDENTE/CANCELADO são recalculados; PROCESSADO/PAGO
   * nunca são tocados. Folha PROCESSADO/PAGO → erro (cancelar primeiro).
   */
  async processarFolhaMes(
    input: ProcessarFolhaInput,
    ctx: Ctx,
  ): Promise<{ folhaId: string; totalColaboradores: number }> {
    const { mes, ano } = input;
    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as Prisma.TransactionClient;
      const existente = await tx.folhaPagamento.findFirst({
        where: { tenantId: ctx.tenantId, anoReferencia: ano, mesReferencia: mes },
      });
      if (existente && ['PROCESSADO', 'PAGO'].includes(existente.status)) {
        throw new BusinessRuleError(
          'FOLHA_JA_PROCESSADA',
          `A folha ${String(mes).padStart(2, '0')}/${ano} já foi processada; cancele-a para reprocessar`,
        );
      }

      let folha;
      if (existente) {
        folha = await tx.folhaPagamento.update({
          where: { id: existente.id },
          data: { status: 'PENDENTE', processadoPorId: ctx.userId },
        });
      } else {
        try {
          folha = await tx.folhaPagamento.create({
            data: {
              tenantId: ctx.tenantId,
              anoReferencia: ano,
              mesReferencia: mes,
              status: 'PENDENTE',
              processadoPorId: ctx.userId,
            },
          });
        } catch (e) {
          // Corrida entre dois processamentos simultâneos do mesmo mês (P2002
          // no @@unique([tenantId, anoReferencia, mesReferencia]))
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            throw new BusinessRuleError(
              'FOLHA_JA_EM_PROCESSAMENTO',
              `A folha ${String(mes).padStart(2, '0')}/${ano} está a ser processada noutra sessão`,
            );
          }
          throw e;
        }
      }

      const ref = dataReferencia(ano, mes);
      const periodo = { inicio: ref, fim: new Date(Date.UTC(ano, mes, 1)) };
      const tabelas = await obterTabelasVigentes(tx, ref, ctx.tenantId);

      const colaboradores = await tx.colaborador.findMany({
        where: { tenantId: ctx.tenantId, status: 'ACTIVO', deletedAt: null },
        select: {
          id: true,
          salarioBase: true,
          subsidioAlimentacao: true,
          subsidioTransporte: true,
          subsidioHabitacao: true,
          subsidiosOutros: true,
          email: true,
        },
      });
      if (colaboradores.length === 0) {
        throw new BusinessRuleError('SEM_COLABORADORES_ACTIVOS', 'Não existem colaboradores activos para processar');
      }

      // Pré-agregação fora do loop (evita N+1 dentro da transacção):
      // comissões, assiduidade/ausências (2 groupBy), payrolls existentes e
      // linhas manuais — número de queries constante face ao n.º de colaboradores.
      const colaboradorIds = colaboradores.map((c) => c.id);
      const comissoes = await comissoesPorColaborador(tx, colaboradores, periodo, ctx.tenantId);
      const agregados = await agregadosDoMes(tx, colaboradorIds, periodo, ctx.tenantId);

      const payrollsExistentes = await tx.payroll.findMany({
        where: {
          tenantId: ctx.tenantId,
          anoReferencia: ano,
          mesReferencia: mes,
          colaboradorId: { in: colaboradorIds },
        },
        select: { id: true, status: true, colaboradorId: true },
      });
      const payrollPorColaborador = new Map(payrollsExistentes.map((p) => [p.colaboradorId, p]));

      const recalculaveisIds = payrollsExistentes
        .filter((p) => !['PROCESSADO', 'PAGO'].includes(p.status))
        .map((p) => p.id);
      const todasLinhasManuais = recalculaveisIds.length
        ? await tx.linhaPayroll.findMany({
            where: { tenantId: ctx.tenantId, payrollId: { in: recalculaveisIds }, manual: true },
            select: { payrollId: true, tipo: true, natureza: true, descricao: true, valor: true },
          })
        : [];
      const linhasManuaisPorPayroll = new Map<string, LinhaManual[]>();
      for (const l of todasLinhasManuais) {
        const lista = linhasManuaisPorPayroll.get(l.payrollId) ?? [];
        lista.push(l);
        linhasManuaisPorPayroll.set(l.payrollId, lista);
      }

      let total = 0;
      for (const col of colaboradores) {
        const payrollExistente = payrollPorColaborador.get(col.id);
        // Imutável após PROCESSADO — não tocar
        if (payrollExistente && ['PROCESSADO', 'PAGO'].includes(payrollExistente.status)) continue;

        const linhasManuais = payrollExistente
          ? (linhasManuaisPorPayroll.get(payrollExistente.id) ?? [])
          : [];

        const entrada = montarEntrada(col, tabelas, {
          horasExtras: agregados.horasExtras.get(col.id) ?? ZERO,
          diasFalta: agregados.diasFalta.get(col.id) ?? 0,
          comissoes: comissoes.get(col.id) ?? ZERO,
        }, linhasManuais);
        const resultado = calcularPayroll(entrada);
        await gravarPayroll(tx, {
          tenantId: ctx.tenantId,
          folhaId: folha.id,
          colaboradorId: col.id,
          mes,
          ano,
          entrada,
          resultado,
          payrollExistenteId: payrollExistente?.id,
          linhasManuais,
        });
        total += 1;
      }

      await actualizarTotaisFolha(tx, folha.id, ctx.tenantId);
      return { folhaId: folha.id, totalColaboradores: total };
    }, { timeout: 60_000 }); // lote mensal: escrita por colaborador dentro da tx
  },

  /**
   * PENDENTE → PROCESSADO: gera o lançamento da massa salarial (diário
   * SALARIOS, débito == crédito) e congela os valores (append-only).
   */
  async marcarProcessada(folhaId: string, ctx: Ctx): Promise<{ lancamentoId: string }> {
    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as Prisma.TransactionClient;
      const folha = await tx.folhaPagamento.findFirst({
        where: { id: folhaId, tenantId: ctx.tenantId },
      });
      if (!folha) throw new NotFoundError('Folha de pagamento não encontrada');
      transitar(TRANSICOES_PAYROLL, folha.status, 'PROCESSADO');

      const pendentes = await tx.payroll.count({
        where: { tenantId: ctx.tenantId, folhaId, status: 'PENDENTE' },
      });
      if (pendentes === 0) {
        throw new BusinessRuleError('FOLHA_VAZIA', 'A folha não tem payrolls pendentes para processar');
      }

      // Nunca contabilizar líquidos negativos (crédito negativo na 4622)
      const negativos = await tx.payroll.count({
        where: { tenantId: ctx.tenantId, folhaId, status: 'PENDENTE', salarioLiquido: { lt: 0 } },
      });
      if (negativos > 0) {
        throw new BusinessRuleError(
          'LIQUIDO_NEGATIVO',
          `${negativos} payroll(s) com salário líquido negativo — corrija os descontos antes de processar`,
        );
      }

      const agora = new Date();
      const lancamento = await registarLancamentoContabilistico(
        tx,
        montarLancamentoFolha(folha, folha, agora),
        ctx,
      );

      await tx.payroll.updateMany({
        where: { tenantId: ctx.tenantId, folhaId, status: 'PENDENTE' },
        data: { status: 'PROCESSADO' },
      });
      await tx.folhaPagamento.update({
        where: { id: folhaId },
        data: {
          status: 'PROCESSADO',
          lancamentoId: lancamento.id,
          dataProcessamento: agora,
          processadoPorId: ctx.userId,
        },
      });
      return { lancamentoId: lancamento.id };
    });
  },

  /**
   * PROCESSADO → PAGO: lançamento de pagamento (4622 → 121) e, se for pago do
   * caixa físico (sessaoCaixaId), movimento de caixa via contrato WS D.
   */
  async marcarPaga(input: MarcarPagaInput, ctx: Ctx): Promise<void> {
    await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as Prisma.TransactionClient;
      const folha = await tx.folhaPagamento.findFirst({
        where: { id: input.folhaId, tenantId: ctx.tenantId },
      });
      if (!folha) throw new NotFoundError('Folha de pagamento não encontrada');
      transitar(TRANSICOES_PAYROLL, folha.status, 'PAGO');

      const dataPagamento = input.dataPagamento ?? new Date();
      const lancamento = await registarLancamentoContabilistico(
        tx,
        montarLancamentoPagamentoFolha(folha, folha.totalLiquido, dataPagamento),
        ctx,
      );

      if (input.sessaoCaixaId) {
        await registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId: input.sessaoCaixaId,
            tipo: 'SANGRIA',
            valor: folha.totalLiquido.toFixed(2),
            descricao: `Pagamento de salários ${String(folha.mesReferencia).padStart(2, '0')}/${folha.anoReferencia}`,
            documentoOrigemId: folha.id,
            documentoOrigemTipo: 'FolhaPagamento',
          },
          ctx,
        );
      }

      await tx.payroll.updateMany({
        where: { tenantId: ctx.tenantId, folhaId: folha.id, status: 'PROCESSADO' },
        data: { status: 'PAGO', dataPagamento },
      });
      await tx.folhaPagamento.update({
        where: { id: folha.id },
        data: { status: 'PAGO', dataPagamento, lancamentoPagamentoId: lancamento.id },
      });
    });
  },

  /**
   * Cancela a folha (PENDENTE ou PROCESSADO). Se já processada, estorna o
   * lançamento da massa salarial (append-only — nunca apagar).
   *
   * Recuperável/idempotente: o estorno corre fora da transacção de estados
   * (o contrato gere as suas próprias escritas). Se a mudança de estados
   * falhar depois do estorno, o retry verifica o estado do lançamento e
   * salta o estorno já efectuado, completando apenas os estados.
   */
  async cancelar(folhaId: string, motivo: string, ctx: Ctx): Promise<void> {
    const folha = await prisma.folhaPagamento.findFirst({
      where: { id: folhaId, tenantId: ctx.tenantId },
    });
    if (!folha) throw new NotFoundError('Folha de pagamento não encontrada');
    transitar(TRANSICOES_PAYROLL, folha.status, 'CANCELADO');

    if (folha.status === 'PROCESSADO' && folha.lancamentoId) {
      const lancamento = await obterLancamento(folha.lancamentoId, ctx);
      if (lancamento && lancamento.status !== 'ESTORNADO') {
        await estornarLancamento(
          { lancamentoId: folha.lancamentoId, motivo: `Cancelamento da folha: ${motivo}` },
          ctx,
        );
      }
    }

    await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as Prisma.TransactionClient;
      await tx.payroll.updateMany({
        where: { tenantId: ctx.tenantId, folhaId, status: { in: ['PENDENTE', 'PROCESSADO'] } },
        data: { status: 'CANCELADO' },
      });
      await tx.folhaPagamento.update({
        where: { id: folhaId },
        data: { status: 'CANCELADO', observacoes: motivo },
      });
    });
  },

  /** Recalcula UM payroll (só PENDENTE), preservando linhas manuais. */
  async recalcularPayroll(payrollId: string, ctx: Ctx): Promise<void> {
    await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as Prisma.TransactionClient;
      await recalcularPayrollNoTx(tx, payrollId, ctx);
    });
  },

  /**
   * Adiciona linha manual (adiantamento, penhora, bónus, outro) a um payroll
   * PENDENTE e recalcula os valores estatutários NA MESMA transacção — se o
   * recálculo falhar (ex.: LIQUIDO_NEGATIVO), a linha não fica gravada.
   * Ponto de extensão do spec 08.
   */
  async ajustarLinhaManual(input: AjusteLinhaInput, ctx: Ctx): Promise<void> {
    await prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as Prisma.TransactionClient;
      const payroll = await tx.payroll.findFirst({
        where: { id: input.payrollId, tenantId: ctx.tenantId },
        select: { id: true, status: true },
      });
      if (!payroll) throw new NotFoundError('Payroll não encontrado');
      if (payroll.status !== 'PENDENTE') {
        throw new BusinessRuleError(
          'PAYROLL_IMUTAVEL',
          'Só é possível ajustar um payroll pendente (após processamento os valores são imutáveis)',
        );
      }
      await tx.linhaPayroll.create({
        data: {
          tenantId: ctx.tenantId,
          payrollId: input.payrollId,
          tipo: input.tipo,
          natureza: input.natureza,
          descricao: input.descricao,
          valor: D(input.valor.toFixed(2)),
          manual: true,
        },
      });
      await recalcularPayrollNoTx(tx, input.payrollId, ctx);
    });
  },

  // -------------------------------------------------------------------------
  // Leituras
  // -------------------------------------------------------------------------

  async listarFolhas(filter: FilterFolhaInput, ctx: Ctx) {
    const where: Prisma.FolhaPagamentoWhereInput = {
      tenantId: ctx.tenantId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.ano ? { anoReferencia: filter.ano } : {}),
    };
    return paginate(
      (a) =>
        prisma.folhaPagamento.findMany({
          ...a,
          where,
          orderBy: [{ anoReferencia: 'desc' }, { mesReferencia: 'desc' }],
          include: { _count: { select: { payrolls: true } } },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async listarPayrolls(filter: FilterPayrollInput, ctx: Ctx) {
    const where: Prisma.PayrollWhereInput = {
      tenantId: ctx.tenantId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.colaboradorId ? { colaboradorId: filter.colaboradorId } : {}),
      ...(filter.mes ? { mesReferencia: filter.mes } : {}),
      ...(filter.ano ? { anoReferencia: filter.ano } : {}),
      ...(filter.folhaId ? { folhaId: filter.folhaId } : {}),
    };
    return paginate(
      (a) =>
        prisma.payroll.findMany({
          ...a,
          where,
          orderBy: [{ anoReferencia: 'desc' }, { mesReferencia: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            colaboradorId: true,
            mesReferencia: true,
            anoReferencia: true,
            salarioBruto: true,
            salarioLiquido: true,
            status: true,
            colaborador: { select: { nome: true } },
          },
        }),
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obterFolha(folhaId: string, ctx: Ctx) {
    const folha = await prisma.folhaPagamento.findFirst({
      where: { id: folhaId, tenantId: ctx.tenantId },
      include: { _count: { select: { payrolls: true } } },
    });
    if (!folha) throw new NotFoundError('Folha de pagamento não encontrada');
    return folha;
  },

  async obterPayroll(payrollId: string, ctx: Ctx) {
    const payroll = await prisma.payroll.findFirst({
      where: { id: payrollId, tenantId: ctx.tenantId },
      include: {
        colaborador: {
          select: {
            codigo: true,
            nome: true,
            nuit: true,
            niss: true,
            bancoNib: true,
            cargo: { select: { nome: true } },
            departamento: { select: { nome: true } },
          },
        },
        linhas: { orderBy: [{ tipo: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!payroll) throw new NotFoundError('Payroll não encontrado');
    return payroll;
  },

  /** Dados completos do recibo de vencimento (para a página e para o PDF). */
  async obterRecibo(payrollId: string, ctx: Ctx): Promise<ReciboDados> {
    const p = await this.obterPayroll(payrollId, ctx);
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { nome: true, nuit: true },
    });
    return {
      payroll: {
        id: p.id,
        mesReferencia: p.mesReferencia,
        anoReferencia: p.anoReferencia,
        status: p.status as StatusPayroll,
        salarioBruto: p.salarioBruto,
        descontoInss: p.descontoInss,
        descontoIrps: p.descontoIrps,
        descontoOutros: p.descontoOutros,
        salarioLiquido: p.salarioLiquido,
        encargoInssEntidade: p.encargoInssEntidade,
        custoTotalEntidade: p.custoTotalEntidade,
        dataPagamento: p.dataPagamento,
      },
      colaborador: {
        codigo: p.colaborador.codigo,
        nome: p.colaborador.nome,
        nuit: p.colaborador.nuit,
        niss: p.colaborador.niss,
        cargo: p.colaborador.cargo?.nome ?? null,
        departamento: p.colaborador.departamento?.nome ?? null,
        bancoNib: p.colaborador.bancoNib,
      },
      empresa: {
        nome: tenant?.nome ?? '',
        nuit: tenant?.nuit ?? '',
      },
      linhas: p.linhas.map((l) => ({
        id: l.id,
        tipo: l.tipo as 'PROVENTO' | 'DESCONTO',
        natureza: l.natureza as ReciboDados['linhas'][number]['natureza'],
        descricao: l.descricao,
        valor: l.valor,
        manual: l.manual,
      })),
    };
  },

  /** Mapa mensal para submissão às autoridades (INSS ou IRPS retido). */
  async mapaMensal(
    tipo: 'INSS' | 'IRPS',
    mes: number,
    ano: number,
    ctx: Ctx,
  ): Promise<{
    linhas: {
      colaboradorCodigo: string;
      colaboradorNome: string;
      nuit: string;
      niss: string | null;
      salarioBruto: Prisma.Decimal;
      inssTrabalhador: Prisma.Decimal;
      inssEntidade: Prisma.Decimal;
      irps: Prisma.Decimal;
    }[];
  }> {
    const payrolls = await prisma.payroll.findMany({
      where: {
        tenantId: ctx.tenantId,
        mesReferencia: mes,
        anoReferencia: ano,
        status: { in: ['PROCESSADO', 'PAGO'] },
      },
      select: {
        salarioBruto: true,
        descontoInss: true,
        encargoInssEntidade: true,
        descontoIrps: true,
        colaborador: { select: { codigo: true, nome: true, nuit: true, niss: true } },
      },
      orderBy: { colaborador: { nome: 'asc' } },
    });
    return {
      linhas: payrolls.map((p) => ({
        colaboradorCodigo: p.colaborador.codigo,
        colaboradorNome: p.colaborador.nome,
        nuit: p.colaborador.nuit,
        niss: p.colaborador.niss,
        salarioBruto: p.salarioBruto,
        inssTrabalhador: p.descontoInss,
        inssEntidade: p.encargoInssEntidade,
        irps: p.descontoIrps,
      })),
    };
  },

  // -------------------------------------------------------------------------
  // Tabelas paramétricas (admin) — nova vigência fecha a anterior
  // -------------------------------------------------------------------------

  async criarTabelaINSS(input: TabelaINSSInput, ctx: Ctx): Promise<{ id: string }> {
    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as Prisma.TransactionClient;
      const anterior = await tx.tabelaINSS.findFirst({
        where: { tenantId: ctx.tenantId, vigenciaFim: null },
        orderBy: { vigenciaInicio: 'desc' },
      });
      if (anterior) {
        if (anterior.vigenciaInicio >= input.vigenciaInicio) {
          throw new BusinessRuleError(
            'VIGENCIA_INVALIDA',
            'A nova vigência tem de começar depois da vigência actual',
          );
        }
        await tx.tabelaINSS.update({
          where: { id: anterior.id },
          data: { vigenciaFim: new Date(input.vigenciaInicio.getTime() - 1) },
        });
      }
      const nova = await tx.tabelaINSS.create({
        data: {
          tenantId: ctx.tenantId,
          vigenciaInicio: input.vigenciaInicio,
          taxaTrabalhador: D(String(input.taxaTrabalhador)),
          taxaEntidade: D(String(input.taxaEntidade)),
          tetoIncidencia: input.tetoIncidencia !== undefined ? D(String(input.tetoIncidencia)) : null,
          descricao: input.descricao,
        },
        select: { id: true },
      });
      return nova;
    });
  },

  async criarEscaloesIRPS(input: CriarEscaloesIRPSInput, ctx: Ctx): Promise<{ total: number }> {
    return prisma.$transaction(async (rawTx) => {
      const tx = rawTx as unknown as Prisma.TransactionClient;
      const vigentes = await tx.escalaoIRPS.findMany({
        where: { tenantId: ctx.tenantId, vigenciaFim: null },
      });
      const fimAnterior = new Date(input.vigenciaInicio.getTime() - 1);
      for (const e of vigentes) {
        if (e.vigenciaInicio >= input.vigenciaInicio) {
          throw new BusinessRuleError(
            'VIGENCIA_INVALIDA',
            'A nova vigência tem de começar depois da vigência actual',
          );
        }
        await tx.escalaoIRPS.update({ where: { id: e.id }, data: { vigenciaFim: fimAnterior } });
      }
      for (const e of input.escaloes) {
        await tx.escalaoIRPS.create({
          data: {
            tenantId: ctx.tenantId,
            vigenciaInicio: input.vigenciaInicio,
            ordem: e.ordem,
            limiteInferior: D(e.limiteInferior.toFixed(2)),
            limiteSuperior: e.limiteSuperior !== null ? D(e.limiteSuperior.toFixed(2)) : null,
            taxa: D(String(e.taxa)),
            parcelaAbater: D(e.parcelaAbater.toFixed(2)),
            numeroDependentes: e.numeroDependentes,
            descricao: input.descricao,
          },
        });
      }
      return { total: input.escaloes.length };
    });
  },

  async listarTabelasINSS(ctx: Ctx) {
    return prisma.tabelaINSS.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { vigenciaInicio: 'desc' },
    });
  },

  async listarEscaloesIRPS(ctx: Ctx) {
    return prisma.escalaoIRPS.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ vigenciaInicio: 'desc' }, { ordem: 'asc' }],
    });
  },
};
