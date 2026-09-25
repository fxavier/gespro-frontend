import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { NotFoundError } from '@/lib/errors';
import { formatMZN } from '@/lib/format-currency';
import type { FiltroDFCInput } from '@/lib/validations/fluxo-caixa';
import { gerarBalancete, gerarDRE } from './contabilidade.service';
import type { ContaBalancete, Ctx, PeriodoContabil } from './contabilidade.interface';
import {
  classificarVariacoes,
  coerenciaContasCaixa,
  montarSeccoesDFC,
  periodoHomologo,
  saldoCaixaDe,
  verificarArticulacao,
  verificarMesmoExercicio,
} from './dfc.model';
import type {
  AvisoConfiguracao,
  ColunaDFC,
  ContaCaixaInfo,
  ContaNaoMapeada,
  DFC,
  IDfcService,
  ImpedimentosDFC,
  MapaConta,
  PeriodoRef,
  ResultadoDFC,
  RubricaResumo,
  VersaoMapeamentoFluxo,
} from './dfc.interface';

/**
 * Serviço da Demonstração de Fluxos de Caixa — método indirecto
 * (spec 22 · WS-2 · ADR-0037 com a Emenda 2026-09-25; nó `servico` do grafo
 * `dfc`, tickets 5.1 e 5.2).
 *
 * SÓ LEITURA. Não escreve em nada — muito menos em `Lancamento`/`PartidaLancamento`
 * (gate-periodo). Toda a aritmética vive no núcleo puro (`dfc.model.ts`) e no
 * `contabilidade.service` (`gerarBalancete`, `gerarDRE`, ambos com
 * `FILTRO_LANCAMENTO_MAPA`); aqui só se lê, se orquestra e se decide se o mapa
 * sai. NÃO usa `saldoContabilAte` (só `LANCADO`, issue #66): os dois lados da
 * articulação saem dos MESMOS balancetes.
 *
 * As duas regras do épico:
 *  1. Conta com movimento e sem mapeamento ⇒ `impedimentos`, TODAS de uma vez,
 *     e nenhum mapa (I7) — como o `fecharPeriodo`.
 *  2. `verificarArticulacao` corre aqui, em produção, em cada coluna; se
 *     falhar, `DFC_NAO_ARTICULA` sobe e o mapa não sai (I6).
 *
 * Isolamento (I10): toda a leitura leva `tenantId` explícito no `where` e passa
 * pelo cliente `prisma` (a extensão escopa por cima). As FKs da migração 22b não
 * são tenant-scoped: um mapeamento do tenant pode apontar para uma rubrica de
 * outro. Por isso as rubricas lêem-se à parte, do próprio tenant, e o mapa conta
 * → rubrica só aceita rubricas dessa lista; um mapeamento para uma rubrica que o
 * tenant não tem conta como NÃO mapeado (impedimento), nunca como a rubrica
 * alheia e nunca como um 500. Nunca se segue a FK com `include`.
 */

const ZERO = new Prisma.Decimal(0);

/** «Desde sempre»: o balancete acumulado começa aqui. Nenhum lançamento é anterior. */
const DESDE_SEMPRE = new Date('0001-01-01T00:00:00.000Z');

const IMPEDIMENTO_NAO_SEMEADO =
  'Mapeamento da DFC não semeado: este tenant ainda não tem rubricas nem versão do mapeamento. ' +
  'Sem ele não há DFC — contacte o suporte para semear o mapeamento.';

// ---------------------------------------------------------------------------
// Leituras (todas com tenantId explícito)
// ---------------------------------------------------------------------------

type PeriodoLido = PeriodoRef & Pick<PeriodoContabil, 'exercicioId'>;

const SELECT_PERIODO = {
  id: true,
  codigo: true,
  ordem: true,
  dataInicio: true,
  dataFim: true,
  estado: true,
  exercicioId: true,
} as const;

async function lerPeriodo(id: string, ctx: Ctx): Promise<PeriodoLido> {
  // findFirst com tenantId (não findUnique): cross-tenant é 404, nunca 403.
  const p = await prisma.periodoContabil.findFirst({ where: { id, tenantId: ctx.tenantId }, select: SELECT_PERIODO });
  if (!p) throw new NotFoundError('Período contabilístico não encontrado');
  return p;
}

