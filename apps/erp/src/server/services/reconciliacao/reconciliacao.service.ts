import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { FILTRO_LANCAMENTO_MAPA, diaCivilEmMaputo } from '../financas/contabilidade.service';
import type { Ctx } from '../types';
import {
  ESTADOS_CORRESPONDIDOS,
  distanciaDias,
  transitarMovimento,
  transitarPeriodoReconciliacao,
  type EstadoMovimento,
  type EstadoPeriodo,
  type Natureza,
} from './reconciliacao.model';
import { executarMatching, type ResultadoMatching } from './matching.service';
import { projetarMovimentosContabilisticos } from './importacao.service';
import {
  escolherRegra,
  montarMapaFecho,
  periodosSobrepoem,
  sugerirPartidas,
  type MapaFecho,
  type PartidaSugerida,
} from './fecho';

// ---------------------------------------------------------------------------
// Reconciliação (ADR-0038, nó RECONCILIATION): período e fecho (RF §16, §17),
// acções sobre correspondências (RF §13, §14, CA07), orquestração do motor e
// sugestão de lançamento (RF §9). Cada acção humana escreve UMA linha de
// CorrespondenciaBancaria ou PeriodoReconciliacao por `create`/`update`, que a
// audit-extension regista (RF §18); as mudanças de estado dos movimentos em
// lote derivam dessas linhas.
// ---------------------------------------------------------------------------

const MS_POR_DIA = 86_400_000;
const PERIODOS_ACTIVOS: EstadoPeriodo[] = ['ABERTO', 'EM_RECONCILIACAO'];

/** Dia civil em Africa/Maputo como aaaammdd. */
function diaNum(d: Date): number {
  const { ano, mes, dia } = diaCivilEmMaputo(d);
  return ano * 10000 + mes * 100 + dia;
}
const diaIso = (n: number) => `${Math.floor(n / 10000)}-${String(Math.floor(n / 100) % 100).padStart(2, '0')}-${String(n % 100).padStart(2, '0')}`;

/** O cliente estendido ou o `tx` de uma transacção dele — o que ambos têm em comum. */
type Db = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

async function contaValida(db: Db, contaBancariaId: string, ctx: Ctx) {
  const conta = await db.contaBancaria.findFirst({
    where: { id: contaBancariaId, tenantId: ctx.tenantId },
    select: { id: true, ativo: true, contaContabilId: true, toleranciaValor: true, permitirAgregacao: true, maxMovimentosAgregacao: true },
  });
  if (!conta) throw new NotFoundError('Conta bancária não encontrada');
  return conta;
}

/**
 * Saldo do razão de uma conta PGC até um dia civil, com o filtro dos mapas
 * (LANCADO ∪ ESTORNADO) — o MESMO universo que a projecção põe em
 * MovimentoContabilistico. `saldoContabilAte` não serve: filtra só LANCADO
 * (issue #66) e o mapa deixaria de fechar numa conta com estornos.
 */
async function saldoRazao(db: Db, contaPgcId: string, dia: number, modo: 'ate' | 'antes', ctx: Ctx): Promise<Prisma.Decimal> {
  const estados = Prisma.join(FILTRO_LANCAMENTO_MAPA.in);
  const comparacao = modo === 'ate' ? Prisma.sql`<=` : Prisma.sql`<`;
  const linhas = await db.$queryRaw<{ tipo: Natureza; total: Prisma.Decimal | null }[]>`
    SELECT p.tipo::text AS tipo, SUM(p.valor) AS total
    FROM "PartidaLancamento" p
    JOIN "Lancamento" l ON l.id = p."lancamentoId"
    WHERE p."tenantId" = ${ctx.tenantId}
      AND l."tenantId" = ${ctx.tenantId}
      AND p."contaId" = ${contaPgcId}
      AND l.status::text IN (${estados})
      AND (l.data AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Maputo')::date ${comparacao} ${diaIso(dia)}::date
    GROUP BY p.tipo`;
  const total = (t: Natureza) => new Prisma.Decimal(linhas.find((l) => l.tipo === t)?.total ?? 0);
  return total('DEBITO').minus(total('CREDITO'));
}

