import 'server-only';
import { Prisma, type TipoPartida } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { getRequestContext } from '@/server/observability/context';
import { logger } from '@/server/observability/logger';
import { paginate } from '@/server/db/paginate';
import type {
  CriarContaPGCInput,
  AtualizarContaPGCInput,
  FiltroContaPGCInput,
  CriarDiarioInput,
  AtualizarDiarioInput,
  CriarCentroCustoInput,
  AtualizarCentroCustoInput,
  FiltroCentroCustoInput,
  CriarLancamentoInput,
  EstornarLancamentoInput,
  EditarLancamentoInput,
  AnularLancamentoInput,
  FiltroLancamentoInput,
  CriarContaBancariaInput,
  AtualizarContaBancariaInput,
  FiltroBalanceteInput,
  FiltroRazaoInput,
  FiltroDREInput,
  FecharPeriodoInput,
  ReabrirPeriodoInput,
  ListarPeriodosInput,
  AbrirExercicioInput,
  FiltroBalanceteVerificacaoInput,
} from '@/lib/validations/contabilidade';
import { MSG_CONTA_MAE_NAO_ENCONTRADA } from '@/lib/validations/contabilidade';
import { montarBalanceteVerificacao, CLASSES_BALANCO, normalizarIntervaloPeriodos } from './balancete-verificacao';
import type { BalanceteVerificacaoResult, RazaoConta } from './contabilidade.interface';
import type { CalendarioContabilisticoInput } from '@/lib/validations/plataforma';
import { bootstrapSeriesDocumento } from '@/server/provisioning/tenant-bootstrap';
import {
  TRANSICOES_LANCAMENTO,
  type StatusLancamento,
  type ContaPGC,
  type ContaDetalhe,
  type Diario,
  type CentroCusto,
  type Lancamento,
  type LancamentoDetalhe,
  type LancamentoComPartidas,
  type ContaBancaria,
  type Balancete,
  type ContaBalancete,
  type LinhaRazao,
  type DRE,
  type PaginacaoContabilidade,
  type RegistarLancamentoContabilisticoInput,
  type Ctx,
  type PeriodoContabil,
  type ExercicioContabil,
  type ResultadoFechoPeriodo,
  type ReaberturaPeriodo,
  type CalendarioContabilisticoRow,
} from './contabilidade.interface';

// ---------------------------------------------------------------------------
// Filtro canónico dos mapas contabilísticos
// ---------------------------------------------------------------------------

/**
 * Predicado de status para balancete, razão e DRE.
 *
 * Lista explícita em vez de `{ not: 'RASCUNHO' }`: se um quarto valor entrar
 * no enum amanhã ele não entrará nos mapas em silêncio — terá de ser aqui
 * adicionado por decisão consciente.
 *
 * Decisão (ADR-0033):
 *
 * - ESTORNADO (original) é INCLUÍDO: o par original+estorno soma zero nas
 *   contas, que é o comportamento contabilístico correcto — um estorno é
 *   um lançamento de reversão e as duas peças ficam no razão.
 *   O filtro antigo `{ not: 'ESTORNADO' }` excluía o original e contava só
 *   o espelho, deixando o simétrico do movimento em vez de zero.
 *
 * - RASCUNHO é EXCLUÍDO: um rascunho não confirmado não tem efeito contabilístico
 *   e não deve inflar balancetes, razão nem DRE.
 *
 * Quatro locais usam este predicado: `obterContaDetalhe`, `gerarBalancete`,
 * `razaoConta` e `calcularLinhasDRE` (via `gerarDRE`). Uma única constante
 * fecha os quatro caminhos.
 */
export const FILTRO_LANCAMENTO_MAPA = { in: ['LANCADO', 'ESTORNADO'] as StatusLancamento[] };

// Predicados dos leitores por DATAS (#363) — vivem num módulo próprio, sem dependências,
// para os serviços de outros domínios (reconciliação) os importarem sem arrastar este.
import { FORA_DE_FECHO_E_ABERTURA, ORIGEM_ABERTURA, SEM_ABERTURA_REAFIRMADA } from './fora-de-fecho-e-abertura';

/**
 * `documentoOrigemTipo` do lançamento da aplicação do resultado (#364, ADR-0035 §5) e do estorno
 * dele; `documentoOrigemId` = a `AplicacaoResultado`. Reservada: só
 * `criarLancamentoAplicacaoResultadoEmTx` / `estornarLancamentoAplicacaoResultadoEmTx` a escrevem.
 */
export const ORIGEM_APLICACAO_RESULTADO = 'AplicacaoResultado';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Fuso fixo — Africa/Maputo (UTC+2, sem horário de Verão). Ver ADR-0033 §2.
// O servidor corre em UTC; o facto fiscal acontece em Maputo. Usar getFullYear()/
// getMonth() leria o fuso do processo e uma factura emitida a 1 de Fevereiro
// às 00h30 de Maputo (22h30 UTC do dia anterior) cairia no período errado.
// Usa-se Intl, não um offset "+2" fixo em código: o Intl já tem a regra.
const _FUSO_FISCAL = 'Africa/Maputo';
const _FMT_PERIODO = new Intl.DateTimeFormat('pt-MZ', {
  timeZone: _FUSO_FISCAL,
  year: 'numeric',
  month: '2-digit',
});

// Içado a módulo pelo mesmo motivo do _FMT_PERIODO: construir um
// Intl.DateTimeFormat custa ~200µs; reutilizá-lo custa ~10µs por formatToParts.
// A projecção de tesouraria (spec 22) chama diaCivilEmMaputo dezenas de vezes
// por pedido e os property tests milhares de vezes por corrida.
const _FMT_DIA_CIVIL = new Intl.DateTimeFormat('pt-MZ', {
  timeZone: _FUSO_FISCAL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** @internal Exportado apenas para testes unitários (ADR-0033 §2). */
export function periodoFiscalDe(data: Date): string {
  const partes = _FMT_PERIODO.formatToParts(data);
  const ano = partes.find((p) => p.type === 'year')!.value;
  const mes = partes.find((p) => p.type === 'month')!.value;
  return `${ano}-${mes}`;
}

/**
 * Devolve o dia civil, mês e ano de `data` no fuso Africa/Maputo.
 *
 * Reutiliza `_FUSO_FISCAL` — não cria uma terceira implementação de `Intl`.
 * Usado pelo cron de abertura de exercício para comparar com a configuração
 * por tenant sem depender do fuso do processo (que é UTC no servidor).
 *
 * @internal Exportado apenas para testes unitários e para o cron route.
 */
export function diaCivilEmMaputo(data: Date): { dia: number; mes: number; ano: number } {
  const partes = _FMT_DIA_CIVIL.formatToParts(data);
  return {
    dia: Number(partes.find((p) => p.type === 'day')!.value),
    mes: Number(partes.find((p) => p.type === 'month')!.value),
    ano: Number(partes.find((p) => p.type === 'year')!.value),
  };
}

/**
 * Determina se um tenant deve ter o exercício aberto hoje, com base na sua
 * configuração e na data actual em Africa/Maputo.
 *
 * Função pura, extraída para ser testável independentemente do cron e do Prisma.
 * O cron chama-a para cada tenant; o resultado de `false` deve ser contado como
 * `saltouData` ou `saltouConfig` no relatório da corrida (para distinguir
 * «saltei de propósito» de «não havia nada a fazer»).
 *
 * @param config Configuração do tenant (nova coluna `ConfiguracaoFiscal`).
 * @param agora  Instante actual (UTC, como `new Date()` devolve). Por omissão `new Date()`.
 *
 * @internal Exportado apenas para testes unitários e para o cron route.
 */
export function deveAbrirHoje(
  config: {
    aberturaExercicioAutomatica: boolean;
    diaAberturaExercicio: number;
    mesAberturaExercicio: number;
  },
  agora: Date = new Date(),
): boolean {
  if (!config.aberturaExercicioAutomatica) return false;
  const { dia, mes } = diaCivilEmMaputo(agora);
  return dia === config.diaAberturaExercicio && mes === config.mesAberturaExercicio;
}

// ---------------------------------------------------------------------------
// Helpers de fronteira de período em Africa/Maputo
// ---------------------------------------------------------------------------

/**
 * Instante UTC que corresponde ao início de um mês em Africa/Maputo (UTC+2, sem DST).
 * 2026-02-01 00:00 Maputo = 2026-01-31T22:00:00Z
 * O offset é fixo; o comentário explica porquê é aceitável aqui ao contrário
 * de num selector de fuso do utilizador.
 */
function inicioDeMesEmMaputo(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1) - 2 * 60 * 60 * 1000);
}

/** Último instante UTC de um mês em Africa/Maputo (23:59:59.999 Maputo = 21:59:59.999 UTC). */
function fimDeMesEmMaputo(ano: number, mes: number): Date {
  // Date.UTC(ano, mes, 0) = last day of `mes-1`; + 21:59:59.999 = last ms of day in Maputo
  return new Date(Date.UTC(ano, mes, 0, 21, 59, 59, 999));
}

/**
 * `userId` das escritas sem utilizador humano: o cron (`/api/cron/abrir-exercicio` chama com
 * ele) e a criação do exercício pela rede de segurança quando o chamador não passa autor. Num
 * `ExercicioContabil.criadoPorId` grava-se `null`; num `Lancamento.criadoPorId` (obrigatório)
 * grava-se este valor.
 */
export const USER_ID_AUTOMATICO = 'cron';

/**
 * Cria um exercício contabilístico com os 13 períodos para `ano`.
 * Idempotente via @@unique([tenantId, codigo]).
 * Rede de segurança do ADR-0033 §3: o caminho normal é o cron de 1 de Dezembro.
 *
 * Também (#363, ADR-0035 §6):
 *  - encadeia o exercício SEGUINTE que já exista sem anterior (`anteriorId` só se escrevia na
 *    criação: criar 2025 depois de 2026 deixava 2026 solto) — salvo se esse seguinte já tiver
 *    lançamentos no diário AB: abertura manual = tenant migrado, cujo primeiro exercício é ele;
 *    encadeá-lo tornava os seus saldos iniciais numa «abertura em falta»;
 *  - gera a abertura (diário AB) quando o anterior já está encerrado — ver
 *    `garantirAberturaAoCriarEmTx`.
 *
 * `autorId` é o autor do lançamento de abertura, se houver (`criadoPorId` do exercício pode ser
 * nulo no cron; o lançamento não pode).
 */
async function criarExercicioComPeriodos(
  tx: Prisma.TransactionClient,
  ano: number,
  tenantId: string,
  criadoPorId: string | null = null,
  autorId: string = criadoPorId ?? USER_ID_AUTOMATICO,
): Promise<{ id: string }> {
  // Encadear ao exercício anterior (FK escalar, sem @relation)
  const anterior = await tx.exercicioContabil.findFirst({
    where: { tenantId, codigo: String(ano - 1) },
    select: { id: true },
  });

  // upsert idempotente — o cron já pode ter criado
  const exercicio = await tx.exercicioContabil.upsert({
    where: { tenantId_codigo: { tenantId, codigo: String(ano) } },
    create: {
      tenantId,
      codigo: String(ano),
      dataInicio: inicioDeMesEmMaputo(ano, 1),
      dataFim: fimDeMesEmMaputo(ano, 12),
      estado: 'ABERTO',
      anteriorId: anterior?.id ?? null,
      criadoPorId,
    },
    update: {},
    select: { id: true },
  });

  // Criar os 12 períodos mensais + período 13 de encerramento (ADR-0035 §2)
  for (let mes = 1; mes <= 12; mes++) {
    const codigo = `${ano}-${String(mes).padStart(2, '0')}`;
    await tx.periodoContabil.upsert({
      where: { tenantId_codigo: { tenantId, codigo } },
      create: {
        tenantId,
        exercicioId: exercicio.id,
        ordem: mes,
        codigo,
        dataInicio: inicioDeMesEmMaputo(ano, mes),
        dataFim: fimDeMesEmMaputo(ano, mes),
        estado: 'ABERTO',
      },
      update: {},
    });
  }
  // Período 13 — encerramento: instante no último milissegundo do ano (ADR-0033 §2)
  // dataInicio = dataFim = fim do mês 12, alinhado com a migration de backfill.
  const codigo13 = `${ano}-13`;
  const fimAno = fimDeMesEmMaputo(ano, 12);
  await tx.periodoContabil.upsert({
    where: { tenantId_codigo: { tenantId, codigo: codigo13 } },
    create: {
      tenantId,
      exercicioId: exercicio.id,
      ordem: 13,
      codigo: codigo13,
      dataInicio: fimAno,
      dataFim: fimAno,
      estado: 'ABERTO',
    },
    update: {},
  });

  // Encadear o seguinte que tenha nascido antes deste (e por isso sem anterior).
  const seguinteSolto = await tx.exercicioContabil.findFirst({
    where: { tenantId, codigo: String(ano + 1), anteriorId: null },
    select: { id: true },
  });
  const seguinteTemAberturaManual =
    seguinteSolto &&
    (await tx.lancamento.count({
      where: { tenantId, diario: { tipo: 'ABERTURA' }, periodo: { exercicioId: seguinteSolto.id } },
    })) > 0;
  if (seguinteSolto && !seguinteTemAberturaManual) {
    await tx.exercicioContabil.updateMany({
      where: { id: seguinteSolto.id, tenantId, anteriorId: null },
      data: { anteriorId: exercicio.id },
    });
  }

  if (anterior) {
    await garantirAberturaAoCriarEmTx(
      tx,
      { exercicioAnteriorId: anterior.id, exercicioId: exercicio.id },
      { tenantId, userId: autorId },
    );
  }

  return exercicio;
}

/**
 * Abertura gerada na CRIAÇÃO do exercício (#363, ADR-0035 §6, disparo T2): o anterior já está
 * pelo menos ENCERRADO_PROVISORIO, com um encerramento em vigor, e este ainda não tem abertura
 * efectiva → gera-a aqui, na mesma transacção. Idempotente: com AB efectivo não faz nada (um
 * segundo `abrirExercicio` não duplica). Com o período 1 já fechado também não faz nada — a
 * criação não falha por isso; o encerramento deste exercício recusará com `ABERTURA_EM_FALTA`.
 *
 * Trancas (ordem do encerramento: anterior → seguinte): o ANTERIOR `FOR SHARE` primeiro, depois
 * este `FOR UPDATE`. Fecha a corrida com `encerrarExercicio(anterior)`: se o encerramento tem a
 * tranca, esperamos pelo commit e lemos ENCERRADO_PROVISORIO (e geramos); se a temos nós, o
 * encerramento espera pelo nosso commit e já vê este exercício (e gera ele). Este exercício
 * `FOR UPDATE` serializa duas criações concorrentes. Quando corre dentro de um lançamento
 * (`resolverPeriodo`), o chamador ainda não trancou diário nenhum deste lançamento; se a sua
 * transacção já tiver trancado um período do anterior (dois lançamentos em anos diferentes na
 * mesma transacção), um encerramento concorrente pode dar deadlock — o Postgres detecta-o e
 * aborta uma das duas, sem estado parcial.
 */
async function garantirAberturaAoCriarEmTx(
  tx: Prisma.TransactionClient,
  input: { exercicioAnteriorId: string; exercicioId: string },
  ctx: Ctx,
): Promise<void> {
  const [anterior] = await tx.$queryRaw<Array<{ estado: string }>>`
    SELECT estado FROM "ExercicioContabil"
    WHERE id = ${input.exercicioAnteriorId} AND "tenantId" = ${ctx.tenantId}
    FOR SHARE
  `;
  if (!anterior || (anterior.estado !== 'ENCERRADO_PROVISORIO' && anterior.estado !== 'ENCERRADO')) return;

  await tx.$queryRaw`
    SELECT id FROM "ExercicioContabil"
    WHERE id = ${input.exercicioId} AND "tenantId" = ${ctx.tenantId}
    FOR UPDATE
  `;
  const encerramento = await tx.encerramentoExercicio.findFirst({
    where: { tenantId: ctx.tenantId, exercicioId: input.exercicioAnteriorId, anuladoEm: null },
    select: { id: true },
  });
  if (!encerramento) return; // encerrado por escrita crua / antes do #138: nada a transportar
  if (await exercicioTemDiarioAbertura(input.exercicioId, ctx.tenantId, tx)) return;

  // Decidido na leitura TRANCADA: fechado, não se escreve nem se lança para a tx do chamador.
  const [periodo1] = await tx.$queryRaw<Array<{ estado: string }>>`
    SELECT estado FROM "PeriodoContabil"
    WHERE "exercicioId" = ${input.exercicioId} AND "tenantId" = ${ctx.tenantId} AND ordem = 1
    FOR SHARE
  `;
  if (periodo1?.estado !== 'ABERTO') return;

  const ab = await gerarAberturaEmTx(tx, input, ctx);
  // Registado dentro da tx do chamador (pode ser a de um lançamento, que não conhecemos): se
  // essa tx desfizer, a linha descreve uma escrita que não ficou. Daí «gerada na transacção».
  if (ab) {
    logger.info(
      {
        tenantId: ctx.tenantId,
        exercicioId: input.exercicioId,
        exercicioAnteriorId: input.exercicioAnteriorId,
        aberturaId: ab.id,
      },
      '[abertura] abertura do exercício gerada na transacção de criação',
    );
  }
}