interface Intervalo {
  exercicio: { id: string; codigo: string; anteriorId: string | null };
  inicio: PeriodoLido;
  fim: PeriodoLido;
}

/**
 * Passo 1: os dois períodos (I10) e, antes de mais nada, V4. Os dois períodos
 * resolvem-se primeiro — um id alheio é 404 mesmo que o intervalo fosse inválido.
 */
async function resolverIntervalo(filtro: FiltroDFCInput, ctx: Ctx): Promise<Intervalo> {
  const [inicio, fim] = await Promise.all([lerPeriodo(filtro.periodoInicioId, ctx), lerPeriodo(filtro.periodoFimId, ctx)]);
  verificarMesmoExercicio(inicio, fim);
  const exercicio = await prisma.exercicioContabil.findFirst({
    where: { id: inicio.exercicioId, tenantId: ctx.tenantId },
    select: { id: true, codigo: true, anteriorId: true },
  });
  if (!exercicio) throw new NotFoundError('Exercício contabilístico não encontrado');
  return { exercicio, inicio, fim };
}

/**
 * E3: o intervalo homólogo do exercício anterior, ou `null` (sem exercício
 * anterior, ou sem um dos dois períodos homólogos — nunca um parcial).
 */
async function resolverHomologo(intervalo: Intervalo, ctx: Ctx): Promise<Intervalo | null> {
  const anteriorId = intervalo.exercicio.anteriorId;
  if (!anteriorId) return null;
  const anterior = await prisma.exercicioContabil.findFirst({
    where: { id: anteriorId, tenantId: ctx.tenantId },
    select: { id: true, codigo: true, anteriorId: true },
  });
  if (!anterior) return null;
  const periodos = await prisma.periodoContabil.findMany({
    where: { tenantId: ctx.tenantId, exercicioId: anterior.id },
    orderBy: { ordem: 'asc' },
  });
  const h = periodoHomologo(intervalo.inicio, intervalo.fim, periodos);
  if (!h) return null;
  const aRef = (p: PeriodoContabil): PeriodoLido => ({
    id: p.id,
    codigo: p.codigo,
    ordem: p.ordem,
    dataInicio: p.dataInicio,
    dataFim: p.dataFim,
    estado: p.estado,
    exercicioId: p.exercicioId,
  });
  return { exercicio: anterior, inicio: aRef(h.inicio), fim: aRef(h.fim) };
}

async function lerVersaoAtual(ctx: Ctx): Promise<Pick<VersaoMapeamentoFluxo, 'id' | 'numero' | 'estado'> | null> {
  return prisma.versaoMapeamentoFluxo.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { numero: 'desc' },
    select: { id: true, numero: true, estado: true },
  });
}

/** A configuração do mapeamento que o mapa usa: rubricas do tenant e conta → rubrica. */
interface Configuracao {
  rubricas: RubricaResumo[];
  mapa: MapaConta;
  /** Contas cujo mapeamento aponta para uma rubrica que o tenant não tem (FK alheia ou apagada). */
  rubricaInexistente: ReadonlySet<string>;
  /** Ids das contas mapeadas a rubricas `CAIXA` (E2). */
  contasCaixa: ReadonlySet<string>;
}

async function lerConfiguracao(ctx: Ctx): Promise<Configuracao> {
  const [rubricas, mapeamentos] = await Promise.all([
    prisma.rubricaFluxoCaixa.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, codigo: true, designacao: true, atividade: true, sinal: true, ordem: true },
      orderBy: [{ atividade: 'asc' }, { ordem: 'asc' }],
    }),
    prisma.mapeamentoContaFluxo.findMany({
      where: { tenantId: ctx.tenantId },
      select: { contaId: true, rubricaId: true },
    }),
  ]);

  // As MESMAS rubricas vão para o mapa e para `montarSeccoesDFC` (dfc-nucleo.md).
  const rubricaPorId = new Map<string, RubricaResumo>(rubricas.map((r) => [r.id, r]));
  const mapa = new Map<string, RubricaResumo>();
  const rubricaInexistente = new Set<string>();
  const contasCaixa = new Set<string>();
  for (const m of mapeamentos) {
    const rubrica = rubricaPorId.get(m.rubricaId);
    if (!rubrica) {
      rubricaInexistente.add(m.contaId);
      continue;
    }
    mapa.set(m.contaId, rubrica);
    if (rubrica.atividade === 'CAIXA') contasCaixa.add(m.contaId);
  }
  return { rubricas, mapa, rubricaInexistente, contasCaixa };
}

