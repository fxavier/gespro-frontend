import 'server-only';
import { Prisma, type EstadoExercicio, type TipoPartida } from '@prisma/client';
import { z } from 'zod';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { MotivoReaberturaSchema } from '@/lib/validations/contabilidade';
import { transitarExercicio } from '@/lib/state-machines';
import { getRequestContext } from '@/server/observability/context';
import { logger } from '@/server/observability/logger';
import {
  FILTRO_LANCAMENTO_MAPA,
  criarLancamentoEncerramentoEmTx,
  estornarLancamentoEncerramentoEmTx,
} from './contabilidade.service';
import type {
  Ctx,
  EncerramentoExercicio,
  ExercicioContabil,
  LinhaFotografiaEncerramento,
  ReaberturaExercicio,
  ResultadoEncerramentoExercicio,
} from './contabilidade.interface';

/**
 * Encerramento provisório do exercício (ADR-0035, «Decisões de implementação», #138).
 *
 * Numa só transacção — tudo ou nada:
 *  1. tranca o exercício (`FOR UPDATE`) e decide a transição pelo estado TRANCADO;
 *  2. tranca os treze períodos (`FOR UPDATE`, por ordem) — trava reaberturas e lançamentos
 *     concorrentes enquanto o ano se apura;
 *  3. recolhe TODOS os impedimentos e, havendo algum, devolve-os sem escrever nada;
 *  4. fotografa o balancete dos períodos 1..12 e grava até três lançamentos no diário EN,
 *     período 13, com a data do fim do exercício — cada um só quando tem partidas (#366): um ano
 *     sem saldo nas classes 6/7 encerra sem lançamento nenhum, e as referências ficam nulas;
 *  5. fecha o período 13, passa o exercício a ENCERRADO_PROVISORIO, regista o
 *     `EncerramentoExercicio` e escreve as linhas de `AuditLog` da transição (#366).
 *
 * Ordem das trancas: exercício → períodos → diário (pela numeração) — a mesma na reabertura e no
 * definitivo (abaixo). `fecharPeriodo` e `reabrirPeriodo` trancam só o período e leem o
 * exercício sem tranca: não há ciclo (o porquê de não ficar velho está no `reabrirPeriodo`).
 *
 * As escritas em `Lancamento`/`PartidaLancamento` passam por `criarLancamentoEncerramentoEmTx`
 * (`contabilidade.service`) — `gate-periodo`.
 *
 * Auditoria (#366): os três serviços escrevem pelo `prismaBase`, que não passa pela
 * `audit-extension` — por isso cada transição escreve as suas linhas de `AuditLog` à mão, na
 * mesma transacção. Uma chamada recusada sai antes de qualquer escrita e não deixa linha.
 */

const ZERO = new Prisma.Decimal(0);
const ORDENS_MENSAIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** Conta-se como corrente (81) tudo o que não é financeiro (82): a regra da DRE. */
const PREFIXOS_FINANCEIROS = ['69', '78'];
const CODIGOS_FIXOS = ['81', '82', '83', '88', '851', '4411'] as const;

type Partida = { contaId: string; tipo: TipoPartida; valor: Prisma.Decimal };
type Tx = Prisma.TransactionClient;

/** `sub` do autor no Keycloak, para os registos e o `AuditLog`. */
async function keycloakSubDe(tx: Tx, ctx: Ctx): Promise<string> {
  const utilizador = await tx.user.findFirst({
    where: { id: ctx.userId, tenantId: ctx.tenantId },
    select: { keycloakSub: true },
  });
  return utilizador?.keycloakSub ?? ctx.userId;
}

/** Linha de `AuditLog` escrita na transacção do chamador (o `prismaBase` não é auditado). */
async function auditar(
  tx: Tx,
  ctx: Ctx,
  keycloakSub: string,
  linha: { entity: string; entityId: string; action: 'CREATE' | 'UPDATE'; data?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      keycloakSub,
      requestId: getRequestContext()?.requestId ?? null,
      ...linha,
    },
  });
}

/** Transição de estado do exercício, no formato da `audit-extension` (antes/depois). */
function transicaoExercicio(antes: EstadoExercicio, depois: EstadoExercicio): Prisma.InputJsonValue {
  return { before: { estado: antes }, after: { estado: depois } };
}