/**
 * Resolve o PeriodoContabil para uma data, dentro de uma transacção.
 * Caminho normal: o período já existe (criado pelo cron de 1 de Dezembro).
 * Rede de segurança: se não existir, cria o exercício e os 13 períodos.
 * @internal Exportado para testes unitários.
 */
export async function resolverPeriodo(
  tx: Prisma.TransactionClient,
  data: Date,
  tenantId: string,
  /** Autor do lançamento de abertura, se a criação do exercício o gerar (#363). */
  userId?: string,
): Promise<{ id: string; codigo: string; estado: string }> {
  const codigo = periodoFiscalDe(data);

  const periodo = await tx.periodoContabil.findFirst({
    where: { tenantId, codigo },
    select: { id: true, codigo: true, estado: true },
  });

  if (periodo) return periodo;

  // Rede de segurança: exercício ainda não existe → criar
  const ano = parseInt(codigo.split('-')[0], 10);
  await criarExercicioComPeriodos(tx, ano, tenantId, null, userId ?? USER_ID_AUTOMATICO);

  // Agora o período existe
  const criado = await tx.periodoContabil.findFirst({
    where: { tenantId, codigo },
    select: { id: true, codigo: true, estado: true },
  });
  if (!criado) throw new Error(`Falha ao criar período ${codigo} para tenant ${tenantId}`);
  return criado;
}

/**
 * Recusa com `PERIODO_FECHADO` se o período fiscal (Africa/Maputo) de `data` já existe e não
 * está ABERTO. Só leitura, sem tranca: serve para falhar cedo (abertura da sessão POS,
 * ADR-0041 §6). Período ainda por criar conta como aberto — o primeiro lançamento cria-o
 * (`resolverPeriodo`). Quem lança continua protegido pela leitura trancada de `criarLancamento`.
 */
export async function exigirPeriodoAbertoEm(data: Date, ctx: Ctx): Promise<void> {
  const periodo = await prisma.periodoContabil.findFirst({
    where: { tenantId: ctx.tenantId, codigo: periodoFiscalDe(data) },
    select: { codigo: true, estado: true },
  });
  if (periodo && periodo.estado !== 'ABERTO') {
    throw new BusinessRuleError(
      'PERIODO_FECHADO',
      `O período contabilístico ${periodo.codigo} está fechado — não é possível vender nele. ` +
        'Reabra o período em Contabilidade › Exercícios ou peça a quem o fechou.',
    );
  }
}

function transitarEstado(atual: StatusLancamento, alvo: StatusLancamento): void {
  const permitidas = TRANSICOES_LANCAMENTO[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      `Transição inválida: ${atual} → ${alvo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`,
    );
  }
}

/** Resolve contaCodigo → contaId dentro de uma transacção (cross-domain). */
async function resolverContaPorCodigo(
  tx: Prisma.TransactionClient,
  codigo: string,
  tenantId: string,
): Promise<{ id: string }> {
  const conta = await tx.contaPGC.findFirst({
    where: { codigo, tenantId, ativo: true },
    select: { id: true, aceitaLancamento: true },
  });
  if (!conta) throw new NotFoundError(`Conta PGC "${codigo}" não encontrada`);
  if (!conta.aceitaLancamento) {
    throw new BusinessRuleError(
      'CONTA_NAO_ACEITA_LANCAMENTO',
      `Conta "${codigo}" não aceita lançamentos directos`,
    );
  }
  return { id: conta.id };
}

async function resolverCentroCustoPorCodigo(
  tx: Prisma.TransactionClient,
  codigo: string,
  tenantId: string,
): Promise<string | null> {
  const cc = await tx.centroCusto.findFirst({
    where: { codigo, tenantId, ativo: true },
    select: { id: true },
  });
  return cc?.id ?? null;
}

async function proximoNumeroLancamento(
  tx: Prisma.TransactionClient,
  diarioId: string,
  periodoFiscal: string,
  tenantId: string,
): Promise<string> {
  // Serializar via lock da linha do Diário para evitar corrida (W7).
  // Qualquer transacção concorrente que queira numerar no mesmo diário espera.
  await tx.$queryRaw`SELECT id FROM "Diario" WHERE id = ${diarioId} FOR UPDATE`;
  const count = await tx.lancamento.count({ where: { tenantId, diarioId, periodoFiscal } });
  return String(count + 1).padStart(6, '0');
}

/**
 * Invariante débito = crédito, em Decimal exacto a partir de `number` ou `Decimal`.
 * Devolve o total a débito (que é o `valorTotal` do lançamento).
 * Partilhado por criar e editar um rascunho (#137, I2) e pelo encerramento (#138).
 */
function totalDasPartidasEquilibradas(
  partidas: ReadonlyArray<{ tipo: 'DEBITO' | 'CREDITO'; valor: number | Prisma.Decimal }>,
): Prisma.Decimal {
  let totalDebito = new Prisma.Decimal(0);
  let totalCredito = new Prisma.Decimal(0);
  for (const p of partidas) {
    const v = new Prisma.Decimal(p.valor.toFixed(2));
    if (p.tipo === 'DEBITO') totalDebito = totalDebito.plus(v);
    else totalCredito = totalCredito.plus(v);
  }
  if (!totalDebito.equals(totalCredito)) {
    throw new BusinessRuleError(
      'PARTIDAS_DESEQUILIBRADAS',
      `Débitos (${totalDebito}) ≠ Créditos (${totalCredito})`,
    );
  }
  return totalDebito;
}

/** A conta existe no tenant e é de movimento (folha). Partilhado por criar e editar. */
async function exigirContaDeMovimento(
  tx: Prisma.TransactionClient,
  contaId: string,
  tenantId: string,
): Promise<void> {
  const conta = await tx.contaPGC.findFirst({
    where: { id: contaId, tenantId },
    select: { aceitaLancamento: true },
  });
  if (!conta) throw new NotFoundError(`Conta ${contaId} não encontrada`);
  if (!conta.aceitaLancamento) {
    throw new BusinessRuleError('CONTA_NAO_ACEITA_LANCAMENTO', `Conta ${contaId} não aceita lançamentos`);
  }
}

/**
 * Tranca (`FOR UPDATE`) a linha do lançamento no tenant e exige que seja
 * RASCUNHO (#137, I1). O estado decide-se pela linha TRANCADA — uma leitura
 * anterior à tranca deixaria passar uma confirmação concorrente.
 */
async function trancarRascunho(
  tx: Prisma.TransactionClient,
  id: string,
  tenantId: string,
): Promise<{ id: string; status: StatusLancamento; periodoId: string }> {
  const [linha] = await tx.$queryRaw<Array<{ id: string; status: StatusLancamento; periodoId: string }>>`
    SELECT id, status, "periodoId" FROM "Lancamento"
    WHERE id = ${id} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (!linha) throw new NotFoundError('Lançamento não encontrado');
  if (linha.status !== 'RASCUNHO') {
    throw new BusinessRuleError(
      'LANCAMENTO_NAO_RASCUNHO',
      'Só um lançamento em rascunho se edita ou anula. Um lançamento confirmado corrige-se por estorno.',
    );
  }
  return linha;
}

/** Tranca o período (`FOR SHARE`, ADR-0033 §5) e exige que esteja ABERTO. */
async function trancarPeriodoAberto(
  tx: Prisma.TransactionClient,
  periodoId: string,
  tenantId: string,
): Promise<{ id: string; codigo: string; estado: string }> {
  const [periodo] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string }>>`
    SELECT id, codigo, estado FROM "PeriodoContabil"
    WHERE id = ${periodoId} AND "tenantId" = ${tenantId}
    FOR SHARE
  `;
  if (!periodo) throw new NotFoundError('Período contabilístico não encontrado');
  if (periodo.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodo.codigo} está fechado`);
  }
  return periodo;
}

// ---------------------------------------------------------------------------
// Plano de contas
// ---------------------------------------------------------------------------

/** Tecto da subida na hierarquia: o PGC vai ao nível 7; folga para dados antigos. */
const PROFUNDIDADE_MAXIMA_PLANO = 32;

/**
 * A mãe tem de existir no tenant (senão 404, mesmo que exista noutro) e, ao
 * actualizar, não pode ser a própria conta nem um descendente dela (#347).
 * Corrida tolerada: dois saves simultâneos podem fechar um ciclo entre a validação e a escrita (o `maesEfectivas` do balancete quebra ciclos).
 */
async function validarContaMae(contaMaeId: string, ctx: Ctx, contaId?: string): Promise<void> {
  if (contaId && contaMaeId === contaId) {
    throw new BusinessRuleError('CONTA_MAE_PROPRIA', 'Uma conta não pode ser mãe de si própria');
  }
  let atual: string | null = contaMaeId;
  for (let i = 0; atual && i < PROFUNDIDADE_MAXIMA_PLANO; i++) {
    const conta: { contaMaeId: string | null } | null = await prisma.contaPGC.findFirst({
      where: { id: atual, tenantId: ctx.tenantId },
      select: { contaMaeId: true },
    });
    if (!conta) {
      if (i === 0) throw new NotFoundError(MSG_CONTA_MAE_NAO_ENCONTRADA);
      return; // cadeia partida acima da mãe: não há ciclo com esta conta
    }
    if (contaId && conta.contaMaeId === contaId) {
      throw new BusinessRuleError(
        'CONTA_MAE_CICLO',
        'A conta mãe escolhida é descendente desta conta — criaria um ciclo na hierarquia',
      );
    }
    atual = conta.contaMaeId;
  }
}

export async function criarConta(input: CriarContaPGCInput, ctx: Ctx): Promise<ContaPGC> {
  const existente = await prisma.contaPGC.findFirst({
    where: { codigo: input.codigo, tenantId: ctx.tenantId },
  });
  if (existente) {
    throw new BusinessRuleError('CONTA_DUPLICADA', `Conta "${input.codigo}" já existe`);
  }
  if (input.contaMaeId) await validarContaMae(input.contaMaeId, ctx);
  return prisma.contaPGC.create({
    data: { tenantId: ctx.tenantId, ...input },
  }) as unknown as ContaPGC;
}

/**
 * Campos que deixam de poder mudar assim que a conta tem movimento.
 *
 * Renumerar ou reclassificar uma conta com lançamentos reescreve o significado
 * de documentos já emitidos: o balancete e o razão do ano passado passariam a
 * dizer outra coisa. O nome e a descrição são rótulo — esses mudam sempre.
 */
const CAMPOS_TRANCADOS = ['codigo', 'classe', 'natureza', 'nivel', 'tipo', 'contaMaeId'] as const;

export async function atualizarConta(input: AtualizarContaPGCInput, ctx: Ctx): Promise<ContaPGC> {
  const { id, ...data } = input;
  const conta = await prisma.contaPGC.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!conta) throw new NotFoundError('Conta não encontrada');

  const alteraTrancado = CAMPOS_TRANCADOS.filter(
    (campo) => data[campo] !== undefined && data[campo] !== conta[campo],
  );

  if (alteraTrancado.length > 0) {
    const comUso = await prisma.partidaLancamento.count({
      where: { contaId: id, tenantId: ctx.tenantId },
    });
    if (comUso > 0) {
      throw new BusinessRuleError(
        'CONTA_COM_LANCAMENTOS',
        `Esta conta já tem ${comUso} movimento(s): ${alteraTrancado.join(', ')} não pode(m) ser alterado(s). Crie uma conta nova e desactive esta.`,
      );
    }
  }

  // Depois da tranca: uma conta com movimentos ouve «tem movimentos», não «ciclo»/404.
  if (data.contaMaeId) await validarContaMae(data.contaMaeId, ctx, id);

  return prisma.contaPGC.update({ where: { id }, data }) as unknown as ContaPGC;
}

export async function desativarConta(id: string, ctx: Ctx): Promise<ContaPGC> {
  const conta = await prisma.contaPGC.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!conta) throw new NotFoundError('Conta não encontrada');
  const comUso = await prisma.partidaLancamento.count({ where: { contaId: id, tenantId: ctx.tenantId } });
  if (comUso > 0) {
    throw new BusinessRuleError('CONTA_COM_LANCAMENTOS', 'Conta tem lançamentos — não pode ser desativada');
  }
  return prisma.contaPGC.update({ where: { id }, data: { ativo: false } }) as unknown as ContaPGC;
}

export async function obterConta(id: string, ctx: Ctx): Promise<ContaPGC | null> {
  return prisma.contaPGC.findFirst({ where: { id, tenantId: ctx.tenantId } }) as unknown as ContaPGC | null;
}

/**
 * A conta com o que a torna legível numa página de detalhe: onde está na
 * hierarquia e quanto movimento tem.
 *
 * O saldo é agregado em SQL (mesmo motivo do `gerarBalancete`): trazer as
 * partidas todas para memória só para as somar é o defeito que já se corrigiu
 * uma vez aqui.
 */
export async function obterContaDetalhe(
  id: string,
  intervalo: { dataInicio: Date; dataFim: Date },
  ctx: Ctx,
): Promise<ContaDetalhe | null> {
  const conta = await prisma.contaPGC.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      contaMae: { select: { id: true, codigo: true, nome: true } },
      subContas: {
        select: { id: true, codigo: true, nome: true, nivel: true, ativo: true },
        orderBy: { codigo: 'asc' },
      },
    },
  });
  if (!conta) return null;

  const agregados = await prisma.partidaLancamento.groupBy({
    by: ['tipo'],
    where: {
      tenantId: ctx.tenantId,
      contaId: id,
      lancamento: {
        data: { gte: intervalo.dataInicio, lte: intervalo.dataFim },
        status: FILTRO_LANCAMENTO_MAPA,
        ...SEM_ABERTURA_REAFIRMADA,
      },
    },
    _sum: { valor: true },
    _count: { _all: true },
  });

  const soma = (lado: 'DEBITO' | 'CREDITO') =>
    agregados.find((a) => a.tipo === lado)?._sum.valor ?? new Prisma.Decimal(0);

  const debitos = soma('DEBITO');
  const creditos = soma('CREDITO');
  const movimentos = agregados.reduce((acc, a) => acc + a._count._all, 0);

  // O sinal do saldo é a natureza da conta, não o lado com mais valor.
  const saldo =
    conta.natureza === 'DEVEDORA' ? debitos.minus(creditos) : creditos.minus(debitos);

  // Contagem sem janela: é o que decide se os campos estruturais estão
  // trancados, e isso não depende do exercício que se está a ver.
  const movimentosTotais = await prisma.partidaLancamento.count({
    where: { contaId: id, tenantId: ctx.tenantId },
  });

  return {
    conta: conta as unknown as ContaPGC,
    contaMae: conta.contaMae,
    subContas: conta.subContas,
    debitos,
    creditos,
    saldo,
    movimentos,
    movimentosTotais,
  };
}

/**
 * Ids de todas as descendentes de `contaId` no tenant (filhas, netas, …), sem a
 * própria conta. `UNION` (não `UNION ALL`) faz a CTE terminar sobre ciclos já
 * gravados; `tenantId` nos dois ramos impede atravessar para outro tenant (#296).
 */