async function recusarContaPartilhada(db: Db, conta: { contaContabilId: string }, ctx: Ctx) {
  const n = await db.contaBancaria.count({ where: { tenantId: ctx.tenantId, contaContabilId: conta.contaContabilId, ativo: true } });
  if (n > 1) {
    throw new BusinessRuleError(
      'CONTA_PGC_PARTILHADA',
      `Há ${n} contas bancárias activas na mesma conta contabilística: o saldo do razão não se reparte por elas. ` +
        'Atribua a cada conta bancária a sua própria subconta do PGC.',
    );
  }
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export interface AbrirPeriodoInput {
  contaBancariaId: string;
  dataInicio: Date;
  dataFim: Date;
  saldoInicialBanco: Prisma.Decimal;
  saldoFinalBanco: Prisma.Decimal;
}

/**
 * Abre um período. Os dois invariantes que o esquema não exprime — um só período
 * activo por conta e nenhum período sobreposto — verificam-se com a conta
 * TRANCADA (`FOR UPDATE`): duas aberturas simultâneas serializam-se aqui.
 */
export async function abrirPeriodo(input: AbrirPeriodoInput, ctx: Ctx) {
  const inicio = diaNum(input.dataInicio);
  const fim = diaNum(input.dataFim);
  if (inicio > fim) throw new ValidationError('A data de fim tem de ser igual ou posterior à data de início.');

  return prisma.$transaction(async (tx) => {
    const trancada = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ContaBancaria" WHERE id = ${input.contaBancariaId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    if (trancada.length === 0) throw new NotFoundError('Conta bancária não encontrada');
    const conta = await contaValida(tx, input.contaBancariaId, ctx);
    if (!conta.ativo) throw new BusinessRuleError('CONTA_BANCARIA_INATIVA', 'A conta bancária está inactiva.');
    await recusarContaPartilhada(tx, conta, ctx);

    const existentes = await tx.periodoReconciliacao.findMany({
      where: { tenantId: ctx.tenantId, contaBancariaId: conta.id, estado: { not: 'CANCELADO' } },
      select: { id: true, estado: true, dataInicio: true, dataFim: true },
    });
    if (existentes.some((p) => PERIODOS_ACTIVOS.includes(p.estado as EstadoPeriodo))) {
      throw new BusinessRuleError('PERIODO_RECONCILIACAO_EM_ABERTO', 'Já existe um período de reconciliação em aberto para esta conta.');
    }
    const sobreposto = existentes.find((p) => periodosSobrepoem({ inicio, fim }, { inicio: diaNum(p.dataInicio), fim: diaNum(p.dataFim) }));
    if (sobreposto) {
      throw new BusinessRuleError('PERIODO_RECONCILIACAO_SOBREPOSTO', 'O período sobrepõe-se a outro já reconciliado nesta conta.');
    }

    return tx.periodoReconciliacao.create({
      data: {
        tenantId: ctx.tenantId,
        contaBancariaId: conta.id,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        estado: 'ABERTO',
        saldoInicialBanco: input.saldoInicialBanco,
        saldoFinalBanco: input.saldoFinalBanco,
        saldoInicialContabil: await saldoRazao(tx, conta.contaContabilId, inicio, 'antes', ctx),
        saldoFinalContabil: await saldoRazao(tx, conta.contaContabilId, fim, 'ate', ctx),
        responsavelId: ctx.userId,
      },
    });
  });
}

async function periodoDoTenant(db: Db, periodoId: string, ctx: Ctx) {
  const periodo = await db.periodoReconciliacao.findFirst({ where: { id: periodoId, tenantId: ctx.tenantId } });
  if (!periodo) throw new NotFoundError('Período de reconciliação não encontrado');
  return periodo;
}

async function calcularMapa(
  db: Db,
  periodo: { contaBancariaId: string; dataInicio: Date; dataFim: Date; saldoFinalBanco: Prisma.Decimal },
  ctx: Ctx,
): Promise<MapaFecho & { saldoFinalContabil: Prisma.Decimal }> {
  const conta = await contaValida(db, periodo.contaBancariaId, ctx);
  const primeiro = await db.periodoReconciliacao.findFirst({
    where: { tenantId: ctx.tenantId, contaBancariaId: conta.id, estado: { not: 'CANCELADO' } },
    orderBy: { dataInicio: 'asc' },
    select: { dataInicio: true, saldoInicialBanco: true },
  });
  const abertura = primeiro ?? { dataInicio: periodo.dataInicio, saldoInicialBanco: new Prisma.Decimal(0) };
  const inicioConta = diaNum(abertura.dataInicio);
  const fim = diaNum(periodo.dataFim);
  // Janela em instantes com um dia de folga de cada lado; o corte exacto é por dia civil, no núcleo.
  const janela = {
    gte: new Date(abertura.dataInicio.getTime() - MS_POR_DIA),
    lte: new Date(periodo.dataFim.getTime() + MS_POR_DIA),
  };
  const base = { tenantId: ctx.tenantId, contaBancariaId: conta.id };
  // ponytail: lê a janela inteira desde o início da conta (O(N), indexado, sem pares) —
  // é o que deixa um EM_TRANSITO antigo continuar a contar. Materializar por período se crescer.
  const [bancarios, contabilisticos] = await Promise.all([
    db.movimentoBancario.findMany({
      where: { ...base, dataMovimento: janela },
      select: { id: true, dataMovimento: true, valor: true, natureza: true, correspondenciaAtivaId: true },
    }),
    db.movimentoContabilistico.findMany({
      where: { ...base, dataContabilistica: janela },
      select: { id: true, dataContabilistica: true, valor: true, natureza: true, correspondenciaAtivaId: true },
    }),
  ]);
  const idsCorrespondencias = [
    ...new Set([...bancarios, ...contabilisticos].map((m) => m.correspondenciaAtivaId).filter((x): x is string => x !== null)),
  ];
  const correspondencias = idsCorrespondencias.length
    ? await db.correspondenciaBancaria.findMany({
        where: { tenantId: ctx.tenantId, id: { in: idsCorrespondencias }, revertida: false },
        select: {
          id: true,
          confirmadaEm: true,
          valorBanco: true,
          valorContabilistico: true,
          linhasBanco: { select: { movimentoBancario: { select: { dataMovimento: true, natureza: true } } } },
          linhasContabilidade: { select: { movimentoContabilistico: { select: { dataContabilistica: true, natureza: true } } } },
        },
      })
    : [];

  const saldoFinalContabil = await saldoRazao(db, conta.contaContabilId, fim, 'ate', ctx);
  const mapa = montarMapaFecho({
    inicioConta,
    inicio: diaNum(periodo.dataInicio),
    fim,
    saldoInicialBancoAbertura: abertura.saldoInicialBanco,
    saldoContabilAntesAbertura: await saldoRazao(db, conta.contaContabilId, inicioConta, 'antes', ctx),
    saldoFinalBanco: periodo.saldoFinalBanco,
    saldoFinalContabil,
    bancarios: bancarios.map((m) => ({
      id: m.id, dia: diaNum(m.dataMovimento), valor: m.valor, natureza: m.natureza as Natureza, correspondenciaId: m.correspondenciaAtivaId,
    })),
    contabilisticos: contabilisticos.map((m) => ({
      id: m.id, dia: diaNum(m.dataContabilistica), valor: m.valor, natureza: m.natureza as Natureza, correspondenciaId: m.correspondenciaAtivaId,
    })),
    correspondencias: correspondencias.map((c) => ({
      id: c.id,
      confirmada: c.confirmadaEm !== null,
      dias: [
        ...c.linhasBanco.map((l) => diaNum(l.movimentoBancario.dataMovimento)),
        ...c.linhasContabilidade.map((l) => diaNum(l.movimentoContabilistico.dataContabilistica)),
      ],
      natureza: (c.linhasBanco[0]?.movimentoBancario.natureza ?? c.linhasContabilidade[0]?.movimentoContabilistico.natureza) as Natureza,
      valorBanco: c.valorBanco,
      valorContabilistico: c.valorContabilistico,
    })),
  });
  return { ...mapa, saldoFinalContabil };
}

/** Mapa de fecho à data de hoje (RF §17) — leitura, não grava nada. */
export async function obterMapaFecho(periodoId: string, ctx: Ctx) {
  const periodo = await periodoDoTenant(prisma, periodoId, ctx);
  return { periodo, mapa: await calcularMapa(prisma, periodo, ctx) };
}

/**
 * Fecha o período (RF §17). Só passa a RECONCILIADO com diferença residual zero
 * ou com justificação explícita; o mapa é GRAVADO, para o fecho ser reprodutível,
 * e as correspondências que o explicam ficam presas ao período — a partir daí
 * não se revertem (RF §19: nada confirmado muda em silêncio).
 */
export async function fecharPeriodoReconciliacao(input: { periodoId: string; justificacao?: string }, ctx: Ctx) {
  return prisma.$transaction(async (tx) => {
    const trancado = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "PeriodoReconciliacao" WHERE id = ${input.periodoId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    if (trancado.length === 0) throw new NotFoundError('Período de reconciliação não encontrado');
    const periodo = await periodoDoTenant(tx, input.periodoId, ctx);
    if (periodo.estado === 'ABERTO') transitarPeriodoReconciliacao('ABERTO', 'EM_RECONCILIACAO');
    else transitarPeriodoReconciliacao(periodo.estado as EstadoPeriodo, 'RECONCILIADO');

    const { correspondenciasExplicadas, ...mapa } = await calcularMapa(tx, periodo, ctx);
    const justificacao = input.justificacao?.trim() || null;
    if (!mapa.diferencaResidual.isZero() && !justificacao) {
      throw new BusinessRuleError(
        'RECONCILIACAO_COM_DIFERENCA',
        `A reconciliação tem uma diferença residual de ${mapa.diferencaResidual.toFixed(2)} MT: justifique-a para fechar o período.`,
        { diferencaResidual: mapa.diferencaResidual.toFixed(2) },
      );
    }

    const fechado = await tx.periodoReconciliacao.update({
      where: { id: periodo.id },
      data: { ...mapa, estado: 'RECONCILIADO', justificacao, fechadoPorId: ctx.userId, fechadoEm: new Date() },
    });
    if (correspondenciasExplicadas.length) {
      await tx.correspondenciaBancaria.updateMany({
        where: { tenantId: ctx.tenantId, id: { in: correspondenciasExplicadas }, periodoId: null },
        data: { periodoId: periodo.id },
      });
    }
    return fechado;
  });
}

/** Com a mesma tranca do fecho: um cancelamento concorrente nunca pisa um RECONCILIADO. */
export async function cancelarPeriodoReconciliacao(periodoId: string, ctx: Ctx) {
  return prisma.$transaction(async (tx) => {
    const trancado = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "PeriodoReconciliacao" WHERE id = ${periodoId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    if (trancado.length === 0) throw new NotFoundError('Período de reconciliação não encontrado');
    const periodo = await periodoDoTenant(tx, periodoId, ctx);
    transitarPeriodoReconciliacao(periodo.estado as EstadoPeriodo, 'CANCELADO');
    return tx.periodoReconciliacao.update({ where: { id: periodo.id }, data: { estado: 'CANCELADO' } });
  });
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

/** Projecta o razão e corre o motor; um período ABERTO passa a EM_RECONCILIACAO. */
export async function executarReconciliacao(
  contaBancariaId: string,
  ctx: Ctx,
): Promise<{ projectados: number; matching: ResultadoMatching }> {
  const { criados } = await projetarMovimentosContabilisticos(contaBancariaId, ctx);
  const matching = await executarMatching(contaBancariaId, ctx);
  // Condicional ao estado: se o período foi cancelado ou fechado entretanto, não se mexe.
  transitarPeriodoReconciliacao('ABERTO', 'EM_RECONCILIACAO');
  await prisma.periodoReconciliacao.updateMany({
    where: { tenantId: ctx.tenantId, contaBancariaId, estado: 'ABERTO' },
    data: { estado: 'EM_RECONCILIACAO' },
  });
  return { projectados: criados, matching };
}

// ---------------------------------------------------------------------------
// Correspondências
// ---------------------------------------------------------------------------

export interface ResultadoLote {
  confirmadas: string[];
  recusadas: { id: string; motivo: string }[];
}

/**
 * Confirma sugestões do motor. Uma sugestão com diferença de valor acima da
 * tolerância só se confirma com justificação e passa a RECONCILIADO_MANUALMENTE
 * (RF §10: nunca automaticamente). Cada uma na sua transacção: uma recusa não
 * desfaz as outras, e a resposta diz qual e porquê.
 */
export async function confirmarCorrespondencias(
  input: { ids: string[]; justificacao?: string },
  ctx: Ctx,
): Promise<ResultadoLote> {
  const resultado: ResultadoLote = { confirmadas: [], recusadas: [] };
  const justificacao = input.justificacao?.trim() || null;

  for (const id of input.ids) {
    try {
      await prisma.$transaction(async (tx) => {
        const corr = await tx.correspondenciaBancaria.findFirst({
          where: { id, tenantId: ctx.tenantId, revertida: false },
          select: {
            id: true, confirmadaEm: true, diferencaValor: true, contaBancariaId: true,
            linhasBanco: { select: { movimentoBancarioId: true } },
            linhasContabilidade: { select: { movimentoContabilisticoId: true } },
          },
        });
        if (!corr) throw new NotFoundError('Correspondência não encontrada');
        if (corr.confirmadaEm) throw new BusinessRuleError('CORRESPONDENCIA_JA_CONFIRMADA', 'Já estava confirmada.');
        const conta = await contaValida(tx, corr.contaBancariaId, ctx);
        const comDiferenca = corr.diferencaValor.abs().gt(conta.toleranciaValor);
        if (comDiferenca && !justificacao) {
          throw new BusinessRuleError('JUSTIFICACAO_OBRIGATORIA', 'A diferença de valor excede a tolerância: justifique para confirmar.');
        }
        const alvo: EstadoMovimento = comDiferenca ? 'RECONCILIADO_MANUALMENTE' : 'RECONCILIADO';
        const idsBanco = corr.linhasBanco.map((l) => l.movimentoBancarioId);
        const idsContab = corr.linhasContabilidade.map((l) => l.movimentoContabilisticoId);

        const [bancos, contabs] = await Promise.all([
          tx.movimentoBancario.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsBanco } }, select: { estado: true, correspondenciaAtivaId: true } }),
          tx.movimentoContabilistico.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsContab } }, select: { estado: true, correspondenciaAtivaId: true } }),
        ]);
        for (const m of [...bancos, ...contabs]) {
          if (m.correspondenciaAtivaId !== corr.id) {
            throw new BusinessRuleError('CORRESPONDENCIA_INCONSISTENTE', 'Um dos movimentos já não pertence a esta correspondência.');
          }
          if (m.estado !== alvo) transitarMovimento(m.estado as EstadoMovimento, alvo);
        }
        const where = { tenantId: ctx.tenantId, correspondenciaAtivaId: corr.id };
        const b = await tx.movimentoBancario.updateMany({ where: { ...where, id: { in: idsBanco } }, data: { estado: alvo } });
        const c = await tx.movimentoContabilistico.updateMany({ where: { ...where, id: { in: idsContab } }, data: { estado: alvo } });
        if (b.count !== idsBanco.length || c.count !== idsContab.length) {
          throw new BusinessRuleError('CORRESPONDENCIA_INCONSISTENTE', 'Um dos movimentos mudou entretanto.');
        }
        await tx.correspondenciaBancaria.update({
          where: { id: corr.id },
          data: { confirmadaPorId: ctx.userId, confirmadaEm: new Date(), ...(justificacao && { justificacao }) },
        });
      });
      resultado.confirmadas.push(id);
    } catch (e) {
      if (e instanceof BusinessRuleError || e instanceof NotFoundError) resultado.recusadas.push({ id, motivo: e.message });
      else throw e;
    }
  }
  return resultado;
}