async function lerContasCaixa(contasCaixa: ReadonlySet<string>, ctx: Ctx): Promise<ContaCaixaInfo[]> {
  if (contasCaixa.size === 0) return [];
  return prisma.contaPGC.findMany({
    where: { tenantId: ctx.tenantId, id: { in: [...contasCaixa] } },
    select: { id: true, codigo: true, nome: true, classe: true, aceitaLancamento: true, ativo: true },
    orderBy: { codigo: 'asc' },
  });
}

/**
 * Os três balancetes de um intervalo, todos por `gerarBalancete`
 * (`FILTRO_LANCAMENTO_MAPA`, agregação em SQL):
 *  - `inicio`: acumulado desde sempre até à véspera do início (`dataInicio − 1 ms`);
 *  - `fim`: acumulado desde sempre até ao `dataFim` do período final;
 *  - `movimento`: só o intervalo — decide que contas «têm movimento» (I7).
 */
interface Saldos {
  inicio: ContaBalancete[];
  fim: ContaBalancete[];
  movimento: ContaBalancete[];
}

async function lerSaldos(intervalo: Intervalo, ctx: Ctx): Promise<Saldos> {
  const vespera = new Date(intervalo.inicio.dataInicio.getTime() - 1);
  const [inicio, fim, movimento] = await Promise.all([
    gerarBalancete({ dataInicio: DESDE_SEMPRE, dataFim: vespera, incluirZeradas: false }, ctx),
    gerarBalancete({ dataInicio: DESDE_SEMPRE, dataFim: intervalo.fim.dataFim, incluirZeradas: false }, ctx),
    gerarBalancete(
      { dataInicio: intervalo.inicio.dataInicio, dataFim: intervalo.fim.dataFim, incluirZeradas: false },
      ctx,
    ),
  ]);
  return { inicio: inicio.contas, fim: fim.contas, movimento: movimento.contas };
}

// ---------------------------------------------------------------------------
// I7 — contas com movimento e sem mapeamento
// ---------------------------------------------------------------------------

interface NaoMapeadaApurada {
  item: ContaNaoMapeada;
  rubricaInexistente: boolean;
}

/**
 * «Com movimento» = tem partidas no intervalo (está no balancete do intervalo).
 * Uma conta com saldo e sem movimento não é impedimento: a variação dela é zero
 * e não mexe na articulação.
 */
async function apurarNaoMapeadas(saldos: Saldos, cfg: Configuracao, ctx: Ctx): Promise<NaoMapeadaApurada[]> {
  const semMapa = saldos.movimento.filter((l) => !cfg.mapa.has(l.conta.id));
  if (semMapa.length === 0) return [];
  const classes = await prisma.contaPGC.findMany({
    where: { tenantId: ctx.tenantId, id: { in: semMapa.map((l) => l.conta.id) } },
    select: { id: true, classe: true },
  });
  const classePorId = new Map(classes.map((c) => [c.id, c.classe]));
  const saldoFinalPorId = new Map(saldos.fim.map((l) => [l.conta.id, l.saldoAtual]));
  return semMapa.map((l) => {
    const classe = classePorId.get(l.conta.id);
    // O balancete só devolve contas do tenant; sem classe é estado impossível.
    if (!classe) throw new NotFoundError(`Conta ${l.conta.codigo} não encontrada`);
    return {
      item: {
        conta: { id: l.conta.id, codigo: l.conta.codigo, nome: l.conta.nome, classe, natureza: l.conta.natureza },
        movimento: l.saldoAtual,
        saldoFinal: saldoFinalPorId.get(l.conta.id) ?? ZERO,
      },
      rubricaInexistente: cfg.rubricaInexistente.has(l.conta.id),
    };
  });
}

