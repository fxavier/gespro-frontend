import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma, type EstadoExercicio } from '@prisma/client';
import { z } from 'zod';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { MotivoReaberturaSchema, ReferenciaActaSchema } from '@/lib/validations/contabilidade';
import { getRequestContext } from '@/server/observability/context';
import { logger } from '@/server/observability/logger';
import {
  FILTRO_LANCAMENTO_MAPA,
  criarLancamentoAplicacaoResultadoEmTx,
  estornarLancamentoAplicacaoResultadoEmTx,
  exercicioTemAberturaEfectivaEmTx,
  periodoFiscalDe,
} from './contabilidade.service';
import type { AplicacaoResultado, Ctx, SituacaoAplicacaoResultado } from './contabilidade.interface';

/**
 * Aplicação do resultado (ADR-0035 §5, #364): o saldo de 88 — Resultado líquido do período —
 * transportado para 59 — Resultados transitados, no exercício SEGUINTE, com a data da
 * deliberação que aprova as contas e a referência da acta. A distribuição posterior (reservas,
 * dividendos) faz-se por lançamentos manuais a partir de 59.
 *
 * Numa só transacção, com as trancas na ordem do encerramento (ano mais antigo primeiro):
 * exercício N `FOR UPDATE` → exercício N+1 `FOR UPDATE` → o período da deliberação (`FOR SHARE`,
 * no escritor) → o diário (numeração). A tranca de N serializa a aplicação com a reabertura de N
 * (que recusa com uma aplicação activa) e com outra aplicação — «uma activa por exercício» é
 * decidida aqui, na leitura trancada, porque o Prisma não exprime um índice único parcial.
 *
 * As escritas em `Lancamento`/`PartidaLancamento` passam pelo `contabilidade.service`
 * (`gate-periodo`). A `AplicacaoResultado` é escrita pelo `prismaBase` (fora da
 * `audit-extension`): as linhas de `AuditLog` são explícitas, na mesma transacção — CREATE ao
 * aplicar, UPDATE ao anular. Uma chamada recusada não deixa linha.
 */

type Tx = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);
const ESTADOS_ENCERRADOS: ReadonlyArray<EstadoExercicio> = ['ENCERRADO_PROVISORIO', 'ENCERRADO'];


/** `sub` do autor no Keycloak, para o registo e o `AuditLog`. */
async function keycloakSubDe(tx: Tx, ctx: Ctx): Promise<string> {
  const utilizador = await tx.user.findFirst({
    where: { id: ctx.userId, tenantId: ctx.tenantId },
    select: { keycloakSub: true },
  });
  return utilizador?.keycloakSub ?? ctx.userId;
}

async function auditar(
  tx: Tx,
  ctx: Ctx,
  keycloakSub: string,
  linha: { entityId: string; action: 'CREATE' | 'UPDATE'; data: Prisma.InputJsonValue },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      keycloakSub,
      requestId: getRequestContext()?.requestId ?? null,
      entity: 'AplicacaoResultado',
      ...linha,
    },
  });
}

/** Saldo de 88 (D − C) no exercício, pelo período do lançamento (meses 1..12). */
async function saldo88EmTx(tx: Tx, conta88Id: string, exercicioId: string, ctx: Ctx): Promise<Prisma.Decimal> {
  const agregados = await tx.partidaLancamento.groupBy({
    by: ['tipo'],
    where: {
      tenantId: ctx.tenantId,
      contaId: conta88Id,
      lancamento: { status: FILTRO_LANCAMENTO_MAPA, periodo: { exercicioId, ordem: { gte: 1, lte: 12 } } },
    },
    _sum: { valor: true },
  });
  let saldo = ZERO;
  for (const a of agregados) {
    const v = a._sum.valor ?? ZERO;
    saldo = a.tipo === 'DEBITO' ? saldo.plus(v) : saldo.minus(v);
  }
  return saldo;
}