export interface ReconciliarManualmenteInput {
  movimentosBancariosIds: string[];
  movimentosContabilisticosIds: string[];
  justificacao: string;
}

/**
 * Reconciliação manual (RF §13, CA07): justificação obrigatória, utilizador e
 * data gravados na correspondência. 1:1 sempre; N:M só com `permitirAgregacao`
 * e até `maxMovimentosAgregacao` (RF §14, §15). Os movimentos têm de estar
 * livres — uma sugestão pendente rejeita-se primeiro (reverter).
 */
export async function reconciliarManualmente(input: ReconciliarManualmenteInput, ctx: Ctx) {
  const justificacao = input.justificacao.trim();
  if (justificacao.length === 0) throw new BusinessRuleError('JUSTIFICACAO_OBRIGATORIA', 'A reconciliação manual exige justificação.');
  const idsBanco = [...new Set(input.movimentosBancariosIds)];
  const idsContab = [...new Set(input.movimentosContabilisticosIds)];
  if (idsBanco.length === 0 || idsContab.length === 0) {
    throw new ValidationError('Escolha pelo menos um movimento bancário e um contabilístico.');
  }

  return prisma.$transaction(async (tx) => {
    const [bancos, contabs] = await Promise.all([
      tx.movimentoBancario.findMany({
        where: { tenantId: ctx.tenantId, id: { in: idsBanco } },
        select: { id: true, contaBancariaId: true, estado: true, correspondenciaAtivaId: true, valor: true, natureza: true, dataMovimento: true },
      }),
      tx.movimentoContabilistico.findMany({
        where: { tenantId: ctx.tenantId, id: { in: idsContab } },
        select: { id: true, contaBancariaId: true, estado: true, correspondenciaAtivaId: true, valor: true, natureza: true, dataContabilistica: true },
      }),
    ]);
    if (bancos.length !== idsBanco.length || contabs.length !== idsContab.length) throw new NotFoundError('Movimento não encontrado');
    const contaId = bancos[0].contaBancariaId;
    if ([...bancos, ...contabs].some((m) => m.contaBancariaId !== contaId)) {
      throw new BusinessRuleError('CONTAS_DIFERENTES', 'Os movimentos pertencem a contas bancárias diferentes.');
    }
    const conta = await contaValida(tx, contaId, ctx);
    const agregada = idsBanco.length > 1 || idsContab.length > 1;
    if (agregada && (!conta.permitirAgregacao || idsBanco.length + idsContab.length > conta.maxMovimentosAgregacao)) {
      throw new BusinessRuleError(
        'AGREGACAO_NAO_PERMITIDA',
        conta.permitirAgregacao
          ? `A conta só permite agregar até ${conta.maxMovimentosAgregacao} movimentos.`
          : 'Esta conta não permite reconciliar vários movimentos de uma vez.',
      );
    }
    const natureza = bancos[0].natureza;
    if ([...bancos, ...contabs].some((m) => m.natureza !== natureza)) {
      throw new BusinessRuleError('NATUREZA_DIVERGENTE', 'Não se reconciliam entradas com saídas.');
    }
    for (const m of [...bancos, ...contabs]) {
      if (m.correspondenciaAtivaId) {
        throw new BusinessRuleError('MOVIMENTO_RESERVADO', 'Um dos movimentos já tem correspondência: rejeite-a primeiro.');
      }
      transitarMovimento(m.estado as EstadoMovimento, 'RECONCILIADO_MANUALMENTE');
    }

    const soma = (ms: { valor: Prisma.Decimal }[]) => ms.reduce((a, m) => a.plus(m.valor), new Prisma.Decimal(0));
    const valorBanco = soma(bancos);
    const valorContabilistico = soma(contabs);
    const diferencaDias = Math.max(
      ...bancos.flatMap((b) => contabs.map((c) => distanciaDias(b.dataMovimento, c.dataContabilistica))),
    );
    const corr = await tx.correspondenciaBancaria.create({
      data: {
        tenantId: ctx.tenantId,
        contaBancariaId: conta.id,
        tipo: agregada ? 'AGREGADO' : 'MANUAL',
        regra: 'MANUAL',
        confianca: 100,
        automatica: false,
        valorBanco,
        valorContabilistico,
        diferencaValor: valorBanco.minus(valorContabilistico),
        diferencaDias,
        justificacao,
        confirmadaPorId: ctx.userId,
        confirmadaEm: new Date(),
        linhasBanco: { create: idsBanco.map((movimentoBancarioId) => ({ tenantId: ctx.tenantId, movimentoBancarioId })) },
        linhasContabilidade: { create: idsContab.map((movimentoContabilisticoId) => ({ tenantId: ctx.tenantId, movimentoContabilisticoId })) },
      },
    });
    // RF §14: reclama só o que continuar livre; qualquer falha desfaz tudo.
    const data = { correspondenciaAtivaId: corr.id, estado: 'RECONCILIADO_MANUALMENTE' as const };
    const b = await tx.movimentoBancario.updateMany({ where: { tenantId: ctx.tenantId, id: { in: idsBanco }, correspondenciaAtivaId: null }, data });
    const c = await tx.movimentoContabilistico.updateMany({ where: { tenantId: ctx.tenantId, id: { in: idsContab }, correspondenciaAtivaId: null }, data });
    if (b.count !== idsBanco.length || c.count !== idsContab.length) {
      throw new BusinessRuleError('MOVIMENTO_RESERVADO', 'Um dos movimentos foi correspondido entretanto.');
    }
    return corr;
  });
}