function fraseNaoMapeada(n: NaoMapeadaApurada, intervalo: Intervalo, comparativo: boolean): string {
  const { conta, movimento } = n.item;
  const onde = comparativo
    ? `no comparativo N-1 (${intervalo.inicio.codigo} a ${intervalo.fim.codigo})`
    : `no intervalo ${intervalo.inicio.codigo} a ${intervalo.fim.codigo}`;
  const porque = n.rubricaInexistente
    ? 'está mapeada a uma rubrica que não existe neste tenant'
    : 'não está mapeada a nenhuma rubrica da DFC';
  return (
    `A conta ${conta.codigo} ${conta.nome} tem movimento ${onde} (${formatMZN(movimento.toFixed(2))}) e ${porque}. ` +
    'Mapeie-a em Fluxo de caixa › Rubricas.'
  );
}

// ---------------------------------------------------------------------------
// Uma coluna do mapa (N ou N-1)
// ---------------------------------------------------------------------------

function ref(p: PeriodoLido): PeriodoRef {
  return { id: p.id, codigo: p.codigo, ordem: p.ordem, dataInicio: p.dataInicio, dataFim: p.dataFim, estado: p.estado };
}

async function montarColuna(intervalo: Intervalo, saldos: Saldos, cfg: Configuracao, ctx: Ctx): Promise<ColunaDFC> {
  // I9: o resultado É o `lucroLiquido` da DRE do MESMO intervalo, em instantes exactos.
  const dre = await gerarDRE({ dataInicio: intervalo.inicio.dataInicio, dataFim: intervalo.fim.dataFim }, ctx);
  // As contas que o núcleo devolve em `naoMapeadas` aqui já não têm movimento
  // (as que tinham pararam o serviço como impedimento): variação zero.
  const { variacoes } = classificarVariacoes(saldos.inicio, saldos.fim, cfg.mapa);
  const seccoes = montarSeccoesDFC(dre.lucroLiquido, variacoes, cfg.rubricas);
  const caixaInicial = saldoCaixaDe(saldos.inicio, cfg.contasCaixa);
  const caixaFinal = saldoCaixaDe(saldos.fim, cfg.contasCaixa);
  const variacaoCaixa = caixaFinal.minus(caixaInicial);
  // I6 em produção: se não articula, lança e o mapa não sai.
  verificarArticulacao(seccoes, variacaoCaixa);
  return {
    exercicio: { id: intervalo.exercicio.id, codigo: intervalo.exercicio.codigo },
    periodoInicio: ref(intervalo.inicio),
    periodoFim: ref(intervalo.fim),
    seccoes,
    caixaInicial,
    caixaFinal,
    variacaoCaixa,
  };
}

