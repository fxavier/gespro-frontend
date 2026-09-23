/**
 * Serviço de apuramento periódico do IVA (ADR-0034).
 *
 * Responsabilidades:
 *  - Apurar o IVA de um período a partir do razão (GroupBy, não `findMany`)
 *  - Gerar o lançamento de apuramento via `registarLancamentoContabilistico`
 *  - Gravar `ApuramentoIva` + `LinhaApuramentoIva` (append-only)
 *  - Detectar e gravar divergências base×taxa vs imposto do razão
 *  - Recusar em vez de calcular incorrectamente (§4)
 *
 * NÃO escreve directamente em `Lancamento` ou `PartidaLancamento` —
 * usa `registarLancamentoContabilistico` (gate-periodo.mjs).
 */
import 'server-only';
import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { getRequestContext } from '@/server/observability/context';
import {
  registarLancamentoContabilistico,
  estornarLancamento,
  FILTRO_LANCAMENTO_MAPA,
} from './contabilidade.service';
import type {
  ApuramentoIvaComLinhas,
  ApuramentoIva,
  LinhaApuramentoIva,
  ApurarIvaInput,
  EstornarApuramentoInput,
  MarcarDeclaradoInput,
  IApuramentoIvaService,
  DocumentoSemLancamento,
  Ctx,
} from './apuramento-iva.interface';
import {
  transitarApuramento,
  IVA_PREFIXOS,
  CONTA_DEDUTIVEL,
} from './apuramento-iva.interface';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const TOLERANCIA_ARREDONDAMENTO = new Prisma.Decimal('0.01');
const TAXA_NORMAL = new Prisma.Decimal('0.160000');

// Período a partir do qual regimeIva deixa de ser lido (ADR-0034 §5)
const PERIODO_LEI_10_2025 = '2026-01';

// Contas IVA que participam no apuramento
const CONTAS_IVA_FILTRO = [
  '44331', '44332', '44333',
  '44321', '44322', '44323',
  '44341', '44342', '44343',
  '4435',  '4437',  '4438',
];

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface SaldoConta {
  codigo: string;
  nome: string;
  /** Positivo = devedor; negativo = credor (natureza DEVEDORA convencional). */
  saldo: Prisma.Decimal;
}

export interface PartidaCalculada {
  contaCodigo: string;
  tipo: 'DEBITO' | 'CREDITO';
  valor: Prisma.Decimal;
  historico?: string;
}

export interface ResultadoCalculo {
  partidas: PartidaCalculada[];
  totalLiquidado: Prisma.Decimal;
  totalDedutivel: Prisma.Decimal;
  totalRegularizacoes: Prisma.Decimal;
  /** Positivo = a pagar; negativo = a recuperar. */
  saldoApuramento: Prisma.Decimal;
  creditoReportado: Prisma.Decimal;
}

// ---------------------------------------------------------------------------
// Lógica de cálculo pura (testável sem DB)
// ---------------------------------------------------------------------------

/**
 * Calcula o saldo de cada conta a partir de agregados de partidas.
 * Para contas de natureza DEVEDORA: saldo = débitos − créditos.
 * Saldo negativo indica posição credora (ex.: 44331 após faturação normal).
 */
export function calcularSaldos(
  agregados: Array<{ contaId: string; tipo: string; _sum: { valor: Prisma.Decimal | null } }>,
  contas: Map<string, { codigo: string; nome: string }>,
): Map<string, SaldoConta> {
  const intermediario = new Map<
    string,
    { codigo: string; nome: string; debitos: Prisma.Decimal; creditos: Prisma.Decimal }
  >();

  for (const a of agregados) {
    const conta = contas.get(a.contaId);
    if (!conta) continue;
    const e = intermediario.get(a.contaId) ?? {
      codigo: conta.codigo,
      nome: conta.nome,
      debitos: new Prisma.Decimal(0),
      creditos: new Prisma.Decimal(0),
    };
    const valor = a._sum.valor ?? new Prisma.Decimal(0);
    if (a.tipo === 'DEBITO') e.debitos = e.debitos.plus(valor);
    else e.creditos = e.creditos.plus(valor);
    intermediario.set(a.contaId, e);
  }

  const resultado = new Map<string, SaldoConta>();
  for (const [id, e] of intermediario) {
    resultado.set(id, {
      codigo: e.codigo,
      nome: e.nome,
      saldo: e.debitos.minus(e.creditos),
    });
  }
  return resultado;
}