async function contasDaAplicacao(tx: Tx, ctx: Ctx): Promise<{ c88: string; c59: string }> {
  const contas = await tx.contaPGC.findMany({
    where: { tenantId: ctx.tenantId, codigo: { in: ['88', '59'] } },
    select: { id: true, codigo: true },
  });
  const c88 = contas.find((c) => c.codigo === '88')?.id;
  const c59 = contas.find((c) => c.codigo === '59')?.id;
  if (!c88) throw new NotFoundError('Conta PGC "88" não encontrada');
  if (!c59) throw new NotFoundError('Conta PGC "59" não encontrada');
  return { c88, c59 };
}

export async function aplicarResultado(
  input: { exercicioId: string; dataDeliberacao: Date; referenciaActa: string },
  ctx: Ctx,
): Promise<AplicacaoResultado> {
  const validado = z
    .object({ referenciaActa: ReferenciaActaSchema, dataDeliberacao: z.date() })
    .safeParse({ referenciaActa: input.referenciaActa, dataDeliberacao: input.dataDeliberacao });
  if (!validado.success || Number.isNaN(validado.data.dataDeliberacao.getTime())) {
    throw new ValidationError('Dados inválidos', validado.success ? undefined : validado.error.flatten());
  }
  const { referenciaActa, dataDeliberacao } = validado.data;

  const aplicacao = await prismaBase.$transaction(
    async (tx) => {
      // 1. Exercício N trancado — o estado que decide é o lido depois da tranca.
      const [exercicio] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: EstadoExercicio }>>`
        SELECT id, codigo, estado FROM "ExercicioContabil"
        WHERE id = ${input.exercicioId} AND "tenantId" = ${ctx.tenantId}
        FOR UPDATE
      `;
      if (!exercicio) throw new NotFoundError('Exercício não encontrado');
      if (!ESTADOS_ENCERRADOS.includes(exercicio.estado)) {
        throw new BusinessRuleError(
          'EXERCICIO_NAO_ENCERRADO',
          `O resultado do exercício ${exercicio.codigo} só se aplica depois de o exercício estar encerrado.`,
        );
      }

      // 2. Exercício N+1 trancado (a seguir a N — ordem das trancas no topo).
      const [seguinte] = await tx.$queryRaw<Array<{ id: string; codigo: string }>>`
        SELECT id, codigo FROM "ExercicioContabil"
        WHERE "anteriorId" = ${exercicio.id} AND "tenantId" = ${ctx.tenantId}
        FOR UPDATE
      `;
      if (!seguinte || !(await exercicioTemAberturaEfectivaEmTx(tx, seguinte.id, ctx))) {
        throw new BusinessRuleError(
          'ABERTURA_EM_FALTA',
          seguinte
            ? `O exercício ${seguinte.codigo} ainda não tem o lançamento de abertura: encerre de novo o exercício ${exercicio.codigo} para o gerar.`
            : `O exercício seguinte a ${exercicio.codigo} ainda não existe. Abra-o primeiro — a abertura é gerada com ele.`,
        );
      }

      // 3. A data da deliberação cai num mês do exercício seguinte (dia fiscal de Maputo).
      const periodo = await tx.periodoContabil.findFirst({
        where: { tenantId: ctx.tenantId, exercicioId: seguinte.id, codigo: periodoFiscalDe(dataDeliberacao), ordem: { lte: 12 } },
        select: { id: true, codigo: true, estado: true },
      });
      if (!periodo) {
        throw new BusinessRuleError(
          'DATA_FORA_DO_EXERCICIO_SEGUINTE',
          `A data da deliberação tem de pertencer ao exercício ${seguinte.codigo}.`,
        );
      }
      if (periodo.estado !== 'ABERTO') {
        // O escritor volta a decidir na leitura trancada; aqui é só para falhar cedo.
        throw new BusinessRuleError(
          'PERIODO_FECHADO',
          `O período ${periodo.codigo}, da data da deliberação, está fechado. Reabra-o ou escolha outra data.`,
        );
      }

      // 4. Uma aplicação activa por exercício — decidido com N trancado.
      const activa = await tx.aplicacaoResultado.findFirst({
        where: { tenantId: ctx.tenantId, exercicioId: exercicio.id, anuladaEm: null },
        select: { id: true },
      });
      if (activa) {
        throw new BusinessRuleError(
          'RESULTADO_JA_APLICADO',
          `O resultado do exercício ${exercicio.codigo} já foi aplicado. Anule a aplicação antes de a registar de novo.`,
        );
      }

      // 5. O valor: o saldo de 88 em N+1 neste momento (abertura + movimento).
      const { c88, c59 } = await contasDaAplicacao(tx, ctx);
      const saldo = await saldo88EmTx(tx, c88, seguinte.id, ctx);
      if (saldo.isZero()) {
        throw new BusinessRuleError(
          'SEM_RESULTADO_A_APLICAR',
          `A conta 88 não tem saldo no exercício ${seguinte.codigo}: não há resultado a aplicar.`,
        );
      }
      const valor = saldo.abs();
      // Lucro: 88 credor (saldo < 0) → D 88 / C 59. Prejuízo: o inverso.
      const lucro = saldo.lessThan(0);

      // 6. Escrita: o lançamento leva a aplicação na origem, por isso o id nasce aqui.
      const aplicacaoId = randomUUID();
      const lancamento = await criarLancamentoAplicacaoResultadoEmTx(
        tx,
        {
          periodoId: periodo.id,
          data: dataDeliberacao,
          aplicacaoId,
          historico: `Aplicação do resultado de ${exercicio.codigo} — ${referenciaActa}`,
          partidas: [
            { contaId: c88, tipo: lucro ? 'DEBITO' : 'CREDITO', valor },
            { contaId: c59, tipo: lucro ? 'CREDITO' : 'DEBITO', valor },
          ],
        },
        ctx,
      );

      const keycloakSub = await keycloakSubDe(tx, ctx);
      const criada = await tx.aplicacaoResultado.create({
        data: {
          id: aplicacaoId,
          tenantId: ctx.tenantId,
          exercicioId: exercicio.id,
          exercicioDestinoId: seguinte.id,
          lancamentoId: lancamento.id,
          valor,
          dataDeliberacao,
          referenciaActa,
          criadoPorId: ctx.userId,
          keycloakSub,
          requestId: getRequestContext()?.requestId ?? null,
        },
      });
      await auditar(tx, ctx, keycloakSub, {
        entityId: criada.id,
        action: 'CREATE',
        data: {
          after: {
            exercicioId: criada.exercicioId,
            exercicioDestinoId: criada.exercicioDestinoId,
            lancamentoId: criada.lancamentoId,
            valor: valor.toFixed(2),
            dataDeliberacao: dataDeliberacao.toISOString(),
            referenciaActa,
          },
        },
      });
      return criada;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  logger.info(
    {
      tenantId: ctx.tenantId,
      exercicioId: aplicacao.exercicioId,
      aplicacaoId: aplicacao.id,
      lancamentoId: aplicacao.lancamentoId,
    },
    '[aplicacao-resultado] resultado aplicado',
  );
  return aplicacao;
}

export async function anularAplicacaoResultado(
  input: { aplicacaoId: string; motivo: string },
  ctx: Ctx,
): Promise<AplicacaoResultado> {
  // A mesma regra de motivo que a reabertura (ADR-0033 §7).
  const validado = z.object({ motivo: MotivoReaberturaSchema }).safeParse({ motivo: input.motivo });
  if (!validado.success) throw new ValidationError('Dados inválidos', validado.error.flatten());
  const motivo = validado.data.motivo;

  const anulada = await prismaBase.$transaction(
    async (tx) => {
      const alvo = await tx.aplicacaoResultado.findFirst({
        where: { id: input.aplicacaoId, tenantId: ctx.tenantId },
        select: { exercicioId: true, exercicioDestinoId: true },
      });
      if (!alvo) throw new NotFoundError('Aplicação do resultado não encontrada');

      // Trancas na ordem da aplicação: N → N+1; depois a decisão sobre a linha relida.
      await tx.$queryRaw`
        SELECT id FROM "ExercicioContabil"
        WHERE id = ${alvo.exercicioId} AND "tenantId" = ${ctx.tenantId}
        FOR UPDATE
      `;
      await tx.$queryRaw`
        SELECT id FROM "ExercicioContabil"
        WHERE id = ${alvo.exercicioDestinoId} AND "tenantId" = ${ctx.tenantId}
        FOR UPDATE
      `;
      const aplicacao = await tx.aplicacaoResultado.findFirst({
        where: { id: input.aplicacaoId, tenantId: ctx.tenantId },
      });
      if (!aplicacao) throw new NotFoundError('Aplicação do resultado não encontrada');
      if (aplicacao.anuladaEm) {
        throw new BusinessRuleError('APLICACAO_JA_ANULADA', 'Esta aplicação do resultado já foi anulada.');
      }

      // O estorno vai para o período do original (por id), não para o mês de hoje.
      const estorno = await estornarLancamentoAplicacaoResultadoEmTx(
        tx,
        { lancamentoId: aplicacao.lancamentoId, motivo },
        ctx,
      );

      const agora = new Date();
      const actualizada = await tx.aplicacaoResultado.update({
        where: { id: aplicacao.id },
        data: { anuladaEm: agora, motivoAnulacao: motivo, lancamentoAnulacaoId: estorno.id, anuladaPorId: ctx.userId },
      });
      await auditar(tx, ctx, await keycloakSubDe(tx, ctx), {
        entityId: aplicacao.id,
        action: 'UPDATE',
        data: {
          before: { anuladaEm: null },
          after: { anuladaEm: agora.toISOString(), motivoAnulacao: motivo, lancamentoAnulacaoId: estorno.id },
        },
      });
      return actualizada;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  logger.info(
    { tenantId: ctx.tenantId, aplicacaoId: anulada.id, lancamentoAnulacaoId: anulada.lancamentoAnulacaoId },
    '[aplicacao-resultado] aplicação anulada',
  );
  return anulada;
}

// ---------------------------------------------------------------------------
// Leitura (UI)
// ---------------------------------------------------------------------------


/**
 * O que a página de exercícios precisa para oferecer «Aplicar resultado» ou mostrar a aplicação
 * em vigor. Leitura sem trancas — a decisão é do `aplicarResultado`.
 */
export async function obterSituacaoAplicacaoResultado(
  exercicioId: string,
  ctx: Ctx,
): Promise<SituacaoAplicacaoResultado | null> {
  return prismaBase.$transaction(async (tx) => {
    const exercicio = await tx.exercicioContabil.findFirst({
      where: { id: exercicioId, tenantId: ctx.tenantId },
      select: { id: true, estado: true },
    });
    if (!exercicio) return null;
    const activa = await tx.aplicacaoResultado.findFirst({
      where: { tenantId: ctx.tenantId, exercicioId, anuladaEm: null },
      select: { id: true, dataDeliberacao: true, referenciaActa: true, valor: true, lancamentoId: true },
    });
    const seguinte = await tx.exercicioContabil.findFirst({
      where: { tenantId: ctx.tenantId, anteriorId: exercicioId },
      select: { id: true, codigo: true, dataInicio: true, dataFim: true },
    });
    let saldo88 = ZERO;
    let comAbertura = false;
    if (seguinte) {
      comAbertura = await exercicioTemAberturaEfectivaEmTx(tx, seguinte.id, ctx);
      const c88 = await tx.contaPGC.findFirst({ where: { tenantId: ctx.tenantId, codigo: '88' }, select: { id: true } });
      if (c88) saldo88 = await saldo88EmTx(tx, c88.id, seguinte.id, ctx);
    }
    return {
      activa,
      seguinte,
      disponivel: ESTADOS_ENCERRADOS.includes(exercicio.estado) && comAbertura && !activa,
      saldo88,
    };
  });
}