async function provisorioDe(intervalo: Intervalo, ctx: Ctx): Promise<boolean> {
  const naoFechados = await prisma.periodoContabil.count({
    where: {
      tenantId: ctx.tenantId,
      exercicioId: intervalo.exercicio.id,
      ordem: { gte: intervalo.inicio.ordem, lte: intervalo.fim.ordem },
      estado: { not: 'FECHADO' },
    },
  });
  return naoFechados > 0;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Todas as contas com movimento sem mapeamento, de uma vez (I7, ticket 5.2):
 * as do intervalo pedido e, havendo comparativo N-1, as que só se movem nele
 * (com os valores do homólogo) — é tudo o que impede o mapa de sair. Lista
 * vazia ⇔ cobertura completa. Ordem: por código.
 */
export async function contasNaoMapeadas(filtro: FiltroDFCInput, ctx: Ctx): Promise<ContaNaoMapeada[]> {
  const intervalo = await resolverIntervalo(filtro, ctx);
  const homologo = await resolverHomologo(intervalo, ctx);
  const cfg = await lerConfiguracao(ctx);
  const { todas } = await apurarTodas(intervalo, homologo, cfg, ctx);
  return todas.map((n) => n.apurada.item);
}

interface Apuramento {
  todas: Array<{ apurada: NaoMapeadaApurada; comparativo: boolean }>;
  saldosN: Saldos;
  saldosH: Saldos | null;
}

async function apurarTodas(
  intervalo: Intervalo,
  homologo: Intervalo | null,
  cfg: Configuracao,
  ctx: Ctx,
): Promise<Apuramento> {
  const [saldosN, saldosH] = await Promise.all([
    lerSaldos(intervalo, ctx),
    homologo ? lerSaldos(homologo, ctx) : Promise.resolve(null),
  ]);
  const doN = await apurarNaoMapeadas(saldosN, cfg, ctx);
  const vistas = new Set(doN.map((n) => n.item.conta.id));
  const doH = saldosH ? (await apurarNaoMapeadas(saldosH, cfg, ctx)).filter((n) => !vistas.has(n.item.conta.id)) : [];
  const todas = [
    ...doN.map((apurada) => ({ apurada, comparativo: false })),
    ...doH.map((apurada) => ({ apurada, comparativo: true })),
  ].sort((a, b) => (a.apurada.item.conta.codigo < b.apurada.item.conta.codigo ? -1 : 1));
  return { todas, saldosN, saldosH };
}

/**
 * A DFC do intervalo `periodoInicioId..periodoFimId` (mesmo exercício), com o
 * comparativo N-1 homólogo, ou os impedimentos — nunca os dois.
 *
 * Ordem (design §4.2 + ticket 5.1):
 *  1. períodos (404 cross-tenant) → `verificarMesmoExercicio` (V4);
 *  2. versão mais recente — sem ela, impedimento «não semeado» e pára;
 *     mapeamento → `contasNaoMapeadas` (N e N-1) + `coerenciaContasCaixa`
 *     → havendo impedimentos, devolve-os TODOS e pára;
 *  3. por coluna: `gerarDRE` → balancetes → `classificarVariacoes` →
 *     `montarSeccoesDFC` → `verificarArticulacao` (N e N-1);
 *  4. `provisorio`, `versao`, `avisos`.
 */
export async function gerarDFC(filtro: FiltroDFCInput, ctx: Ctx): Promise<ResultadoDFC> {
  const intervalo = await resolverIntervalo(filtro, ctx);

  const versao = await lerVersaoAtual(ctx);
  if (!versao) {
    const semSeed: ImpedimentosDFC = { impedimentos: [IMPEDIMENTO_NAO_SEMEADO], contasNaoMapeadas: [], avisos: [] };
    return semSeed;
  }

  const [homologo, cfg] = await Promise.all([resolverHomologo(intervalo, ctx), lerConfiguracao(ctx)]);
  const coerencia = coerenciaContasCaixa(await lerContasCaixa(cfg.contasCaixa, ctx));
  const avisos: AvisoConfiguracao[] = coerencia.avisos;

  const { todas, saldosN, saldosH } = await apurarTodas(intervalo, homologo, cfg, ctx);
  if (todas.length > 0 || coerencia.impedimentos.length > 0) {
    const impedimentos: ImpedimentosDFC = {
      impedimentos: [
        ...todas.map((n) => fraseNaoMapeada(n.apurada, n.comparativo && homologo ? homologo : intervalo, n.comparativo)),
        ...coerencia.impedimentos,
      ],
      contasNaoMapeadas: todas.map((n) => n.apurada.item),
      avisos,
    };
    return impedimentos;
  }

  const atual = await montarColuna(intervalo, saldosN, cfg, ctx);
  const colunaHomologa = homologo && saldosH ? await montarColuna(homologo, saldosH, cfg, ctx) : null;

  const dfc: DFC = {
    atual,
    homologo: colunaHomologa,
    provisorio: await provisorioDe(intervalo, ctx),
    versao: { id: versao.id, numero: versao.numero, estado: versao.estado },
    avisos,
  };
  return dfc;
}

/** O que existe hoje do contrato; o resto (`config`) chega no nó próprio. */
export const dfcService = { gerarDFC, contasNaoMapeadas } satisfies Pick<IDfcService, 'gerarDFC' | 'contasNaoMapeadas'>;