/**
 * Reverte uma correspondência — sugestão rejeitada ou reconciliação desfeita.
 * Append-only: a linha fica, marcada `revertida` com autor e data (RF §18, §19).
 * Os movimentos reconciliados ou com diferença voltam a PENDENTE; os de uma
 * sugestão, que nunca mudaram de estado, só ficam livres. Recusa se o período
 * que a correspondência explica já estiver fechado.
 */
export async function reverterCorrespondencia(id: string, ctx: Ctx) {
  return prisma.$transaction(async (tx) => {
    const corr = await tx.correspondenciaBancaria.findFirst({
      where: { id, tenantId: ctx.tenantId, revertida: false },
      select: { id: true, periodo: { select: { estado: true } } },
    });
    if (!corr) throw new NotFoundError('Correspondência não encontrada');
    if (corr.periodo?.estado === 'RECONCILIADO') {
      throw new BusinessRuleError('PERIODO_RECONCILIACAO_FECHADO', 'A correspondência pertence a um período já reconciliado.');
    }
    const where = { tenantId: ctx.tenantId, correspondenciaAtivaId: corr.id };
    const aPendente: EstadoMovimento[] = [...ESTADOS_CORRESPONDIDOS, 'DIFERENCA_VALOR'];
    for (const m of [
      ...(await tx.movimentoBancario.findMany({ where, select: { estado: true } })),
      ...(await tx.movimentoContabilistico.findMany({ where, select: { estado: true } })),
    ]) {
      if (aPendente.includes(m.estado as EstadoMovimento)) transitarMovimento(m.estado as EstadoMovimento, 'PENDENTE');
    }
    for (const modelo of [tx.movimentoBancario, tx.movimentoContabilistico] as const) {
      const delegate = modelo as unknown as { updateMany(a: object): Promise<{ count: number }> };
      await delegate.updateMany({ where: { ...where, estado: { in: aPendente } }, data: { correspondenciaAtivaId: null, estado: 'PENDENTE' } });
      await delegate.updateMany({ where, data: { correspondenciaAtivaId: null } });
    }
    return tx.correspondenciaBancaria.update({
      where: { id: corr.id },
      data: { revertida: true, revertidaPorId: ctx.userId, revertidaEm: new Date() },
    });
  });
}

