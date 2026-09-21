import 'server-only';
import { Prisma, type TipoPartida } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { getRequestContext } from '@/server/observability/context';
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
  FiltroLancamentoInput,
  CriarContaBancariaInput,
  AtualizarContaBancariaInput,
  IniciarReconciliacaoInput,
  MarcarItemReconciliadoInput,
  ImportarExtratoInput,
  AutoMatchInput,
  ConcluirReconciliacaoInput,
  FiltroBalanceteInput,
  FiltroRazaoInput,
  FiltroDREInput,
  FecharPeriodoInput,
  ReabrirPeriodoInput,
  ListarPeriodosInput,
  AbrirExercicioInput,
} from '@/lib/validations/contabilidade';
import type { CalendarioContabilisticoInput } from '@/lib/validations/plataforma';
import { bootstrapSeriesDocumento } from '@/server/provisioning/tenant-bootstrap';
import {
  calcularDiferencaNaoConciliada,
  sugerirMatchesPuro,
  transitarReconciliacao,
  type MatchSugerido,
} from './reconciliacao.helpers';
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
  type ReconciliacaoBancaria,
  type ReconciliacaoDetalhe,
  type ReconciliacaoComConta,
  type StatusReconciliacao,
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
 * Cria um exercício contabilístico com os 13 períodos para `ano`.
 * Idempotente via @@unique([tenantId, codigo]).
 * Rede de segurança do ADR-0033 §3: o caminho normal é o cron de 1 de Dezembro.
 */