export async function idsDescendentes(contaId: string, ctx: Ctx): Promise<string[]> {
  const linhas = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH RECURSIVE descendentes(id) AS (
      SELECT id FROM "ContaPGC" WHERE "contaMaeId" = ${contaId} AND "tenantId" = ${ctx.tenantId}
      UNION
      SELECT c.id FROM "ContaPGC" c
        JOIN descendentes d ON c."contaMaeId" = d.id
       WHERE c."tenantId" = ${ctx.tenantId}
    )
    SELECT id FROM descendentes WHERE id <> ${contaId}
  `;
  return linhas.map((l) => l.id);
}

export async function listarContas(
  filtro: FiltroContaPGCInput,
  ctx: Ctx,
  opcoes: { excluirIds?: string[] } = {},
): Promise<PaginacaoContabilidade<ContaPGC>> {
  return paginate(
    (a) =>
      prisma.contaPGC.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(opcoes.excluirIds?.length ? { id: { notIn: opcoes.excluirIds } } : {}),
          ...(filtro.classe ? { classe: filtro.classe } : {}),
          ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
          ...(filtro.nivel !== undefined ? { nivel: filtro.nivel } : {}),
          ...(filtro.aceitaLancamento !== undefined ? { aceitaLancamento: filtro.aceitaLancamento } : {}),
          ...(filtro.ativo !== undefined ? { ativo: filtro.ativo } : {}),
          ...(filtro.search
            ? { OR: [{ nome: { contains: filtro.search, mode: 'insensitive' } }, { codigo: { contains: filtro.search } }] }
            : {}),
        },
        orderBy: { codigo: 'asc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoContabilidade<ContaPGC>>;
}

/** KPI (#104): número de contas do plano do tenant — o universo de `listarContas` sem filtros. */
export async function contarContas(_filtro: Record<string, never>, ctx: Ctx): Promise<number> {
  return prisma.contaPGC.count({ where: { tenantId: ctx.tenantId } });
}

export async function arvoreContas(ctx: Ctx): Promise<ContaPGC[]> {
  return prisma.contaPGC.findMany({
    where: { tenantId: ctx.tenantId, ativo: true },
    orderBy: { codigo: 'asc' },
  }) as unknown as ContaPGC[];
}

// ---------------------------------------------------------------------------
// Diários
// ---------------------------------------------------------------------------

export async function criarDiario(input: CriarDiarioInput, ctx: Ctx): Promise<Diario> {
  return prisma.diario.create({
    data: { tenantId: ctx.tenantId, ...input },
  }) as unknown as Diario;
}

export async function atualizarDiario(input: AtualizarDiarioInput, ctx: Ctx): Promise<Diario> {
  const { id, ...data } = input;
  const diario = await prisma.diario.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!diario) throw new NotFoundError('Diário não encontrado');
  return prisma.diario.update({ where: { id }, data }) as unknown as Diario;
}

export async function obterDiario(id: string, ctx: Ctx): Promise<Diario | null> {
  return prisma.diario.findFirst({ where: { id, tenantId: ctx.tenantId } }) as unknown as Diario | null;
}

export async function contarLancamentosDoDiario(diarioId: string, ctx: Ctx): Promise<number> {
  return prisma.lancamento.count({ where: { diarioId, tenantId: ctx.tenantId } });
}

export async function listarDiarios(ctx: Ctx): Promise<Diario[]> {
  return prisma.diario.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { codigo: 'asc' },
  }) as unknown as Diario[];
}

// ---------------------------------------------------------------------------
// Centros de custo
// ---------------------------------------------------------------------------

export async function criarCentroCusto(input: CriarCentroCustoInput, ctx: Ctx): Promise<CentroCusto> {
  return prisma.centroCusto.create({
    data: {
      tenantId: ctx.tenantId,
      ...input,
      orcamento: input.orcamento !== undefined ? new Prisma.Decimal(input.orcamento) : undefined,
    },
  }) as unknown as CentroCusto;
}

export async function atualizarCentroCusto(input: AtualizarCentroCustoInput, ctx: Ctx): Promise<CentroCusto> {
  const { id, ...data } = input;
  const cc = await prisma.centroCusto.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!cc) throw new NotFoundError('Centro de custo não encontrado');
  return prisma.centroCusto.update({
    where: { id },
    data: {
      ...data,
      orcamento: data.orcamento !== undefined ? new Prisma.Decimal(data.orcamento) : undefined,
    },
  }) as unknown as CentroCusto;
}

export async function listarCentrosCusto(filtro: FiltroCentroCustoInput, ctx: Ctx): Promise<PaginacaoContabilidade<CentroCusto>> {
  return paginate(
    (a) =>
      prisma.centroCusto.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
          ...(filtro.ativo !== undefined ? { ativo: filtro.ativo } : {}),
        },
        orderBy: { codigo: 'asc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoContabilidade<CentroCusto>>;
}

// ---------------------------------------------------------------------------
// Lançamentos (UI path — partidas com contaId resolvido pelo cliente)
// ---------------------------------------------------------------------------

export async function criarLancamento(input: CriarLancamentoInput, ctx: Ctx): Promise<LancamentoComPartidas> {
  exigirOrigemNaoReservada(input.documentoOrigemTipo);
  return prismaBase.$transaction(async (tx) => {
    const diario = await tx.diario.findFirst({
      where: { id: input.diarioId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!diario) throw new NotFoundError('Diário não encontrado ou inactivo');

    // ADR-0033 §5: resolver período + bloquear com FOR SHARE para impedir fecho concorrente
    const periodoResolvido = await resolverPeriodo(tx, input.data, ctx.tenantId, ctx.userId);
    const [periodoLocked] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string }>>`
      SELECT id, codigo, estado FROM "PeriodoContabil"
      WHERE id = ${periodoResolvido.id} AND "tenantId" = ${ctx.tenantId}
      FOR SHARE
    `;
    if (!periodoLocked) throw new NotFoundError('Período contabilístico não encontrado');
    if (periodoLocked.estado !== 'ABERTO') {
      throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodoLocked.codigo} está fechado`);
    }
    // Na mesma tx: se `resolverPeriodo` criou um exercício, a recusa desfá-lo.
    await exigirDiarioDeLancamentoManual(tx, diario.tipo, periodoLocked.id, ctx.tenantId);

    const numero = await proximoNumeroLancamento(tx, diario.id, periodoLocked.codigo, ctx.tenantId);

    // Invariante débito=crédito (Decimal exacto a partir de number)
    const totalDebito = totalDasPartidasEquilibradas(input.partidas);

    const lancamento = await tx.lancamento.create({
      data: {
        tenantId: ctx.tenantId,
        numero,
        data: input.data,
        tipo: 'MANUAL',
        origem: input.origem ?? 'MANUAL',
        diarioId: diario.id,
        periodoId: periodoLocked.id,
        documentoOrigemId: input.documentoOrigemId ?? null,
        documentoOrigemTipo: input.documentoOrigemTipo ?? null,
        historico: input.historico,
        valorTotal: totalDebito,
        status: 'RASCUNHO',
        periodoFiscal: periodoLocked.codigo, // cópia de periodo.codigo (ADR-0033 §1)
        observacoes: input.observacoes ?? null,
        criadoPorId: ctx.userId,
      },
    });

    for (const p of input.partidas) {
      // Verificar que a conta aceita lançamentos
      await exigirContaDeMovimento(tx, p.contaId, ctx.tenantId);
      await tx.partidaLancamento.create({
        data: {
          tenantId: ctx.tenantId,
          lancamentoId: lancamento.id,
          contaId: p.contaId,
          centroCustoId: p.centroCustoId ?? null,
          tipo: p.tipo,
          valor: new Prisma.Decimal(p.valor.toFixed(2)),
          historico: p.historico ?? null,
        },
      });
    }

    return tx.lancamento.findFirst({
      where: { id: lancamento.id },
      include: {
        partidas: {
          include: {
            conta: { select: { id: true, codigo: true, nome: true, natureza: true } },
            centroCusto: { select: { id: true, codigo: true, nome: true } },
          },
        },
        diario: { select: { id: true, codigo: true, nome: true, tipo: true } },
      },
    }) as unknown as LancamentoComPartidas;
  });
}

/**
 * Origem reservada (#363): `ORIGEM_ABERTURA` identifica a abertura gerada e é o que tira um
 * lançamento dos leitores por datas — só o gerador a escreve.
 */
function exigirOrigemNaoReservada(documentoOrigemTipo: string | null | undefined): void {
  // #364: `ORIGEM_APLICACAO_RESULTADO` idem — é o que tira o lançamento da aplicação (e o seu
  // estorno) do estorno genérico.
  if (documentoOrigemTipo === ORIGEM_ABERTURA || documentoOrigemTipo === ORIGEM_APLICACAO_RESULTADO) {
    throw new BusinessRuleError(
      'DOCUMENTO_ORIGEM_RESERVADO',
      'Esta origem de documento é reservada aos lançamentos gerados pelo encerramento, pela abertura do exercício e pela aplicação do resultado.',
    );
  }
}

/**
 * Diários reservados (ADR-0035, #363) — mesma regra na criação manual e na confirmação de
 * um rascunho: o diário de encerramento só recebe o encerramento; o de abertura, num
 * exercício com anterior, só a abertura gerada no encerramento do anterior (à mão, só no
 * primeiro exercício — saldos iniciais).
 */
async function exigirDiarioDeLancamentoManual(
  db: Prisma.TransactionClient,
  diarioTipo: string,
  periodoId: string,
  tenantId: string,
): Promise<void> {
  if (diarioTipo === 'ENCERRAMENTO') {
    throw new BusinessRuleError(
      'DIARIO_DE_ENCERRAMENTO',
      'O diário de encerramento só recebe os lançamentos gerados pelo encerramento do exercício.',
    );
  }
  if (diarioTipo !== 'ABERTURA') return;
  const comAnterior = await db.exercicioContabil.count({
    where: { tenantId, anteriorId: { not: null }, periodos: { some: { id: periodoId } } },
  });
  if (comAnterior > 0) {
    throw new BusinessRuleError(
      'ABERTURA_AUTOMATICA',
      'A abertura deste exercício é gerada no encerramento do anterior; não se lança à mão.',
    );
  }
}

export async function confirmarLancamento(id: string, ctx: Ctx): Promise<Lancamento> {
  const lancamento = await prisma.lancamento.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { diario: { select: { tipo: true } } },
  });
  if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
  transitarEstado(lancamento.status as StatusLancamento, 'LANCADO');
  await exigirDiarioDeLancamentoManual(prismaBase, lancamento.diario.tipo, lancamento.periodoId, ctx.tenantId);
  return prisma.lancamento.update({ where: { id }, data: { status: 'LANCADO' } }) as unknown as Lancamento;
}

export async function estornarLancamento(input: EstornarLancamentoInput, ctx: Ctx): Promise<Lancamento> {
  return prismaBase.$transaction(async (tx) => {
    await estornarLancamentoEmTx(tx, input, ctx);
    return tx.lancamento.findFirst({
      where: { id: input.lancamentoId, tenantId: ctx.tenantId },
    }) as unknown as Lancamento;
  });
}

/**
 * O estorno dentro de uma transacção alheia (#148: cancelar uma NC estorna o
 * lançamento dela na MESMA transacção). Mesmo comportamento que `estornarLancamento`,
 * incluindo o `FOR SHARE` do período — vive aqui por causa do `gate-periodo`.
 * Devolve o lançamento de ESTORNO criado (o original fica `ESTORNADO`).
 */
