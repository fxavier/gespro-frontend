import 'server-only';
import { Prisma, type EstadoExercicio, type TipoPartida } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { transitarExercicio } from '@/lib/state-machines';
import { getRequestContext } from '@/server/observability/context';
import { logger } from '@/server/observability/logger';
import { FILTRO_LANCAMENTO_MAPA, criarLancamentoEncerramentoEmTx } from './contabilidade.service';
import type {
  Ctx,
  EncerramentoExercicio,
  LinhaFotografiaEncerramento,
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
 *  4. fotografa o balancete dos períodos 1..12 e grava os três lançamentos no diário EN,
 *     período 13, com a data do fim do exercício (o 2.º só com estimativa > 0);
 *  5. fecha o período 13, passa o exercício a ENCERRADO_PROVISORIO e regista o
 *     `EncerramentoExercicio`.
 *
 * Ordem das trancas: exercício → períodos → diário (pela numeração). `fecharPeriodo` e
 * `reabrirPeriodo` trancam só o período e leem o exercício sem tranca: não há ciclo.
 *
 * As escritas em `Lancamento`/`PartidaLancamento` passam por `criarLancamentoEncerramentoEmTx`
 * (`contabilidade.service`) — `gate-periodo`.
 */

const ZERO = new Prisma.Decimal(0);
const ORDENS_MENSAIS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** Conta-se como corrente (81) tudo o que não é financeiro (82): a regra da DRE. */
const PREFIXOS_FINANCEIROS = ['69', '78'];
const CODIGOS_FIXOS = ['81', '82', '83', '88', '851', '4411'] as const;

type Partida = { contaId: string; tipo: TipoPartida; valor: Prisma.Decimal };

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
      if (folhasResultados.length === 0) impedimentos.push('SEM_RESULTADOS_A_APURAR');

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
      // Resultado corrente exactamente zero e sem imposto: não há nada a levar a 88, e o
      // registo exige o lançamento do resultado líquido.
      if (partidasLiquido.length === 0) return { ok: false, impedimentos: ['SEM_RESULTADOS_A_APURAR'] };

      // 4e. Escrita.
      const comum = {
        periodoId: periodo13.id,
        data: exercicio.dataFim,
        documentoOrigemId: exercicio.id,
        documentoOrigemTipo: 'ExercicioContabil',
      };
      const lancResultados = await criarLancamentoEncerramentoEmTx(
        tx,
        { ...comum, historico: `Encerramento ${exercicio.codigo} — apuramento dos resultados`, partidas: partidasResultados },
        ctx,
      );
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
      const lancLiquido = await criarLancamentoEncerramentoEmTx(
        tx,
        { ...comum, historico: `Encerramento ${exercicio.codigo} — resultado líquido do exercício`, partidas: partidasLiquido },
        ctx,
      );

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
      const utilizador = await tx.user.findFirst({
        where: { id: ctx.userId, tenantId: ctx.tenantId },
        select: { keycloakSub: true },
      });

      const encerramento = await tx.encerramentoExercicio.create({
        data: {
          tenantId: ctx.tenantId,
          exercicioId: exercicio.id,
          versao: anteriores + 1,
          estimativaImposto: estimativa,
          lancamentoResultadosId: lancResultados.id,
          lancamentoImpostoId: lancImposto?.id ?? null,
          lancamentoLiquidoId: lancLiquido.id,
          fotografia: fotografia as unknown as Prisma.InputJsonValue,
          totalDebito,
          totalCredito,
          encerradoPorId: ctx.userId,
          keycloakSub: utilizador?.keycloakSub ?? ctx.userId,
          requestId: getRequestContext()?.requestId ?? null,
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