/** Marca (ou desmarca) um movimento livre como IGNORADO. Um `update` de uma linha, auditado. */
export async function definirIgnorado(input: { lado: 'BANCO' | 'CONTABILIDADE'; id: string; ignorado: boolean }, ctx: Ctx) {
  const delegate = (input.lado === 'BANCO' ? prisma.movimentoBancario : prisma.movimentoContabilistico) as unknown as {
    findFirst(a: object): Promise<{ id: string; estado: string; correspondenciaAtivaId: string | null } | null>;
    update(a: object): Promise<unknown>;
  };
  const m = await delegate.findFirst({
    where: { id: input.id, tenantId: ctx.tenantId },
    select: { id: true, estado: true, correspondenciaAtivaId: true },
  });
  if (!m) throw new NotFoundError('Movimento não encontrado');
  if (m.correspondenciaAtivaId) {
    throw new BusinessRuleError('MOVIMENTO_RESERVADO', 'O movimento tem correspondência: reverta-a primeiro.');
  }
  const alvo: EstadoMovimento = input.ignorado ? 'IGNORADO' : 'PENDENTE';
  if (m.estado === alvo) return m;
  if (!input.ignorado && m.estado !== 'IGNORADO') {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', 'Só um movimento ignorado pode ser reactivado.');
  }
  transitarMovimento(m.estado as EstadoMovimento, alvo);
  return delegate.update({ where: { id: m.id }, data: { estado: alvo } });
}