export async function estornarLancamentoEmTx(
  tx: Prisma.TransactionClient,
  input: EstornarLancamentoInput,
  ctx: Ctx,
): Promise<Lancamento> {
  const lancamento = await tx.lancamento.findFirst({
    where: { id: input.lancamentoId, tenantId: ctx.tenantId },
    include: { partidas: true, diario: { select: { tipo: true } } },
  });
  if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
  // ADR-0035 §1 (#138): o encerramento desfaz-se só pela reabertura do exercício, que estorna
  // no período 13. Decidido antes de resolver o período de destino — `resolverPeriodo` podia
  // criar o exercício seguinte só para recusar a seguir.
  if (lancamento.diario.tipo === 'ENCERRAMENTO') {
    throw new BusinessRuleError(
      'LANCAMENTO_DE_ENCERRAMENTO',
      'Um lançamento de encerramento só se estorna reabrindo o exercício.',
    );
  }
  // ADR-0035 §6 (#363): a abertura gerada (e o seu estorno) desfaz-se só pela reabertura do
  // exercício anterior, que a estorna no período 1. Também antes de resolver período nenhum.
  if (lancamento.diario.tipo === 'ABERTURA' && (await eAberturaAutomatica(tx, lancamento, ctx.tenantId))) {
    throw new BusinessRuleError(
      'LANCAMENTO_DE_ABERTURA',
      'A abertura do exercício é gerada pelo encerramento do anterior; só se estorna reabrindo o exercício anterior.',
    );
  }
  // ADR-0035 §5 (#364): a aplicação do resultado (e o seu estorno) desfaz-se só pela anulação
  // da aplicação, que estorna no período do original. Antes de resolver período nenhum.
  if (lancamento.documentoOrigemTipo === ORIGEM_APLICACAO_RESULTADO) {
    throw new BusinessRuleError(
      'LANCAMENTO_DE_APLICACAO',
      'O lançamento da aplicação do resultado só se estorna anulando a aplicação, em Contabilidade › Exercícios.',
    );
  }
  transitarEstado(lancamento.status as StatusLancamento, 'ESTORNADO');

  const dataEstorno = input.data ?? new Date();

  // ADR-0033 §5: resolver período do estorno + bloqueio FOR SHARE
  const periodoResolvido = await resolverPeriodo(tx, dataEstorno, ctx.tenantId, ctx.userId);
  const [periodoLocked] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string }>>`
    SELECT id, codigo, estado FROM "PeriodoContabil"
    WHERE id = ${periodoResolvido.id} AND "tenantId" = ${ctx.tenantId}
    FOR SHARE
  `;
  if (!periodoLocked) throw new NotFoundError('Período contabilístico não encontrado');
  if (periodoLocked.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodoLocked.codigo} está fechado`);
  }

  return gravarEstornoEmTx(tx, lancamento, periodoLocked, dataEstorno, input.motivo, ctx);
}

/**
 * Núcleo partilhado dos estornos: o lançamento-espelho (partidas invertidas, `lancamentoEstornoId`)
 * no período já trancado pelo chamador, e o original passa a `ESTORNADO`.
 */
async function gravarEstornoEmTx(
  tx: Prisma.TransactionClient,
  lancamento: Prisma.LancamentoGetPayload<{ include: { partidas: true } }>,
  periodo: { id: string; codigo: string },
  dataEstorno: Date,
  motivo: string | undefined,
  ctx: Ctx,
  /** Origem do estorno; por omissão o próprio original (`'Lancamento'`). */
  origem: { tipo: string; id: string | null } = { tipo: 'Lancamento', id: lancamento.id },
): Promise<Lancamento> {
  const numero = await proximoNumeroLancamento(tx, lancamento.diarioId, periodo.codigo, ctx.tenantId);

  const estorno = await tx.lancamento.create({
    data: {
      tenantId: ctx.tenantId,
      numero,
      data: dataEstorno,
      tipo: 'ESTORNO',
      origem: lancamento.origem,
      diarioId: lancamento.diarioId,
      periodoId: periodo.id,
      documentoOrigemId: origem.id,
      documentoOrigemTipo: origem.tipo,
      historico: `ESTORNO: ${lancamento.historico}`,
      valorTotal: lancamento.valorTotal,
      status: 'LANCADO',
      periodoFiscal: periodo.codigo, // cópia de periodo.codigo (ADR-0033 §1)
      observacoes: motivo,
      criadoPorId: ctx.userId,
      lancamentoEstornoId: lancamento.id,
    },
  });

  for (const p of lancamento.partidas) {
    await tx.partidaLancamento.create({
      data: {
        tenantId: ctx.tenantId,
        lancamentoId: estorno.id,
        contaId: p.contaId,
        centroCustoId: p.centroCustoId,
        tipo: p.tipo === 'DEBITO' ? 'CREDITO' : 'DEBITO',
        valor: p.valor,
        historico: p.historico,
      },
    });
  }

  // #356: transição condicional ao estado lido. Dois estornos concorrentes do mesmo
  // lançamento serializam-se na numeração do diário; o segundo, ao voltar a avaliar o
  // WHERE depois do commit do primeiro, vê count 0 — e a recusa desfaz o estorno duplicado.
  const { count } = await tx.lancamento.updateMany({
    where: { id: lancamento.id, tenantId: ctx.tenantId, status: lancamento.status },
    data: { status: 'ESTORNADO' },
  });
  if (count !== 1) {
    throw new BusinessRuleError(
      'TRANSICAO_INVALIDA',
      'O lançamento já foi estornado ou mudou de estado entretanto.',
    );
  }
  return estorno as unknown as Lancamento;
}

/**
 * Editar um lançamento em RASCUNHO (#137, D2).
 *
 * Muda histórico, observações, partidas e a data — esta só dentro do mesmo
 * período (I3). Número, diário, período e estado nunca mudam (I4). Escreve pelo
 * cliente ESTENDIDO e só com escritas singulares, para o trilho de auditoria
 * (D5): as partidas antigas saem uma a uma e as novas entram uma a uma.
 */
export async function editarLancamentoRascunho(
  input: EditarLancamentoInput,
  ctx: Ctx,
): Promise<LancamentoComPartidas> {
  return prisma.$transaction(async (txEstendido) => {
    // Só o tipo muda: em runtime continua a ser o tx ESTENDIDO (auditoria, D5).
    const tx = txEstendido as unknown as Prisma.TransactionClient;
    const atual = await trancarRascunho(tx, input.id, ctx.tenantId);

    const periodoDaData = await resolverPeriodo(tx, input.data, ctx.tenantId, ctx.userId);
    if (periodoDaData.id !== atual.periodoId) {
      throw new BusinessRuleError(
        'LANCAMENTO_MUDA_PERIODO',
        `A data tem de ficar no período do lançamento; ${periodoDaData.codigo} é outro período. Para mudar de período, anule este rascunho e crie outro.`,
      );
    }
    await trancarPeriodoAberto(tx, atual.periodoId, ctx.tenantId);

    // Validar tudo antes da primeira escrita.
    const valorTotal = totalDasPartidasEquilibradas(input.partidas);
    for (const p of input.partidas) {
      await exigirContaDeMovimento(tx, p.contaId, ctx.tenantId);
    }

    const antigas = await tx.partidaLancamento.findMany({
      where: { tenantId: ctx.tenantId, lancamentoId: atual.id },
      select: { id: true },
    });
    for (const antiga of antigas) {
      await tx.partidaLancamento.delete({ where: { id: antiga.id, tenantId: ctx.tenantId } });
    }
    for (const p of input.partidas) {
      await tx.partidaLancamento.create({
        data: {
          tenantId: ctx.tenantId,
          lancamentoId: atual.id,
          contaId: p.contaId,
          centroCustoId: p.centroCustoId ?? null,
          tipo: p.tipo,
          valor: new Prisma.Decimal(p.valor.toFixed(2)),
          historico: p.historico ?? null,
        },
      });
    }

    await tx.lancamento.update({
      where: { id: atual.id, tenantId: ctx.tenantId },
      data: {
        data: input.data,
        historico: input.historico,
        observacoes: input.observacoes ?? null,
        valorTotal,
      },
    });

    return tx.lancamento.findFirst({
      where: { id: atual.id, tenantId: ctx.tenantId },
      include: {
        partidas: {
          include: {
            conta: { select: { id: true, codigo: true, nome: true, natureza: true } },
            centroCusto: { select: { id: true, codigo: true, nome: true } },
          },
        },
        diario: { select: { id: true, codigo: true, nome: true, tipo: true } },
      },
    }) as unknown as LancamentoComPartidas;
  });
}

/**
 * Anular um lançamento em RASCUNHO (#137, D1/D3): passa a ANULADO com o
 * motivo. A linha e o número ficam — um anulado continua a contar para a
 * numeração do diário no período (I4) e fica fora dos mapas (I5).
 */
export async function anularLancamentoRascunho(
  input: AnularLancamentoInput,
  ctx: Ctx,
): Promise<Lancamento> {
  return prisma.$transaction(async (txEstendido) => {
    const tx = txEstendido as unknown as Prisma.TransactionClient;
    const atual = await trancarRascunho(tx, input.id, ctx.tenantId);
    await trancarPeriodoAberto(tx, atual.periodoId, ctx.tenantId);
    transitarEstado(atual.status, 'ANULADO');

    return tx.lancamento.update({
      where: { id: atual.id, tenantId: ctx.tenantId },
      data: { status: 'ANULADO', motivoAnulacao: input.motivo },
    }) as unknown as Lancamento;
  });
}

export async function obterLancamento(id: string, ctx: Ctx): Promise<LancamentoComPartidas | null> {
  return prisma.lancamento.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      partidas: {
        include: {
          conta: { select: { id: true, codigo: true, nome: true, natureza: true } },
          centroCusto: { select: { id: true, codigo: true, nome: true } },
        },
      },
      diario: { select: { id: true, codigo: true, nome: true, tipo: true } },
    },
  }) as unknown as LancamentoComPartidas | null;
}

/**
 * O lançamento com os dois lados do estorno resolvidos.
 *
 * Atenção ao sentido de `lancamentoEstornoId`: apesar do que o comentário do
 * schema deixa supor, é o **estorno** que aponta para o original, não o
 * contrário. Por isso «quem estornou este?» é uma procura inversa e não uma
 * leitura de campo.
 */
export async function obterLancamentoDetalhe(
  id: string,
  ctx: Ctx,
): Promise<LancamentoDetalhe | null> {
  const lancamento = await obterLancamento(id, ctx);
  if (!lancamento) return null;

  const resumo = { id: true, numero: true, data: true, historico: true, status: true } as const;

  // Este lançamento é um estorno: `lancamentoEstornoId` guarda o original.
  const original = lancamento.lancamentoEstornoId
    ? await prisma.lancamento.findFirst({
        where: { id: lancamento.lancamentoEstornoId, tenantId: ctx.tenantId },
        select: resumo,
      })
    : null;

  // Este lançamento foi estornado: o estorno é quem aponta para cá.
  const estorno =
    lancamento.status === 'ESTORNADO'
      ? await prisma.lancamento.findFirst({
          where: { lancamentoEstornoId: id, tenantId: ctx.tenantId },
          select: resumo,
        })
      : null;

  return { lancamento, original, estorno };
}

export async function listarLancamentos(filtro: FiltroLancamentoInput, ctx: Ctx): Promise<PaginacaoContabilidade<LancamentoComPartidas>> {
  return paginate(
    (a) =>
      prisma.lancamento.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.diarioId ? { diarioId: filtro.diarioId } : {}),
          // D6: os anulados só aparecem quando se pedem pelo filtro de estado.
          status: filtro.status ?? { not: 'ANULADO' },
          ...(filtro.origem ? { origem: filtro.origem } : {}),
          ...(filtro.periodoFiscal ? { periodoFiscal: filtro.periodoFiscal } : {}),
          ...(filtro.dataInicio || filtro.dataFim
            ? { data: { ...(filtro.dataInicio ? { gte: filtro.dataInicio } : {}), ...(filtro.dataFim ? { lte: filtro.dataFim } : {}) } }
            : {}),
        },
        include: {
          partidas: {
            include: {
              conta: { select: { id: true, codigo: true, nome: true, natureza: true } },
              centroCusto: { select: { id: true, codigo: true, nome: true } },
            },
          },
          diario: { select: { id: true, codigo: true, nome: true, tipo: true } },
        },
        orderBy: { data: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoContabilidade<LancamentoComPartidas>>;
}

/**
 * KPI (#104): número de lançamentos do tenant com o mesmo critério de estado de `listarLancamentos`
 * (sem estado pedido, os anulados ficam de fora).
 */
export async function contarLancamentos(
  filtro: { status?: FiltroLancamentoInput['status'] },
  ctx: Ctx,
): Promise<number> {
  return prisma.lancamento.count({
    where: { tenantId: ctx.tenantId, status: filtro.status ?? { not: 'ANULADO' } },
  });
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

/** Uma linha de `groupBy(['contaId','tipo'])` com `_sum.valor`. */
export interface AgregadoPartida {
  contaId: string;
  tipo: TipoPartida;
  _sum: { valor: Prisma.Decimal | null };
}

/**
 * Monta as linhas do balancete a partir de somas já agregadas.
 *
 * Pura de propósito: é aqui que vive a aritmética (que lado soma, que natureza
 * inverte o sinal, que contas se filtram) e é o que um teste consegue cobrir
 * sem base de dados. A consulta fica em `gerarBalancete`.
 */
export function montarLinhasBalancete(
  agregados: AgregadoPartida[],
  contas: Map<string, ContaBalancete['conta']>,
  incluirZeradas: boolean,
  opcoes: {
    /** Somas anteriores a `dataInicio` — dão o saldo anterior (#141). */
    anteriores?: AgregadoPartida[];
    /** Todas as contas de `contas` entram, mesmo sem movimento (com `incluirZeradas`). */
    listarTodas?: boolean;
    /** Código (prefixo) ou nome (contém); filtra linhas, não os totais. */
    search?: string;
  } = {},
): { contas: ContaBalancete[]; totalDebitos: Prisma.Decimal; totalCreditos: Prisma.Decimal } {
  const zero = () => new Prisma.Decimal(0);
  type Soma = { conta: ContaBalancete['conta']; debitos: Prisma.Decimal; creditos: Prisma.Decimal; antD: Prisma.Decimal; antC: Prisma.Decimal };
  const mapa = new Map<string, Soma>();
  const entrada = (contaId: string): Soma | null => {
    const conta = contas.get(contaId);
    // Uma partida cuja conta não existe neste tenant não é somável — e não é
    // silenciável noutro sítio: seria uma fuga cross-tenant a acontecer.
    if (!conta) return null;
    const e = mapa.get(contaId) ?? { conta, debitos: zero(), creditos: zero(), antD: zero(), antC: zero() };
    mapa.set(contaId, e);
    return e;
  };

  for (const a of agregados) {
    const e = entrada(a.contaId);
    if (!e) continue;
    const valor = a._sum.valor ?? zero();
    if (a.tipo === 'DEBITO') e.debitos = e.debitos.plus(valor);
    else e.creditos = e.creditos.plus(valor);
  }
  for (const a of opcoes.anteriores ?? []) {
    const e = entrada(a.contaId);
    if (!e) continue;
    const valor = a._sum.valor ?? zero();
    if (a.tipo === 'DEBITO') e.antD = e.antD.plus(valor);
    else e.antC = e.antC.plus(valor);
  }
  if (opcoes.listarTodas) for (const id of contas.keys()) entrada(id);

  const pelaNatureza = (natureza: string, d: Prisma.Decimal, c: Prisma.Decimal) =>
    natureza === 'DEVEDORA' ? d.minus(c) : c.minus(d);

  let totalDebitos = zero();
  let totalCreditos = zero();

  const linhas = Array.from(mapa.values())
    .map((e) => {
      const saldoAnterior = pelaNatureza(e.conta.natureza, e.antD, e.antC);
      return {
        conta: e.conta,
        saldoAnterior,
        debitos: e.debitos,
        creditos: e.creditos,
        saldoAtual: saldoAnterior.plus(pelaNatureza(e.conta.natureza, e.debitos, e.creditos)),
      };
    })
    .filter((l) => incluirZeradas || !l.debitos.equals(0) || !l.creditos.equals(0) || !l.saldoAnterior.equals(0))
    .map((l) => {
      totalDebitos = totalDebitos.plus(l.debitos);
      totalCreditos = totalCreditos.plus(l.creditos);
      return l;
    })
    .filter((l) => {
      const q = opcoes.search?.trim().toLowerCase();
      return !q || l.conta.codigo.toLowerCase().startsWith(q) || l.conta.nome.toLowerCase().includes(q);
    })
    .sort((a, b) => a.conta.codigo.localeCompare(b.conta.codigo));

  return { contas: linhas, totalDebitos, totalCreditos };
}

/**
 * Balancete de verificação do período.
 *
 * A agregação é feita em **SQL** (defeito D3, ADR-0018 §6). A versão anterior
 * trazia todas as partidas do período com `findMany` e somava-as num `Map` em
 * JavaScript: ~6 s de base de dados mais a hidratação de um `Prisma.Decimal`
 * por linha. Com 250 000 partidas e o limite de memória da pilha de referência
 * (768 MB por instância, ou seja ~384 MB de *old space*), isso não era lento —
 * **esgotava a heap e matava o processo** com 15 utilizadores concorrentes.
 * O `groupBy` devolve uma linha por (conta, lado): dezenas, não centenas de
 * milhares.
 */
export async function gerarBalancete(filtro: FiltroBalanceteInput, ctx: Ctx): Promise<Balancete> {
  const somas = (data: Prisma.DateTimeFilter) =>
    prisma.partidaLancamento.groupBy({
      by: ['contaId', 'tipo'],
      where: { tenantId: ctx.tenantId, lancamento: { data, status: FILTRO_LANCAMENTO_MAPA, ...FORA_DE_FECHO_E_ABERTURA } },
      _sum: { valor: true },
    });
  // #141: o saldo anterior (só quando pedido) é tudo o que foi lançado antes do início.
  const [agregados, anteriores] = await Promise.all([
    somas({ gte: filtro.dataInicio, lte: filtro.dataFim }),
    filtro.comSaldoAnterior ? somas({ lt: filtro.dataInicio }) : Promise.resolve([]),
  ]);

  // Com «Incluir zeradas» entram todas as contas movimentáveis; sem, só as que
  // têm movimento no período ou saldo anterior.
  const contas = await prisma.contaPGC.findMany({
    where: filtro.incluirZeradas
      ? { tenantId: ctx.tenantId, aceitaLancamento: true }
      : { tenantId: ctx.tenantId, id: { in: [...new Set([...agregados, ...anteriores].map((a) => a.contaId))] } },
    select: { id: true, codigo: true, nome: true, tipo: true, natureza: true },
  });

  const { contas: linhas, totalDebitos, totalCreditos } = montarLinhasBalancete(
    agregados,
    new Map(contas.map((c) => [c.id, c])),
    filtro.incluirZeradas,
    { anteriores, listarTodas: filtro.incluirZeradas, search: filtro.search },
  );

  return { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim, contas: linhas, totalDebitos, totalCreditos };
}


// ---------------------------------------------------------------------------
// Helper: verifica se o exercício tem lançamentos no diário ABERTURA
// ---------------------------------------------------------------------------

/**
 * True se o exercício tiver um lançamento de abertura EFECTIVO (#363): `LANCADO` no diário
 * de tipo ABERTURA, que não foi estornado (o original passa a `ESTORNADO`) nem é ele próprio
 * um estorno (`lancamentoEstornoId`). Um AB estornado deixa o exercício sem abertura e a
 * abertura implícita volta. Partilhado por `razaoConta` e `gerarBalanceteVerificacao`.
 */
async function exercicioTemDiarioAbertura(
  exercicioId: string,
  tenantId: string,
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  const where: Prisma.LancamentoWhereInput = {
    tenantId,
    status: 'LANCADO',
    lancamentoEstornoId: null,
    diario: { tipo: 'ABERTURA' },
    periodo: { exercicioId },
  };
  const count = tx ? await tx.lancamento.count({ where }) : await prisma.lancamento.count({ where });
  return count > 0;
}

// ---------------------------------------------------------------------------
// Razão de conta — modo por datas e modo por períodos (ADR-0040 §7, issue #297)
// ---------------------------------------------------------------------------

type AgregadoTipoValor = Array<{ tipo: string; _sum: { valor: Prisma.Decimal | null } }> | undefined | null;

/**
 * Soma partidas por tipo, devolvendo os débitos e créditos brutos.
 * Defensivo: aceita `undefined`/`null` (Prisma groupBy devolve `[]` em produção,
 * mas um duplo sem return value devolve `undefined`).
 * Partilhado por `calcularSaldoSignado` e `razaoConta`.
 */
function somarAgregados(agregados: AgregadoTipoValor): { debito: Prisma.Decimal; credito: Prisma.Decimal } {
  const zero = new Prisma.Decimal(0);
  let debito = zero;
  let credito = zero;
  for (const a of agregados ?? []) {
    const v = a._sum.valor ?? zero;
    if (a.tipo === 'DEBITO') debito = debito.plus(v);
    else credito = credito.plus(v);
  }
  return { debito, credito };
}

/**
 * Calcula o saldo assinado pela natureza a partir de um array de agregados
 * `{ tipo, _sum: { valor } }`. Resultado: DEVEDORA → D−C; CREDORA → C−D.
 */
function calcularSaldoSignado(agregados: AgregadoTipoValor, natureza: 'DEVEDORA' | 'CREDORA'): Prisma.Decimal {
  const { debito, credito } = somarAgregados(agregados);
  return natureza === 'DEVEDORA' ? debito.minus(credito) : credito.minus(debito);
}

/**
 * Constrói as linhas do razão a partir de partidas ordenadas, computando
 * `saldoAcumulado` como corrida a partir de `saldoAnterior`.
 */
function construirLinhasRazao(
  partidas: Array<{
    id: string;
    lancamentoId: string;
    tipo: string;
    valor: Prisma.Decimal;
    historico: string | null;
    lancamento: { id: string; data: Date; historico: string; origem: string };
  }>,
  natureza: 'DEVEDORA' | 'CREDORA',
  saldoAnterior: Prisma.Decimal,
): LinhaRazao[] {
  const sinal = natureza === 'DEVEDORA' ? 1 : -1;
  let saldo = saldoAnterior;
  return partidas.map((p) => {
    const d = p.tipo === 'DEBITO' ? p.valor : null;
    const c = p.tipo === 'CREDITO' ? p.valor : null;
    const delta = (d ?? new Prisma.Decimal(0)).minus(c ?? new Prisma.Decimal(0));
    saldo = saldo.plus(delta.times(sinal));
    return {
      lancamentoId: p.lancamentoId,
      data: p.lancamento.data,
      historico: p.historico ?? p.lancamento.historico,
      debito: d,
      credito: c,
      saldoAcumulado: saldo,
      origem: p.lancamento.origem as LinhaRazao['origem'],
    };
  });
}

// take e cursor são ignorados: o serviço devolve sempre as linhas completas (decisão G5, #297); paginação por cursor fica para quando a dimensão de uma conta o justificar.
export async function razaoConta(filtro: FiltroRazaoInput, ctx: Ctx): Promise<RazaoConta> {
  const conta = await prisma.contaPGC.findFirst({ where: { id: filtro.contaId, tenantId: ctx.tenantId } });
  if (!conta) throw new NotFoundError('Conta não encontrada');

  // ── Modo por datas ─────────────────────────────────────────────────────────
  if (!('exercicioId' in filtro)) {
    const movWhere = {
      tenantId: ctx.tenantId,
      contaId: filtro.contaId,
      lancamento: {
        data: { gte: filtro.dataInicio, lte: filtro.dataFim },
        status: FILTRO_LANCAMENTO_MAPA,
        ...SEM_ABERTURA_REAFIRMADA,
      },
    } satisfies Prisma.PartidaLancamentoWhereInput;

    const [antRaw, totaisRaw, partidas] = await Promise.all([
      // saldoAnterior: tudo com data < dataInicio
      prisma.partidaLancamento.groupBy({
        by: ['tipo'],
        where: {
          tenantId: ctx.tenantId,
          contaId: filtro.contaId,
          lancamento: { status: FILTRO_LANCAMENTO_MAPA, data: { lt: filtro.dataInicio }, ...SEM_ABERTURA_REAFIRMADA },
        },
        _sum: { valor: true },
      }),
      prisma.partidaLancamento.groupBy({
        by: ['tipo'],
        where: movWhere,
        _sum: { valor: true },
      }),
      prisma.partidaLancamento.findMany({
        where: movWhere,
        include: { lancamento: { select: { id: true, data: true, historico: true, origem: true } } },
        orderBy: [{ lancamento: { data: 'asc' } }, { id: 'asc' }],
      }),
    ]);

    const saldoAnterior = calcularSaldoSignado(antRaw, conta.natureza);
    const totais = somarAgregados(totaisRaw);
    const saldoFinal = saldoAnterior.plus(calcularSaldoSignado(totaisRaw, conta.natureza));
    const linhas = construirLinhasRazao(partidas, conta.natureza, saldoAnterior);

    return {
      conta: { id: conta.id, codigo: conta.codigo, nome: conta.nome, natureza: conta.natureza, classe: conta.classe },
      saldoAnterior,
      totais,
      linhas,
      saldoFinal,
      intervalo: { modo: 'DATAS', dataInicio: filtro.dataInicio, dataFim: filtro.dataFim },
    };
  }

  // ── Modo por períodos ──────────────────────────────────────────────────────
  const { exercicioId: exercicioIdFiltro, periodoInicial, periodoFinal, incluir13 } = filtro;

  // Normalização partilhada com gerarBalanceteVerificacao
  const { periodoInicial: effectiveInicial, periodoFinal: effectiveFinal } =
    normalizarIntervaloPeriodos({ periodoInicial, periodoFinal, incluir13 });

  // Resolver exercício (deve pertencer ao tenant — cross-tenant → NotFoundError)
  const exercicio = await prisma.exercicioContabil.findFirst({
    where: { tenantId: ctx.tenantId, id: exercicioIdFiltro },
    select: { id: true, dataInicio: true },
  });
  if (!exercicio) throw new NotFoundError('Exercício contabilístico não encontrado');

  const exercicioId = exercicio.id;

  // Verificar AB só para contas de balanço: classes 6/7 não têm histórico anterior relevante.
  const temAbertura = CLASSES_BALANCO.has(conta.classe)
    ? await exercicioTemDiarioAbertura(exercicioId, ctx.tenantId)
    : true;

  const movWherePeriodos = {
    tenantId: ctx.tenantId,
    contaId: filtro.contaId,
    lancamento: {
      status: FILTRO_LANCAMENTO_MAPA,
      periodo: { exercicioId, ordem: { gte: effectiveInicial, lte: effectiveFinal } },
    },
  } as const;

  // Todas as queries em paralelo
  const [antPeriodosRaw, antHistoricoRaw, totaisRaw, partidas] = await Promise.all([
    // Anterior — Part A: períodos [1..effectiveInicial-1]
    effectiveInicial > 1
      ? prisma.partidaLancamento.groupBy({
          by: ['tipo'],
          where: {
            tenantId: ctx.tenantId,
            contaId: filtro.contaId,
            lancamento: {
              status: FILTRO_LANCAMENTO_MAPA,
              periodo: { exercicioId, ordem: { gte: 1, lte: effectiveInicial - 1 } },
            },
          },
          _sum: { valor: true },
        })
      : Promise.resolve([]),
    // Anterior — Part B: histórico antes do exercício (só sem AB e classes de balanço)
    !temAbertura && CLASSES_BALANCO.has(conta.classe)
      ? prisma.partidaLancamento.groupBy({
          by: ['tipo'],
          where: {
            tenantId: ctx.tenantId,
            contaId: filtro.contaId,
            lancamento: { status: FILTRO_LANCAMENTO_MAPA, data: { lt: exercicio.dataInicio }, ...SEM_ABERTURA_REAFIRMADA },
          },
          _sum: { valor: true },
        })
      : Promise.resolve([]),
    prisma.partidaLancamento.groupBy({
      by: ['tipo'],
      where: movWherePeriodos,
      _sum: { valor: true },
    }),
    prisma.partidaLancamento.findMany({
      where: movWherePeriodos,
      include: { lancamento: { select: { id: true, data: true, historico: true, origem: true } } },
      orderBy: [
        { lancamento: { periodo: { ordem: 'asc' } } },
        { lancamento: { data: 'asc' } },
        { id: 'asc' },
      ],
    }),
  ]);

  const saldoAnterior = calcularSaldoSignado(
    [...(antPeriodosRaw ?? []), ...(antHistoricoRaw ?? [])],
    conta.natureza,
  );

  const totais = somarAgregados(totaisRaw);
  const saldoFinal = saldoAnterior.plus(calcularSaldoSignado(totaisRaw, conta.natureza));
  const linhas = construirLinhasRazao(partidas, conta.natureza, saldoAnterior);

  return {
    conta: { id: conta.id, codigo: conta.codigo, nome: conta.nome, natureza: conta.natureza, classe: conta.classe },
    saldoAnterior,
    totais,
    linhas,
    saldoFinal,
    intervalo: {
      modo: 'PERIODOS',
      exercicioId,
      periodoInicial: effectiveInicial,
      periodoFinal: effectiveFinal,
      incluir13,
    },
  };
}

/**
 * Tipo mínimo de conta necessário para o cálculo da DRE.
 * Idêntico ao que `gerarDRE` obtém por `select: { id, codigo, natureza }`.
 */
export type ContaParaDRE = { id: string; codigo: string; natureza: 'DEVEDORA' | 'CREDORA' };

/**
 * Cálculo puro das linhas da DRE a partir de agregados pré-calculados.
 *
 * Separado de `gerarDRE` pelo mesmo motivo que `montarLinhasBalancete` existe:
 * a consulta e a aritmética têm responsabilidades diferentes, e a aritmética
 * tem de ser testável sem base de dados.
 *
 * Correcções aplicadas (achado C do ADR-0033):
 *
 * 1. Prefixos sem pontos — os 504 códigos PGC do seed não têm pontos
 *    (`611`, `6112`, …). `'6.1'.startsWith('6.1')` não coincidia com nenhum
 *    código real; apenas `saldoPrefixo('7')` acertava. Corrigido para `'61'`,
 *    `'62'`, etc.
 *
 * 2. Duplo cômputo em classe 78 — após a correcção dos prefixos,
 *    `saldoPrefixo('7')` passa a incluir a classe 78 E
 *    `saldoPrefixo('78')` também devolve valor. Para evitar que o rendimento
 *    financeiro entre duas vezes (uma em receitaBruta, outra em
 *    receitasFinanceiras/resultadoFinanceiro), `receitaBruta` é calculada
 *    como `saldo('7') − saldo('78')`, ficando só com as receitas operacionais.
 *
 * 3. O `.abs()` que aqui existia foi removido. Devolvia sempre magnitudes
 *    positivas, o que era inócuo enquanto as linhas de gasto davam zero. Deixou
 *    de o ser: `estornarLancamento` aceita `input.data`, logo um estorno pode
 *    cair noutro período, e nesse período a conta de gasto tem só o crédito —
 *    o saldo é negativo e o `.abs()` apresentava-o como gasto positivo, errando
 *    por duas vezes o valor. A `natureza` já assina o saldo; a página apresenta
 *    negativos entre parênteses (`DreRow`, `dre/page.tsx`).
 */
export function calcularLinhasDRE(
  agregados: AgregadoPartida[],
  contas: Map<string, ContaParaDRE>,
): Omit<DRE, 'dataInicio' | 'dataFim' | 'centroCustoId'> {
  function saldoPrefixo(prefixo: string): Prisma.Decimal {
    let s = new Prisma.Decimal(0);
    for (const a of agregados) {
      const conta = contas.get(a.contaId);
      if (!conta || !conta.codigo.startsWith(prefixo)) continue;
      const valor = a._sum.valor ?? new Prisma.Decimal(0);
      const isDevedora = conta.natureza === 'DEVEDORA';
      if (a.tipo === 'DEBITO') s = isDevedora ? s.plus(valor) : s.minus(valor);
      else s = isDevedora ? s.minus(valor) : s.plus(valor);
    }
    // Sem .abs(): a `natureza` já assina o saldo. Um saldo negativo num período
    // indica uma reversão (p.ex. estorno cross-período que deixa só o crédito
    // numa conta DEVEDORA) — a DRE deve reflecti-lo tal qual, e a página
    // apresenta negativos entre parênteses em vermelho (DreRow, dre/page.tsx).
    return s;
  }

  // Receitas operacionais = classe 7 excluindo 78 (financeiras).
  // Calcula-se receitasFinanceiras primeiro para poder subtrair de saldo('7').
  const receitasFinanceiras = saldoPrefixo('78'); // classe 78 = Rendimentos e ganhos financeiros
  const receitaBruta = saldoPrefixo('7').minus(receitasFinanceiras);
  const deducoes = new Prisma.Decimal(0);
  const receitaLiquida = receitaBruta.minus(deducoes);
  const custoProdutosVendidos = saldoPrefixo('61'); // classe 61 = Custo dos inventários vendidos
  const lucroBruto = receitaLiquida.minus(custoProdutosVendidos);
  const despesasVendas = saldoPrefixo('62');         // classe 62 = Gastos com o pessoal (PGC-NIRF)
  const despesasAdministrativas = saldoPrefixo('63'); // classe 63 = Fornecimentos e serviços de terceiros (PGC-NIRF)
  // classe 64 = Perdas por imparidade · 65 = Amortizações e depreciações
  // classe 66 = Provisões · 67 = Justo valor e outros ajustamentos
  // classe 68 = Outros gastos e perdas operacionais (PGC-NIRF) — operacional, não financeiro
  const despesasGerais = saldoPrefixo('64').plus(saldoPrefixo('65')).plus(saldoPrefixo('66'))
    .plus(saldoPrefixo('67')).plus(saldoPrefixo('68'));
  const totalDespesasOperacionais = despesasVendas.plus(despesasAdministrativas).plus(despesasGerais);
  const lucroOperacional = lucroBruto.minus(totalDespesasOperacionais);
  const despesasFinanceiras = saldoPrefixo('69'); // classe 69 = Gastos e perdas financeiros (PGC-NIRF)
  const resultadoFinanceiro = receitasFinanceiras.minus(despesasFinanceiras);
  const lucroAntesImpostos = lucroOperacional.plus(resultadoFinanceiro);
  // Classe 85 (851 Imposto corrente, 852 Imposto diferido) deixada a zero
  // até ao ADR-0035 §4: (1) nenhum fluxo escreve a classe 8 actualmente;
  // (2) a conta 851 tem natureza CREDORA no seed, o que faria um débito de
  // imposto sair negativo — a lógica de sinal tem de ser decidida em conjunto
  // com a implementação do ADR-0035. Pré-requisito: linha 823 deste ficheiro.
  const impostos = new Prisma.Decimal(0);
  const lucroLiquido = lucroAntesImpostos.minus(impostos);

  return {
    receitaBruta, deducoes, receitaLiquida,
    custoProdutosVendidos, lucroBruto,
    despesasVendas, despesasAdministrativas, despesasGerais, totalDespesasOperacionais,
    lucroOperacional, receitasFinanceiras, despesasFinanceiras, resultadoFinanceiro,
    lucroAntesImpostos, impostos, lucroLiquido,
  };
}

/**
 * Demonstração de resultados do período.
 *
 * Agregação em SQL pelo mesmo motivo do `gerarBalancete` (defeito D3): a versão
 * anterior trazia todas as partidas do período para memória. O agrupamento por
 * (conta, lado) não altera a aritmética — a soma é associativa e o sinal
 * depende só do `tipo` (que está na chave de agrupamento) e da `natureza` da
 * conta (que é constante por conta).
 *
 * A lógica de cálculo foi extraída para `calcularLinhasDRE` (testável sem DB).
 */
export async function gerarDRE(filtro: FiltroDREInput, ctx: Ctx): Promise<DRE> {
  const agregados = await prisma.partidaLancamento.groupBy({
    by: ['contaId', 'tipo'],
    where: {
      tenantId: ctx.tenantId,
      ...(filtro.centroCustoId ? { centroCustoId: filtro.centroCustoId } : {}),
      lancamento: {
        data: { gte: filtro.dataInicio, lte: filtro.dataFim },
        status: FILTRO_LANCAMENTO_MAPA,
        ...FORA_DE_FECHO_E_ABERTURA,
      },
    },
    _sum: { valor: true },
  });

  const contas = await prisma.contaPGC.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...new Set(agregados.map((a) => a.contaId))] } },
    select: { id: true, codigo: true, natureza: true },
  });
  const porId = new Map(contas.map((c) => [c.id, c as ContaParaDRE]));

  return {
    dataInicio: filtro.dataInicio,
    dataFim: filtro.dataFim,
    centroCustoId: filtro.centroCustoId,
    ...calcularLinhasDRE(agregados, porId),
  };
}

// ---------------------------------------------------------------------------
// Banca
// ---------------------------------------------------------------------------

/** Valida que a conta PGC existe no tenant, é folha (aceitaLancamento) e da classe 1. */
async function validarContaContabilBancaria(contaContabilId: string, tenantId: string): Promise<void> {
  const contaPGC = await prisma.contaPGC.findFirst({
    where: { id: contaContabilId, tenantId, ativo: true },
    select: { aceitaLancamento: true, classe: true },
  });
  if (!contaPGC) throw new NotFoundError('Conta contabilística não encontrada');
  if (!contaPGC.aceitaLancamento || contaPGC.classe !== 'CLASSE_1') {
    throw new BusinessRuleError(
      'CONTA_CONTABIL_INVALIDA',
      'A conta contabilística deve ser uma conta folha (aceita lançamentos) da classe 1',
    );
  }
}

export async function criarContaBancaria(input: CriarContaBancariaInput, ctx: Ctx): Promise<ContaBancaria> {
  await validarContaContabilBancaria(input.contaContabilId, ctx.tenantId);
  const existente = await prisma.contaBancaria.findFirst({
    where: { tenantId: ctx.tenantId, banco: input.banco, numeroConta: input.numeroConta },
    select: { id: true },
  });
  if (existente) {
    throw new BusinessRuleError(
      'CONTA_BANCARIA_DUPLICADA',
      `Já existe a conta ${input.numeroConta} no banco ${input.banco}`,
    );
  }
  // saldoAtual nunca é editável manualmente — derivado dos movimentos (append-only).
  // Tolerâncias omitidas ficam com a omissão da BD (issue #140).
  const { toleranciaValor, ...resto } = input;
  return prisma.contaBancaria.create({
    data: {
      tenantId: ctx.tenantId,
      ...resto,
      ...(toleranciaValor !== undefined ? { toleranciaValor: new Prisma.Decimal(toleranciaValor) } : {}),
      saldoAtual: new Prisma.Decimal(0),
    },
  }) as unknown as ContaBancaria;
}

export async function atualizarContaBancaria(input: AtualizarContaBancariaInput, ctx: Ctx): Promise<ContaBancaria> {
  const { id, toleranciaValor, ...resto } = input;
  // Só os campos fornecidos: um update parcial não repõe omissões (issue #140).
  const data = {
    ...resto,
    ...(toleranciaValor !== undefined ? { toleranciaValor: new Prisma.Decimal(toleranciaValor) } : {}),
  };
  const cb = await prisma.contaBancaria.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!cb) throw new NotFoundError('Conta bancária não encontrada');
  if (data.contaContabilId && data.contaContabilId !== cb.contaContabilId) {
    await validarContaContabilBancaria(data.contaContabilId, ctx.tenantId);
  }
  // O schema Zod não expõe saldoAtual — permanece derivado (Requisito 1.3)
  return prisma.contaBancaria.update({ where: { id }, data }) as unknown as ContaBancaria;
}

/**
 * Desactivar / reactivar uma conta bancária (#465). Muda SÓ `ativo`: uma conta inactiva sai
 * das listas de escolha e da reconciliação, mas a configuração dos meios POS que a usem fica
 * (o ecrã dos meios assinala `contaBancariaInativa`). Escrita singular pelo cliente estendido
 * para ficar no AuditLog.
 */
export async function definirContaBancariaActiva(id: string, ativo: boolean, ctx: Ctx): Promise<ContaBancaria> {
  const cb = await prisma.contaBancaria.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
  if (!cb) throw new NotFoundError('Conta bancária não encontrada');
  return prisma.contaBancaria.update({ where: { id: cb.id }, data: { ativo } }) as unknown as ContaBancaria;
}

export async function obterContaBancaria(id: string, ctx: Ctx): Promise<ContaBancaria | null> {
  return prisma.contaBancaria.findFirst({
    where: { id, tenantId: ctx.tenantId },
  }) as unknown as ContaBancaria | null;
}

export async function listarContasBancarias(ctx: Ctx): Promise<ContaBancaria[]> {
  return prisma.contaBancaria.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { banco: 'asc' },
  }) as unknown as ContaBancaria[];
}

/**
 * Saldo do razão da conta PGC até `ate` (agregação de partidas de lançamentos
 * LANCADO). Natureza DEVEDORA (classe 1): saldo = Σ débitos − Σ créditos.
 * `exclusivo: true` usa `< ate` (saldo de abertura); por omissão `<= ate`.
 */
export async function saldoContabilAte(
  contaId: string,
  ate: Date,
  ctx: Ctx,
  opts?: { exclusivo?: boolean; tx?: Prisma.TransactionClient },
): Promise<Prisma.Decimal> {
  const db = opts?.tx ?? prismaBase;
  const agg = await db.partidaLancamento.groupBy({
    by: ['tipo'],
    where: {
      tenantId: ctx.tenantId,
      contaId,
      lancamento: {
        status: 'LANCADO',
        data: opts?.exclusivo ? { lt: ate } : { lte: ate },
        ...SEM_ABERTURA_REAFIRMADA,
      },
    },
    _sum: { valor: true },
  });
  const debitos = agg.find((a) => a.tipo === 'DEBITO')?._sum.valor ?? new Prisma.Decimal(0);
  const creditos = agg.find((a) => a.tipo === 'CREDITO')?._sum.valor ?? new Prisma.Decimal(0);
  return debitos.minus(creditos);
}

// ---------------------------------------------------------------------------
// Períodos e Exercícios (ADR-0033 §5, §6, §7)
// ---------------------------------------------------------------------------

/**
 * Abre o exercício contabilístico para um dado ano — cria ExercicioContabil + 13 PeriodoContabil
 * + séries de documento para o tenant do contexto.
 *
 * Idempotente: o @@unique([tenantId, codigo]) e o skipDuplicates garantem que chamar duas vezes
 * para o mesmo ano não duplica nem lança erro.
 *
 * Partilhado entre o cron de Dezembro (disparo automático) e a Server Action
 * `abrirExercicio` (disparo manual, requer `financas:exercicio:abrir`).
 *
 * @returns { seriesCriadas } — número de séries novas criadas (0 se já existiam todas)
 */
export async function abrirExercicio(
  input: AbrirExercicioInput,
  ctx: Ctx,
): Promise<{ ano: number; seriesCriadas: number }> {
  const { ano } = input;

  let seriesCriadas = 0;
  // Criação automática (cron) — o exercício guarda null
  const criadoPorId = ctx.userId === USER_ID_AUTOMATICO ? null : ctx.userId;

  await prismaBase.$transaction(async (tx) => {
    // Cria exercício + 13 períodos; idempotente via @@unique([tenantId, codigo])
    await criarExercicioComPeriodos(tx, ano, ctx.tenantId, criadoPorId, ctx.userId);
    seriesCriadas = await bootstrapSeriesDocumento(tx, ctx.tenantId, ano);
  });

  return { ano, seriesCriadas };
}

export async function listarExercicios(ctx: Ctx): Promise<ExercicioContabil[]> {
  return prisma.exercicioContabil.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { codigo: 'desc' },
  }) as unknown as ExercicioContabil[];
}

export async function listarPeriodos(
  filtro: ListarPeriodosInput,
  ctx: Ctx,
): Promise<PeriodoContabil[]> {
  return prisma.periodoContabil.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filtro.exercicioId ? { exercicioId: filtro.exercicioId } : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    },
    orderBy: [{ codigo: 'desc' }, { ordem: 'asc' }],
  }) as unknown as PeriodoContabil[];
}

/**
 * Fecha um período contabilístico após verificar todas as pré-condições (ADR-0033 §6).
 *
 * Devolve o conjunto de impedimentos de uma só vez (não para à primeira falha)
 * para que o ecrã os mostre todos.
 *
 * Pré-condições implementadas:
 * 1. RASCUNHOS_NO_PERIODO  — nenhum lançamento em RASCUNHO no período
 * 2. SESSAO_CAIXA_ABERTA   — nenhuma sessão de caixa por fechar no período
 * 3. RECONCILIACAO_EM_ANDAMENTO — nenhuma reconciliação bancária em curso
 * 4. DOCUMENTO_SEM_LANCAMENTO  — todo documento fiscal emitido tem lancamentoId
 * 5. BALANCETE_DESEQUILIBRADO  — total débitos === total créditos no período
 * 6. PERIODO_ANTERIOR_ABERTO   — o período anterior está fechado (ordem estrita)
 *
 * 7. IVA_NAO_APURADO — o apuramento do IVA do período está feito (ADR-0034)
 *
 * Período 13 (encerramento): só 1, 5 e 6 — sem operações nem IVA (ADR-0035 §2/§7, #138).
 */
export async function fecharPeriodo(
  input: FecharPeriodoInput,
  ctx: Ctx,
): Promise<ResultadoFechoPeriodo> {
  return prismaBase.$transaction(async (tx) => {
    // Bloquear a linha com FOR UPDATE para impedir leituras concorrentes que tentam escrever
    const [periodo] = await tx.$queryRaw<
      Array<{ id: string; codigo: string; estado: string; exercicioId: string; ordem: number; tenantId: string }>
    >`
      SELECT id, codigo, estado, "exercicioId", ordem, "tenantId"
      FROM "PeriodoContabil"
      WHERE id = ${input.id} AND "tenantId" = ${ctx.tenantId}
      FOR UPDATE
    `;
    if (!periodo) throw new NotFoundError('Período não encontrado');
    if (periodo.estado === 'FECHADO') {
      throw new BusinessRuleError('PERIODO_JA_FECHADO', `Período ${periodo.codigo} já está fechado`);
    }

    // Verificar que o exercício não está encerrado
    const [exercicio] = await tx.$queryRaw<Array<{ estado: string }>>`
      SELECT estado FROM "ExercicioContabil"
      WHERE id = ${periodo.exercicioId} AND "tenantId" = ${ctx.tenantId}
    `;
    if (exercicio?.estado === 'ENCERRADO') {
      throw new BusinessRuleError('EXERCICIO_ENCERRADO', 'Exercício está encerrado');
    }

    const impedimentos: string[] = [];

    // 1. Nenhum lançamento em RASCUNHO no período
    const rascunhos = await tx.lancamento.count({
      where: { tenantId: ctx.tenantId, periodoId: periodo.id, status: 'RASCUNHO' },
    });
    if (rascunhos > 0) impedimentos.push('RASCUNHOS_NO_PERIODO');

    // O período 13 (encerramento) não tem operações nem IVA (ADR-0035 §2/§7, #138):
    // o seu instante cai dentro do período 12, que já carregou as verificações por
    // datas e o apuramento. Saltam-se 2, 3, 4 e 7; ficam 1, 5 e 6.
    const encerramento = periodo.ordem === 13;

    if (!encerramento) {
      // 2. Nenhuma sessão de caixa aberta com abertura no período
      // Usa dataAbertura para determinar a que período pertence a sessão
      const [perDb] = await tx.$queryRaw<Array<{ data_inicio: Date; data_fim: Date }>>`
        SELECT "dataInicio" as data_inicio, "dataFim" as data_fim
        FROM "PeriodoContabil" WHERE id = ${periodo.id}
      `;
      if (perDb) {
        const sessoesPorFechar = await tx.sessaoCaixa.count({
          where: {
            tenantId: ctx.tenantId,
            status: 'ABERTA',
            dataAbertura: { gte: perDb.data_inicio, lte: perDb.data_fim },
          },
        });
        if (sessoesPorFechar > 0) impedimentos.push('SESSAO_CAIXA_ABERTA');

        // 3. Nenhum período de reconciliação bancária em curso que se sobreponha (ADR-0038)
        const periodosReconciliacao = await tx.periodoReconciliacao.count({
          where: {
            tenantId: ctx.tenantId,
            estado: { in: ['ABERTO', 'EM_RECONCILIACAO'] },
            dataInicio: { lte: perDb.data_fim },
            dataFim: { gte: perDb.data_inicio },
          },
        });
        if (periodosReconciliacao > 0) impedimentos.push('RECONCILIACAO_EM_ANDAMENTO');
      }

      // 4. Todo documento fiscal emitido (Fatura, NotaCredito, NotaDebito) tem lancamentoId
      const periodoFiltro = perDb ? { gte: perDb.data_inicio, lte: perDb.data_fim } : undefined;
      const [faturasSL, ncSL, ndSL] = await Promise.all([
        tx.fatura.count({
          where: { tenantId: ctx.tenantId, status: { in: ['EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA'] }, lancamentoId: null, dataEmissao: periodoFiltro },
        }),
        tx.notaCredito.count({
          where: { tenantId: ctx.tenantId, status: { in: ['EMITIDA', 'LIQUIDADA'] }, lancamentoId: null, dataEmissao: periodoFiltro },
        }),
        tx.notaDebito.count({
          where: { tenantId: ctx.tenantId, status: { in: ['EMITIDA', 'LIQUIDADA'] }, lancamentoId: null, dataEmissao: periodoFiltro },
        }),
      ]);
      if (faturasSL + ncSL + ndSL > 0) impedimentos.push('DOCUMENTO_SEM_LANCAMENTO');
    }

    // 5. Balancete equilibrado — total débitos === total créditos no período
    const agregados = await tx.partidaLancamento.groupBy({
      by: ['tipo'],
      where: {
        tenantId: ctx.tenantId,
        lancamento: { periodoId: periodo.id, status: FILTRO_LANCAMENTO_MAPA },
      },
      _sum: { valor: true },
    });
    const totalDebitos = agregados.find((a) => a.tipo === 'DEBITO')?._sum.valor ?? new Prisma.Decimal(0);
    const totalCreditos = agregados.find((a) => a.tipo === 'CREDITO')?._sum.valor ?? new Prisma.Decimal(0);
    if (!totalDebitos.equals(totalCreditos)) impedimentos.push('BALANCETE_DESEQUILIBRADO');

    // 6. Período anterior fechado (ordem estrita; período 1 não tem anterior)
    if (periodo.ordem > 1) {
      const [anterior] = await tx.$queryRaw<Array<{ estado: string }>>`
        SELECT estado FROM "PeriodoContabil"
        WHERE "tenantId" = ${ctx.tenantId}
          AND "exercicioId" = ${periodo.exercicioId}
          AND ordem = ${periodo.ordem - 1}
      `;
      if (anterior && anterior.estado !== 'FECHADO') {
        impedimentos.push('PERIODO_ANTERIOR_ABERTO');
      }
    }

    // 7. IVA_NAO_APURADO: apuramento do IVA do período (ADR-0033 §6, ADR-0034)
    if (!encerramento) {
      const ivaApurado = await tx.apuramentoIva.findFirst({
        where: {
          tenantId: ctx.tenantId,
          periodoId: periodo.id,
          estado: { in: ['APURADO', 'DECLARADO'] },
        },
        select: { id: true },
      });
      if (!ivaApurado) impedimentos.push('IVA_NAO_APURADO');
    }

    if (impedimentos.length > 0) {
      return { ok: false, impedimentos };
    }

    // Todos os impedimentos passaram → fechar o período
    const periodoFechado = await tx.periodoContabil.update({
      where: { id: periodo.id },
      data: {
        estado: 'FECHADO',
        fechadoEm: new Date(),
        fechadoPorId: ctx.userId,
      },
    });

    return { ok: true, periodo: periodoFechado as unknown as PeriodoContabil };
  });
}

/**
 * Reabre um período contabilístico, exigindo motivo e gravando ReaberturaPeriodo (ADR-0033 §7).
 * Recusa se o exercício estiver ENCERRADO ou ENCERRADO_PROVISORIO (ADR-0035 §1).
 *
 * Recusa a reabertura se o apuramento do IVA do período já estiver `DECLARADO` à AT (ADR-0033 §7).
 */
export async function reabrirPeriodo(
  input: ReabrirPeriodoInput,
  ctx: Ctx,
): Promise<PeriodoContabil> {
  return prismaBase.$transaction(async (tx) => {
    const [periodo] = await tx.$queryRaw<
      Array<{ id: string; codigo: string; estado: string; exercicioId: string; tenantId: string }>
    >`
      SELECT id, codigo, estado, "exercicioId", "tenantId"
      FROM "PeriodoContabil"
      WHERE id = ${input.id} AND "tenantId" = ${ctx.tenantId}
      FOR UPDATE
    `;
    if (!periodo) throw new NotFoundError('Período não encontrado');
    if (periodo.estado !== 'FECHADO') {
      throw new BusinessRuleError('PERIODO_NAO_FECHADO', `Período ${periodo.codigo} não está fechado`);
    }

    // Lido sem tranca, DEPOIS da tranca do período, e não fica velho (READ COMMITTED, uma
    // fotografia por instrução): a única transição que passa a proibir a reabertura
    // (ABERTO → ENCERRADO_PROVISORIO, `encerrarExercicio`) tranca os treze períodos com
    // `FOR UPDATE` — ou esta transacção esperou por ela e lê aqui o estado já gravado, ou
    // reabre primeiro e o encerramento vê o período ABERTO e recusa. As outras transições
    // (→ ENCERRADO, → ABERTO) ou proíbem dos dois lados ou só aliviam. Trancar o exercício
    // aqui, depois do período, faria ciclo com o encerramento e a reabertura do exercício,
    // que trancam exercício → períodos.
    const [exercicio] = await tx.$queryRaw<Array<{ estado: string }>>`
      SELECT estado FROM "ExercicioContabil"
      WHERE id = ${periodo.exercicioId} AND "tenantId" = ${ctx.tenantId}
    `;
    if (exercicio?.estado === 'ENCERRADO') {
      throw new BusinessRuleError(
        'EXERCICIO_ENCERRADO',
        'Não é possível reabrir um período de um exercício encerrado',
      );
    }
    // ADR-0035 §1: num exercício encerrado provisoriamente os períodos não reabrem um a um —
    // reabre-se o exercício (estorna o encerramento e reabre o período 13).
    if (exercicio?.estado === 'ENCERRADO_PROVISORIO') {
      throw new BusinessRuleError(
        'EXERCICIO_ENCERRADO_PROVISORIO',
        'O exercício está encerrado provisoriamente. Reabra primeiro o exercício para reabrir um período.',
      );
    }

    // Não reabre se o apuramento do IVA do período já estiver declarado à AT (ADR-0033 §7, ADR-0034 §7)
    const ivaDeclarado = await tx.apuramentoIva.findFirst({
      where: {
        tenantId: ctx.tenantId,
        periodoId: periodo.id,
        estado: 'DECLARADO',
      },
      select: { id: true, referenciaEntrega: true },
    });
    if (ivaDeclarado) {
      throw new BusinessRuleError(
        'IVA_JA_DECLARADO',
        `O apuramento do IVA do período ${periodo.codigo} já foi declarado à AT ` +
          `(referência: ${ivaDeclarado.referenciaEntrega ?? 'n/d'}). ` +
          'A correcção deve ser feita por regularização no período seguinte (ADR-0034 §7).',
      );
    }

    // Obter keycloakSub do utilizador para o registo de auditoria
    const utilizador = await tx.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { keycloakSub: true },
    });
    const keycloakSub = utilizador?.keycloakSub ?? ctx.userId;
    const requestId = getRequestContext()?.requestId ?? null;

    // Reabrir + registar (tudo na mesma transacção)
    const periodoAberto = await tx.periodoContabil.update({
      where: { id: periodo.id },
      data: { estado: 'ABERTO', fechadoEm: null, fechadoPorId: null },
    });

    await tx.reaberturaPeriodo.create({
      data: {
        tenantId: ctx.tenantId,
        periodoId: periodo.id,
        motivo: input.motivo,
        reabertoPorId: ctx.userId,
        keycloakSub,
        requestId,
      },
    });

    return periodoAberto as unknown as PeriodoContabil;
  });
}

// ---------------------------------------------------------------------------
// Calendário contabilístico — leitura e actualização (ADR-0033 §3)
// Configuração do automatismo de abertura de exercício e (futuramente) de
// fecho automático de períodos.
// ---------------------------------------------------------------------------

/**
 * Lê as preferências do calendário contabilístico do tenant.
 *
 * Se o tenant ainda não tiver `ConfiguracaoFiscal` (raro em produção, possível
 * em testes), devolve os valores por omissão que o schema define.
 */
export async function obterCalendarioContabilistico(
  ctx: Ctx,
): Promise<CalendarioContabilisticoRow> {
  const cfg = await prismaBase.configuracaoFiscal.findUnique({
    where: { tenantId: ctx.tenantId },
    select: {
      aberturaExercicioAutomatica: true,
      diaAberturaExercicio: true,
      mesAberturaExercicio: true,
      fechoPeriodoAutomatico: true,
      diasAposFimDoMesParaFechoAutomatico: true,
    },
  });
  // Valores por omissão espelham os @default do schema — preservam o comportamento
  // anterior ao campo existir (cron a 1 de Dezembro, automático ligado).
  return {
    aberturaExercicioAutomatica: cfg?.aberturaExercicioAutomatica ?? true,
    diaAberturaExercicio: cfg?.diaAberturaExercicio ?? 1,
    mesAberturaExercicio: cfg?.mesAberturaExercicio ?? 12,
    fechoPeriodoAutomatico: cfg?.fechoPeriodoAutomatico ?? false,
    diasAposFimDoMesParaFechoAutomatico: cfg?.diasAposFimDoMesParaFechoAutomatico ?? 10,
  };
}

/**
 * Actualiza as preferências do calendário contabilístico do tenant.
 *
 * Usa `upsert` com tenantId: um tenant recém-criado pode ainda não ter
 * ConfiguracaoFiscal (é criada pelo bootstrap, mas pode falhar parcialmente em testes).
 *
 * NOTA: `update` não é scoped pela extensão de tenant — filtra por `tenantId`
 * explicitamente (CLAUDE.md, «Multi-tenancy»).
 */
export async function atualizarCalendarioContabilistico(
  input: CalendarioContabilisticoInput,
  ctx: Ctx,
): Promise<CalendarioContabilisticoRow> {
  // Filtra apenas os campos relevantes ao calendário — outros campos de
  // ConfiguracaoFiscal (regimeIva, taxaIvaDefault…) pertencem a outras actions.
  const campos = {
    ...(input.aberturaExercicioAutomatica !== undefined && {
      aberturaExercicioAutomatica: input.aberturaExercicioAutomatica,
    }),
    ...(input.diaAberturaExercicio !== undefined && {
      diaAberturaExercicio: input.diaAberturaExercicio,
    }),
    ...(input.mesAberturaExercicio !== undefined && {
      mesAberturaExercicio: input.mesAberturaExercicio,
    }),
    ...(input.fechoPeriodoAutomatico !== undefined && {
      fechoPeriodoAutomatico: input.fechoPeriodoAutomatico,
    }),
    ...(input.diasAposFimDoMesParaFechoAutomatico !== undefined && {
      diasAposFimDoMesParaFechoAutomatico: input.diasAposFimDoMesParaFechoAutomatico,
    }),
  };

  await prismaBase.configuracaoFiscal.update({
    where: { tenantId: ctx.tenantId },
    data: campos,
  });

  return obterCalendarioContabilistico(ctx);
}

// ---------------------------------------------------------------------------
// Contrato cross-domínio: registarLancamentoContabilistico
// Chamado por WS A, B, C dentro de $transaction.
// ---------------------------------------------------------------------------

export async function registarLancamentoContabilistico(
  tx: Prisma.TransactionClient,
  input: RegistarLancamentoContabilisticoInput,
  ctx: Ctx,
): Promise<Lancamento> {
  exigirOrigemNaoReservada(input.documentoOrigemTipo);
  const diario = await tx.diario.findFirst({
    where: { tipo: input.diarioTipo, tenantId: ctx.tenantId, ativo: true },
  });
  if (!diario) {
    throw new NotFoundError(`Diário do tipo "${input.diarioTipo}" não encontrado`);
  }

  // ADR-0033 §5: resolver período + bloqueio FOR SHARE (mesmo dentro de tx externa)
  const periodoResolvido = await resolverPeriodo(tx, input.data, ctx.tenantId, ctx.userId);
  const [periodoLocked] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string }>>`
    SELECT id, codigo, estado FROM "PeriodoContabil"
    WHERE id = ${periodoResolvido.id} AND "tenantId" = ${ctx.tenantId}
    FOR SHARE
  `;
  if (!periodoLocked) throw new NotFoundError('Período contabilístico não encontrado');
  if (periodoLocked.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodoLocked.codigo} está fechado`);
  }

  const numero = await proximoNumeroLancamento(tx, diario.id, periodoLocked.codigo, ctx.tenantId);

  // Invariante débito=crédito (Decimal exacto)
  let totalDebito = new Prisma.Decimal(0);
  let totalCredito = new Prisma.Decimal(0);
  for (const p of input.partidas) {
    const v = new Prisma.Decimal(String(p.valor));
    if (p.tipo === 'DEBITO') totalDebito = totalDebito.plus(v);
    else totalCredito = totalCredito.plus(v);
  }
  if (!totalDebito.equals(totalCredito)) {
    throw new BusinessRuleError(
      'PARTIDAS_DESEQUILIBRADAS',
      `Débitos (${totalDebito}) ≠ Créditos (${totalCredito})`,
    );
  }

  const lancamento = await tx.lancamento.create({
    data: {
      tenantId: ctx.tenantId,
      numero,
      data: input.data,
      tipo: 'AUTOMATICO',
      origem: input.origem,
      diarioId: diario.id,
      periodoId: periodoLocked.id,
      documentoOrigemId: input.documentoOrigemId,
      documentoOrigemTipo: input.documentoOrigemTipo,
      historico: input.historico,
      valorTotal: totalDebito,
      status: 'LANCADO', // automático → directo para LANCADO
      periodoFiscal: periodoLocked.codigo, // cópia de periodo.codigo (ADR-0033 §1)
      criadoPorId: ctx.userId,
    },
  });

  for (const p of input.partidas) {
    const conta = await resolverContaPorCodigo(tx, p.contaCodigo, ctx.tenantId);
    const ccId = p.centroCustoCodigo
      ? await resolverCentroCustoPorCodigo(tx, p.centroCustoCodigo, ctx.tenantId)
      : null;
    await tx.partidaLancamento.create({
      data: {
        tenantId: ctx.tenantId,
        lancamentoId: lancamento.id,
        contaId: conta.id,
        centroCustoId: ccId,
        tipo: p.tipo,
        valor: new Prisma.Decimal(String(p.valor)),
        historico: p.historico ?? null,
      },
    });
  }

  return lancamento as unknown as Lancamento;
}