/**
 * Monta as partidas do lançamento de apuramento e calcula os totais.
 * Função pura — testável sem base de dados.
 *
 * Lógica (ADR-0034 §2):
 *  1. D 4433x pelo saldo credor (IVA liquidado → zerando)
 *  2. C 4432x pelo saldo devedor (IVA dedutível → zerando)
 *  3. 44342 (a favor do Estado): D pelo saldo credor
 *     44341 (a favor do sujeito passivo): C pelo saldo devedor
 *  4. Crédito reportado do período anterior: D 4435 / C 4438 (ADR-0034 §3)
 *  5. Net → C 4435 (a pagar) ou D 4435 + D 4438 (a recuperar)
 *  6. Zerar 4435 → D 4435 / C 4437 (a pagar) ou D 4438 / C 4435 (a recuperar)
 */
export function montarPartidasApuramento(
  saldos: Map<string, SaldoConta>,
  creditoReportadoDe4438: Prisma.Decimal,
): ResultadoCalculo {
  const partidas: PartidaCalculada[] = [];
  let totalLiquidado = new Prisma.Decimal(0);
  let totalDedutivel = new Prisma.Decimal(0);
  let regularizacoesEstado = new Prisma.Decimal(0);
  let regularizacoesSP = new Prisma.Decimal(0);

  // Passo 1: D 4433x (saldo credor = sc.saldo < 0 → |sc.saldo|)
  for (const sc of saldos.values()) {
    if (!sc.codigo.startsWith(IVA_PREFIXOS.liquidado)) continue;
    const saldoCredor = sc.saldo.negated();
    if (saldoCredor.lessThanOrEqualTo(0)) continue;
    partidas.push({ contaCodigo: sc.codigo, tipo: 'DEBITO', valor: saldoCredor });
    totalLiquidado = totalLiquidado.plus(saldoCredor);
  }

  // Passo 2: C 4432x (saldo devedor = sc.saldo > 0)
  for (const sc of saldos.values()) {
    if (!sc.codigo.startsWith(IVA_PREFIXOS.dedutivel)) continue;
    if (sc.saldo.lessThanOrEqualTo(0)) continue;
    partidas.push({ contaCodigo: sc.codigo, tipo: 'CREDITO', valor: sc.saldo });
    totalDedutivel = totalDedutivel.plus(sc.saldo);
  }

  // Passo 3: regularizações
  for (const sc of saldos.values()) {
    if (!sc.codigo.startsWith(IVA_PREFIXOS.regularizacoes)) continue;
    if (sc.codigo === '44341') {
      // A favor do sujeito passivo — saldo devedor → C 44341 (ADR-0034 §2)
      if (sc.saldo.greaterThan(0)) {
        partidas.push({ contaCodigo: '44341', tipo: 'CREDITO', valor: sc.saldo });
        regularizacoesSP = regularizacoesSP.plus(sc.saldo);
      }
    } else if (sc.codigo === '44342') {
      // A favor do Estado — saldo credor → D 44342 (ADR-0034 §2)
      const saldoCredor = sc.saldo.negated();
      if (saldoCredor.greaterThan(0)) {
        partidas.push({ contaCodigo: '44342', tipo: 'DEBITO', valor: saldoCredor });
        regularizacoesEstado = regularizacoesEstado.plus(saldoCredor);
      }
    }
    // 44343: PRORATA_NAO_SUPORTADO deve ter recusado antes de chegar aqui
  }

  const totalRegularizacoes = regularizacoesEstado.minus(regularizacoesSP);

  // Passo 4a: contrapartida 4435 para os passos 1-3 (ADR-0034 §2, ponto 4)
  // netOperacional = liquidado + reg_estado - dedutivel - reg_sp
  const netOperacional = totalLiquidado.minus(totalDedutivel).plus(totalRegularizacoes);
  if (netOperacional.greaterThan(0)) {
    // Passos 1-3 têm mais débitos que créditos → 4435 fica credor
    partidas.push({ contaCodigo: IVA_PREFIXOS.apuramento, tipo: 'CREDITO', valor: netOperacional });
  } else if (netOperacional.lessThan(0)) {
    // Passos 1-3 têm mais créditos que débitos → 4435 fica devedor
    partidas.push({
      contaCodigo: IVA_PREFIXOS.apuramento,
      tipo: 'DEBITO',
      valor: netOperacional.negated(),
    });
  }

  // Passo 4b: crédito reportado do período anterior: D 4435 / C 4438 (ADR-0034 §3)
  if (creditoReportadoDe4438.greaterThan(0)) {
    partidas.push({ contaCodigo: IVA_PREFIXOS.apuramento, tipo: 'DEBITO', valor: creditoReportadoDe4438 });
    partidas.push({ contaCodigo: IVA_PREFIXOS.aRecuperar, tipo: 'CREDITO', valor: creditoReportadoDe4438 });
  }

  // Saldo de 4435 após passos 4a e 4b:
  //   D 4435 += creditoReportado + |netOp| (se netOp < 0)
  //   C 4435 += netOp (se netOp > 0)
  // Saldo devedor = creditoReportado - netOp  (sempre)
  const saldo4435Devedor = creditoReportadoDe4438.minus(netOperacional);

  // Passo 5: zerar 4435 para 4437 (a pagar) ou 4438 (a recuperar)
  if (saldo4435Devedor.greaterThan(0)) {
    // 4435 é devedor → IVA a recuperar: D 4438, C 4435
    partidas.push({ contaCodigo: IVA_PREFIXOS.aRecuperar, tipo: 'DEBITO', valor: saldo4435Devedor });
    partidas.push({ contaCodigo: IVA_PREFIXOS.apuramento, tipo: 'CREDITO', valor: saldo4435Devedor });
  } else if (saldo4435Devedor.lessThan(0)) {
    // 4435 é credor → IVA a pagar: D 4435, C 4437
    const saldo4435Credor = saldo4435Devedor.negated();
    partidas.push({ contaCodigo: IVA_PREFIXOS.apuramento, tipo: 'DEBITO', valor: saldo4435Credor });
    partidas.push({ contaCodigo: IVA_PREFIXOS.aPagar, tipo: 'CREDITO', valor: saldo4435Credor });
  }
  // Se saldo4435 = 0: 4435 já está a zero, sem entradas adicionais

  // saldoApuramento para o DB: positivo = a pagar; negativo = a recuperar
  // = negated(saldo4435Devedor) = netOperacional - creditoReportado
  const saldoApuramento = netOperacional.minus(creditoReportadoDe4438);

  return {
    partidas,
    totalLiquidado,
    totalDedutivel,
    totalRegularizacoes,
    saldoApuramento,
    creditoReportado: creditoReportadoDe4438,
  };
}