// ---------------------------------------------------------------------------
// Sugestão de lançamento (RF §9)
// ---------------------------------------------------------------------------

export interface SugestaoLancamento {
  regraId: string;
  data: Date;
  historico: string;
  partidas: PartidaSugerida[];
}

/**
 * Sugere o lançamento que contabilizaria um movimento bancário sem contrapartida,
 * pela primeira regra configurada que case. Não cria nada: criar o lançamento é
 * acto do utilizador, pelo `criarLancamento` (gate-periodo). `null` = sem regra.
 */
export async function sugerirLancamento(movimentoBancarioId: string, ctx: Ctx): Promise<SugestaoLancamento | null> {
  const m = await prisma.movimentoBancario.findFirst({
    where: { id: movimentoBancarioId, tenantId: ctx.tenantId },
    select: { id: true, contaBancariaId: true, descricao: true, natureza: true, valor: true, dataMovimento: true, estado: true },
  });
  if (!m) throw new NotFoundError('Movimento não encontrado');
  if (m.estado !== 'BANCO_SEM_CONTABILIZACAO') return null;
  const conta = await contaValida(prisma, m.contaBancariaId, ctx);
  const regras = await prisma.regraSugestaoLancamento.findMany({
    where: { tenantId: ctx.tenantId, ativo: true, OR: [{ contaBancariaId: null }, { contaBancariaId: conta.id }] },
    select: { id: true, contaBancariaId: true, padrao: true, natureza: true, contaContrapartidaId: true, prioridade: true },
  });
  const regra = escolherRegra(
    { descricao: m.descricao, natureza: m.natureza as Natureza, contaBancariaId: conta.id },
    regras.map((r) => ({ ...r, natureza: r.natureza as Natureza })),
  );
  if (!regra) return null;
  return {
    regraId: regra.id,
    data: m.dataMovimento,
    historico: m.descricao,
    partidas: sugerirPartidas({ valor: m.valor, natureza: m.natureza as Natureza }, conta.contaContabilId, regra.contaContrapartidaId),
  };
}