/**
 * Grava um lançamento de encerramento (ADR-0035, #138) no período 13, dentro da tx do
 * chamador (`encerramento-exercicio.service`). Vive aqui por causa do `gate-periodo`: só
 * este ficheiro escreve em `Lancamento`/`PartidaLancamento`.
 *
 * Ao contrário de `registarLancamentoContabilistico`, recebe o período por id: o instante
 * do período 13 cai dentro de Dezembro e `resolverPeriodo` devolveria o período 12 — e esse
 * caminho não se alarga. Recusa qualquer período que não seja o 13 ABERTO do tenant, decidido
 * na leitura trancada (`FOR SHARE`).
 */
export async function criarLancamentoEncerramentoEmTx(
  tx: Prisma.TransactionClient,
  input: {
    periodoId: string;
    data: Date;
    historico: string;
    documentoOrigemId?: string;
    documentoOrigemTipo?: string;
    partidas: ReadonlyArray<{ contaId: string; tipo: TipoPartida; valor: Prisma.Decimal }>;
  },
  ctx: Ctx,
): Promise<Lancamento> {
  const [periodo] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string; ordem: number }>>`
    SELECT id, codigo, estado, ordem FROM "PeriodoContabil"
    WHERE id = ${input.periodoId} AND "tenantId" = ${ctx.tenantId}
    FOR SHARE
  `;
  if (!periodo) throw new NotFoundError('Período contabilístico não encontrado');
  if (periodo.ordem !== 13) {
    throw new BusinessRuleError(
      'PERIODO_NAO_E_DE_ENCERRAMENTO',
      `Os lançamentos de encerramento vão para o período 13; ${periodo.codigo} não o é.`,
    );
  }
  if (periodo.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodo.codigo} está fechado`);
  }

  if (input.partidas.length === 0 || input.partidas.some((p) => !p.valor.greaterThan(0))) {
    throw new BusinessRuleError('PARTIDA_VALOR_INVALIDO', 'Cada partida tem de ter valor positivo.');
  }
  const totalDebito = totalDasPartidasEquilibradas(input.partidas);

  const diario = await tx.diario.findFirst({
    where: { tipo: 'ENCERRAMENTO', tenantId: ctx.tenantId, ativo: true },
    select: { id: true },
  });
  if (!diario) throw new NotFoundError('Diário do tipo "ENCERRAMENTO" não encontrado');

  const numero = await proximoNumeroLancamento(tx, diario.id, periodo.codigo, ctx.tenantId);

  const lancamento = await tx.lancamento.create({
    data: {
      tenantId: ctx.tenantId,
      numero,
      data: input.data,
      tipo: 'AUTOMATICO',
      origem: 'AJUSTE',
      diarioId: diario.id,
      periodoId: periodo.id,
      documentoOrigemId: input.documentoOrigemId ?? null,
      documentoOrigemTipo: input.documentoOrigemTipo ?? null,
      historico: input.historico,
      valorTotal: totalDebito,
      status: 'LANCADO',
      periodoFiscal: periodo.codigo, // cópia de periodo.codigo (ADR-0033 §1)
      criadoPorId: ctx.userId,
    },
  });

  for (const p of input.partidas) {
    await exigirContaDeMovimento(tx, p.contaId, ctx.tenantId);
    await tx.partidaLancamento.create({
      data: {
        tenantId: ctx.tenantId,
        lancamentoId: lancamento.id,
        contaId: p.contaId,
        tipo: p.tipo,
        valor: new Prisma.Decimal(p.valor.toFixed(2)),
      },
    });
  }

  return lancamento as unknown as Lancamento;
}

/**
 * Estorna um lançamento de encerramento DENTRO do período 13 (ADR-0035 §1, #138: reabertura do
 * exercício), na tx do chamador. `estornarLancamentoEmTx` resolve o período pela data — a do fim
 * do exercício cai em Dezembro, fechado — por isso aqui o período vem por id: tem de ser o 13 do
 * tenant, ABERTO (leitura trancada `FOR SHARE`), e o lançamento tem de estar nele, LANCADO. O
 * estorno fica com a data do original. Vive aqui por causa do `gate-periodo`.
 */
export async function estornarLancamentoEncerramentoEmTx(
  tx: Prisma.TransactionClient,
  input: { lancamentoId: string; periodoId: string; motivo: string },
  ctx: Ctx,
): Promise<Lancamento> {
  const [periodo] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string; ordem: number }>>`
    SELECT id, codigo, estado, ordem FROM "PeriodoContabil"
    WHERE id = ${input.periodoId} AND "tenantId" = ${ctx.tenantId}
    FOR SHARE
  `;
  if (!periodo) throw new NotFoundError('Período contabilístico não encontrado');
  if (periodo.ordem !== 13) {
    throw new BusinessRuleError(
      'PERIODO_NAO_E_DE_ENCERRAMENTO',
      `Os lançamentos de encerramento estornam-se no período 13; ${periodo.codigo} não o é.`,
    );
  }
  if (periodo.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodo.codigo} está fechado`);
  }

  const lancamento = await tx.lancamento.findFirst({
    where: { id: input.lancamentoId, tenantId: ctx.tenantId },
    include: { partidas: true, diario: { select: { tipo: true } } },
  });
  if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
  if (lancamento.diario.tipo !== 'ENCERRAMENTO') {
    throw new BusinessRuleError(
      'LANCAMENTO_NAO_E_DE_ENCERRAMENTO',
      `O lançamento ${lancamento.numero} não é do diário de encerramento.`,
    );
  }
  if (lancamento.status === 'ESTORNADO') {
    throw new BusinessRuleError(
      'LANCAMENTO_ENCERRAMENTO_JA_ESTORNADO',
      `O lançamento de encerramento ${lancamento.numero} já foi estornado.`,
    );
  }
  if (lancamento.periodoId !== periodo.id) {
    throw new BusinessRuleError(
      'LANCAMENTO_FORA_DO_PERIODO',
      `O lançamento ${lancamento.numero} não pertence ao período ${periodo.codigo}.`,
    );
  }
  transitarEstado(lancamento.status as StatusLancamento, 'ESTORNADO');

  return gravarEstornoEmTx(tx, lancamento, periodo, lancamento.data, input.motivo, ctx);
}

