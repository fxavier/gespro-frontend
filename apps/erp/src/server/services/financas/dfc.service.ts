import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { formatMZN } from '@/lib/format-currency';
import type {
  CriarRubricaInput,
  DefinirContasCaixaInput,
  EditarRubricaInput,
  FiltroDFCInput,
  MapearContaInput,
  ValidarVersaoInput,
} from '@/lib/validations/fluxo-caixa';
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
import { instantaneoDe, mudou } from './mapeamento-versao.model';
import { ERROS_DFC } from './dfc.interface';
import type {
  AvisoConfiguracao,
  ColunaDFC,
  ContaResumoDFC,
  InstantaneoMapeamento,
  MapeamentoContaFluxo,
  PainelConfiguracaoDFC,
  RubricaFluxoCaixa,
  VersaoComValidador,
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
 * A DFC é SÓ LEITURA do razão: não escreve em `Lancamento`/`PartidaLancamento`
 * (gate-periodo). As únicas escritas deste ficheiro são as da CONFIGURAÇÃO do
 * mapeamento (rubricas, mapeamentos, versões — nó `config`, no fim do ficheiro). Toda a aritmética vive no núcleo puro (`dfc.model.ts`) e no
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
async function apurarNaoMapeadas(
  saldos: Saldos,
  cfg: Configuracao,
  comparativo: boolean,
  ctx: Ctx,
): Promise<NaoMapeadaApurada[]> {
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
        comparativo,
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
  return todas.map((n) => n.item);
}

interface Apuramento {
  /** Por código. `apurada.item.comparativo` diz de que coluna são os valores. */
  todas: NaoMapeadaApurada[];
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
  const doN = await apurarNaoMapeadas(saldosN, cfg, false, ctx);
  const vistas = new Set(doN.map((n) => n.item.conta.id));
  const doH = saldosH ? (await apurarNaoMapeadas(saldosH, cfg, true, ctx)).filter((n) => !vistas.has(n.item.conta.id)) : [];
  const todas = [...doN, ...doH].sort((a, b) => (a.item.conta.codigo < b.item.conta.codigo ? -1 : 1));
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
        ...todas.map((n) =>
          fraseNaoMapeada(n, n.item.comparativo && homologo ? homologo : intervalo, n.item.comparativo),
        ),
        ...coerencia.impedimentos,
      ],
      contasNaoMapeadas: todas.map((n) => n.item),
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

// ---------------------------------------------------------------------------
// Configuração do mapeamento (nó `config`, ticket 7.1) — escritas versionadas
// ---------------------------------------------------------------------------
//
// Todas as escritas da cópia de trabalho (`RubricaFluxoCaixa`,
// `MapeamentoContaFluxo`) passam por `escreverVersionado`:
//  - uma única `$transaction` interactiva, que começa pela tranca consultiva do
//    tenant (`pg_advisory_xact_lock`, ver `trancarMapeamento`) — serializa TODOS
//    os escritores entre si e com o `validarVersao`, mesmo num tenant ainda sem
//    versão nenhuma (onde um `FOR UPDATE` não tranca linha alguma) — e depois
//    tranca a versão mais recente com `FOR UPDATE`: uma validação nunca fica
//    presa a uma versão que outro escritor acabou de ultrapassar (V3);
//  - a escrita propriamente dita, SINGULAR (`create`/`update`/`delete` de uma
//    linha, nunca `upsert` nem `*Many`: essas passam sem `AuditLog`);
//  - o instantâneo do vivo, lido na MESMA tx, e a versão n+1 em `PENDING` se e só
//    se `mudou()` (V1, V2). Uma falha em qualquer passo desfaz tudo.
//
// Isolamento (I10): cada id que chega do cliente resolve-se primeiro por
// `findFirst({ where: { id, tenantId } })`, e a recusa (`NotFoundError`) sai
// ANTES de qualquer escrita. As FKs da 22b não são escopadas por tenant — um
// `update`/`delete` só se faz por `id` já confirmado como do tenant.

/**
 * O cliente de transacção do `prisma` ESTENDIDO (tenant + auditoria) — não o
 * `Prisma.TransactionClient` cru: as escritas destes três modelos têm de passar
 * pela `audit-extension` (AUDIT_MODELS), e isso só acontece no cliente estendido.
 */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function naoEncontradaConta(): NotFoundError {
  return new NotFoundError('Conta do plano de contas não encontrada');
}

function naoEncontradaRubrica(): NotFoundError {
  return new NotFoundError('Rubrica da DFC não encontrada');
}

async function contaDoTenant(tx: Tx, contaId: string, ctx: Ctx): Promise<{ id: string; codigo: string; nome: string }> {
  const conta = await tx.contaPGC.findFirst({
    where: { id: contaId, tenantId: ctx.tenantId },
    select: { id: true, codigo: true, nome: true },
  });
  if (!conta) throw naoEncontradaConta();
  return conta;
}

async function rubricaDoTenant(tx: Tx, rubricaId: string, ctx: Ctx) {
  const rubrica = await tx.rubricaFluxoCaixa.findFirst({
    where: { id: rubricaId, tenantId: ctx.tenantId, deletedAt: null },
  });
  if (!rubrica) throw naoEncontradaRubrica();
  return rubrica;
}

async function contarContasDaRubrica(tx: Tx, rubricaId: string, ctx: Ctx): Promise<number> {
  return tx.mapeamentoContaFluxo.count({ where: { tenantId: ctx.tenantId, rubricaId } });
}

function eUnicidade(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

function codigoDuplicado(codigo: string): BusinessRuleError {
  return new BusinessRuleError(
    ERROS_DFC.RUBRICA_CODIGO_DUPLICADO,
    `Já existe uma rubrica com o código ${codigo} neste tenant (incluindo rubricas eliminadas).`,
    { codigo },
  );
}

/**
 * Código livre no tenant. Esta leitura NÃO vê rubricas eliminadas: a
 * `tenant-extension` injecta `deletedAt: null` nos modelos com soft delete. Uma
 * rubrica eliminada continua a ocupar o `@@unique([tenantId, codigo])`, e esse
 * caso só se apanha no P2002 do `create`/`update`, traduzido por `codigoDuplicado`.
 */
async function exigirCodigoLivre(tx: Tx, codigo: string, ctx: Ctx): Promise<void> {
  const ocupado = await tx.rubricaFluxoCaixa.findFirst({
    where: { tenantId: ctx.tenantId, codigo },
    select: { id: true },
  });
  if (ocupado) throw codigoDuplicado(codigo);
}

/**
 * V1 + V2: o esqueleto de todas as escritas de configuração. `escrever` faz as
 * escritas singulares na tx; no fim, se o instantâneo do vivo mudou face ao da
 * versão mais recente, nasce a versão n+1 em `PENDING`, na mesma tx.
 */
/**
 * Tranca consultiva do mapeamento do tenant, libertada no fim da tx. Serializa
 * escritores e validações do mesmo tenant sem depender de existir uma linha de
 * versão para trancar; tenants diferentes não se esperam uns aos outros.
 */
async function trancarMapeamento(tx: Tx, ctx: Ctx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('dfc-mapeamento:' || ${ctx.tenantId}::text, 0))`;
}

/** Duas versões com o mesmo número: outro escritor passou à frente (só sem a tranca consultiva). */
function alteradoEmSimultaneo(): BusinessRuleError {
  return new BusinessRuleError(
    ERROS_DFC.MAPEAMENTO_ALTERADO_EM_SIMULTANEO,
    'A configuração foi alterada por outra pessoa entretanto. Tente de novo.',
  );
}

async function escreverVersionado<T>(ctx: Ctx, escrever: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await trancarMapeamento(tx, ctx);
    // Tranca a versão mais recente (a mesma linha que o `validarVersao` tranca).
    await tx.$queryRaw`SELECT "id" FROM "VersaoMapeamentoFluxo" WHERE "tenantId" = ${ctx.tenantId} ORDER BY "numero" DESC LIMIT 1 FOR UPDATE`;
    const ultima = await tx.versaoMapeamentoFluxo.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { numero: 'desc' },
      select: { numero: true, instantaneo: true },
    });

    const resultado = await escrever(tx);

    const rubricas = await tx.rubricaFluxoCaixa.findMany({ where: { tenantId: ctx.tenantId } });
    const mapeamentos = await tx.mapeamentoContaFluxo.findMany({
      where: { tenantId: ctx.tenantId },
      select: { contaId: true, rubricaId: true },
    });
    const novo = instantaneoDe(rubricas as RubricaFluxoCaixa[], mapeamentos);
    const anterior = ultima ? (ultima.instantaneo as unknown as InstantaneoMapeamento) : null;
    if (mudou(anterior, novo)) {
      await tx.versaoMapeamentoFluxo.create({
        data: {
          tenantId: ctx.tenantId,
          numero: (ultima?.numero ?? 0) + 1,
          estado: 'PENDING',
          instantaneo: novo as unknown as Prisma.InputJsonValue,
          validadoPorId: null,
          validadoEm: null,
          observacao: null,
        },
      }).catch((e: unknown) => {
        if (eUnicidade(e)) throw alteradoEmSimultaneo();
        throw e;
      });
    }
    return resultado;
  });
}

/**
 * Atribui a conta a uma rubrica (cria ou reatribui o mapeamento). A conta
 * passa a ter exactamente um mapeamento (`@@unique([tenantId, contaId])`).
 * Mapear para a rubrica onde já está não escreve nada nem cria versão.
 */
export async function mapearConta(input: MapearContaInput, ctx: Ctx): Promise<MapeamentoContaFluxo> {
  return escreverVersionado(ctx, async (tx) => {
    await contaDoTenant(tx, input.contaId, ctx);
    const rubrica = await rubricaDoTenant(tx, input.rubricaId, ctx);
    if (!rubrica.ativo) {
      throw new BusinessRuleError(
        ERROS_DFC.RUBRICA_INATIVA,
        `A rubrica ${rubrica.codigo} está desactivada: reactive-a antes de lhe mapear contas.`,
        { rubricaId: rubrica.id },
      );
    }
    const actual = await tx.mapeamentoContaFluxo.findFirst({
      where: { tenantId: ctx.tenantId, contaId: input.contaId },
    });
    if (actual && actual.rubricaId === rubrica.id) return actual;
    if (actual) {
      return tx.mapeamentoContaFluxo.update({ where: { id: actual.id }, data: { rubricaId: rubrica.id } });
    }
    return tx.mapeamentoContaFluxo.create({
      data: { tenantId: ctx.tenantId, contaId: input.contaId, rubricaId: rubrica.id },
    });
  });
}

/**
 * Retira o mapeamento da conta (ajuste 4 do grafo). A conta fica NÃO mapeada:
 * se tiver movimento, passa a impedimento da DFC até alguém a reatribuir.
 * Uma conta sem mapeamento devolve `null`, sem escrita nem versão.
 */
export async function desmapearConta(contaId: string, ctx: Ctx): Promise<MapeamentoContaFluxo | null> {
  return escreverVersionado(ctx, async (tx) => {
    await contaDoTenant(tx, contaId, ctx);
    const actual = await tx.mapeamentoContaFluxo.findFirst({ where: { tenantId: ctx.tenantId, contaId } });
    if (!actual) return null;
    return tx.mapeamentoContaFluxo.delete({ where: { id: actual.id } });
  });
}

/**
 * Nasce `origem: TENANT`, activa. Só há UMA rubrica de caixa por tenant (a
 * semeada): as contas de caixa definem-se em `definirContasCaixa`.
 */
export async function criarRubrica(input: CriarRubricaInput, ctx: Ctx): Promise<RubricaFluxoCaixa> {
  if (input.atividade === 'CAIXA') {
    throw new BusinessRuleError(
      ERROS_DFC.RUBRICA_CAIXA_UNICA,
      'Só existe uma rubrica de caixa e equivalentes; as contas de caixa definem-se em «Contas de caixa».',
    );
  }
  return escreverVersionado(ctx, async (tx) => {
    await exigirCodigoLivre(tx, input.codigo, ctx);
    try {
      return await tx.rubricaFluxoCaixa.create({
        data: {
          tenantId: ctx.tenantId,
          codigo: input.codigo,
          designacao: input.designacao,
          atividade: input.atividade,
          sinal: input.sinal,
          ordem: input.ordem,
          origem: 'TENANT',
          ativo: true,
        },
      });
    } catch (e) {
      if (eUnicidade(e)) throw codigoDuplicado(input.codigo);
      throw e;
    }
  });
}

type CampoEditavel = 'codigo' | 'designacao' | 'atividade' | 'sinal' | 'ordem' | 'ativo';
const CAMPOS_EDITAVEIS: readonly CampoEditavel[] = ['codigo', 'designacao', 'atividade', 'sinal', 'ordem', 'ativo'];

/**
 * Edição parcial. Só se escreve o que muda; sem mudança não há escrita nem
 * versão. Regras:
 *  - desactivar uma rubrica com contas ⇒ `RUBRICA_COM_CONTAS` (MINOR-2 do
 *    `servico`): reatribua ou desmapeie as contas primeiro;
 *  - o código de uma rubrica `SISTEMA` não muda ⇒ `RUBRICA_DE_SISTEMA`;
 *  - a actividade não entra nem sai de `CAIXA` ⇒ `RUBRICA_CAIXA_UNICA`.
 */
export async function editarRubrica(input: EditarRubricaInput, ctx: Ctx): Promise<RubricaFluxoCaixa> {
  return escreverVersionado(ctx, async (tx) => {
    const actual = await rubricaDoTenant(tx, input.id, ctx);
    const data: Partial<Pick<RubricaFluxoCaixa, CampoEditavel>> = {};
    for (const campo of CAMPOS_EDITAVEIS) {
      const novo = input[campo];
      if (novo !== undefined && novo !== actual[campo]) (data as Record<string, unknown>)[campo] = novo;
    }
    if (Object.keys(data).length === 0) return actual;

    if (data.codigo !== undefined && actual.origem === 'SISTEMA') {
      throw new BusinessRuleError(
        ERROS_DFC.RUBRICA_DE_SISTEMA,
        `O código da rubrica de sistema ${actual.codigo} não se altera.`,
        { rubricaId: actual.id },
      );
    }
    if (data.atividade !== undefined && (data.atividade === 'CAIXA' || actual.atividade === 'CAIXA')) {
      throw new BusinessRuleError(
        ERROS_DFC.RUBRICA_CAIXA_UNICA,
        'A actividade de caixa e equivalentes não se atribui nem se retira a uma rubrica existente.',
        { rubricaId: actual.id },
      );
    }
    if (data.ativo === false) {
      const contas = await contarContasDaRubrica(tx, actual.id, ctx);
      if (contas > 0) {
        throw new BusinessRuleError(
          ERROS_DFC.RUBRICA_COM_CONTAS,
          `A rubrica ${actual.codigo} tem ${contas} conta(s) mapeada(s): reatribua-as ou desmapeie-as antes de a desactivar.`,
          { rubricaId: actual.id, contas },
        );
      }
    }
    if (data.codigo !== undefined) await exigirCodigoLivre(tx, data.codigo, ctx);

    try {
      return await tx.rubricaFluxoCaixa.update({ where: { id: actual.id }, data });
    } catch (e) {
      if (eUnicidade(e) && data.codigo !== undefined) throw codigoDuplicado(data.codigo);
      throw e;
    }
  });
}

/**
 * Soft delete (`deletedAt`) de uma rubrica `TENANT` sem contas. `SISTEMA`
 * recusa com `RUBRICA_DE_SISTEMA` (desactiva-se, não se apaga); com contas
 * recusa com `RUBRICA_COM_CONTAS`.
 */
export async function eliminarRubrica(id: string, ctx: Ctx): Promise<RubricaFluxoCaixa> {
  return escreverVersionado(ctx, async (tx) => {
    const actual = await rubricaDoTenant(tx, id, ctx);
    if (actual.origem === 'SISTEMA') {
      throw new BusinessRuleError(
        ERROS_DFC.RUBRICA_DE_SISTEMA,
        `A rubrica ${actual.codigo} é de sistema: não se elimina (pode desactivá-la quando não tiver contas).`,
        { rubricaId: actual.id },
      );
    }
    const contas = await contarContasDaRubrica(tx, actual.id, ctx);
    if (contas > 0) {
      throw new BusinessRuleError(
        ERROS_DFC.RUBRICA_COM_CONTAS,
        `A rubrica ${actual.codigo} tem ${contas} conta(s) mapeada(s): reatribua-as ou desmapeie-as antes de a eliminar.`,
        { rubricaId: actual.id, contas },
      );
    }
    return tx.rubricaFluxoCaixa.update({ where: { id: actual.id }, data: { deletedAt: new Date() } });
  });
}

/**
 * E2. `contaIds` passa a ser o conjunto EXACTO das contas de caixa: as que
 * entram mapeiam à rubrica `CAIXA` (reatribuídas, se estavam noutra); as que
 * saem ficam SEM mapeamento — nunca se adivinha uma actividade para elas.
 * Uma conta alheia ou inexistente em qualquer posição da lista ⇒ 404 antes de
 * escrever. O mesmo conjunto noutra ordem não escreve nada.
 */
export async function definirContasCaixa(
  input: DefinirContasCaixaInput,
  ctx: Ctx,
): Promise<MapeamentoContaFluxo[]> {
  const ids = [...new Set(input.contaIds)];
  return escreverVersionado(ctx, async (tx) => {
    const contas = await tx.contaPGC.findMany({
      where: { tenantId: ctx.tenantId, id: { in: ids } },
      select: { id: true },
    });
    if (contas.length !== ids.length) throw naoEncontradaConta();

    const rubricasCaixa = await tx.rubricaFluxoCaixa.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null, atividade: 'CAIXA' },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, ativo: true },
    });
    const caixa = rubricasCaixa[0];
    if (!caixa) throw new NotFoundError('Rubrica de caixa e equivalentes não encontrada neste tenant');
    if (!caixa.ativo && ids.length > 0) {
      throw new BusinessRuleError(
        ERROS_DFC.RUBRICA_INATIVA,
        `A rubrica ${caixa.codigo} (caixa e equivalentes) está desactivada: reactive-a antes de lhe atribuir contas.`,
        { rubricaId: caixa.id },
      );
    }
    const idsCaixa = rubricasCaixa.map((r) => r.id);

    const actuais = await tx.mapeamentoContaFluxo.findMany({
      where: { tenantId: ctx.tenantId, OR: [{ rubricaId: { in: idsCaixa } }, { contaId: { in: ids } }] },
    });
    const pedidas = new Set(ids);
    const porConta = new Map(actuais.map((m) => [m.contaId, m]));

    // As que saem do conjunto: ficam sem mapeamento.
    for (const m of actuais) {
      if (idsCaixa.includes(m.rubricaId) && !pedidas.has(m.contaId)) {
        await tx.mapeamentoContaFluxo.delete({ where: { id: m.id } });
      }
    }
    // As que entram (ou já estavam noutra rubrica de caixa): mapeiam à rubrica CAIXA.
    for (const contaId of ids) {
      const m = porConta.get(contaId);
      if (m && m.rubricaId === caixa.id) continue;
      if (m) await tx.mapeamentoContaFluxo.update({ where: { id: m.id }, data: { rubricaId: caixa.id } });
      else await tx.mapeamentoContaFluxo.create({ data: { tenantId: ctx.tenantId, contaId, rubricaId: caixa.id } });
    }

    return tx.mapeamentoContaFluxo.findMany({
      where: { tenantId: ctx.tenantId, rubricaId: caixa.id },
      orderBy: { contaId: 'asc' },
    });
  });
}

/**
 * V3. Valida a versão indicada, se — e só se — for a mais recente e estiver
 * `PENDING`. A versão tranca-se com `FOR UPDATE` DENTRO da tx e ANTES do
 * update; o estado que decide é lido depois da tranca. A única escrita é o
 * `update` dos quatro campos da validação.
 */
export async function validarVersao(input: ValidarVersaoInput, ctx: Ctx): Promise<VersaoMapeamentoFluxo> {
  return prisma.$transaction(async (tx) => {
    await trancarMapeamento(tx, ctx);
    const [trancada] = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "VersaoMapeamentoFluxo" WHERE "id" = ${input.versaoId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    if (!trancada) throw new NotFoundError('Versão do mapeamento não encontrada');

    const versao = await tx.versaoMapeamentoFluxo.findFirst({
      where: { id: trancada.id, tenantId: ctx.tenantId },
      select: { id: true, numero: true, estado: true },
    });
    if (!versao) throw new NotFoundError('Versão do mapeamento não encontrada');
    const recente = await tx.versaoMapeamentoFluxo.findFirst({
      where: { tenantId: ctx.tenantId },
      orderBy: { numero: 'desc' },
      select: { id: true, numero: true },
    });
    if (!recente || recente.id !== versao.id) {
      throw new BusinessRuleError(
        ERROS_DFC.VERSAO_DESACTUALIZADA,
        `A versão ${versao.numero} já não é a actual (a actual é a ${recente?.numero ?? '—'}): só se valida a versão mais recente.`,
        { versaoId: versao.id, numero: versao.numero, actual: recente?.numero ?? null },
      );
    }
    if (versao.estado === 'VALIDATED') {
      throw new BusinessRuleError(
        ERROS_DFC.VERSAO_JA_VALIDADA,
        `A versão ${versao.numero} já está validada.`,
        { versaoId: versao.id, numero: versao.numero },
      );
    }
    const validada = await tx.versaoMapeamentoFluxo.update({
      where: { id: versao.id },
      data: {
        estado: 'VALIDATED',
        validadoPorId: ctx.userId,
        validadoEm: new Date(),
        observacao: input.observacao ?? null,
      },
    });
    return validada as unknown as VersaoMapeamentoFluxo;
  });
}

// ---------------------------------------------------------------------------
// Leituras da configuração
// ---------------------------------------------------------------------------

/** A versão mais recente (maior `numero`), ou `null` num tenant sem seed do mapeamento. */
export async function versaoAtual(ctx: Ctx): Promise<VersaoMapeamentoFluxo | null> {
  const v = await prisma.versaoMapeamentoFluxo.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { numero: 'desc' },
  });
  return v as unknown as VersaoMapeamentoFluxo | null;
}

/** Versões do tenant, da mais recente para a mais antiga. */
export async function listarVersoes(ctx: Ctx): Promise<VersaoMapeamentoFluxo[]> {
  const vs = await prisma.versaoMapeamentoFluxo.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { numero: 'desc' },
  });
  return vs as unknown as VersaoMapeamentoFluxo[];
}

/** Rubricas activas e não apagadas do tenant, por (`atividade`, `ordem`). */
export async function listarRubricas(ctx: Ctx): Promise<RubricaFluxoCaixa[]> {
  return prisma.rubricaFluxoCaixa.findMany({
    where: { tenantId: ctx.tenantId, deletedAt: null, ativo: true },
    orderBy: [{ atividade: 'asc' }, { ordem: 'asc' }, { codigo: 'asc' }],
  });
}

/** Cópia de trabalho do mapeamento do tenant. */
export async function listarMapeamentos(ctx: Ctx): Promise<MapeamentoContaFluxo[]> {
  return prisma.mapeamentoContaFluxo.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { contaId: 'asc' } });
}

/**
 * O painel de configuração (UI de rubricas): TODAS as rubricas não apagadas,
 * activas e inactivas, cada uma com as contas que lhe estão mapeadas, e as
 * contas folha activas do tenant que não têm mapeamento nenhum. Um mapeamento
 * para uma rubrica que o tenant não tem (FK alheia, 22b) aparece como conta
 * sem mapeamento — é assim que a DFC o trata.
 */
export async function painelConfiguracao(ctx: Ctx): Promise<PainelConfiguracaoDFC> {
  const [rubricas, mapeamentos] = await Promise.all([
    prisma.rubricaFluxoCaixa.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null },
      orderBy: [{ atividade: 'asc' }, { ordem: 'asc' }, { codigo: 'asc' }],
    }),
    prisma.mapeamentoContaFluxo.findMany({
      where: { tenantId: ctx.tenantId },
      select: { contaId: true, rubricaId: true },
    }),
  ]);
  const idsRubricas = new Set(rubricas.map((r) => r.id));
  const validos = mapeamentos.filter((m) => idsRubricas.has(m.rubricaId));
  const mapeadas = new Set(validos.map((m) => m.contaId));

  const [contasMapeadas, semMapeamento] = await Promise.all([
    prisma.contaPGC.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...mapeadas] } },
      select: { id: true, codigo: true, nome: true },
      orderBy: { codigo: 'asc' },
    }),
    prisma.contaPGC.findMany({
      where: { tenantId: ctx.tenantId, aceitaLancamento: true, ativo: true, id: { notIn: [...mapeadas] } },
      select: { id: true, codigo: true, nome: true },
      orderBy: { codigo: 'asc' },
    }),
  ]);
  const rubricaDaConta = new Map(validos.map((m) => [m.contaId, m.rubricaId]));
  const contasPorRubrica = new Map<string, ContaResumoDFC[]>();
  for (const c of contasMapeadas) {
    const r = rubricaDaConta.get(c.id);
    if (!r) continue;
    const lista = contasPorRubrica.get(r) ?? [];
    lista.push(c);
    contasPorRubrica.set(r, lista);
  }
  return {
    rubricas: rubricas.map((r) => ({ rubrica: r, contas: contasPorRubrica.get(r.id) ?? [] })),
    contasSemMapeamento: semMapeamento,
  };
}

/** Uma rubrica não apagada do tenant, para o formulário de edição. Alheia ou apagada ⇒ `NotFoundError`. */
export async function obterRubrica(id: string, ctx: Ctx): Promise<RubricaFluxoCaixa> {
  const r = await prisma.rubricaFluxoCaixa.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } });
  if (!r) throw naoEncontradaRubrica();
  return r;
}

/** Uma conta do tenant e a rubrica a que está mapeada (ou `null`), para o «Mapear conta». */
export async function obterContaParaMapear(
  contaId: string,
  ctx: Ctx,
): Promise<ContaResumoDFC & { rubricaId: string | null }> {
  const conta = await prisma.contaPGC.findFirst({
    where: { id: contaId, tenantId: ctx.tenantId },
    select: { id: true, codigo: true, nome: true },
  });
  if (!conta) throw naoEncontradaConta();
  const m = await prisma.mapeamentoContaFluxo.findFirst({
    where: { tenantId: ctx.tenantId, contaId },
    select: { rubricaId: true },
  });
  return { ...conta, rubricaId: m?.rubricaId ?? null };
}

/** O histórico das versões com o nome de quem validou (UI). Da mais recente para a mais antiga. */
export async function historicoVersoes(ctx: Ctx): Promise<VersaoComValidador[]> {
  const versoes = await listarVersoes(ctx);
  const ids = [...new Set(versoes.map((v) => v.validadoPorId).filter((x): x is string => x !== null))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, nome: true } })
    : [];
  const nomePorId = new Map(users.map((u) => [u.id, u.nome]));
  return versoes.map((v) => ({
    ...v,
    validadoPorNome: v.validadoPorId ? (nomePorId.get(v.validadoPorId) ?? null) : null,
    contas: v.instantaneo?.mapeamentos?.length ?? 0,
    rubricas: v.instantaneo?.rubricas?.length ?? 0,
  }));
}

export const dfcService = {
  gerarDFC,
  contasNaoMapeadas,
  listarRubricas,
  listarMapeamentos,
  mapearConta,
  desmapearConta,
  criarRubrica,
  editarRubrica,
  eliminarRubrica,
  definirContasCaixa,
  listarVersoes,
  versaoAtual,
  validarVersao,
} satisfies IDfcService;