/** Partida que leva `saldo` (D − C) a zero na conta: credita um saldo devedor, debita um credor. */
function saldar(contaId: string, saldo: Prisma.Decimal): Partida {
  return { contaId, tipo: saldo.greaterThan(0) ? 'CREDITO' : 'DEBITO', valor: saldo.abs() };
}

/** Partida que acrescenta `variacao` (D − C) à conta. */
function movimentar(contaId: string, variacao: Prisma.Decimal): Partida {
  return { contaId, tipo: variacao.greaterThan(0) ? 'DEBITO' : 'CREDITO', valor: variacao.abs() };
}

/** Valor ≥ 0 com no máximo duas casas decimais; tudo o resto é recusado. */
function lerEstimativa(estimativaImposto: string): Prisma.Decimal {
  const texto = String(estimativaImposto ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) {
    throw new BusinessRuleError(
      'ESTIMATIVA_IMPOSTO_INVALIDA',
      'A estimativa do imposto tem de ser um valor maior ou igual a zero, com no máximo duas casas decimais.',
      { estimativaImposto },
    );
  }
  return new Prisma.Decimal(texto);
}

export async function encerrarExercicio(
  input: { exercicioId: string; estimativaImposto: string },
  ctx: Ctx,
): Promise<ResultadoEncerramentoExercicio> {
  const estimativa = lerEstimativa(input.estimativaImposto);
  const inicio = Date.now();
  let partidasPorLancamento: { resultados: number; imposto: number; liquido: number } | null = null;

  const resultado = await prismaBase.$transaction<ResultadoEncerramentoExercicio>(
    async (tx) => {
      // 1. Exercício trancado — o estado que decide é o lido depois da tranca.
      const [exercicio] = await tx.$queryRaw<
        Array<{ id: string; codigo: string; estado: EstadoExercicio; anteriorId: string | null; dataFim: Date }>
      >`
        SELECT id, codigo, estado, "anteriorId", "dataFim"
        FROM "ExercicioContabil"
        WHERE id = ${input.exercicioId} AND "tenantId" = ${ctx.tenantId}
        FOR UPDATE
      `;
      if (!exercicio) throw new NotFoundError('Exercício não encontrado');
      const estadoAlvo = transitarExercicio(exercicio.estado, 'ENCERRADO_PROVISORIO');

      // 2. Os treze períodos, trancados por ordem.
      const periodos = await tx.$queryRaw<Array<{ id: string; ordem: number; estado: string }>>`
        SELECT id, ordem, estado FROM "PeriodoContabil"
        WHERE "exercicioId" = ${exercicio.id} AND "tenantId" = ${ctx.tenantId}
        ORDER BY ordem
        FOR UPDATE
      `;
      const periodo13 = periodos.find((p) => p.ordem === 13);
      if (!periodo13) throw new NotFoundError(`Período de encerramento do exercício ${exercicio.codigo} não encontrado`);
      const mensais = periodos.filter((p) => ORDENS_MENSAIS.includes(p.ordem));

      // 3. Impedimentos — todos de uma vez.
      const impedimentos: string[] = [];

      if (mensais.length < 12) impedimentos.push('PERIODOS_MENSAIS_EM_FALTA');
      if (mensais.some((p) => p.estado !== 'FECHADO')) impedimentos.push('PERIODOS_MENSAIS_ABERTOS');
      // Decidido na leitura trancada: um período 13 já fechado não recebe os lançamentos.
      if (periodo13.estado !== 'ABERTO') impedimentos.push('PERIODO_13_FECHADO');

      if (exercicio.anteriorId) {
        const anterior = await tx.exercicioContabil.findFirst({
          where: { id: exercicio.anteriorId, tenantId: ctx.tenantId },
          select: { estado: true },
        });
        // ADR-0035 (#138): sem anterior, ou anterior pelo menos ENCERRADO_PROVISORIO.
        if (anterior && anterior.estado !== 'ENCERRADO_PROVISORIO' && anterior.estado !== 'ENCERRADO') {
          impedimentos.push('EXERCICIO_ANTERIOR_ABERTO');
        }
      }

      const rascunhos13 = await tx.lancamento.count({
        where: { tenantId: ctx.tenantId, periodoId: periodo13.id, status: 'RASCUNHO' },
      });
      if (rascunhos13 > 0) impedimentos.push('RASCUNHOS_NO_PERIODO_13');

      // Somas por conta dos períodos 1..12 (pelo período do lançamento, não pela data).
      const agregados = await tx.partidaLancamento.groupBy({
        by: ['contaId', 'tipo'],
        where: {
          tenantId: ctx.tenantId,
          lancamento: { status: FILTRO_LANCAMENTO_MAPA, periodoId: { in: mensais.map((p) => p.id) } },
        },
        _sum: { valor: true },
      });
      const somas = new Map<string, { debito: Prisma.Decimal; credito: Prisma.Decimal }>();
      let totalDebito = ZERO;
      let totalCredito = ZERO;
      for (const a of agregados) {
        const v = a._sum.valor ?? ZERO;
        const s = somas.get(a.contaId) ?? { debito: ZERO, credito: ZERO };
        if (a.tipo === 'DEBITO') {
          s.debito = s.debito.plus(v);
          totalDebito = totalDebito.plus(v);
        } else {
          s.credito = s.credito.plus(v);
          totalCredito = totalCredito.plus(v);
        }
        somas.set(a.contaId, s);
      }
      if (!totalDebito.equals(totalCredito)) impedimentos.push('BALANCETE_DESEQUILIBRADO');

      const saldo = (contaId: string) => {
        const s = somas.get(contaId);
        return s ? s.debito.minus(s.credito) : ZERO;
      };

      const contasMovimentadas = await tx.contaPGC.findMany({
        where: { tenantId: ctx.tenantId, id: { in: [...somas.keys()] } },
        select: { id: true, codigo: true, nome: true, classe: true },
        orderBy: { codigo: 'asc' },
      });
      const folhasResultados = contasMovimentadas.filter(
        (c) => (c.classe === 'CLASSE_6' || c.classe === 'CLASSE_7') && !saldo(c.id).isZero(),
      );
      if (impedimentos.length > 0) return { ok: false, impedimentos };

      // 4a. Contas da classe 8 e do imposto.
      const fixas = await tx.contaPGC.findMany({
        where: { tenantId: ctx.tenantId, codigo: { in: [...CODIGOS_FIXOS] } },
        select: { id: true, codigo: true },
      });
      const conta = new Map(fixas.map((c) => [c.codigo, c.id]));
      for (const codigo of CODIGOS_FIXOS) {
        if (!conta.has(codigo)) throw new NotFoundError(`Conta PGC "${codigo}" não encontrada`);
      }
      const c = (codigo: (typeof CODIGOS_FIXOS)[number]) => conta.get(codigo)!;
      const folhas85 = await tx.contaPGC.findMany({
        where: { tenantId: ctx.tenantId, codigo: { startsWith: '85' }, aceitaLancamento: true },
        select: { id: true },
        orderBy: { codigo: 'asc' },
      });

      // 4b. Fotografia do balancete dos períodos 1..12 (antes dos lançamentos de encerramento).
      const fotografia: LinhaFotografiaEncerramento[] = contasMovimentadas.map((cm) => {
        const s = somas.get(cm.id)!;
        const liquido = s.debito.minus(s.credito);
        return {
          contaId: cm.id,
          codigo: cm.codigo,
          nome: cm.nome,
          totalDebito: s.debito.toFixed(2),
          totalCredito: s.credito.toFixed(2),
          saldoDevedor: (liquido.greaterThan(0) ? liquido : ZERO).toFixed(2),
          saldoCredor: (liquido.lessThan(0) ? liquido.negated() : ZERO).toFixed(2),
        };
      });

      // 4c. Lançamento 1 — apuramento dos resultados: 6/7 → 81 (correntes) / 82 (financeiros) → 83.
      const partidasResultados: Partida[] = [];
      const paraAlvo = new Map<string, Prisma.Decimal>([
        [c('81'), ZERO],
        [c('82'), ZERO],
      ]);
      for (const folha of folhasResultados) {
        const s = saldo(folha.id);
        partidasResultados.push(saldar(folha.id, s));
        const alvo = PREFIXOS_FINANCEIROS.some((p) => folha.codigo.startsWith(p)) ? c('82') : c('81');
        paraAlvo.set(alvo, paraAlvo.get(alvo)!.plus(s));
      }
      let transferido83 = ZERO;
      for (const [alvo, variacao] of paraAlvo) {
        if (!variacao.isZero()) partidasResultados.push(movimentar(alvo, variacao));
        // Inclui movimento que 81/82 já tivessem nos períodos 1..12.
        const saldoAlvo = saldo(alvo).plus(variacao);
        if (!saldoAlvo.isZero()) {
          partidasResultados.push(saldar(alvo, saldoAlvo));
          transferido83 = transferido83.plus(saldoAlvo);
        }
      }
      if (!transferido83.isZero()) partidasResultados.push(movimentar(c('83'), transferido83));

      // 4d. Lançamento 3 (planeado antes de escrever) — 83 e as folhas de 85 → 88.
      const saldosParaLiquido: Array<[string, Prisma.Decimal]> = [
        [c('83'), saldo(c('83')).plus(transferido83)],
        ...folhas85.map((f): [string, Prisma.Decimal] => [
          f.id,
          saldo(f.id).plus(f.id === c('851') ? estimativa : ZERO),
        ]),
      ];
      const partidasLiquido: Partida[] = [];
      let transferido88 = ZERO;
      for (const [contaId, s] of saldosParaLiquido) {
        if (s.isZero()) continue;
        partidasLiquido.push(saldar(contaId, s));
        transferido88 = transferido88.plus(s);
      }
      if (!transferido88.isZero()) partidasLiquido.push(movimentar(c('88'), transferido88));
      // Sem saldo nas classes 6/7, ou resultado corrente exactamente zero e sem imposto, não há
      // nada a lançar: o ano encerra na mesma, com a referência a nulo (#366).

      // 4e. Escrita.
      const comum = {
        periodoId: periodo13.id,
        data: exercicio.dataFim,
        documentoOrigemId: exercicio.id,
        documentoOrigemTipo: 'ExercicioContabil',
      };
      const lancResultados =
        partidasResultados.length > 0
          ? await criarLancamentoEncerramentoEmTx(
              tx,
              { ...comum, historico: `Encerramento ${exercicio.codigo} — apuramento dos resultados`, partidas: partidasResultados },
              ctx,
            )
          : null;
      const lancImposto = estimativa.greaterThan(0)
        ? await criarLancamentoEncerramentoEmTx(
            tx,
            {
              ...comum,
              historico: `Encerramento ${exercicio.codigo} — estimativa do imposto sobre o rendimento`,
              partidas: [
                { contaId: c('851'), tipo: 'DEBITO', valor: estimativa },
                { contaId: c('4411'), tipo: 'CREDITO', valor: estimativa },
              ],
            },
            ctx,
          )
        : null;
      const lancLiquido =
        partidasLiquido.length > 0
          ? await criarLancamentoEncerramentoEmTx(
              tx,
              { ...comum, historico: `Encerramento ${exercicio.codigo} — resultado líquido do exercício`, partidas: partidasLiquido },
              ctx,
            )
          : null;

      // 5. Estados e registo (ids vindos das leituras trancadas, já filtradas por tenant).
      const agora = new Date();
      await tx.periodoContabil.update({
        where: { id: periodo13.id },
        data: { estado: 'FECHADO', fechadoEm: agora, fechadoPorId: ctx.userId },
      });
      await tx.exercicioContabil.update({
        where: { id: exercicio.id },
        data: { estado: estadoAlvo },
      });

      const anteriores = await tx.encerramentoExercicio.count({
        where: { tenantId: ctx.tenantId, exercicioId: exercicio.id },
      });
      const keycloakSub = await keycloakSubDe(tx, ctx);

      const encerramento = await tx.encerramentoExercicio.create({
        data: {
          tenantId: ctx.tenantId,
          exercicioId: exercicio.id,
          versao: anteriores + 1,
          estimativaImposto: estimativa,
          lancamentoResultadosId: lancResultados?.id ?? null,
          lancamentoImpostoId: lancImposto?.id ?? null,
          lancamentoLiquidoId: lancLiquido?.id ?? null,
          fotografia: fotografia as unknown as Prisma.InputJsonValue,
          totalDebito,
          totalCredito,
          encerradoPorId: ctx.userId,
          keycloakSub,
          requestId: getRequestContext()?.requestId ?? null,
        },
      });
      await auditar(tx, ctx, keycloakSub, {
        entity: 'ExercicioContabil',
        entityId: exercicio.id,
        action: 'UPDATE',
        data: transicaoExercicio(exercicio.estado, estadoAlvo),
      });
      await auditar(tx, ctx, keycloakSub, {
        entity: 'EncerramentoExercicio',
        entityId: encerramento.id,
        action: 'CREATE',
        // Sem a fotografia: fica no próprio registo, que é imutável.
        data: {
          after: {
            versao: encerramento.versao,
            estimativaImposto: estimativa.toFixed(2),
            lancamentoResultadosId: encerramento.lancamentoResultadosId,
            lancamentoImpostoId: encerramento.lancamentoImpostoId,
            lancamentoLiquidoId: encerramento.lancamentoLiquidoId,
          },
        },
      });

      partidasPorLancamento = {
        resultados: partidasResultados.length,
        imposto: lancImposto ? 2 : 0,
        liquido: partidasLiquido.length,
      };
      return { ok: true, encerramento: encerramento as unknown as EncerramentoExercicio };
    },
    // A transacção mais longa do produto (ADR-0035, Consequências); uma segunda chamada
    // concorrente espera aqui pela tranca do exercício e sai com TRANSICAO_INVALIDA.
    { timeout: 60_000, maxWait: 10_000 },
  );

  // Registo depois do commit (ou da recusa): ids e contagens, sem PII.
  if (resultado.ok) {
    logger.info(
      {
        tenantId: ctx.tenantId,
        exercicioId: input.exercicioId,
        versao: resultado.encerramento.versao,
        partidasPorLancamento,
        duracaoMs: Date.now() - inicio,
      },
      '[encerramento] exercício encerrado provisoriamente',
    );
  } else {
    logger.warn(
      { tenantId: ctx.tenantId, exercicioId: input.exercicioId, impedimentos: resultado.impedimentos },
      '[encerramento] exercício não encerrado — impedimentos',
    );
  }
  return resultado;
}