// ---------------------------------------------------------------------------
// Abertura do exercício seguinte (ADR-0035 §6, #363)
// ---------------------------------------------------------------------------

/**
 * A abertura gerada, ou um estorno dela: no diário AB, com origem `ORIGEM_ABERTURA` (o estorno
 * leva a mesma; para dados anteriores a isso segue-se o `lancamentoEstornoId`). Uma abertura
 * manual não é.
 */
async function eAberturaAutomatica(
  tx: Prisma.TransactionClient,
  lancamento: { documentoOrigemTipo: string | null; lancamentoEstornoId: string | null },
  tenantId: string,
): Promise<boolean> {
  if (lancamento.documentoOrigemTipo === ORIGEM_ABERTURA) return true;
  if (!lancamento.lancamentoEstornoId) return false;
  const original = await tx.lancamento.findFirst({
    where: { id: lancamento.lancamentoEstornoId, tenantId },
    select: { documentoOrigemTipo: true },
  });
  return original?.documentoOrigemTipo === ORIGEM_ABERTURA;
}

/**
 * Ids das aberturas EFECTIVAS do exercício geradas a partir de outro (LANCADO, não estornadas,
 * não estorno). `exercicioAnteriorId` restringe à origem; omitido, todas as geradas.
 */
export async function aberturasAutomaticasEfectivasEmTx(
  tx: Prisma.TransactionClient,
  input: { exercicioId: string; exercicioAnteriorId?: string },
  ctx: Ctx,
): Promise<string[]> {
  const linhas = await tx.lancamento.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: 'LANCADO',
      lancamentoEstornoId: null,
      diario: { tipo: 'ABERTURA' },
      periodo: { exercicioId: input.exercicioId },
      documentoOrigemTipo: ORIGEM_ABERTURA,
      ...(input.exercicioAnteriorId ? { documentoOrigemId: input.exercicioAnteriorId } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return linhas.map((l) => l.id);
}

/** «Tem AB» efectivo (ADR-0035, «Decisões de implementação»), na tx do chamador. */
export async function exercicioTemAberturaEfectivaEmTx(
  tx: Prisma.TransactionClient,
  exercicioId: string,
  ctx: Ctx,
): Promise<boolean> {
  return exercicioTemDiarioAbertura(exercicioId, ctx.tenantId, tx);
}

/**
 * Grava a abertura do exercício seguinte (#363) na tx do chamador: diário ABERTURA, período de
 * ordem 1 do exercício seguinte (por id, nunca pela data — `resolverPeriodo` podia criar
 * exercícios), `data` = `dataInicio` desse exercício, LANCADO, origem = o exercício anterior.
 * Recusa um período 1 que não esteja ABERTO, decidido na leitura trancada (`FOR SHARE`). Vive
 * aqui por causa do `gate-periodo`.
 */
export async function criarLancamentoAberturaEmTx(
  tx: Prisma.TransactionClient,
  input: {
    exercicioSeguinteId: string;
    exercicioAnteriorId: string;
    historico: string;
    partidas: ReadonlyArray<{ contaId: string; tipo: TipoPartida; valor: Prisma.Decimal }>;
  },
  ctx: Ctx,
): Promise<Lancamento> {
  const [periodo] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string; dataInicio: Date }>>`
    SELECT p.id, p.codigo, p.estado, e."dataInicio"
    FROM "PeriodoContabil" p
    JOIN "ExercicioContabil" e ON e.id = p."exercicioId"
    WHERE p."exercicioId" = ${input.exercicioSeguinteId} AND p."tenantId" = ${ctx.tenantId}
      AND e."tenantId" = ${ctx.tenantId} AND p.ordem = 1
    FOR SHARE OF p
  `;
  if (!periodo) throw new NotFoundError('Período 1 do exercício seguinte não encontrado');
  if (periodo.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodo.codigo} está fechado`);
  }

  if (input.partidas.length === 0 || input.partidas.some((p) => !p.valor.greaterThan(0))) {
    throw new BusinessRuleError('PARTIDA_VALOR_INVALIDO', 'Cada partida tem de ter valor positivo.');
  }
  const totalDebito = totalDasPartidasEquilibradas(input.partidas);

  const diario = await tx.diario.findFirst({
    where: { tipo: 'ABERTURA', tenantId: ctx.tenantId, ativo: true },
    select: { id: true },
  });
  if (!diario) throw new NotFoundError('Diário do tipo "ABERTURA" não encontrado');

  const numero = await proximoNumeroLancamento(tx, diario.id, periodo.codigo, ctx.tenantId);

  const lancamento = await tx.lancamento.create({
    data: {
      tenantId: ctx.tenantId,
      numero,
      data: periodo.dataInicio,
      tipo: 'AUTOMATICO',
      origem: 'AJUSTE',
      diarioId: diario.id,
      periodoId: periodo.id,
      documentoOrigemId: input.exercicioAnteriorId,
      documentoOrigemTipo: ORIGEM_ABERTURA,
      historico: input.historico,
      valorTotal: totalDebito,
      status: 'LANCADO',
      periodoFiscal: periodo.codigo, // cópia de periodo.codigo (ADR-0033 §1)
      criadoPorId: ctx.userId,
    },
  });

  for (const p of input.partidas) {
    await exigirContaDeMovimento(tx, p.contaId, ctx.tenantId);
    await tx.partidaLancamento.create({
      data: {
        tenantId: ctx.tenantId,
        lancamentoId: lancamento.id,
        contaId: p.contaId,
        tipo: p.tipo,
        valor: new Prisma.Decimal(p.valor.toFixed(2)),
      },
    });
  }

  return lancamento as unknown as Lancamento;
}

/**
 * Estorna a abertura gerada (#363: reabertura do exercício anterior, ou a regeração no
 * re-encerramento) no período DELA — o 1 do exercício seguinte, por id, trancado `FOR SHARE` e
 * ABERTO —, no mesmo diário, com a data do original. Vive aqui por causa do `gate-periodo`.
 */
export async function estornarLancamentoAberturaEmTx(
  tx: Prisma.TransactionClient,
  input: { lancamentoId: string; motivo: string },
  ctx: Ctx,
): Promise<Lancamento> {
  const lancamento = await tx.lancamento.findFirst({
    where: { id: input.lancamentoId, tenantId: ctx.tenantId },
    include: { partidas: true, diario: { select: { tipo: true } } },
  });
  if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
  if (lancamento.diario.tipo !== 'ABERTURA' || lancamento.documentoOrigemTipo !== ORIGEM_ABERTURA) {
    throw new BusinessRuleError(
      'LANCAMENTO_NAO_E_DE_ABERTURA',
      `O lançamento ${lancamento.numero} não é uma abertura gerada.`,
    );
  }
  transitarEstado(lancamento.status as StatusLancamento, 'ESTORNADO');

  const [periodo] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string }>>`
    SELECT id, codigo, estado FROM "PeriodoContabil"
    WHERE id = ${lancamento.periodoId} AND "tenantId" = ${ctx.tenantId}
    FOR SHARE
  `;
  if (!periodo) throw new NotFoundError('Período contabilístico não encontrado');
  if (periodo.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodo.codigo} está fechado`);
  }

  // O estorno leva a origem da abertura (o exercício anterior): é o que o tira dos leitores
  // por datas (`SEM_ABERTURA_REAFIRMADA`) e o liga ao original pelo `lancamentoEstornoId`.
  return gravarEstornoEmTx(tx, lancamento, periodo, lancamento.data, input.motivo, ctx, {
    tipo: ORIGEM_ABERTURA,
    id: lancamento.documentoOrigemId,
  });
}