async function criarExercicioComPeriodos(
  tx: Prisma.TransactionClient,
  ano: number,
  tenantId: string,
  criadoPorId: string | null = null,
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

  return exercicio;
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
): Promise<{ id: string; codigo: string; estado: string }> {
  const codigo = periodoFiscalDe(data);

  const periodo = await tx.periodoContabil.findFirst({
    where: { tenantId, codigo },
    select: { id: true, codigo: true, estado: true },
  });

  if (periodo) return periodo;

  // Rede de segurança: exercício ainda não existe → criar
  const ano = parseInt(codigo.split('-')[0], 10);
  await criarExercicioComPeriodos(tx, ano, tenantId);

  // Agora o período existe
  const criado = await tx.periodoContabil.findFirst({
    where: { tenantId, codigo },
    select: { id: true, codigo: true, estado: true },
  });
  if (!criado) throw new Error(`Falha ao criar período ${codigo} para tenant ${tenantId}`);
  return criado;
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

// ---------------------------------------------------------------------------
// Plano de contas
// ---------------------------------------------------------------------------

export async function criarConta(input: CriarContaPGCInput, ctx: Ctx): Promise<ContaPGC> {
  const existente = await prisma.contaPGC.findFirst({
    where: { codigo: input.codigo, tenantId: ctx.tenantId },
  });
  if (existente) {
    throw new BusinessRuleError('CONTA_DUPLICADA', `Conta "${input.codigo}" já existe`);
  }
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

export async function listarContas(filtro: FiltroContaPGCInput, ctx: Ctx): Promise<PaginacaoContabilidade<ContaPGC>> {
  return paginate(
    (a) =>
      prisma.contaPGC.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
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
  return prismaBase.$transaction(async (tx) => {
    const diario = await tx.diario.findFirst({
      where: { id: input.diarioId, tenantId: ctx.tenantId, ativo: true },
    });
    if (!diario) throw new NotFoundError('Diário não encontrado ou inactivo');

    // ADR-0033 §5: resolver período + bloquear com FOR SHARE para impedir fecho concorrente
    const periodoResolvido = await resolverPeriodo(tx, input.data, ctx.tenantId);
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

    // Invariante débito=crédito (Decimal exacto a partir de number)
    let totalDebito = new Prisma.Decimal(0);
    let totalCredito = new Prisma.Decimal(0);
    for (const p of input.partidas) {
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
      const conta = await tx.contaPGC.findFirst({
        where: { id: p.contaId, tenantId: ctx.tenantId },
        select: { aceitaLancamento: true },
      });
      if (!conta) throw new NotFoundError(`Conta ${p.contaId} não encontrada`);
      if (!conta.aceitaLancamento) {
        throw new BusinessRuleError('CONTA_NAO_ACEITA_LANCAMENTO', `Conta ${p.contaId} não aceita lançamentos`);
      }
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

export async function confirmarLancamento(id: string, ctx: Ctx): Promise<Lancamento> {
  const lancamento = await prisma.lancamento.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
  transitarEstado(lancamento.status as StatusLancamento, 'LANCADO');
  return prisma.lancamento.update({ where: { id }, data: { status: 'LANCADO' } }) as unknown as Lancamento;
}

export async function estornarLancamento(input: EstornarLancamentoInput, ctx: Ctx): Promise<Lancamento> {
  return prismaBase.$transaction(async (tx) => {
    const lancamento = await tx.lancamento.findFirst({
      where: { id: input.lancamentoId, tenantId: ctx.tenantId },
      include: { partidas: true },
    });
    if (!lancamento) throw new NotFoundError('Lançamento não encontrado');
    transitarEstado(lancamento.status as StatusLancamento, 'ESTORNADO');

    const dataEstorno = input.data ?? new Date();

    // ADR-0033 §5: resolver período do estorno + bloqueio FOR SHARE
    const periodoResolvido = await resolverPeriodo(tx, dataEstorno, ctx.tenantId);
    const [periodoLocked] = await tx.$queryRaw<Array<{ id: string; codigo: string; estado: string }>>`
      SELECT id, codigo, estado FROM "PeriodoContabil"
      WHERE id = ${periodoResolvido.id} AND "tenantId" = ${ctx.tenantId}
      FOR SHARE
    `;
    if (!periodoLocked) throw new NotFoundError('Período contabilístico não encontrado');
    if (periodoLocked.estado !== 'ABERTO') {
      throw new BusinessRuleError('PERIODO_FECHADO', `Período ${periodoLocked.codigo} está fechado`);
    }

    const numero = await proximoNumeroLancamento(tx, lancamento.diarioId, periodoLocked.codigo, ctx.tenantId);

    const estorno = await tx.lancamento.create({
      data: {
        tenantId: ctx.tenantId,
        numero,
        data: dataEstorno,
        tipo: 'ESTORNO',
        origem: lancamento.origem,
        diarioId: lancamento.diarioId,
        periodoId: periodoLocked.id,
        documentoOrigemId: lancamento.id,
        documentoOrigemTipo: 'Lancamento',
        historico: `ESTORNO: ${lancamento.historico}`,
        valorTotal: lancamento.valorTotal,
        status: 'LANCADO',
        periodoFiscal: periodoLocked.codigo, // cópia de periodo.codigo (ADR-0033 §1)
        observacoes: input.motivo,
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

    return tx.lancamento.update({
      where: { id: lancamento.id },
      data: { status: 'ESTORNADO' },
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
          ...(filtro.status ? { status: filtro.status } : {}),
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
): { contas: ContaBalancete[]; totalDebitos: Prisma.Decimal; totalCreditos: Prisma.Decimal } {
  const mapa = new Map<string, { conta: ContaBalancete['conta']; debitos: Prisma.Decimal; creditos: Prisma.Decimal }>();

  for (const a of agregados) {
    const conta = contas.get(a.contaId);
    // Uma partida cuja conta não existe neste tenant não é somável — e não é
    // silenciável noutro sítio: seria uma fuga cross-tenant a acontecer.
    if (!conta) continue;
    const e = mapa.get(a.contaId) ?? { conta, debitos: new Prisma.Decimal(0), creditos: new Prisma.Decimal(0) };
    const valor = a._sum.valor ?? new Prisma.Decimal(0);
    if (a.tipo === 'DEBITO') e.debitos = e.debitos.plus(valor);
    else e.creditos = e.creditos.plus(valor);
    mapa.set(a.contaId, e);
  }

  let totalDebitos = new Prisma.Decimal(0);
  let totalCreditos = new Prisma.Decimal(0);

  const linhas = Array.from(mapa.values())
    .filter((e) => incluirZeradas || !e.debitos.equals(0) || !e.creditos.equals(0))
    .map((e) => {
      totalDebitos = totalDebitos.plus(e.debitos);
      totalCreditos = totalCreditos.plus(e.creditos);
      const saldoAtual = e.conta.natureza === 'DEVEDORA'
        ? e.debitos.minus(e.creditos)
        : e.creditos.minus(e.debitos);
      return {
        conta: e.conta,
        saldoAnterior: new Prisma.Decimal(0),
        debitos: e.debitos,
        creditos: e.creditos,
        saldoAtual,
      };
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
  const agregados = await prisma.partidaLancamento.groupBy({
    by: ['contaId', 'tipo'],
    where: {
      tenantId: ctx.tenantId,
      lancamento: {
        data: { gte: filtro.dataInicio, lte: filtro.dataFim },
        status: FILTRO_LANCAMENTO_MAPA,
      },
    },
    _sum: { valor: true },
  });

  const contas = await prisma.contaPGC.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...new Set(agregados.map((a) => a.contaId))] } },
    select: { id: true, codigo: true, nome: true, tipo: true, natureza: true },
  });

  const { contas: linhas, totalDebitos, totalCreditos } = montarLinhasBalancete(
    agregados,
    new Map(contas.map((c) => [c.id, c])),
    filtro.incluirZeradas,
  );

  return { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim, contas: linhas, totalDebitos, totalCreditos };
}

export async function razaoConta(filtro: FiltroRazaoInput, ctx: Ctx): Promise<LinhaRazao[]> {
  const conta = await prisma.contaPGC.findFirst({ where: { id: filtro.contaId, tenantId: ctx.tenantId } });
  if (!conta) throw new NotFoundError('Conta não encontrada');

  const partidas = await prisma.partidaLancamento.findMany({
    where: {
      tenantId: ctx.tenantId,
      contaId: filtro.contaId,
      lancamento: {
        data: { gte: filtro.dataInicio, lte: filtro.dataFim },
        status: FILTRO_LANCAMENTO_MAPA,
      },
    },
    include: {
      lancamento: { select: { id: true, data: true, historico: true, origem: true } },
    },
    orderBy: { lancamento: { data: 'asc' } },
  });

  let saldo = new Prisma.Decimal(0);
  const isDevedora = conta.natureza === 'DEVEDORA';

  return partidas.map((p) => {
    if (p.tipo === 'DEBITO') saldo = isDevedora ? saldo.plus(p.valor) : saldo.minus(p.valor);
    else saldo = isDevedora ? saldo.minus(p.valor) : saldo.plus(p.valor);
    return {
      lancamentoId: p.lancamentoId,
      data: p.lancamento.data,
      historico: p.historico ?? p.lancamento.historico,
      debito: p.tipo === 'DEBITO' ? p.valor : null,
      credito: p.tipo === 'CREDITO' ? p.valor : null,
      saldoAcumulado: saldo,
      origem: p.lancamento.origem as LinhaRazao['origem'],
    };
  });
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
  // saldoAtual nunca é editável manualmente — derivado dos movimentos (append-only)
  return prisma.contaBancaria.create({
    data: { tenantId: ctx.tenantId, ...input, saldoAtual: new Prisma.Decimal(0) },
  }) as unknown as ContaBancaria;
}

export async function atualizarContaBancaria(input: AtualizarContaBancariaInput, ctx: Ctx): Promise<ContaBancaria> {
  const { id, ...data } = input;
  const cb = await prisma.contaBancaria.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!cb) throw new NotFoundError('Conta bancária não encontrada');
  if (data.contaContabilId && data.contaContabilId !== cb.contaContabilId) {
    await validarContaContabilBancaria(data.contaContabilId, ctx.tenantId);
  }
  // O schema Zod não expõe saldoAtual — permanece derivado (Requisito 1.3)
  return prisma.contaBancaria.update({ where: { id }, data }) as unknown as ContaBancaria;
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
      },
    },
    _sum: { valor: true },
  });
  const debitos = agg.find((a) => a.tipo === 'DEBITO')?._sum.valor ?? new Prisma.Decimal(0);
  const creditos = agg.find((a) => a.tipo === 'CREDITO')?._sum.valor ?? new Prisma.Decimal(0);
  return debitos.minus(creditos);
}

/**
 * Geração idempotente de itens LANCAMENTO_CONTABIL: um item por partida da
 * conta contabilística no intervalo; lançamentos já representados na
 * reconciliação (mesmo lancamentoId) não são duplicados.
 */
async function gerarItensRazaoNoTx(
  tx: Prisma.TransactionClient,
  rec: { id: string; dataInicio: Date; dataFim: Date },
  contaContabilId: string,
  ctx: Ctx,
): Promise<number> {
  const partidas = await tx.partidaLancamento.findMany({
    where: {
      tenantId: ctx.tenantId,
      contaId: contaContabilId,
      lancamento: { status: 'LANCADO', data: { gte: rec.dataInicio, lte: rec.dataFim } },
    },
    select: {
      lancamentoId: true,
      tipo: true,
      valor: true,
      historico: true,
      lancamento: { select: { data: true, historico: true } },
    },
    orderBy: { lancamento: { data: 'asc' } },
  });

  const existentes = await tx.itemReconciliacaoBancaria.findMany({
    where: {
      tenantId: ctx.tenantId,
      reconciliacaoId: rec.id,
      tipo: 'LANCAMENTO_CONTABIL',
      lancamentoId: { not: null },
    },
    select: { lancamentoId: true },
  });
  const jaGerados = new Set(existentes.map((e) => e.lancamentoId));

  let criados = 0;
  for (const p of partidas) {
    if (jaGerados.has(p.lancamentoId)) continue;
    await tx.itemReconciliacaoBancaria.create({
      data: {
        tenantId: ctx.tenantId,
        reconciliacaoId: rec.id,
        tipo: 'LANCAMENTO_CONTABIL',
        data: p.lancamento.data,
        descricao: p.historico ?? p.lancamento.historico,
        valor: p.valor,
        tipoMovimento: p.tipo,
        lancamentoId: p.lancamentoId,
        conciliado: false,
      },
    });
    criados++;
  }
  return criados;
}

/** Recalcula a diferença não conciliada da reconciliação dentro da transacção. */
async function recalcularDiferencaNoTx(
  tx: Prisma.TransactionClient,
  rec: { id: string; saldoFinalBanco: Prisma.Decimal },
  saldoFinalContabil: Prisma.Decimal,
  ctx: Ctx,
): Promise<Prisma.Decimal> {
  const itens = await tx.itemReconciliacaoBancaria.findMany({
    where: { tenantId: ctx.tenantId, reconciliacaoId: rec.id },
    select: { tipo: true, tipoMovimento: true, valor: true, conciliado: true },
  });
  return calcularDiferencaNaoConciliada(rec.saldoFinalBanco, saldoFinalContabil, itens);
}

export async function iniciarReconciliacao(input: IniciarReconciliacaoInput, ctx: Ctx): Promise<ReconciliacaoBancaria> {
  return prismaBase.$transaction(async (tx) => {
    // W9/B1: validar que a conta bancária pertence ao tenant
    const cb = await tx.contaBancaria.findFirst({
      where: { id: input.contaBancariaId, tenantId: ctx.tenantId },
      select: { id: true, contaContabilId: true },
    });
    if (!cb) throw new NotFoundError('Conta bancária não encontrada');

    // Requisito 2.2: só uma reconciliação EM_ANDAMENTO por conta bancária
    const aberta = await tx.reconciliacaoBancaria.findFirst({
      where: { tenantId: ctx.tenantId, contaBancariaId: cb.id, status: 'EM_ANDAMENTO' },
      select: { id: true },
    });
    if (aberta) {
      throw new BusinessRuleError(
        'RECONCILIACAO_EM_ABERTO',
        'Já existe uma reconciliação em andamento para esta conta bancária',
      );
    }

    // Requisito 2.1: saldos contabilísticos reais a partir do razão
    const saldoInicialContabil = await saldoContabilAte(cb.contaContabilId, input.dataInicio, ctx, {
      exclusivo: true,
      tx,
    });
    const saldoFinalContabil = await saldoContabilAte(cb.contaContabilId, input.dataFim, ctx, { tx });
    const saldoFinalBanco = new Prisma.Decimal(input.saldoFinalBanco.toFixed(2));

    const rec = await tx.reconciliacaoBancaria.create({
      data: {
        tenantId: ctx.tenantId,
        contaBancariaId: cb.id,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        saldoInicialBanco: new Prisma.Decimal(input.saldoInicialBanco.toFixed(2)),
        saldoFinalBanco,
        saldoInicialContabil,
        saldoFinalContabil,
        diferencaNaoConciliada: saldoFinalBanco.minus(saldoFinalContabil),
        status: 'EM_ANDAMENTO',
        responsavelId: ctx.userId,
      },
    });

    // Requisito 3.1: gerar itens do razão na abertura
    await gerarItensRazaoNoTx(tx, rec, cb.contaContabilId, ctx);

    return rec as unknown as ReconciliacaoBancaria;
  });
}

export async function gerarItensRazao(reconciliacaoId: string, ctx: Ctx): Promise<{ criados: number }> {
  return prismaBase.$transaction(async (tx) => {
    const rec = await tx.reconciliacaoBancaria.findFirst({
      where: { id: reconciliacaoId, tenantId: ctx.tenantId },
      select: { id: true, dataInicio: true, dataFim: true, contaBancariaId: true, status: true },
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');
    if (rec.status !== 'EM_ANDAMENTO') {
      throw new BusinessRuleError('RECONCILIACAO_IMUTAVEL', 'Reconciliação concluída/cancelada é imutável');
    }
    const cb = await tx.contaBancaria.findFirst({
      where: { id: rec.contaBancariaId, tenantId: ctx.tenantId },
      select: { contaContabilId: true },
    });
    if (!cb) throw new NotFoundError('Conta bancária não encontrada');
    const criados = await gerarItensRazaoNoTx(tx, rec, cb.contaContabilId, ctx);
    return { criados };
  });
}

export async function importarExtrato(
  input: ImportarExtratoInput,
  ctx: Ctx,
): Promise<{ criados: number; ignorados: number }> {
  return prismaBase.$transaction(async (tx) => {
    const rec = await tx.reconciliacaoBancaria.findFirst({
      where: { id: input.reconciliacaoId, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');
    if (rec.status !== 'EM_ANDAMENTO') {
      throw new BusinessRuleError('RECONCILIACAO_IMUTAVEL', 'Reconciliação concluída/cancelada é imutável');
    }

    // Requisito 4.3: idempotência por [tenantId, reconciliacaoId, extratoReferencia]
    const existentes = await tx.itemReconciliacaoBancaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        reconciliacaoId: rec.id,
        tipo: 'EXTRATO_BANCARIO',
        extratoReferencia: { in: input.linhas.map((l) => l.extratoReferencia) },
      },
      select: { extratoReferencia: true },
    });
    const jaImportadas = new Set(existentes.map((e) => e.extratoReferencia));
    const novas = input.linhas.filter((l) => !jaImportadas.has(l.extratoReferencia));

    // skipDuplicates cobre corridas concorrentes via @@unique de importação
    const res = await tx.itemReconciliacaoBancaria.createMany({
      data: novas.map((l) => ({
        tenantId: ctx.tenantId,
        reconciliacaoId: rec.id,
        tipo: 'EXTRATO_BANCARIO',
        data: l.data,
        descricao: l.descricao,
        valor: new Prisma.Decimal(l.valor.toFixed(2)),
        tipoMovimento: l.tipoMovimento,
        extratoReferencia: l.extratoReferencia,
        conciliado: false,
      })),
      skipDuplicates: true,
    });

    return { criados: res.count, ignorados: input.linhas.length - res.count };
  });
}

export async function sugerirMatches(input: AutoMatchInput, ctx: Ctx): Promise<MatchSugerido[]> {
  const rec = await prisma.reconciliacaoBancaria.findFirst({
    where: { id: input.reconciliacaoId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!rec) throw new NotFoundError('Reconciliação não encontrada');

  const itens = await prisma.itemReconciliacaoBancaria.findMany({
    where: { tenantId: ctx.tenantId, reconciliacaoId: rec.id, conciliado: false },
    select: { id: true, tipo: true, tipoMovimento: true, valor: true, data: true, conciliado: true },
  });
  return sugerirMatchesPuro(itens, input.janelaDias);
}

export async function marcarItemReconciliado(input: MarcarItemReconciliadoInput, ctx: Ctx): Promise<ReconciliacaoBancaria> {
  return prismaBase.$transaction(async (tx) => {
    // B1 (fecho do BLOCKER Wave 2): tudo filtrado por tenantId; cross-tenant → 404
    const rec = await tx.reconciliacaoBancaria.findFirst({
      where: { id: input.reconciliacaoId, tenantId: ctx.tenantId },
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');
    if (rec.status !== 'EM_ANDAMENTO') {
      throw new BusinessRuleError('RECONCILIACAO_IMUTAVEL', 'Reconciliação concluída/cancelada é imutável');
    }

    const item = await tx.itemReconciliacaoBancaria.findFirst({
      where: { id: input.itemId, tenantId: ctx.tenantId, reconciliacaoId: rec.id },
    });
    if (!item) throw new NotFoundError('Item de reconciliação não encontrado');

    let itemParId: string | null = null;
    if (input.conciliado && input.itemParId) {
      const par = await tx.itemReconciliacaoBancaria.findFirst({
        where: { id: input.itemParId, tenantId: ctx.tenantId, reconciliacaoId: rec.id },
      });
      if (!par) throw new NotFoundError('Item par não encontrado');
      if (par.tipo === item.tipo) {
        throw new BusinessRuleError('PAR_INVALIDO', 'O item par deve ser do lado oposto (razão ↔ extracto)');
      }
      await tx.itemReconciliacaoBancaria.updateMany({
        where: { id: par.id, tenantId: ctx.tenantId },
        data: { conciliado: true, itemParId: item.id },
      });
      itemParId = par.id;
    }

    await tx.itemReconciliacaoBancaria.updateMany({
      where: { id: item.id, tenantId: ctx.tenantId },
      data: {
        conciliado: input.conciliado,
        itemParId: input.conciliado ? itemParId : null,
        observacoes: input.observacoes ?? item.observacoes,
      },
    });

    // Desconciliar também o par previamente associado
    if (!input.conciliado && item.itemParId) {
      await tx.itemReconciliacaoBancaria.updateMany({
        where: { id: item.itemParId, tenantId: ctx.tenantId, reconciliacaoId: rec.id },
        data: { conciliado: false, itemParId: null },
      });
    }

    // Requisito 5.3: recálculo da diferença na mesma transacção
    const diferenca = await recalcularDiferencaNoTx(tx, rec, rec.saldoFinalContabil, ctx);
    return tx.reconciliacaoBancaria.update({
      where: { id: rec.id },
      data: { diferencaNaoConciliada: diferenca },
    }) as unknown as ReconciliacaoBancaria;
  });
}

export async function concluirReconciliacao(
  input: ConcluirReconciliacaoInput,
  ctx: Ctx,
): Promise<ReconciliacaoBancaria> {
  return prismaBase.$transaction(async (tx) => {
    const rec = await tx.reconciliacaoBancaria.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');
    transitarReconciliacao(rec.status as StatusReconciliacao, 'CONCLUIDA');

    const cb = await tx.contaBancaria.findFirst({
      where: { id: rec.contaBancariaId, tenantId: ctx.tenantId },
      select: { contaContabilId: true },
    });
    if (!cb) throw new NotFoundError('Conta bancária não encontrada');

    // Requisito 6.1: recálculo de saldos e diferença no fecho
    const saldoInicialContabil = await saldoContabilAte(cb.contaContabilId, rec.dataInicio, ctx, {
      exclusivo: true,
      tx,
    });
    const saldoFinalContabil = await saldoContabilAte(cb.contaContabilId, rec.dataFim, ctx, { tx });
    const diferenca = await recalcularDiferencaNoTx(tx, rec, saldoFinalContabil, ctx);

    const observacoes = input.observacoes ?? rec.observacoes;
    if (!diferenca.isZero() && !observacoes) {
      throw new BusinessRuleError(
        'RECONCILIACAO_NAO_BALANCEADA',
        `Diferença não conciliada de ${diferenca.toFixed(2)} exige justificação (observações)`,
      );
    }

    return tx.reconciliacaoBancaria.update({
      where: { id: rec.id },
      data: {
        status: 'CONCLUIDA',
        saldoInicialContabil,
        saldoFinalContabil,
        diferencaNaoConciliada: diferenca,
        observacoes,
      },
    }) as unknown as ReconciliacaoBancaria;
  });
}

export async function cancelarReconciliacao(id: string, ctx: Ctx): Promise<ReconciliacaoBancaria> {
  const rec = await prisma.reconciliacaoBancaria.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!rec) throw new NotFoundError('Reconciliação não encontrada');
  transitarReconciliacao(rec.status as StatusReconciliacao, 'CANCELADA');
  return prisma.reconciliacaoBancaria.update({
    where: { id: rec.id },
    data: { status: 'CANCELADA' },
  }) as unknown as ReconciliacaoBancaria;
}

export async function obterReconciliacao(id: string, ctx: Ctx): Promise<ReconciliacaoDetalhe | null> {
  const rec = await prisma.reconciliacaoBancaria.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      contaBancaria: {
        select: { id: true, banco: true, agencia: true, numeroConta: true, contaContabilId: true },
      },
      itens: { orderBy: [{ data: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!rec) return null;
  const { itens, ...resto } = rec;
  return {
    ...resto,
    itensRazao: itens.filter((i) => i.tipo === 'LANCAMENTO_CONTABIL'),
    itensExtrato: itens.filter((i) => i.tipo === 'EXTRATO_BANCARIO'),
  } as unknown as ReconciliacaoDetalhe;
}

export async function listarReconciliacoes(ctx: Ctx): Promise<ReconciliacaoComConta[]> {
  return prisma.reconciliacaoBancaria.findMany({
    where: { tenantId: ctx.tenantId },
    include: { contaBancaria: { select: { id: true, banco: true, numeroConta: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  }) as unknown as ReconciliacaoComConta[];
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
  // userId 'cron' (string literal) indica criação automática — guardamos null
  const criadoPorId = ctx.userId === 'cron' ? null : ctx.userId;

  await prismaBase.$transaction(async (tx) => {
    // Cria exercício + 13 períodos; idempotente via @@unique([tenantId, codigo])
    await criarExercicioComPeriodos(tx, ano, ctx.tenantId, criadoPorId);
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

      // 3. Nenhuma reconciliação bancária em curso (usa intervalo de datas do período)
      const reconciliacoes = await tx.reconciliacaoBancaria.count({
        where: {
          tenantId: ctx.tenantId,
          status: 'EM_ANDAMENTO',
          dataInicio: { lte: perDb.data_fim },
          dataFim: { gte: perDb.data_inicio },
        },
      });
      if (reconciliacoes > 0) impedimentos.push('RECONCILIACAO_EM_ANDAMENTO');
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

    // 5. Balancete equilibrado — total débitos === total créditos no período
    const agregados = await tx.partidaLancamento.groupBy({
      by: ['tipo'],
      where: {
        tenantId: ctx.tenantId,
        lancamento: { periodoId: periodo.id, status: { in: ['LANCADO', 'ESTORNADO'] } },
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
    const ivaApurado = await tx.apuramentoIva.findFirst({
      where: {
        tenantId: ctx.tenantId,
        periodoId: periodo.id,
        estado: { in: ['APURADO', 'DECLARADO'] },
      },
      select: { id: true },
    });
    if (!ivaApurado) impedimentos.push('IVA_NAO_APURADO');

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
 * Recusa se o exercício estiver ENCERRADO.
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
  const diario = await tx.diario.findFirst({
    where: { tipo: input.diarioTipo, tenantId: ctx.tenantId, ativo: true },
  });
  if (!diario) {
    throw new NotFoundError(`Diário do tipo "${input.diarioTipo}" não encontrado`);
  }

  // ADR-0033 §5: resolver período + bloqueio FOR SHARE (mesmo dentro de tx externa)
  const periodoResolvido = await resolverPeriodo(tx, input.data, ctx.tenantId);
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
  obterLancamento,
  listarLancamentos,
  gerarBalancete,
  razaoConta,
  gerarDRE,
  criarContaBancaria,
  atualizarContaBancaria,
  listarContasBancarias,
  iniciarReconciliacao,
  gerarItensRazao,
  importarExtrato,
  sugerirMatches,
  marcarItemReconciliado,
  concluirReconciliacao,
  cancelarReconciliacao,
  obterReconciliacao,
  listarReconciliacoes,
  abrirExercicio,
  listarExercicios,
  listarPeriodos,
  fecharPeriodo,
  reabrirPeriodo,
  obterCalendarioContabilistico,
  atualizarCalendarioContabilistico,
  registarLancamentoContabilistico,
} satisfies IContabilidadeService;