/**
 * Calcula a divergência entre base×taxa e imposto do razão.
 * Devolve o valor absoluto da divergência se > tolerância, ou null.
 */
export function calcularDivergencia(
  base: Prisma.Decimal | null,
  taxa: Prisma.Decimal | null,
  imposto: Prisma.Decimal,
): Prisma.Decimal | null {
  if (!base || !taxa) return null;
  const esperado = base.times(taxa).toDecimalPlaces(2);
  const diff = esperado.minus(imposto).abs();
  return diff.greaterThan(TOLERANCIA_ARREDONDAMENTO) ? diff.toDecimalPlaces(2) : null;
}

// ---------------------------------------------------------------------------
// apurarIva — operação principal
// ---------------------------------------------------------------------------

export async function apurarIva(
  input: ApurarIvaInput,
  ctx: Ctx,
): Promise<ApuramentoIvaComLinhas> {
  return prismaBase.$transaction(async (tx) => {
    // 1. Bloquear o período com FOR UPDATE (ADR-0033 §5)
    const periodos = await tx.$queryRaw<
      Array<{
        id: string;
        codigo: string;
        estado: string;
        dataInicio: Date;
        dataFim: Date;
      }>
    >`
      SELECT id, codigo, estado, "dataInicio", "dataFim"
      FROM "PeriodoContabil"
      WHERE id = ${input.periodoId} AND "tenantId" = ${ctx.tenantId}
      FOR UPDATE
    `;
    if (!periodos.length) throw new NotFoundError('Período não encontrado');
    const periodo = periodos[0];
    if (periodo.estado !== 'ABERTO') {
      throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodo.codigo} está fechado`);
    }

    // 2. PERIODO_JA_APURADO
    const jaApurado = await tx.apuramentoIva.findFirst({
      where: {
        tenantId: ctx.tenantId,
        periodoId: input.periodoId,
        estado: { in: ['APURADO', 'DECLARADO'] },
      },
    });
    if (jaApurado) {
      throw new BusinessRuleError(
        'PERIODO_JA_APURADO',
        `O período ${periodo.codigo} já tem um apuramento activo (versão ${jaApurado.versao}). ` +
          'Para corrigir, estorne-o e execute de novo.',
      );
    }

    // 3. PERIODO_COM_RASCUNHOS (ADR-0034 §4)
    const rascunhos = await tx.lancamento.count({
      where: { tenantId: ctx.tenantId, periodoId: input.periodoId, status: 'RASCUNHO' },
    });
    if (rascunhos > 0) {
      throw new BusinessRuleError(
        'PERIODO_COM_RASCUNHOS',
        `O período ${periodo.codigo} tem ${rascunhos} lançamento(s) em rascunho. ` +
          'Confirme ou elimine antes de apurar.',
      );
    }

    // 4. DOCUMENTO_SEM_LANCAMENTO (ADR-0034 §4)
    //    Devolve QUAIS são os documentos, não só quantos: «tem 3 documentos sem
    //    lançamento» obriga o utilizador a procurá-los à mão num período inteiro.
    const seleccao = { select: { id: true, numero: true, dataEmissao: true } } as const;
    const janela = { gte: periodo.dataInicio, lte: periodo.dataFim };
    const [faturasSL, ncSL, ndSL] = await Promise.all([
      tx.fatura.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ['EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA'] },
          lancamentoId: null,
          dataEmissao: janela,
        },
        orderBy: { dataEmissao: 'asc' },
        ...seleccao,
      }),
      tx.notaCredito.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ['EMITIDA', 'LIQUIDADA'] },
          lancamentoId: null,
          dataEmissao: janela,
        },
        orderBy: { dataEmissao: 'asc' },
        ...seleccao,
      }),
      tx.notaDebito.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ['EMITIDA', 'LIQUIDADA'] },
          lancamentoId: null,
          dataEmissao: janela,
        },
        orderBy: { dataEmissao: 'asc' },
        ...seleccao,
      }),
    ]);
    const listar = (
      docs: { id: string; numero: string; dataEmissao: Date }[],
      tipo: DocumentoSemLancamento['tipo'],
    ): DocumentoSemLancamento[] =>
      docs.map((d) => ({ tipo, id: d.id, numero: d.numero, dataEmissao: d.dataEmissao.toISOString() }));
    const documentosSemLancamento = [
      ...listar(faturasSL, 'FATURA'),
      ...listar(ncSL, 'NOTA_CREDITO'),
      ...listar(ndSL, 'NOTA_DEBITO'),
    ];
    if (documentosSemLancamento.length > 0) {
      const numeros = documentosSemLancamento.map((d) => d.numero);
      throw new BusinessRuleError(
        'DOCUMENTO_SEM_LANCAMENTO',
        `O período ${periodo.codigo} tem ${numeros.length} documento(s) fiscal(is) sem ` +
          `lançamento: ${numeros.slice(0, 10).join(', ')}` +
          (numeros.length > 10 ? ` e mais ${numeros.length - 10}.` : '.') +
          ' Gere os lançamentos em falta antes de apurar.',
        { documentos: documentosSemLancamento },
      );
    }

    // 5. PRORATA_NAO_SUPORTADO (ADR-0034 §4)
    //    A partir de 2026-01, só a taxa 16 % é suportada. Taxa 5 % implica
    //    dedução limitada e pro rata não implementado — recusa-se a calcular.
    if (periodo.codigo >= PERIODO_LEI_10_2025) {
      const temTaxaNaoStandardFaturas = await tx.$queryRaw<[{ existe: boolean }]>`
        SELECT EXISTS (
          SELECT 1 FROM "LinhaFatura" lf
          JOIN "Fatura" f ON f.id = lf."faturaId"
          WHERE f."tenantId" = ${ctx.tenantId}
            AND f."dataEmissao" >= ${periodo.dataInicio}
            AND f."dataEmissao" <= ${periodo.dataFim}
            AND f.status IN ('EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA')
            AND lf."taxaIva" NOT IN (0::numeric, 0.160000::numeric)
        ) AS existe
      `;
      const temTaxaNaoStandardCpagar = await tx.$queryRaw<[{ existe: boolean }]>`
        SELECT EXISTS (
          SELECT 1 FROM "ContaPagar"
          WHERE "tenantId" = ${ctx.tenantId}
            AND "dataDocumento" >= ${periodo.dataInicio}
            AND "dataDocumento" <= ${periodo.dataFim}
            AND "taxaIva" IS NOT NULL
            AND "taxaIva" NOT IN (0::numeric, 0.160000::numeric)
        ) AS existe
      `;
      if (
        temTaxaNaoStandardFaturas[0]?.existe ||
        temTaxaNaoStandardCpagar[0]?.existe
      ) {
        throw new BusinessRuleError(
          'PRORATA_NAO_SUPORTADO',
          `O período ${periodo.codigo} tem operações a taxas não-standard (ex.: 5 %). ` +
            'O cálculo do pro rata não está implementado. ' +
            'Consulte o seu contabilista para tratar este período manualmente.',
        );
      }
    }

    // 6. Agregar saldos das contas IVA via GroupBy (ADR-0018 §6 — não `findMany`)
    const agregados = await tx.partidaLancamento.groupBy({
      by: ['contaId', 'tipo'],
      where: {
        tenantId: ctx.tenantId,
        lancamento: {
          periodoId: input.periodoId,
          status: FILTRO_LANCAMENTO_MAPA,
        },
        conta: { codigo: { in: CONTAS_IVA_FILTRO } },
      },
      _sum: { valor: true },
    });

    const contasIdsSet = [...new Set(agregados.map((a) => a.contaId))];
    const contasDb = await tx.contaPGC.findMany({
      where: { tenantId: ctx.tenantId, id: { in: contasIdsSet } },
      select: { id: true, codigo: true, nome: true },
    });
    const contasMap = new Map(contasDb.map((c) => [c.id, { codigo: c.codigo, nome: c.nome }]));

    const saldos = calcularSaldos(
      agregados as Array<{ contaId: string; tipo: string; _sum: { valor: Prisma.Decimal | null } }>,
      contasMap,
    );

    // 7. Crédito reportado de 4438 (períodos anteriores — ADR-0034 §3)
    //    O saldo devedor de 4438 (débitos - créditos > 0) é o crédito acumulado.
    //    Excluímos o período actual porque ainda não foi apurado.
    const saldo4438Aggs = await tx.partidaLancamento.groupBy({
      by: ['tipo'],
      where: {
        tenantId: ctx.tenantId,
        conta: { codigo: '4438' },
        lancamento: {
          periodoId: { not: input.periodoId },
          status: FILTRO_LANCAMENTO_MAPA,
        },
      },
      _sum: { valor: true },
    });
    const d4438 = saldo4438Aggs.find((a) => a.tipo === 'DEBITO')?._sum.valor ?? new Prisma.Decimal(0);
    const c4438 = saldo4438Aggs.find((a) => a.tipo === 'CREDITO')?._sum.valor ?? new Prisma.Decimal(0);
    const creditoReportado = Prisma.Decimal.max(new Prisma.Decimal(0), d4438.minus(c4438));

    // 8. Montar partidas (lógica pura)
    const resultado = montarPartidasApuramento(saldos, creditoReportado);

    // Se não há partidas (apuramento trivialmente zero), geramos um lançamento vazio
    // com as contas de 4435 D e C = 0, para registar que o apuramento foi feito.
    // Se todas as partidas têm valor 0, o lançamento seria desequilibrado — não criar.
    // Nomes das contas de destino (4435/4437/4438), que não aparecem nos
    // agregados do razão por não terem movimento prévio no período.
    const codigosPartidas = [...new Set(resultado.partidas.map((x) => x.contaCodigo))];
    const nomesDestino = new Map(
      (await tx.contaPGC.findMany({
        where: { tenantId: ctx.tenantId, codigo: { in: codigosPartidas } },
        select: { codigo: true, nome: true },
      })).map((c) => [c.codigo, c.nome] as const),
    );
    const totalDebitos = resultado.partidas
      .filter((p) => p.tipo === 'DEBITO')
      .reduce((acc, p) => acc.plus(p.valor), new Prisma.Decimal(0));

    if (totalDebitos.equals(0)) {
      // Apuramento trivialmente zero: sem partidas. Guardamos o apuramento mas sem lançamento.
      const ultimaVersao = await tx.apuramentoIva.findFirst({
        where: { tenantId: ctx.tenantId, periodoId: input.periodoId },
        orderBy: { versao: 'desc' },
        select: { versao: true },
      });
      const novaVersao = (ultimaVersao?.versao ?? 0) + 1;
      const utilizador = await tx.user.findFirst({
        where: { id: ctx.userId, tenantId: ctx.tenantId },
        select: { keycloakSub: true },
      });
      const apuramento = await tx.apuramentoIva.create({
        data: {
          tenantId: ctx.tenantId,
          periodoId: input.periodoId,
          versao: novaVersao,
          estado: 'APURADO',
          lancamentoId: null,
          totalIvaLiquidado: resultado.totalLiquidado,
          totalIvaDedutivel: resultado.totalDedutivel,
          totalRegularizacoes: resultado.totalRegularizacoes,
          saldoApuramento: resultado.saldoApuramento,
          creditoReportado: resultado.creditoReportado,
          apuradoPorId: ctx.userId,
          keycloakSub: utilizador?.keycloakSub ?? ctx.userId,
          requestId: getRequestContext()?.requestId ?? null,
        },
        include: { linhas: true },
      });
      return apuramento as unknown as ApuramentoIvaComLinhas;
    }

    // 9. Calcular bases a partir dos documentos (ADR-0034 §8)
    const basesPorConta = await calcularBasesDosDocumentos(
      tx,
      ctx.tenantId,
      periodo.dataInicio,
      periodo.dataFim,
    );

    // 10. Gerar lançamento via registarLancamentoContabilistico
    //     (NÃO escreve directamente em Lancamento — gate-periodo.mjs)
    const lancamento = await registarLancamentoContabilistico(
      tx,
      {
        data: periodo.dataFim,
        diarioTipo: 'OPERACOES',
        origem: 'AJUSTE',
        documentoOrigemId: periodo.id,
        documentoOrigemTipo: 'PeriodoContabil',
        historico: `Apuramento IVA ${periodo.codigo}`,
        partidas: resultado.partidas.map((p) => ({
          contaCodigo: p.contaCodigo,
          tipo: p.tipo,
          valor: p.valor.toString(),
          historico: p.historico,
        })),
      },
      ctx,
    );

    // 11. Versão do apuramento
    const ultimaVersao = await tx.apuramentoIva.findFirst({
      where: { tenantId: ctx.tenantId, periodoId: input.periodoId },
      orderBy: { versao: 'desc' },
      select: { versao: true },
    });
    const novaVersao = (ultimaVersao?.versao ?? 0) + 1;

    // 12. Trilho de auditoria
    const utilizador = await tx.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { keycloakSub: true },
    });
    const keycloakSub = utilizador?.keycloakSub ?? ctx.userId;
    const requestId = getRequestContext()?.requestId ?? null;

    // 13. Criar ApuramentoIva
    const apuramento = await tx.apuramentoIva.create({
      data: {
        tenantId: ctx.tenantId,
        periodoId: input.periodoId,
        versao: novaVersao,
        estado: 'APURADO',
        lancamentoId: lancamento.id,
        totalIvaLiquidado: resultado.totalLiquidado,
        totalIvaDedutivel: resultado.totalDedutivel,
        totalRegularizacoes: resultado.totalRegularizacoes,
        saldoApuramento: resultado.saldoApuramento,
        creditoReportado: resultado.creditoReportado,
        apuradoPorId: ctx.userId,
        keycloakSub,
        requestId,
      },
    });

    // 14. Criar LinhasApuramentoIva (sem as entradas internas de 4435 D/C que se cancelam)
    const linhasData = resultado.partidas
      .filter(
        (p) =>
          !(
            p.contaCodigo === IVA_PREFIXOS.apuramento &&
            resultado.partidas.filter(
              (x) => x.contaCodigo === IVA_PREFIXOS.apuramento,
            ).length >= 2
          ),
      )
      .map((p) => {
        const base = basesPorConta.get(p.contaCodigo) ?? null;
        const taxa = base !== null ? TAXA_NORMAL : null;
        const divergencia = calcularDivergencia(base, taxa, p.valor);
        // `contasDb` só traz as contas COM movimento no razão. As de destino do
        // apuramento — 4435, 4437, 4438 — não têm movimento prévio no período,
        // e ficavam sem nome: a linha gravava o código onde devia estar «IVA a
        // pagar». Precisamente na coluna que existe para preservar o nome à data.
        const nomeContaNaLinha =
          contasDb.find((c) => c.codigo === p.contaCodigo)?.nome ??
          nomesDestino.get(p.contaCodigo) ??
          p.contaCodigo;
        return {
          tenantId: ctx.tenantId,
          apuramentoId: apuramento.id,
          contaCodigo: p.contaCodigo,
          contaNome: nomeContaNaLinha,
          tipoMovimento: p.tipo as 'DEBITO' | 'CREDITO',
          baseImponivel: base,
          taxaAplicada: taxa,
          valorImposto: p.valor,
          divergenciaBase: divergencia,
        };
      });

    if (linhasData.length > 0) {
      await tx.linhaApuramentoIva.createMany({ data: linhasData });
    }

    const linhas = await tx.linhaApuramentoIva.findMany({
      where: { apuramentoId: apuramento.id },
    });

    return {
      ...(apuramento as unknown as ApuramentoIva),
      linhas: linhas as unknown as LinhaApuramentoIva[],
    };
  });
}

// ---------------------------------------------------------------------------
// Calcular bases a partir dos documentos (ADR-0034 §8)
// ---------------------------------------------------------------------------

async function calcularBasesDosDocumentos(
  tx: Prisma.TransactionClient,
  tenantId: string,
  dataInicio: Date,
  dataFim: Date,
): Promise<Map<string, Prisma.Decimal>> {
  const resultado = new Map<string, Prisma.Decimal>();

  // 44331 — operações gerais: Faturas − NC + ND (taxa 16 %)
  const [fatBases] = await tx.$queryRaw<[{ base: string | null }]>`
    SELECT COALESCE(SUM(lf.subtotal), 0)::text as base
    FROM "LinhaFatura" lf
    JOIN "Fatura" f ON f.id = lf."faturaId"
    WHERE f."tenantId" = ${tenantId}
      AND f."dataEmissao" >= ${dataInicio}
      AND f."dataEmissao" <= ${dataFim}
      AND f.status IN ('EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA')
      AND lf."taxaIva" = 0.160000
  `;
  const [ncBases] = await tx.$queryRaw<[{ base: string | null }]>`
    SELECT COALESCE(SUM(lnc.subtotal), 0)::text as base
    FROM "LinhaNotaCredito" lnc
    JOIN "NotaCredito" nc ON nc.id = lnc."notaCreditoId"
    WHERE nc."tenantId" = ${tenantId}
      AND nc."dataEmissao" >= ${dataInicio}
      AND nc."dataEmissao" <= ${dataFim}
      AND nc.status IN ('EMITIDA', 'LIQUIDADA')
      AND lnc."taxaIva" = 0.160000
  `;
  const [ndBases] = await tx.$queryRaw<[{ base: string | null }]>`
    SELECT COALESCE(SUM(lnd.subtotal), 0)::text as base
    FROM "LinhaNotaDebito" lnd
    JOIN "NotaDebito" nd ON nd.id = lnd."notaDebitoId"
    WHERE nd."tenantId" = ${tenantId}
      AND nd."dataEmissao" >= ${dataInicio}
      AND nd."dataEmissao" <= ${dataFim}
      AND nd.status IN ('EMITIDA', 'LIQUIDADA')
      AND lnd."taxaIva" = 0.160000
  `;

  const base44331 = new Prisma.Decimal(fatBases?.base ?? '0')
    .minus(new Prisma.Decimal(ncBases?.base ?? '0'))
    .plus(new Prisma.Decimal(ndBases?.base ?? '0'));

  if (base44331.greaterThan(0)) resultado.set('44331', base44331);

  // 4432x — dedutível: ContaPagar por tipoAquisicao
  const basesCpagar = await tx.$queryRaw<
    Array<{ tipoAquisicao: string; base: string }>
  >`
    SELECT "tipoAquisicao", COALESCE(SUM("baseIva"), 0)::text as base
    FROM "ContaPagar"
    WHERE "tenantId" = ${tenantId}
      AND "dataDocumento" >= ${dataInicio}
      AND "dataDocumento" <= ${dataFim}
      AND "baseIva" IS NOT NULL
      AND "taxaIva" = 0.160000
      AND "tipoAquisicao" IS NOT NULL
    GROUP BY "tipoAquisicao"
  `;
  for (const row of basesCpagar) {
    const conta = CONTA_DEDUTIVEL[row.tipoAquisicao];
    const base = new Prisma.Decimal(row.base);
    if (conta && base.greaterThan(0)) resultado.set(conta, base);
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// estornarApuramentoIva
// ---------------------------------------------------------------------------

export async function estornarApuramentoIva(
  input: EstornarApuramentoInput,
  ctx: Ctx,
): Promise<ApuramentoIva> {
  // Verificar o apuramento, ler o período e marcar como ESTORNADO numa transacção.
  // A data do período é necessária para o estorno: o lançamento de estorno tem de
  // ficar no mesmo período que o lançamento de apuramento (§7), não no período de hoje.
  // Se ficasse hoje, o razão do mês corrigido não seria revertido, e a segunda corrida
  // encontraria as contas a zero (testado e confirmado pelo orquestrador).
  const { apuramento, lancamentoId, periodoDataFim } = await prismaBase.$transaction(async (tx) => {
    const ap = await tx.apuramentoIva.findFirst({
      where: { id: input.apuramentoId, tenantId: ctx.tenantId },
      select: {
        id: true, estado: true, lancamentoId: true, periodoId: true,
        versao: true, tenantId: true, apuradoPorId: true, keycloakSub: true,
        requestId: true, createdAt: true,
        totalIvaLiquidado: true, totalIvaDedutivel: true, totalRegularizacoes: true,
        saldoApuramento: true, creditoReportado: true,
        declaradoPorId: true, declaradoEm: true, referenciaEntrega: true,
      },
    });
    if (!ap) throw new NotFoundError('Apuramento não encontrado');
    transitarApuramento(ap.estado as 'APURADO' | 'ESTORNADO' | 'DECLARADO', 'ESTORNADO');

    // Buscar o último dia do período para usar na data do estorno
    const periodo = await tx.periodoContabil.findFirst({
      where: { id: ap.periodoId, tenantId: ctx.tenantId },
      select: { dataFim: true },
    });

    const updated = await tx.apuramentoIva.update({
      where: { id: input.apuramentoId },
      data: { estado: 'ESTORNADO' },
    });
    return { apuramento: updated, lancamentoId: ap.lancamentoId, periodoDataFim: periodo?.dataFim ?? null };
  });

  // Estornar o lançamento fora da transacção anterior (tem a sua própria transacção).
  // Passa a data do período: o estorno pertence ao mesmo período que o apuramento
  // que está a corrigir — é a única forma de o razão desse período voltar ao estado
  // anterior e a versão seguinte ser calculável.
  if (lancamentoId) {
    await estornarLancamento(
      { lancamentoId, motivo: input.motivo, data: periodoDataFim ?? undefined },
      ctx,
    );
  }

  return apuramento as unknown as ApuramentoIva;
}

// ---------------------------------------------------------------------------
// marcarDeclarado
// ---------------------------------------------------------------------------

export async function marcarDeclarado(
  input: MarcarDeclaradoInput,
  ctx: Ctx,
): Promise<ApuramentoIva> {
  return prismaBase.$transaction(async (tx) => {
    const ap = await tx.apuramentoIva.findFirst({
      where: { id: input.apuramentoId, tenantId: ctx.tenantId },
    });
    if (!ap) throw new NotFoundError('Apuramento não encontrado');
    transitarApuramento(ap.estado as 'APURADO' | 'ESTORNADO' | 'DECLARADO', 'DECLARADO');

    return tx.apuramentoIva.update({
      where: { id: input.apuramentoId },
      data: {
        estado: 'DECLARADO',
        declaradoPorId: ctx.userId,
        declaradoEm: input.declaradoEm,
        referenciaEntrega: input.referenciaEntrega,
      },
    }) as unknown as ApuramentoIva;
  });
}

// ---------------------------------------------------------------------------
// obterApuramento
// ---------------------------------------------------------------------------

export async function obterApuramento(
  periodoId: string,
  ctx: Ctx,
): Promise<ApuramentoIvaComLinhas | null> {
  const ap = await prismaBase.apuramentoIva.findFirst({
    where: {
      tenantId: ctx.tenantId,
      periodoId,
      estado: { in: ['APURADO', 'DECLARADO'] },
    },
    orderBy: { versao: 'desc' },
    include: { linhas: true },
  });
  if (!ap) return null;
  return ap as unknown as ApuramentoIvaComLinhas;
}

// ---------------------------------------------------------------------------
// NIT
// ---------------------------------------------------------------------------

export const apuramentoIvaService = {
  apurarIva,
  estornarApuramento: estornarApuramentoIva,
  marcarDeclarado,
  obterApuramento,
} satisfies IApuramentoIvaService;