/**
 * Gera a abertura do exercício `exercicioId` a partir do fecho do anterior (#363, ADR-0035 §6),
 * na tx do chamador. Saldos de fecho = partidas do anterior nos períodos 1..13 (pelo período do
 * lançamento, `FILTRO_LANCAMENTO_MAPA`) — o 13 traz os lançamentos de encerramento, que saldam as
 * classes 6/7 e põem o resultado no 88. Transporta cada folha das classes 1–5 e 8
 * (`CLASSES_BALANCO`) com saldo não nulo: devedor → débito, credor → crédito. Sem saldos não
 * escreve nada e devolve `null`. Não verifica estados — é do chamador.
 */
export async function gerarAberturaEmTx(
  tx: Prisma.TransactionClient,
  input: { exercicioAnteriorId: string; exercicioId: string },
  ctx: Ctx,
): Promise<Lancamento | null> {
  const partidas = await partidasDeAberturaEmTx(tx, input.exercicioAnteriorId, ctx);
  if (partidas.length === 0) return null;

  const [anterior, seguinte] = await Promise.all(
    [input.exercicioAnteriorId, input.exercicioId].map((id) =>
      tx.exercicioContabil.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { codigo: true } }),
    ),
  );
  return criarLancamentoAberturaEmTx(
    tx,
    {
      exercicioSeguinteId: input.exercicioId,
      exercicioAnteriorId: input.exercicioAnteriorId,
      historico: `Abertura ${seguinte?.codigo ?? ''} — saldos de fecho do exercício ${anterior?.codigo ?? ''}`.trim(),
      partidas,
    },
    ctx,
  );
}