/**
 * Reabertura do exercício encerrado provisoriamente (ADR-0035 §1, #138). Numa só transacção:
 * tranca o exercício (`FOR UPDATE`) e decide a transição pelo estado trancado; tranca o
 * período 13; reabre-o; estorna, nele, os lançamentos do encerramento em vigor (o período 12
 * está fechado e assim fica); anula esse encerramento; regista a `ReaberturaExercicio`; e o
 * exercício volta a ABERTO. Os doze mensais continuam fechados — cada um reabre-se depois,
 * pelo `reabrirPeriodo`, com o seu motivo.
 */
export async function reabrirExercicio(
  input: { exercicioId: string; motivo: string },
  ctx: Ctx,
): Promise<ReaberturaExercicio> {
  // A mesma regra de motivo que o `reabrirPeriodo` (ADR-0033 §7).
  const validado = z.object({ motivo: MotivoReaberturaSchema }).safeParse({ motivo: input.motivo });
  if (!validado.success) throw new ValidationError('Dados inválidos', validado.error.flatten());
  const motivo = validado.data.motivo;
  const inicio = Date.now();

  const reabertura = await prismaBase.$transaction(
    async (tx) => {
      const [exercicio] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: EstadoExercicio }>>`
        SELECT id, codigo, estado FROM "ExercicioContabil"
        WHERE id = ${input.exercicioId} AND "tenantId" = ${ctx.tenantId}
        FOR UPDATE
      `;
      if (!exercicio) throw new NotFoundError('Exercício não encontrado');
      const estadoAlvo = transitarExercicio(exercicio.estado, 'ABERTO');

      const [periodo13] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "PeriodoContabil"
        WHERE "exercicioId" = ${exercicio.id} AND "tenantId" = ${ctx.tenantId} AND ordem = 13
        FOR UPDATE
      `;
      if (!periodo13) throw new NotFoundError(`Período de encerramento do exercício ${exercicio.codigo} não encontrado`);

      const encerramento = await tx.encerramentoExercicio.findFirst({
        where: { tenantId: ctx.tenantId, exercicioId: exercicio.id, anuladoEm: null },
        orderBy: { versao: 'desc' },
      });
      if (!encerramento) {
        throw new NotFoundError(`Encerramento em vigor do exercício ${exercicio.codigo} não encontrado`);
      }

      // Reabrir o 13 antes de estornar: o estorno exige-o ABERTO.
      await tx.periodoContabil.update({
        where: { id: periodo13.id },
        data: { estado: 'ABERTO', fechadoEm: null, fechadoPorId: null },
      });

      const idsEN = [
        encerramento.lancamentoResultadosId,
        encerramento.lancamentoImpostoId,
        encerramento.lancamentoLiquidoId,
      ].filter((id): id is string => id !== null);
      for (const lancamentoId of idsEN) {
        await estornarLancamentoEncerramentoEmTx(
          tx,
          { lancamentoId, periodoId: periodo13.id, motivo },
          ctx,
        );
      }

      await tx.encerramentoExercicio.update({
        where: { id: encerramento.id },
        data: { anuladoEm: new Date() },
      });
      await tx.exercicioContabil.update({
        where: { id: exercicio.id },
        data: { estado: estadoAlvo },
      });

      const keycloakSub = await keycloakSubDe(tx, ctx);
      const criada = await tx.reaberturaExercicio.create({
        data: {
          tenantId: ctx.tenantId,
          exercicioId: exercicio.id,
          encerramentoId: encerramento.id,
          motivo,
          lancamentosEstornados: idsEN,
          reabertoPorId: ctx.userId,
          keycloakSub,
          requestId: getRequestContext()?.requestId ?? null,
        },
      });
      await auditar(tx, ctx, keycloakSub, {
        entity: 'ExercicioContabil',
        entityId: exercicio.id,
        action: 'UPDATE',
        data: transicaoExercicio(exercicio.estado, estadoAlvo),
      });
      await auditar(tx, ctx, keycloakSub, {
        entity: 'ReaberturaExercicio',
        entityId: criada.id,
        action: 'CREATE',
        data: {
          after: {
            encerramentoId: criada.encerramentoId,
            motivo: criada.motivo,
            lancamentosEstornados: criada.lancamentosEstornados,
          },
        },
      });
      return criada;
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  logger.info(
    {
      tenantId: ctx.tenantId,
      exercicioId: input.exercicioId,
      encerramentoId: reabertura.encerramentoId,
      lancamentosEstornados: reabertura.lancamentosEstornados.length,
      duracaoMs: Date.now() - inicio,
    },
    '[encerramento] exercício reaberto',
  );
  return reabertura;
}

/**
 * Encerramento definitivo (ADR-0035 §1): ENCERRADO_PROVISORIO → ENCERRADO, irreversível, com
 * autor e data. Decidido na leitura trancada (`FOR UPDATE`) — uma reabertura concorrente
 * espera pela tranca e sai com TRANSICAO_INVALIDA, ou vice-versa.
 */
export async function encerrarExercicioDefinitivo(
  input: { exercicioId: string },
  ctx: Ctx,
): Promise<ExercicioContabil> {
  const exercicio = await prismaBase.$transaction(async (tx) => {
    const [linha] = await tx.$queryRaw<Array<{ id: string; estado: EstadoExercicio }>>`
      SELECT id, estado FROM "ExercicioContabil"
      WHERE id = ${input.exercicioId} AND "tenantId" = ${ctx.tenantId}
      FOR UPDATE
    `;
    if (!linha) throw new NotFoundError('Exercício não encontrado');
    const estadoAlvo = transitarExercicio(linha.estado, 'ENCERRADO');
    const actualizado = await tx.exercicioContabil.update({
      where: { id: linha.id },
      data: { estado: estadoAlvo, encerradoDefinitivoEm: new Date(), encerradoDefinitivoPorId: ctx.userId },
    });
    await auditar(tx, ctx, await keycloakSubDe(tx, ctx), {
      entity: 'ExercicioContabil',
      entityId: linha.id,
      action: 'UPDATE',
      data: transicaoExercicio(linha.estado, estadoAlvo),
    });
    return actualizado;
  });

  logger.info(
    { tenantId: ctx.tenantId, exercicioId: input.exercicioId },
    '[encerramento] exercício encerrado em definitivo',
  );
  return exercicio as unknown as ExercicioContabil;
}