/**
 * Há abertura a esperar do exercício `exercicioAnteriorId`? Sim quando ele tem saldos de balanço
 * a transportar (o mesmo agregado que `gerarAberturaEmTx` usa) — um ano a zero não abre nada e
 * não deixa nada «em falta» (§7, #363). O estado do anterior é outro impedimento.
 */
export async function aberturaEsperadaDeEmTx(
  tx: Prisma.TransactionClient,
  exercicioAnteriorId: string,
  ctx: Ctx,
): Promise<boolean> {
  return (await partidasDeAberturaEmTx(tx, exercicioAnteriorId, ctx)).length > 0;
}

/** As partidas da abertura: saldos de fecho de balanço do exercício (ver `gerarAberturaEmTx`). */
async function partidasDeAberturaEmTx(
  tx: Prisma.TransactionClient,
  exercicioAnteriorId: string,
  ctx: Ctx,
): Promise<Array<{ contaId: string; tipo: TipoPartida; valor: Prisma.Decimal }>> {
  const agregados = await tx.partidaLancamento.groupBy({
    by: ['contaId', 'tipo'],
    where: {
      tenantId: ctx.tenantId,
      lancamento: {
        status: FILTRO_LANCAMENTO_MAPA,
        periodo: { exercicioId: exercicioAnteriorId, ordem: { gte: 1, lte: 13 } },
      },
    },
    _sum: { valor: true },
  });
  const saldos = new Map<string, Prisma.Decimal>();
  for (const a of agregados) {
    const v = a._sum.valor ?? new Prisma.Decimal(0);
    const atual = saldos.get(a.contaId) ?? new Prisma.Decimal(0);
    saldos.set(a.contaId, a.tipo === 'DEBITO' ? atual.plus(v) : atual.minus(v));
  }

  const contas = await tx.contaPGC.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...saldos.keys()] } },
    select: { id: true, classe: true },
    orderBy: { codigo: 'asc' },
  });
  return contas
    .filter((c) => CLASSES_BALANCO.has(c.classe) && !saldos.get(c.id)!.isZero())
    .map((c) => {
      const s = saldos.get(c.id)!;
      return { contaId: c.id, tipo: (s.greaterThan(0) ? 'DEBITO' : 'CREDITO') as TipoPartida, valor: s.abs() };
    });
}

// ---------------------------------------------------------------------------
// Aplicação do resultado (ADR-0035 §5, #364)
// ---------------------------------------------------------------------------

/**
 * Grava o lançamento da aplicação do resultado (88 ↔ 59) na tx do chamador
 * (`aplicacao-resultado.service`): diário OPERACOES, período recebido por id (o da data da
 * deliberação no exercício seguinte, já escolhido pelo chamador — `resolverPeriodo` podia criar
 * exercícios), trancado `FOR SHARE` e ABERTO, LANCADO, origem reservada
 * `ORIGEM_APLICACAO_RESULTADO` com a aplicação em `documentoOrigemId`. Vive aqui por causa do
 * `gate-periodo`.
 */
export async function criarLancamentoAplicacaoResultadoEmTx(
  tx: Prisma.TransactionClient,
  input: {
    periodoId: string;
    data: Date;
    aplicacaoId: string;
    historico: string;
    partidas: ReadonlyArray<{ contaId: string; tipo: TipoPartida; valor: Prisma.Decimal }>;
  },
  ctx: Ctx,
): Promise<Lancamento> {
  const [periodo] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string; ordem: number }>>`
    SELECT id, codigo, estado, ordem FROM "PeriodoContabil"
    WHERE id = ${input.periodoId} AND "tenantId" = ${ctx.tenantId}
    FOR SHARE
  `;
  if (!periodo) throw new NotFoundError('Período contabilístico não encontrado');
  if (periodo.ordem === 13) {
    throw new BusinessRuleError(
      'PERIODO_DE_ENCERRAMENTO',
      `A aplicação do resultado vai para um período mensal; ${periodo.codigo} é o de encerramento.`,
    );
  }
  if (periodo.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodo.codigo} está fechado`);
  }

  if (input.partidas.length === 0 || input.partidas.some((p) => !p.valor.greaterThan(0))) {
    throw new BusinessRuleError('PARTIDA_VALOR_INVALIDO', 'Cada partida tem de ter valor positivo.');
  }
  const totalDebito = totalDasPartidasEquilibradas(input.partidas);

  const diario = await tx.diario.findFirst({
    where: { tipo: 'OPERACOES', tenantId: ctx.tenantId, ativo: true },
    select: { id: true },
  });
  if (!diario) throw new NotFoundError('Diário do tipo "OPERACOES" não encontrado');

  const numero = await proximoNumeroLancamento(tx, diario.id, periodo.codigo, ctx.tenantId);

  const lancamento = await tx.lancamento.create({
    data: {
      tenantId: ctx.tenantId,
      numero,
      data: input.data,
      tipo: 'AUTOMATICO',
      origem: 'AJUSTE',
      diarioId: diario.id,
      periodoId: periodo.id,
      documentoOrigemId: input.aplicacaoId,
      documentoOrigemTipo: ORIGEM_APLICACAO_RESULTADO,
      historico: input.historico,
      valorTotal: totalDebito,
      status: 'LANCADO',
      periodoFiscal: periodo.codigo, // cópia de periodo.codigo (ADR-0033 §1)
      criadoPorId: ctx.userId,
    },
  });

  for (const p of input.partidas) {
    await exigirContaDeMovimento(tx, p.contaId, ctx.tenantId);
    await tx.partidaLancamento.create({
      data: {
        tenantId: ctx.tenantId,
        lancamentoId: lancamento.id,
        contaId: p.contaId,
        tipo: p.tipo,
        valor: new Prisma.Decimal(p.valor.toFixed(2)),
      },
    });
  }

  return lancamento as unknown as Lancamento;
}

/**
 * Estorna o lançamento da aplicação do resultado (#364: anulação da aplicação) no período DELE —
 * por id, não pela data de hoje —, trancado `FOR SHARE` e ABERTO, no mesmo diário, com a data do
 * original. O estorno leva a mesma origem reservada (e a aplicação em `documentoOrigemId`): o
 * estorno genérico recusa-o também. Vive aqui por causa do `gate-periodo`.
 */
export async function estornarLancamentoAplicacaoResultadoEmTx(
  tx: Prisma.TransactionClient,
  input: { lancamentoId: string; motivo: string },
  ctx: Ctx,
): Promise<Lancamento> {
  const lancamento = await tx.lancamento.findFirst({
    where: { id: input.lancamentoId, tenantId: ctx.tenantId },
    include: { partidas: true },
  });
  if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
  if (lancamento.documentoOrigemTipo !== ORIGEM_APLICACAO_RESULTADO || lancamento.lancamentoEstornoId !== null) {
    throw new BusinessRuleError(
      'LANCAMENTO_NAO_E_DE_APLICACAO',
      `O lançamento ${lancamento.numero} não é uma aplicação do resultado.`,
    );
  }
  transitarEstado(lancamento.status as StatusLancamento, 'ESTORNADO');

  const [periodo] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string }>>`
    SELECT id, codigo, estado FROM "PeriodoContabil"
    WHERE id = ${lancamento.periodoId} AND "tenantId" = ${ctx.tenantId}
    FOR SHARE
  `;
  if (!periodo) throw new NotFoundError('Período contabilístico não encontrado');
  if (periodo.estado !== 'ABERTO') {
    throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodo.codigo} está fechado`);
  }

  return gravarEstornoEmTx(tx, lancamento, periodo, lancamento.data, input.motivo, ctx, {
    tipo: ORIGEM_APLICACAO_RESULTADO,
    id: lancamento.documentoOrigemId,
  });
}

// ---------------------------------------------------------------------------
// Balancete de Verificação PHC (ADR-0040, issue #280, S1)
// ---------------------------------------------------------------------------

/**
 * Gera o balancete de verificação no modelo PHC para o intervalo de períodos
 * pedido dentro de um exercício.
 *
 * - Movimento: partidas nos períodos [periodoInicial..periodoFinal].
 * - Acumulado: partidas nos períodos [1..periodoFinal].
 * - Abertura implícita: partidas antes de exercicio.dataInicio, só quando o
 *   exercício NÃO tiver lançamentos no diário de tipo ABERTURA.
 * - incluir13=false: o período 13 nunca entra mesmo que periodoFinal=13.
 *
 * Usa `prisma.partidaLancamento.groupBy` — nunca `$queryRaw` (ADR-0040 §3).
 */
export async function gerarBalanceteVerificacao(
  filtro: FiltroBalanceteVerificacaoInput,
  ctx: Ctx,
): Promise<BalanceteVerificacaoResult> {
  const { tenantId } = ctx;

  // Normalização do intervalo — partilhada com razaoConta
  const { periodoInicial: effectiveInicial, periodoFinal: effectiveFinal } =
    normalizarIntervaloPeriodos({
      periodoInicial: filtro.periodoInicial,
      periodoFinal: filtro.periodoFinal,
      incluir13: filtro.incluir13,
    });

  // 1. Resolver o exercício (n2: primeiro, antes de qualquer groupBy — ADR-0040 §4)
  const exercicio = filtro.exercicioId
    ? await prisma.exercicioContabil.findFirst({
        where: { tenantId, id: filtro.exercicioId },
        select: { id: true, codigo: true, dataInicio: true, dataFim: true },
      })
    : await prisma.exercicioContabil.findFirst({
        where: { tenantId, dataInicio: { lte: new Date() }, dataFim: { gte: new Date() } },
        orderBy: { dataInicio: 'desc' },
        select: { id: true, codigo: true, dataInicio: true, dataFim: true },
      });

  if (!exercicio) {
    throw new NotFoundError('Exercício contabilístico não encontrado');
  }

  const exercicioId = exercicio.id;

  // 2. Verificar se o exercício tem lançamentos no diário AB (n2: sequencial — só então
  //    fazemos a query «anteriores», que pode ser pesada em bases grandes)
  const temAbertura = await exercicioTemDiarioAbertura(exercicioId, tenantId);

  // 3. Restantes queries em paralelo; anteriores só quando não há diário AB
  const [movimentoRaw, acumuladoRaw, contasRaw, anterioresRaw] = await Promise.all([
    // Movimento: períodos [inicial..final]
    prisma.partidaLancamento.groupBy({
      by: ['contaId', 'tipo'],
      where: {
        tenantId,
        lancamento: {
          status: FILTRO_LANCAMENTO_MAPA,
          periodo: { exercicioId, ordem: { gte: effectiveInicial, lte: effectiveFinal } },
        },
      },
      _sum: { valor: true },
    }),
    // Acumulado: períodos [1..final]
    prisma.partidaLancamento.groupBy({
      by: ['contaId', 'tipo'],
      where: {
        tenantId,
        lancamento: {
          status: FILTRO_LANCAMENTO_MAPA,
          periodo: { exercicioId, ordem: { gte: 1, lte: effectiveFinal } },
        },
      },
      _sum: { valor: true },
    }),
    // Todas as contas do tenant (mães e folhas)
    prisma.contaPGC.findMany({
      where: { tenantId },
      select: {
        id: true,
        codigo: true,
        nome: true,
        classe: true,
        natureza: true,
        nivel: true,
        contaMaeId: true,
        aceitaLancamento: true,
      },
    }),
    // Anteriores: partidas antes de exercicio.dataInicio (só quando sem AB)
    !temAbertura
      ? prisma.partidaLancamento.groupBy({
          by: ['contaId', 'tipo'],
          where: {
            tenantId,
            // Abertura implícita: o período 13 dos anteriores CONTA (é ele que põe o
            // resultado no 88); só o AB re-afirmado sai, senão os saldos dobram.
            lancamento: {
              status: FILTRO_LANCAMENTO_MAPA,
              data: { lt: exercicio.dataInicio },
              ...SEM_ABERTURA_REAFIRMADA,
            },
          },
          _sum: { valor: true },
        })
      : Promise.resolve([]),
  ]);

  // Se o exercício tem lançamentos no diário AB → sem abertura implícita
  const anteriores = temAbertura ? null : anterioresRaw;

  // 3. Montar o balancete via núcleo puro
  const nucleo = montarBalanceteVerificacao({
    contas: contasRaw,
    movimento: movimentoRaw,
    acumulado: acumuladoRaw,
    anteriores,
  });

  return {
    exercicio,
    periodoInicial: effectiveInicial,
    periodoFinal: effectiveFinal,
    incluir13: filtro.incluir13,
    contas: contasRaw,
    ...nucleo,
  };
}

// ---------------------------------------------------------------------------
// Verificação de conformidade com IContabilidadeService (NIT)
// ---------------------------------------------------------------------------

import type { IContabilidadeService } from './contabilidade.interface';

export const contabilidadeService = {
  criarConta,
  atualizarConta,
  desativarConta,
  obterConta,
  listarContas,
  arvoreContas,
  criarDiario,
  atualizarDiario,
  listarDiarios,
  criarCentroCusto,
  atualizarCentroCusto,
  listarCentrosCusto,
  criarLancamento,
  confirmarLancamento,
  estornarLancamento,
  editarLancamentoRascunho,
  anularLancamentoRascunho,
  obterLancamento,
  listarLancamentos,
  gerarBalancete,
  razaoConta,
  gerarDRE,
  criarContaBancaria,
  atualizarContaBancaria,
  listarContasBancarias,
  abrirExercicio,
  listarExercicios,
  listarPeriodos,
  fecharPeriodo,
  reabrirPeriodo,
  obterCalendarioContabilistico,
  atualizarCalendarioContabilistico,
  registarLancamentoContabilistico,
  gerarBalanceteVerificacao,
} satisfies IContabilidadeService;
