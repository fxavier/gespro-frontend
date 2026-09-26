import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AUDIT_MODELS } from '@/server/db/audit-extension';
import type { AtividadeSeccao, SinalFluxo } from '@/lib/validations/fluxo-caixa';
import type { Ctx } from '../contabilidade.interface';
import type {
  DFC,
  IDfcService,
  InstantaneoMapeamento,
  MapeamentoContaFluxo,
  RubricaFluxoCaixa,
  RubricaInstantaneo,
} from '../dfc.interface';
import { instantaneoDe } from '../mapeamento-versao.model';
import { afirmarV1 } from './helpers/juiz-v1-dfc';
import {
  duploConfigDfc as duplo,
  OPERACOES_ESCRITA,
  OPERACOES_PROIBIDAS,
  type Chamada,
  type Linha,
  type Modelo,
  type Tabelas,
} from './helpers/duplo-config-dfc';
// ---------------------------------------------------------------------------
// ORÁCULO do nó `config-v` (grafo dfc, gate do ticket 7) — escrito pelo
// verificador-fluxo-caixa. FICHEIRO PROTEGIDO: o `feat-dfc` não lhe toca
// (doutrina 00 §2; grafo dfc, «Ficheiros protegidos»). Se um invariante daqui
// estiver errado, é uma alteração ao ADR-0037 e escala-se ao orquestrador.
//
// Contra o SERVIÇO REAL (`dfc.service.ts`) e um duplo COM ESTADO de
// `@/server/db/client` (helpers/duplo-config-dfc.ts: transacções com commit e
// rollback, tenant-extension emulada, FKs não escopadas como na 22b, `upsert`
// e `*Many` proibidos e contados). Nenhuma escrita na base.
//
// Invariantes (ADR-0037, Emenda 2026-09-25, E1/E5; grafo dfc, ajustes 4 e 5):
//  - V1  o instantâneo da versão mais recente é igual ao mapeamento vivo;
//  - V2  cada escrita que muda o mapeamento cria a versão n+1 em PENDING NA
//        MESMA transacção; uma falha a meio não deixa nem escrita nem versão;
//        uma escrita que não muda nada não cria versão;
//  - V3  só se valida a versão mais recente (VERSAO_DESACTUALIZADA); validar é
//        a única escrita sobre uma versão, trancada com FOR UPDATE;
//  - transição nos DOIS sentidos, vista pelo `gerarDFC`;
//  - RUBRICA_DE_SISTEMA; e RUBRICA_COM_CONTAS (MINOR-2 do `servico`, código
//        fixado por este oráculo): desactivar ou apagar rubrica com contas;
//  - I10 contaId/rubricaId/versaoId de outro tenant ⇒ NotFoundError ANTES de
//        escrever (zero escritas);
//  - auditoria: nenhuma escrita por `upsert`/`*Many`; os três modelos em
//        AUDIT_MODELS.
//
// `desmapearConta(contaId, ctx)` ainda não está no contrato (ajuste 4 do
// grafo): a assinatura fica fixada aqui, em `ServicoConfig`.
// ---------------------------------------------------------------------------

vi.mock('@/server/db/client', async () => {
  const m = await import('./helpers/duplo-config-dfc');
  return { prisma: m.duploConfigDfc.prisma, prismaBase: m.duploConfigDfc.prismaBase };
});

// `gerarDFC` só é chamado na transição: o razão é vazio (a DFC sai com zeros e
// articula); o que se mede é a `versao` que ela reporta.
vi.mock('../contabilidade.service', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../contabilidade.service')>();
  return {
    ...orig,
    gerarBalancete: async (f: { dataInicio: Date; dataFim: Date; incluirZeradas: boolean }) => ({
      dataInicio: f.dataInicio,
      dataFim: f.dataFim,
      ...orig.montarLinhasBalancete([], new Map() as never, f.incluirZeradas),
    }),
    gerarDRE: async (f: { dataInicio: Date; dataFim: Date }) => ({
      dataInicio: f.dataInicio,
      dataFim: f.dataFim,
      ...orig.calcularLinhasDRE([], new Map() as never),
    }),
  };
});

import * as servico from '../dfc.service';

/**
 * O que o nó `config` tem de exportar de `dfc.service.ts` (exportações
 * nomeadas). Enquanto faltarem, o tsc acusa AQUI (TS2739) e cada teste
 * rebenta com «… is not a function».
 */
type ServicoConfig = Pick<
  IDfcService,
  | 'gerarDFC'
  | 'mapearConta'
  | 'criarRubrica'
  | 'editarRubrica'
  | 'eliminarRubrica'
  | 'definirContasCaixa'
  | 'validarVersao'
  | 'versaoAtual'
  | 'listarVersoes'
> & {
  /** Ajuste 4 do grafo: remove o mapeamento da conta (escrita singular, versão n+1, 404 cross-tenant). */
  desmapearConta(contaId: string, ctx: Ctx): Promise<unknown>;
};
const svc: ServicoConfig = servico;

/** ≥ 1000 por propriedade — exigência do verificador. */
const NUM_RUNS = 1000;

/** MINOR-2 do nó `servico`: o código que este oráculo fixa. */
const RUBRICA_COM_CONTAS = 'RUBRICA_COM_CONTAS';
const RUBRICA_DE_SISTEMA = 'RUBRICA_DE_SISTEMA';
const VERSAO_DESACTUALIZADA = 'VERSAO_DESACTUALIZADA';
const NAO_ENCONTRADO = 'NAO_ENCONTRADO';

// ---------------------------------------------------------------------------
// Universo: tenant A (o que se configura) e tenant B (o alheio)
// ---------------------------------------------------------------------------

const A = 't-dfc-config-a';
const B = 't-dfc-config-b';
const CONFIGURADOR = 'u-configurador';
const CONTABILISTAS = ['u-contabilista-1', 'u-contabilista-2'] as const;
const T0 = new Date(Date.UTC(2026, 0, 5, 10)); // instante fixo das linhas semeadas

function conta(tenantId: string, id: string, codigo: string, nome: string, classe: number, tipo: string, natureza: string): Linha {
  return {
    id,
    tenantId,
    codigo,
    nome,
    classe: `CLASSE_${classe}`,
    tipo,
    natureza,
    nivel: codigo.length,
    contaMaeId: null,
    aceitaLancamento: true,
    ativo: true,
    descricao: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

/** As contas folha de A. 421 e 44331 são as da classe 4 com o sinal ao contrário. */
const CONTAS_A: readonly Linha[] = [
  conta(A, 'a-111', '111', 'Caixa', 1, 'ATIVO', 'DEVEDORA'),
  conta(A, 'a-121', '121', 'Depósitos à ordem — BCI', 1, 'ATIVO', 'DEVEDORA'),
  conta(A, 'a-123', '123', 'Depósitos à ordem — Standard Bank', 1, 'ATIVO', 'DEVEDORA'),
  conta(A, 'a-251', '251', 'Empréstimos bancários', 2, 'PASSIVO', 'CREDORA'),
  conta(A, 'a-261', '261', 'Investimentos financeiros', 2, 'ATIVO', 'DEVEDORA'),
  conta(A, 'a-311', '311', 'Mercadorias', 3, 'ATIVO', 'DEVEDORA'),
  conta(A, 'a-411', '411', 'Clientes c/c', 4, 'ATIVO', 'DEVEDORA'),
  conta(A, 'a-421', '421', 'Fornecedores c/c', 4, 'PASSIVO', 'DEVEDORA'),
  conta(A, 'a-44331', '44331', 'IVA liquidado', 4, 'PASSIVO', 'DEVEDORA'),
  conta(A, 'a-611', '611', 'Custo das mercadorias vendidas', 6, 'GASTO', 'DEVEDORA'),
  conta(A, 'a-711', '711', 'Vendas', 7, 'RENDIMENTO', 'CREDORA'),
  conta(A, 'a-4999', '4999', 'Conta criada pelo tenant, por mapear', 4, 'ATIVO', 'DEVEDORA'),
];
const IDS_CONTAS_A = CONTAS_A.map((c) => String(c.id));

const CONTAS_B: readonly Linha[] = [
  conta(B, 'b-111', '111', 'Caixa', 1, 'ATIVO', 'DEVEDORA'),
  conta(B, 'b-421', '421', 'Fornecedores c/c', 4, 'PASSIVO', 'DEVEDORA'),
];

interface RubricaSemente {
  id: string;
  codigo: string;
  designacao: string;
  atividade: RubricaFluxoCaixa['atividade'];
  sinal: SinalFluxo;
  ordem: number;
  origem: 'SISTEMA' | 'TENANT';
  apagada?: boolean;
}

function rubrica(tenantId: string, r: RubricaSemente): Linha {
  return {
    id: r.id,
    tenantId,
    codigo: r.codigo,
    designacao: r.designacao,
    atividade: r.atividade,
    sinal: r.sinal,
    ordem: r.ordem,
    origem: r.origem,
    ativo: true,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: r.apagada ? T0 : null,
  };
}

const R = {
  CX01: { id: 'ra-cx01', codigo: 'CX-01', designacao: 'Caixa e equivalentes de caixa', atividade: 'CAIXA', sinal: 'VARIACAO', ordem: 1, origem: 'SISTEMA' },
  OP01: { id: 'ra-op01', codigo: 'OP-01', designacao: 'Recebimentos de clientes', atividade: 'OPERACIONAL', sinal: 'ENTRADA', ordem: 1, origem: 'SISTEMA' },
  OP02: { id: 'ra-op02', codigo: 'OP-02', designacao: 'Pagamentos a fornecedores', atividade: 'OPERACIONAL', sinal: 'SAIDA', ordem: 2, origem: 'SISTEMA' },
  INV01: { id: 'ra-inv01', codigo: 'INV-01', designacao: 'Pagamentos de inventários e activos', atividade: 'INVESTIMENTO', sinal: 'SAIDA', ordem: 1, origem: 'SISTEMA' },
  FIN01: { id: 'ra-fin01', codigo: 'FIN-01', designacao: 'Recebimentos de empréstimos', atividade: 'FINANCIAMENTO', sinal: 'ENTRADA', ordem: 1, origem: 'SISTEMA' },
  FIN02: { id: 'ra-fin02', codigo: 'FIN-02', designacao: 'Pagamentos de empréstimos', atividade: 'FINANCIAMENTO', sinal: 'SAIDA', ordem: 2, origem: 'SISTEMA' },
  OP90: { id: 'ra-op90', codigo: 'OP-90', designacao: 'Outros fluxos operacionais', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 90, origem: 'TENANT' },
  INV90: { id: 'ra-inv90', codigo: 'INV-90', designacao: 'Investimentos financeiros', atividade: 'INVESTIMENTO', sinal: 'VARIACAO', ordem: 90, origem: 'TENANT' },
  OP80: { id: 'ra-op80', codigo: 'OP-80', designacao: 'Rubrica apagada', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 80, origem: 'TENANT', apagada: true },
} as const satisfies Record<string, RubricaSemente>;

/** FIN-01 (SISTEMA) e OP-90 (TENANT) nascem sem contas; INV-90 (TENANT) tem uma. */
const MAPA_INICIAL_A: ReadonlyArray<readonly [string, string]> = [
  ['a-111', R.CX01.id],
  ['a-121', R.CX01.id],
  ['a-123', R.CX01.id],
  ['a-251', R.FIN02.id],
  ['a-261', R.INV90.id],
  ['a-311', R.INV01.id],
  ['a-411', R.OP01.id],
  ['a-421', R.OP02.id],
  ['a-44331', R.OP02.id],
  ['a-611', R.OP01.id],
  ['a-711', R.OP01.id],
];

const RB_CX = 'rb-cx01';
const RB_FIN99 = 'rb-fin99';
const CODIGO_ALHEIO = 'FIN-99';
const VERSAO_B = 'vb-1';
const CONTA_INEXISTENTE = 'conta-que-nao-existe';
const RUBRICA_INEXISTENTE = 'rubrica-que-nao-existe';

const mapeamento = (tenantId: string, contaId: string, rubricaId: string): Linha => ({
  id: `m-${tenantId}-${contaId}`,
  tenantId,
  contaId,
  rubricaId,
  createdAt: T0,
  updatedAt: T0,
});

function mundo(estadoV1: 'PENDING' | 'VALIDATED'): Tabelas {
  const rubricasA = Object.values(R).map((r) => rubrica(A, r));
  const mapsA = MAPA_INICIAL_A.map(([c, r]) => mapeamento(A, c, r));
  const rubricasB = [
    rubrica(B, { id: RB_CX, codigo: 'CX-01', designacao: 'Caixa', atividade: 'CAIXA', sinal: 'VARIACAO', ordem: 1, origem: 'SISTEMA' }),
    rubrica(B, { id: RB_FIN99, codigo: CODIGO_ALHEIO, designacao: 'Rubrica do outro tenant', atividade: 'FINANCIAMENTO', sinal: 'ENTRADA', ordem: 99, origem: 'TENANT' }),
  ];
  const mapsB = [mapeamento(B, 'b-111', RB_CX), mapeamento(B, 'b-421', RB_FIN99)];
  const versao = (tenantId: string, id: string, rs: Linha[], ms: Linha[], estado: 'PENDING' | 'VALIDATED'): Linha => ({
    id,
    tenantId,
    numero: 1,
    estado,
    instantaneo: JSON.parse(
      JSON.stringify(instantaneoDe(rs as unknown as RubricaFluxoCaixa[], ms as unknown as MapeamentoContaFluxo[])),
    ),
    validadoPorId: estado === 'VALIDATED' ? CONTABILISTAS[0] : null,
    validadoEm: estado === 'VALIDATED' ? T0 : null,
    observacao: estado === 'VALIDATED' ? 'Parecer inicial' : null,
    createdAt: T0,
  });
  return {
    contaPGC: [...CONTAS_A, ...CONTAS_B],
    exercicioContabil: [
      { id: 'ex-a-2026', tenantId: A, codigo: '2026', dataInicio: new Date(Date.UTC(2025, 11, 31, 22)), dataFim: new Date(Date.UTC(2026, 11, 31, 21, 59, 59, 999)), estado: 'ABERTO', anteriorId: null, criadoPorId: null, createdAt: T0, updatedAt: T0 },
    ],
    periodoContabil: [
      // 2026-01 em Africa/Maputo: 01/01 00:00 (+02:00) a 31/01 23:59:59.999 (+02:00).
      { id: 'pa-2026-01', tenantId: A, exercicioId: 'ex-a-2026', ordem: 1, codigo: '2026-01', dataInicio: new Date(Date.UTC(2025, 11, 31, 22)), dataFim: new Date(Date.UTC(2026, 0, 31, 21, 59, 59, 999)), estado: 'ABERTO', fechadoEm: null, fechadoPorId: null, createdAt: T0, updatedAt: T0 },
    ],
    rubricaFluxoCaixa: [...rubricasA, ...rubricasB],
    mapeamentoContaFluxo: [...mapsA, ...mapsB],
    versaoMapeamentoFluxo: [
      versao(A, 'va-1', rubricasA, mapsA, estadoV1),
      versao(B, VERSAO_B, rubricasB, mapsB, 'VALIDATED'),
    ],
  };
}

// ---------------------------------------------------------------------------
// Chamar o serviço como a action o chama: dentro do contexto de tenant
// ---------------------------------------------------------------------------

type Desfecho<T> = { ok: true; valor: T } | { ok: false; erro: unknown };

const ctxDe = (userId: string = CONFIGURADOR): Ctx => ({ tenantId: A, userId });

/** Erros de programação e do duplo NÃO são desfechos: sobem, para a saída vermelha dizer o que falta. */
function eErroDeProgramacao(e: unknown): boolean {
  return (
    e instanceof TypeError ||
    e instanceof ReferenceError ||
    (e instanceof Error && e.message.startsWith('[duplo da configuração da DFC]'))
  );
}

async function correr<T>(fn: (ctx: Ctx) => Promise<T>, userId: string = CONFIGURADOR): Promise<Desfecho<T>> {
  const ctx = ctxDe(userId);
  try {
    return { ok: true, valor: await runWithTenantContext({ tenantId: ctx.tenantId, userId: ctx.userId }, () => fn(ctx)) };
  } catch (e) {
    if (eErroDeProgramacao(e)) throw e;
    return { ok: false, erro: e };
  }
}

async function exigir<T>(fn: (ctx: Ctx) => Promise<T>, userId?: string): Promise<T> {
  const r = await correr(fn, userId);
  if (!r.ok) throw new Error(`devia passar e lançou: ${String(r.erro)}`, { cause: r.erro });
  return r.valor;
}

function codigoDe(e: unknown): string {
  if (e instanceof NotFoundError) return NAO_ENCONTRADO;
  if (e instanceof BusinessRuleError) return e.code;
  return `OUTRO(${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)})`;
}

// ---------------------------------------------------------------------------
// Leituras do estado commitado no duplo
// ---------------------------------------------------------------------------

const MODELOS_DFC: readonly Modelo[] = ['rubricaFluxoCaixa', 'mapeamentoContaFluxo', 'versaoMapeamentoFluxo'];

function versoesDe(tenantId: string): Linha[] {
  return duplo.linhas('versaoMapeamentoFluxo', tenantId).sort((a, b) => Number(a.numero) - Number(b.numero));
}

function instantaneoVivo(tenantId: string = A): InstantaneoMapeamento {
  return instantaneoDe(
    duplo.linhas('rubricaFluxoCaixa', tenantId) as unknown as RubricaFluxoCaixa[],
    duplo.linhas('mapeamentoContaFluxo', tenantId) as unknown as MapeamentoContaFluxo[],
  );
}

function tudoDe(tenantId?: string): Record<string, Linha[]> {
  return Object.fromEntries(MODELOS_DFC.map((m) => [m, duplo.linhas(m, tenantId)]));
}

/** Uma fotografia de tudo o que uma escrita pode mexer — para «nada mudou». */
function fotografia() {
  return { a: tudoDe(A), b: tudoDe(B) };
}

const escritasDe = (cs: Chamada[]) => cs.filter((c) => OPERACOES_ESCRITA.has(c.operacao));
const proibidasDe = (cs: Chamada[]) => cs.filter((c) => OPERACOES_PROIBIDAS.has(c.operacao));

/** Corre `fn` e devolve o desfecho e as chamadas que ela fez ao duplo. */
async function observar<T>(fn: (ctx: Ctx) => Promise<T>, userId?: string) {
  const i0 = duplo.chamadas.length;
  const t0 = duplo.trancas.length;
  const r = await correr(fn, userId);
  const chamadas = duplo.chamadas.slice(i0);
  return { r, chamadas, escritas: escritasDe(chamadas), trancas: duplo.trancas.slice(t0), i0 };
}

/** V2 «na mesma transacção»: todas as escritas numa única tx, não nula, commitada, e uma delas é a versão. */
function afirmarMesmaTransaccao(escritas: Chamada[]): void {
  const txs = new Set(escritas.map((c) => c.txId));
  expect([...txs], 'todas as escritas (cópia de trabalho E versão) numa única $transaction').toHaveLength(1);
  const [tx] = [...txs];
  expect(tx, 'escrita fora de $transaction').not.toBeNull();
  expect(duplo.commits).toContain(tx);
  expect(escritas.some((c) => c.modelo === 'versaoMapeamentoFluxo' && c.operacao === 'create')).toBe(true);
  expect(escritas.some((c) => c.modelo !== 'versaoMapeamentoFluxo')).toBe(true);
}

function afirmarVersaoNova(antes: Linha[], depois: Linha[]): void {
  expect(depois).toHaveLength(antes.length + 1);
  expect(depois.slice(0, antes.length), 'as versões anteriores não se tocam (append-only)').toEqual(antes);
  const nova = depois[depois.length - 1];
  expect(nova.numero).toBe(Number(antes[antes.length - 1].numero) + 1);
  expect(nova.estado).toBe('PENDING');
  expect(nova.validadoPorId).toBeNull();
  expect(nova.validadoEm).toBeNull();
  expect(nova.observacao).toBeNull();
}

beforeEach(() => {
  duplo.repor(mundo('PENDING'));
});

afterEach(() => {
  // Nenhum teste deste ficheiro aceita uma escrita em lote ou um upsert.
  expect(proibidasDe(duplo.chamadas), 'upsert/*Many passam SEM AuditLog').toEqual([]);
});

// ===========================================================================
// As seis escritas do mapeamento — um cenário que MUDA cada uma
// ===========================================================================

interface Escritor {
  nome: string;
  /** O modelo da cópia de trabalho que a escrita tem de tocar. */
  copia: Modelo;
  fazer: (ctx: Ctx) => Promise<unknown>;
  /** O que o vivo tem de mostrar depois. */
  efeito: () => void;
}

const mapaVivo = () => new Map(duplo.linhas('mapeamentoContaFluxo', A).map((m) => [String(m.contaId), String(m.rubricaId)]));
const rubricaViva = (id: string) => duplo.linhas('rubricaFluxoCaixa', A).find((r) => r.id === id);

const ESCRITORES: readonly Escritor[] = [
  {
    nome: 'mapearConta (conta sem mapeamento)',
    copia: 'mapeamentoContaFluxo',
    fazer: (ctx) => svc.mapearConta({ contaId: 'a-4999', rubricaId: R.OP90.id }, ctx),
    efeito: () => expect(mapaVivo().get('a-4999')).toBe(R.OP90.id),
  },
  {
    nome: 'mapearConta (reatribuir)',
    copia: 'mapeamentoContaFluxo',
    fazer: (ctx) => svc.mapearConta({ contaId: 'a-421', rubricaId: R.OP01.id }, ctx),
    efeito: () => expect(mapaVivo().get('a-421')).toBe(R.OP01.id),
  },
  {
    nome: 'desmapearConta',
    copia: 'mapeamentoContaFluxo',
    fazer: (ctx) => svc.desmapearConta('a-261', ctx),
    efeito: () => expect(mapaVivo().has('a-261')).toBe(false),
  },
  {
    nome: 'criarRubrica',
    copia: 'rubricaFluxoCaixa',
    fazer: (ctx) =>
      svc.criarRubrica({ codigo: 'OP-50', designacao: 'Pagamentos ao pessoal', atividade: 'OPERACIONAL', sinal: 'SAIDA', ordem: 50 }, ctx),
    efeito: () => {
      const r = duplo.linhas('rubricaFluxoCaixa', A).find((x) => x.codigo === 'OP-50');
      expect(r).toMatchObject({ designacao: 'Pagamentos ao pessoal', atividade: 'OPERACIONAL', sinal: 'SAIDA', ordem: 50, origem: 'TENANT', ativo: true, deletedAt: null });
    },
  },
  {
    nome: 'editarRubrica',
    copia: 'rubricaFluxoCaixa',
    fazer: (ctx) => svc.editarRubrica({ id: R.OP01.id, designacao: 'Recebimentos de clientes (revisto)' }, ctx),
    efeito: () => expect(rubricaViva(R.OP01.id)?.designacao).toBe('Recebimentos de clientes (revisto)'),
  },
  {
    nome: 'eliminarRubrica (TENANT sem contas)',
    copia: 'rubricaFluxoCaixa',
    fazer: (ctx) => svc.eliminarRubrica(R.OP90.id, ctx),
    efeito: () => {
      // Soft delete: a linha fica, com deletedAt; sai do instantâneo.
      expect(rubricaViva(R.OP90.id)?.deletedAt).toBeInstanceOf(Date);
      expect(instantaneoVivo().rubricas.some((r) => r.id === R.OP90.id)).toBe(false);
    },
  },
  {
    nome: 'definirContasCaixa (sai 121, entra 4999)',
    copia: 'mapeamentoContaFluxo',
    fazer: (ctx) => svc.definirContasCaixa({ contaIds: ['a-111', 'a-123', 'a-4999'] }, ctx),
    efeito: () => {
      const m = mapaVivo();
      expect(m.get('a-111')).toBe(R.CX01.id);
      expect(m.get('a-123')).toBe(R.CX01.id);
      expect(m.get('a-4999')).toBe(R.CX01.id);
      // A que sai fica SEM mapeamento (nunca se adivinha actividade).
      expect(m.has('a-121')).toBe(false);
    },
  },
];

describe('V2 — cada escrita que muda o mapeamento cria a versão n+1 em PENDING na MESMA $transaction', () => {
  it.each(ESCRITORES.map((e) => [e.nome, e] as const))('%s: efeito, versão n+1 PENDING, V1, e uma só transacção', async (_n, e) => {
    const antes = versoesDe(A);
    const b = tudoDe(B);
    const { r, escritas } = await observar(e.fazer);
    if (!r.ok) throw new Error(`${e.nome} devia passar e lançou: ${String(r.erro)}`);
    e.efeito();
    const depois = versoesDe(A);
    afirmarVersaoNova(antes, depois);
    afirmarV1(depois, instantaneoVivo());
    afirmarMesmaTransaccao(escritas);
    expect(escritas.some((c) => c.modelo === e.copia)).toBe(true);
    expect(tudoDe(B)).toEqual(b);
  });

  it.each(ESCRITORES.map((e) => [e.nome, e] as const))(
    '%s: TEM de lançar se a versão falhar a meio — e não fica nem escrita nem versão',
    async (_n, e) => {
      const foto = fotografia();
      duplo.falharNa({ modelo: 'versaoMapeamentoFluxo', operacao: 'create' });
      const { r } = await observar(e.fazer);
      expect(r.ok, 'a falha da versão tem de chegar a quem chamou').toBe(false);
      expect(fotografia()).toEqual(foto);
    },
  );

  it.each(ESCRITORES.map((e) => [e.nome, e] as const))(
    '%s: TEM de lançar se a escrita na cópia de trabalho falhar — e não fica versão',
    async (_n, e) => {
      const foto = fotografia();
      duplo.falharNa({ modelo: e.copia, operacao: '*escrita' });
      const { r } = await observar(e.fazer);
      expect(r.ok).toBe(false);
      expect(fotografia()).toEqual(foto);
    },
  );

  it('definirContasCaixa: uma falha na SEGUNDA escrita desfaz a primeira (conjunto aplicado pela metade não fica)', async () => {
    const foto = fotografia();
    duplo.falharNa({ modelo: 'mapeamentoContaFluxo', operacao: '*escrita', ordem: 2 });
    const { r } = await observar((ctx) => svc.definirContasCaixa({ contaIds: ['a-111', 'a-4999', 'a-311'] }, ctx));
    expect(r.ok).toBe(false);
    expect(fotografia()).toEqual(foto);
  });
});

describe('V2 — uma escrita que não muda nada não cria versão', () => {
  const NULAS: ReadonlyArray<readonly [string, (ctx: Ctx) => Promise<unknown>]> = [
    ['mapearConta para a rubrica onde a conta já está', (ctx) => svc.mapearConta({ contaId: 'a-411', rubricaId: R.OP01.id }, ctx)],
    ['editarRubrica com os valores que já tem', (ctx) => svc.editarRubrica({ id: R.OP02.id, designacao: R.OP02.designacao, ordem: R.OP02.ordem, ativo: true }, ctx)],
    ['editarRubrica sem campos', (ctx) => svc.editarRubrica({ id: R.OP02.id }, ctx)],
    ['definirContasCaixa com o conjunto actual, por outra ordem', (ctx) => svc.definirContasCaixa({ contaIds: ['a-123', 'a-111', 'a-121'] }, ctx)],
  ];

  it.each(NULAS)('%s: passa, e as versões e o vivo ficam iguais', async (_n, fazer) => {
    const foto = fotografia();
    const { r } = await observar(fazer);
    if (!r.ok) throw new Error(`devia passar e lançou: ${String(r.erro)}`);
    expect(versoesDe(A)).toEqual(foto.a.versaoMapeamentoFluxo.sort((x, y) => Number(x.numero) - Number(y.numero)));
    expect(instantaneoVivo()).toEqual(instantaneoDe(foto.a.rubricaFluxoCaixa as unknown as RubricaFluxoCaixa[], foto.a.mapeamentoContaFluxo as unknown as MapeamentoContaFluxo[]));
  });

  it('desmapearConta de uma conta sem mapeamento: nenhuma versão, nada muda', async () => {
    const foto = fotografia();
    await observar((ctx) => svc.desmapearConta('a-4999', ctx));
    expect(fotografia()).toEqual(foto);
  });

  it('repetir a mesma escrita: a segunda não cria versão', async () => {
    await exigir((ctx) => svc.mapearConta({ contaId: 'a-4999', rubricaId: R.OP90.id }, ctx));
    const depoisDaPrimeira = versoesDe(A);
    expect(depoisDaPrimeira).toHaveLength(2);
    await exigir((ctx) => svc.mapearConta({ contaId: 'a-4999', rubricaId: R.OP90.id }, ctx));
    expect(versoesDe(A)).toEqual(depoisDaPrimeira);
  });
});

// ===========================================================================
// V3 — validar
// ===========================================================================

describe('V3 — só se valida a versão mais recente; validar é a única escrita sobre uma versão', () => {
  it('valida a mais recente: VALIDATED, validadoPorId = ctx.userId, validadoEm, observação; trancada com FOR UPDATE na mesma tx', async () => {
    const antes = versoesDe(A);
    const vivoAntes = instantaneoVivo();
    const t0 = Date.now();
    const { r, escritas, trancas } = await observar(
      (ctx) => svc.validarVersao({ versaoId: 'va-1', observacao: 'Conforme o Decreto 70/2009' }, ctx),
      CONTABILISTAS[1],
    );
    if (!r.ok) throw new Error(`devia passar e lançou: ${String(r.erro)}`);
    const t1 = Date.now();

    expect(r.valor).toMatchObject({ id: 'va-1', estado: 'VALIDATED', validadoPorId: CONTABILISTAS[1], observacao: 'Conforme o Decreto 70/2009' });
    const depois = versoesDe(A);
    expect(depois).toHaveLength(1);
    const v = depois[0];
    expect(v).toMatchObject({ estado: 'VALIDATED', validadoPorId: CONTABILISTAS[1], observacao: 'Conforme o Decreto 70/2009' });
    expect(v.validadoEm).toBeInstanceOf(Date);
    expect((v.validadoEm as Date).getTime()).toBeGreaterThanOrEqual(t0);
    expect((v.validadoEm as Date).getTime()).toBeLessThanOrEqual(t1);
    // Nada mais da versão muda.
    const { estado: _e, validadoPorId: _p, validadoEm: _m, observacao: _o, ...resto } = v;
    const { estado: _e0, validadoPorId: _p0, validadoEm: _m0, observacao: _o0, ...resto0 } = antes[0];
    expect(resto).toEqual(resto0);
    expect(instantaneoVivo()).toEqual(vivoAntes);

    // A única escrita é UM update da versão, só com os campos da validação.
    expect(escritas.map((c) => `${c.modelo}.${c.operacao}`)).toEqual(['versaoMapeamentoFluxo.update']);
    const dados = (escritas[0].args as { data: Record<string, unknown> }).data;
    for (const k of Object.keys(dados)) expect(['estado', 'validadoPorId', 'validadoEm', 'observacao']).toContain(k);

    // FOR UPDATE sobre a versão, na mesma transacção, ANTES do update.
    const tranca = trancas.find((t) => t.modelo === 'versaoMapeamentoFluxo' && t.modo === 'FOR UPDATE');
    expect(tranca, 'validarVersao tem de trancar a versão com FOR UPDATE').toBeDefined();
    expect(tranca?.ids).toContain('va-1');
    expect(tranca?.txId).not.toBeNull();
    expect(tranca?.txId).toBe(escritas[0].txId);
    expect(tranca?.indiceChamada).toBeLessThan(duplo.chamadas.indexOf(escritas[0]));
    expect(duplo.commits).toContain(escritas[0].txId);
  });

  it('sem observação: observacao fica null', async () => {
    await exigir((ctx) => svc.validarVersao({ versaoId: 'va-1' }, ctx), CONTABILISTAS[0]);
    expect(versoesDe(A)[0]).toMatchObject({ estado: 'VALIDATED', validadoPorId: CONTABILISTAS[0], observacao: null });
  });

  it('TEM de lançar VERSAO_DESACTUALIZADA numa versão anterior — e nada muda', async () => {
    await exigir((ctx) => svc.mapearConta({ contaId: 'a-4999', rubricaId: R.OP90.id }, ctx));
    const foto = fotografia();
    const { r } = await observar((ctx) => svc.validarVersao({ versaoId: 'va-1', observacao: 'Parecer atrasado' }, ctx), CONTABILISTAS[0]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toBeInstanceOf(BusinessRuleError);
      expect(codigoDe(r.erro)).toBe(VERSAO_DESACTUALIZADA);
    }
    expect(fotografia()).toEqual(foto);
  });

  it('TEM de lançar NotFoundError para a versão de OUTRO tenant ou inexistente — antes de escrever', async () => {
    for (const versaoId of [VERSAO_B, 'versao-que-nao-existe']) {
      const foto = fotografia();
      const { r, escritas } = await observar((ctx) => svc.validarVersao({ versaoId, observacao: 'x' }, ctx), CONTABILISTAS[0]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(codigoDe(r.erro)).toBe(NAO_ENCONTRADO);
      expect(escritas).toEqual([]);
      expect(fotografia()).toEqual(foto);
    }
  });

  it('nenhuma escrita de configuração toca numa versão existente (nem numa VALIDATED): só cria a seguinte', async () => {
    for (const e of ESCRITORES) {
      duplo.repor(mundo('VALIDATED'));
      const v1 = versoesDe(A)[0];
      await exigir(e.fazer);
      expect(versoesDe(A)[0], e.nome).toEqual(v1);
      const sobreVersoes = escritasDe(duplo.chamadas).filter((c) => c.modelo === 'versaoMapeamentoFluxo');
      expect(sobreVersoes.map((c) => c.operacao), e.nome).toEqual(['create']);
    }
  });
});

// ===========================================================================
// Transição nos DOIS sentidos (skill estado-com-escritor), vista pela DFC
// ===========================================================================

describe('transição nos dois sentidos: VALIDATED → alterar → PENDING → validar → VALIDATED', () => {
  const filtro = { periodoInicioId: 'pa-2026-01', periodoFimId: 'pa-2026-01' };

  async function versaoNaDFC() {
    const r = await exigir((ctx) => svc.gerarDFC(filtro, ctx));
    if ('impedimentos' in r) throw new Error(`a DFC devia sair e deu impedimentos: ${r.impedimentos.join(' | ')}`);
    return (r as DFC).versao;
  }

  it('a faixa «por validar» volta depois de uma alteração e sai depois de validar', async () => {
    duplo.repor(mundo('VALIDATED'));
    expect(await versaoNaDFC()).toMatchObject({ numero: 1, estado: 'VALIDATED' });

    // → alterar: PENDING, e a DFC di-lo
    await exigir((ctx) => svc.mapearConta({ contaId: 'a-421', rubricaId: R.OP01.id }, ctx));
    expect(await versaoNaDFC()).toMatchObject({ numero: 2, estado: 'PENDING' });
    expect(await exigir((ctx) => svc.versaoAtual(ctx))).toMatchObject({ numero: 2, estado: 'PENDING' });
    // O parecer antigo fica preso à versão 1: continua VALIDATED, e já não se pode revalidar.
    expect(versoesDe(A)[0]).toMatchObject({ numero: 1, estado: 'VALIDATED', validadoPorId: CONTABILISTAS[0] });
    const velha = await correr((ctx) => svc.validarVersao({ versaoId: 'va-1' }, ctx), CONTABILISTAS[1]);
    expect(velha.ok).toBe(false);
    if (!velha.ok) expect(codigoDe(velha.erro)).toBe(VERSAO_DESACTUALIZADA);

    // → validar: VALIDATED, e a DFC di-lo
    const v2 = await exigir((ctx) => svc.versaoAtual(ctx));
    await exigir((ctx) => svc.validarVersao({ versaoId: String(v2?.id), observacao: 'Revisto' }, ctx), CONTABILISTAS[1]);
    expect(await versaoNaDFC()).toMatchObject({ numero: 2, estado: 'VALIDATED' });

    // → e outra vez para trás, por outro escritor (contas de caixa fazem parte da versão)
    await exigir((ctx) => svc.definirContasCaixa({ contaIds: ['a-111', 'a-121'] }, ctx));
    expect(await versaoNaDFC()).toMatchObject({ numero: 3, estado: 'PENDING' });

    const lista = await exigir((ctx) => svc.listarVersoes(ctx));
    expect(lista.map((v) => [v.numero, v.estado])).toEqual([
      [3, 'PENDING'],
      [2, 'VALIDATED'],
      [1, 'VALIDATED'],
    ]);
    afirmarV1(versoesDe(A), instantaneoVivo());
  });
});

// ===========================================================================
// Rubricas: SISTEMA e rubricas com contas (MINOR-2)
// ===========================================================================

describe('RUBRICA_DE_SISTEMA e RUBRICA_COM_CONTAS', () => {
  async function recusa(fazer: (ctx: Ctx) => Promise<unknown>, codigos: readonly string[]) {
    const foto = fotografia();
    const { r } = await observar(fazer);
    expect(r.ok, 'TEM de lançar').toBe(false);
    if (!r.ok) {
      expect(r.erro).toBeInstanceOf(BusinessRuleError);
      expect(codigos).toContain(codigoDe(r.erro));
    }
    expect(fotografia()).toEqual(foto);
  }

  it('apagar uma rubrica SISTEMA sem contas TEM de lançar RUBRICA_DE_SISTEMA', async () => {
    await recusa((ctx) => svc.eliminarRubrica(R.FIN01.id, ctx), [RUBRICA_DE_SISTEMA]);
  });

  it('apagar uma rubrica SISTEMA com contas recusa (qualquer dos dois códigos)', async () => {
    await recusa((ctx) => svc.eliminarRubrica(R.CX01.id, ctx), [RUBRICA_DE_SISTEMA, RUBRICA_COM_CONTAS]);
    await recusa((ctx) => svc.eliminarRubrica(R.OP01.id, ctx), [RUBRICA_DE_SISTEMA, RUBRICA_COM_CONTAS]);
  });

  it('apagar uma rubrica TENANT com contas TEM de lançar RUBRICA_COM_CONTAS', async () => {
    await recusa((ctx) => svc.eliminarRubrica(R.INV90.id, ctx), [RUBRICA_COM_CONTAS]);
  });

  it('desactivar uma rubrica com contas TEM de lançar RUBRICA_COM_CONTAS (TENANT, SISTEMA e a de CAIXA)', async () => {
    await recusa((ctx) => svc.editarRubrica({ id: R.INV90.id, ativo: false }, ctx), [RUBRICA_COM_CONTAS]);
    await recusa((ctx) => svc.editarRubrica({ id: R.OP02.id, ativo: false }, ctx), [RUBRICA_COM_CONTAS]);
    await recusa((ctx) => svc.editarRubrica({ id: R.CX01.id, ativo: false, designacao: 'Caixa' }, ctx), [RUBRICA_COM_CONTAS]);
  });

  it('sem contas passa: desactivar a SISTEMA FIN-01, e depois de desmapear a única conta apagar a TENANT INV-90', async () => {
    await exigir((ctx) => svc.editarRubrica({ id: R.FIN01.id, ativo: false }, ctx));
    expect(rubricaViva(R.FIN01.id)?.ativo).toBe(false);
    await exigir((ctx) => svc.desmapearConta('a-261', ctx));
    await exigir((ctx) => svc.eliminarRubrica(R.INV90.id, ctx));
    expect(rubricaViva(R.INV90.id)?.deletedAt).toBeInstanceOf(Date);
    expect(versoesDe(A).map((v) => v.numero)).toEqual([1, 2, 3, 4]);
    afirmarV1(versoesDe(A), instantaneoVivo());
  });
});

// ===========================================================================
// I10 — ids de outro tenant ⇒ NotFoundError ANTES de escrever
// ===========================================================================

describe('I10 — contaId/rubricaId de outro tenant ou inexistente ⇒ NotFoundError, zero escritas', () => {
  const ALHEIAS: ReadonlyArray<readonly [string, (ctx: Ctx) => Promise<unknown>]> = [
    ['mapearConta com a conta de B', (ctx) => svc.mapearConta({ contaId: 'b-421', rubricaId: R.OP01.id }, ctx)],
    ['mapearConta com a rubrica de B', (ctx) => svc.mapearConta({ contaId: 'a-4999', rubricaId: RB_FIN99 }, ctx)],
    ['mapearConta de uma conta de A que B já mapeou, para a rubrica de B', (ctx) => svc.mapearConta({ contaId: 'a-411', rubricaId: RB_CX }, ctx)],
    ['mapearConta com conta inexistente', (ctx) => svc.mapearConta({ contaId: CONTA_INEXISTENTE, rubricaId: R.OP01.id }, ctx)],
    ['mapearConta com rubrica inexistente', (ctx) => svc.mapearConta({ contaId: 'a-4999', rubricaId: RUBRICA_INEXISTENTE }, ctx)],
    ['mapearConta para uma rubrica apagada', (ctx) => svc.mapearConta({ contaId: 'a-4999', rubricaId: R.OP80.id }, ctx)],
    ['desmapearConta da conta de B', (ctx) => svc.desmapearConta('b-421', ctx)],
    ['desmapearConta de conta inexistente', (ctx) => svc.desmapearConta(CONTA_INEXISTENTE, ctx)],
    ['editarRubrica de B', (ctx) => svc.editarRubrica({ id: RB_FIN99, designacao: 'Tomada' }, ctx)],
    ['editarRubrica apagada', (ctx) => svc.editarRubrica({ id: R.OP80.id, designacao: 'Ressuscitada' }, ctx)],
    ['eliminarRubrica de B', (ctx) => svc.eliminarRubrica(RB_FIN99, ctx)],
    ['definirContasCaixa com uma conta de B no meio', (ctx) => svc.definirContasCaixa({ contaIds: ['a-111', 'b-111', 'a-121'] }, ctx)],
    ['definirContasCaixa com conta inexistente', (ctx) => svc.definirContasCaixa({ contaIds: ['a-111', CONTA_INEXISTENTE] }, ctx)],
  ];

  it.each(ALHEIAS)('%s', async (_n, fazer) => {
    const foto = fotografia();
    const { r, escritas } = await observar(fazer);
    expect(r.ok, 'TEM de lançar').toBe(false);
    if (!r.ok) expect(codigoDe(r.erro)).toBe(NAO_ENCONTRADO);
    expect(escritas, 'NotFoundError ANTES de escrever').toEqual([]);
    expect(fotografia()).toEqual(foto);
  });

  it('o código de uma rubrica de B está livre em A: criar FIN-99 em A passa e B não muda', async () => {
    const b = tudoDe(B);
    const r = await exigir((ctx) =>
      svc.criarRubrica({ codigo: CODIGO_ALHEIO, designacao: 'Outra', atividade: 'FINANCIAMENTO', sinal: 'SAIDA', ordem: 99 }, ctx),
    );
    expect(r).toMatchObject({ codigo: CODIGO_ALHEIO, tenantId: A, origem: 'TENANT' });
    expect(r.id).not.toBe(RB_FIN99);
    expect(tudoDe(B)).toEqual(b);
  });
});

// ===========================================================================
// Auditoria
// ===========================================================================

describe('auditoria — escritas singulares, e os três modelos no trilho', () => {
  it('RubricaFluxoCaixa, MapeamentoContaFluxo e VersaoMapeamentoFluxo estão em AUDIT_MODELS', () => {
    expect([...AUDIT_MODELS]).toEqual(
      expect.arrayContaining(['RubricaFluxoCaixa', 'MapeamentoContaFluxo', 'VersaoMapeamentoFluxo']),
    );
  });

  it('nenhuma das escritas (as seis, validar e desmapear) usa upsert nem *Many', async () => {
    for (const e of ESCRITORES) {
      duplo.repor(mundo('PENDING'));
      await exigir(e.fazer);
      expect(proibidasDe(duplo.chamadas), e.nome).toEqual([]);
      expect(escritasDe(duplo.chamadas).every((c) => ['create', 'update', 'delete'].includes(c.operacao))).toBe(true);
    }
    duplo.repor(mundo('PENDING'));
    await exigir((ctx) => svc.validarVersao({ versaoId: 'va-1' }, ctx), CONTABILISTAS[0]);
    expect(proibidasDe(duplo.chamadas)).toEqual([]);
  });
});

// ===========================================================================
// [property] V1, V2, V3, I10, MINOR-2 — sequências de escritas contra um
// modelo de referência (o que o vivo TEM de ser), não contra o serviço
// ===========================================================================

type Alvo = 'propria' | 'alheia' | 'inexistente' | 'apagada';
type Op =
  | { k: 'mapear'; conta: number; rubrica: number; alvoConta: Alvo; alvoRubrica: Alvo }
  | { k: 'desmapear'; conta: number; alvo: 'mapeada' | 'naoMapeada' | 'alheia' | 'inexistente' }
  | { k: 'criar'; codigo: 'novo' | 'repetido' | 'alheio'; atividade: AtividadeSeccao; sinal: SinalFluxo; ordem: number; designacao: string }
  | {
      k: 'editar';
      rubrica: number;
      alvo: 'propria' | 'alheia' | 'apagada';
      designacao?: string;
      ordem?: number | 'mesma';
      ativo?: boolean;
      sinal?: SinalFluxo;
      atividade?: AtividadeSeccao;
    }
  | { k: 'eliminar'; rubrica: number; alvo: 'propria' | 'alheia' | 'apagada' }
  | { k: 'caixa'; contas: string[]; comAlheia: boolean }
  | { k: 'validar'; alvo: 'recente' | 'anterior' | 'alheia'; indice: number; validador: string; observacao?: string };

interface RubricaRef extends RubricaInstantaneo {
  apagada: boolean;
}
interface Referencia {
  rubricas: Map<string, RubricaRef>;
  mapa: Map<string, string>;
  seq: number;
}

type Esperado =
  | { tipo: 'ok' }
  | { tipo: 'erro'; codigos: readonly string[]; semEscritas: boolean }
  | { tipo: 'erroQualquer' }
  | { tipo: 'semMudanca' }
  | { tipo: 'validar'; versaoId: string; validador: string; observacao: string | null };

interface Plano {
  descricao: string;
  userId: string;
  fazer: (ctx: Ctx) => Promise<unknown>;
  esperado: Esperado;
  /** Aplica o efeito ESPERADO à referência (só quando o esperado é `ok`). */
  aplicar?: (ref: Referencia, valor: unknown) => void;
}

const SECCOES: readonly AtividadeSeccao[] = ['OPERACIONAL', 'INVESTIMENTO', 'FINANCIAMENTO'];
const SINAIS: readonly SinalFluxo[] = ['ENTRADA', 'SAIDA', 'VARIACAO'];
const DESIGNACOES = ['Recebimentos de clientes', 'Pagamentos ao pessoal', 'Juros pagos', 'Dividendos recebidos'] as const;

function referenciaInicial(): Referencia {
  const rubricas = new Map<string, RubricaRef>(
    Object.values(R).map((r) => [
      r.id,
      { id: r.id, codigo: r.codigo, designacao: r.designacao, atividade: r.atividade, sinal: r.sinal, ordem: r.ordem, origem: r.origem, ativo: true, apagada: 'apagada' in r && r.apagada === true },
    ]),
  );
  return { rubricas, mapa: new Map(MAPA_INICIAL_A), seq: 10 };
}

const clonarRef = (r: Referencia): Referencia => ({
  rubricas: new Map([...r.rubricas].map(([k, v]) => [k, { ...v }])),
  mapa: new Map(r.mapa),
  seq: r.seq,
});

/** A forma do vivo que a referência prevê — incluindo rubricas apagadas (soft delete). */
function formaDaReferencia(ref: Referencia) {
  return {
    rubricas: [...ref.rubricas.values()].map((r) => ({ ...r })).sort((a, b) => (a.id < b.id ? -1 : 1)),
    mapa: [...ref.mapa].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}

function formaDoVivo() {
  return {
    rubricas: duplo
      .linhas('rubricaFluxoCaixa', A)
      .map((r) => ({
        id: String(r.id),
        codigo: r.codigo,
        designacao: r.designacao,
        atividade: r.atividade,
        sinal: r.sinal,
        ordem: r.ordem,
        origem: r.origem,
        ativo: r.ativo,
        apagada: r.deletedAt !== null,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    mapa: duplo
      .linhas('mapeamentoContaFluxo', A)
      .map((m) => [String(m.contaId), String(m.rubricaId)] as [string, string])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}

/** O instantâneo que a referência prevê (sem apagadas) — para decidir se houve mudança, sem o núcleo. */
function instantaneoDaReferencia(ref: Referencia): string {
  const rubricas = [...ref.rubricas.values()]
    .filter((r) => !r.apagada)
    .map(({ apagada: _a, ...r }) => r)
    .sort((a, b) => (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0));
  const mapeamentos = [...ref.mapa].map(([contaId, rubricaId]) => ({ contaId, rubricaId })).sort((a, b) => (a.contaId < b.contaId ? -1 : 1));
  return JSON.stringify({ rubricas, mapeamentos });
}

const escolher = <T,>(xs: readonly T[], i: number): T | undefined => (xs.length === 0 ? undefined : xs[i % xs.length]);

function contasCaixa(ref: Referencia): string[] {
  return [...ref.mapa].filter(([, r]) => ref.rubricas.get(r)?.atividade === 'CAIXA').map(([c]) => c);
}
const temContas = (ref: Referencia, rubricaId: string) => [...ref.mapa.values()].includes(rubricaId);
const vivas = (ref: Referencia) => [...ref.rubricas.values()].filter((r) => !r.apagada);
const apagadas = (ref: Referencia) => [...ref.rubricas.values()].filter((r) => r.apagada);
const naoEncontrado: Esperado = { tipo: 'erro', codigos: [NAO_ENCONTRADO], semEscritas: true };

/** Traduz a operação gerada numa chamada ao serviço e no desfecho que a especificação obriga. */
function planear(ref: Referencia, versoes: Linha[], op: Op): Plano | null {
  switch (op.k) {
    case 'mapear': {
      const caixa = new Set(contasCaixa(ref));
      const contaId =
        op.alvoConta === 'alheia'
          ? 'b-421'
          : op.alvoConta === 'inexistente'
            ? CONTA_INEXISTENTE
            : escolher(IDS_CONTAS_A.filter((c) => !caixa.has(c)), op.conta);
      const destinos = vivas(ref).filter((r) => r.ativo && r.atividade !== 'CAIXA');
      const rubricaId =
        op.alvoRubrica === 'alheia'
          ? RB_FIN99
          : op.alvoRubrica === 'apagada'
            ? escolher(apagadas(ref), op.rubrica)?.id
            : op.alvoRubrica === 'inexistente'
              ? RUBRICA_INEXISTENTE
              : escolher(destinos, op.rubrica)?.id;
      if (!contaId || !rubricaId) return null;
      const propria = op.alvoConta === 'propria' && op.alvoRubrica === 'propria';
      return {
        descricao: `mapearConta(${contaId} → ${rubricaId})`,
        userId: CONFIGURADOR,
        fazer: (ctx) => svc.mapearConta({ contaId, rubricaId }, ctx),
        esperado: propria ? { tipo: 'ok' } : naoEncontrado,
        aplicar: (r) => void r.mapa.set(contaId, rubricaId),
      };
    }
    case 'desmapear': {
      const caixa = new Set(contasCaixa(ref));
      if (op.alvo === 'alheia' || op.alvo === 'inexistente') {
        const contaId = op.alvo === 'alheia' ? 'b-421' : CONTA_INEXISTENTE;
        return { descricao: `desmapearConta(${contaId})`, userId: CONFIGURADOR, fazer: (ctx) => svc.desmapearConta(contaId, ctx), esperado: naoEncontrado };
      }
      const mapeadas = IDS_CONTAS_A.filter((c) => ref.mapa.has(c) && !caixa.has(c));
      const livres = IDS_CONTAS_A.filter((c) => !ref.mapa.has(c));
      if (op.alvo === 'mapeada' && mapeadas.length > 0) {
        const contaId = escolher(mapeadas, op.conta) as string;
        return {
          descricao: `desmapearConta(${contaId})`,
          userId: CONFIGURADOR,
          fazer: (ctx) => svc.desmapearConta(contaId, ctx),
          esperado: { tipo: 'ok' },
          aplicar: (r) => void r.mapa.delete(contaId),
        };
      }
      const contaId = escolher(livres, op.conta);
      if (!contaId) return null;
      return { descricao: `desmapearConta(${contaId}) sem mapeamento`, userId: CONFIGURADOR, fazer: (ctx) => svc.desmapearConta(contaId, ctx), esperado: { tipo: 'semMudanca' } };
    }
    case 'criar': {
      const ocupados = new Map([...ref.rubricas.values()].map((r) => [r.codigo, r]));
      let codigo: string;
      let esperado: Esperado = { tipo: 'ok' };
      if (op.codigo === 'repetido') {
        const alvo = escolher(vivas(ref), op.ordem);
        if (!alvo) return null;
        codigo = alvo.codigo;
        esperado = { tipo: 'erroQualquer' };
      } else if (op.codigo === 'alheio' && !ocupados.has(CODIGO_ALHEIO)) {
        codigo = CODIGO_ALHEIO;
      } else if (op.codigo === 'alheio' && ocupados.get(CODIGO_ALHEIO)?.apagada === false) {
        codigo = CODIGO_ALHEIO;
        esperado = { tipo: 'erroQualquer' };
      } else {
        codigo = `NV-${String(ref.seq).padStart(2, '0')}`;
        ref.seq += 1;
      }
      const input = { codigo, designacao: op.designacao, atividade: op.atividade, sinal: op.sinal, ordem: op.ordem };
      return {
        descricao: `criarRubrica(${codigo})`,
        userId: CONFIGURADOR,
        fazer: (ctx) => svc.criarRubrica(input, ctx),
        esperado,
        aplicar: (r, valor) => {
          const id = String((valor as { id?: unknown }).id);
          r.rubricas.set(id, { id, ...input, origem: 'TENANT', ativo: true, apagada: false });
        },
      };
    }
    case 'editar': {
      if (op.alvo !== 'propria') {
        const id = op.alvo === 'alheia' ? RB_FIN99 : (escolher(apagadas(ref), op.rubrica)?.id as string);
        return { descricao: `editarRubrica(${id}) alheia/apagada`, userId: CONFIGURADOR, fazer: (ctx) => svc.editarRubrica({ id, designacao: 'Tomada' }, ctx), esperado: naoEncontrado };
      }
      const alvo = escolher(vivas(ref), op.rubrica) as RubricaRef;
      const editavelPorInteiro = alvo.origem === 'TENANT' && alvo.atividade !== 'CAIXA';
      const patch: { id: string; designacao?: string; ordem?: number; ativo?: boolean; sinal?: SinalFluxo; atividade?: AtividadeSeccao } = { id: alvo.id };
      if (op.designacao !== undefined) patch.designacao = op.designacao === 'mesma' ? alvo.designacao : op.designacao;
      if (op.ordem !== undefined) patch.ordem = op.ordem === 'mesma' ? alvo.ordem : op.ordem;
      if (op.ativo !== undefined) patch.ativo = op.ativo;
      if (editavelPorInteiro && op.sinal !== undefined) patch.sinal = op.sinal;
      if (editavelPorInteiro && op.atividade !== undefined) patch.atividade = op.atividade;
      const recusa = patch.ativo === false && temContas(ref, alvo.id);
      return {
        descricao: `editarRubrica(${JSON.stringify(patch)})`,
        userId: CONFIGURADOR,
        fazer: (ctx) => svc.editarRubrica(patch, ctx),
        esperado: recusa ? { tipo: 'erro', codigos: [RUBRICA_COM_CONTAS], semEscritas: false } : { tipo: 'ok' },
        aplicar: (r) => {
          const { id, ...campos } = patch;
          r.rubricas.set(id, { ...(r.rubricas.get(id) as RubricaRef), ...campos });
        },
      };
    }
    case 'eliminar': {
      if (op.alvo !== 'propria') {
        const id = op.alvo === 'alheia' ? RB_FIN99 : (escolher(apagadas(ref), op.rubrica)?.id as string);
        return { descricao: `eliminarRubrica(${id}) alheia/apagada`, userId: CONFIGURADOR, fazer: (ctx) => svc.eliminarRubrica(id, ctx), esperado: naoEncontrado };
      }
      const alvo = escolher(vivas(ref), op.rubrica) as RubricaRef;
      const comContas = temContas(ref, alvo.id);
      const esperado: Esperado =
        alvo.origem === 'SISTEMA'
          ? { tipo: 'erro', codigos: comContas ? [RUBRICA_DE_SISTEMA, RUBRICA_COM_CONTAS] : [RUBRICA_DE_SISTEMA], semEscritas: false }
          : comContas
            ? { tipo: 'erro', codigos: [RUBRICA_COM_CONTAS], semEscritas: false }
            : { tipo: 'ok' };
      return {
        descricao: `eliminarRubrica(${alvo.codigo})`,
        userId: CONFIGURADOR,
        fazer: (ctx) => svc.eliminarRubrica(alvo.id, ctx),
        esperado,
        aplicar: (r) => void r.rubricas.set(alvo.id, { ...alvo, apagada: true }),
      };
    }
    case 'caixa': {
      const cx = vivas(ref).find((r) => r.atividade === 'CAIXA') as RubricaRef;
      const ids = op.comAlheia ? [...op.contas.slice(0, 1), 'b-111', ...op.contas.slice(1)] : [...op.contas];
      return {
        descricao: `definirContasCaixa(${ids.join(', ')})`,
        userId: CONFIGURADOR,
        fazer: (ctx) => svc.definirContasCaixa({ contaIds: ids }, ctx),
        esperado: op.comAlheia ? naoEncontrado : { tipo: 'ok' },
        aplicar: (r) => {
          for (const c of contasCaixa(r)) if (!ids.includes(c)) r.mapa.delete(c);
          for (const c of ids) r.mapa.set(c, cx.id);
        },
      };
    }
    case 'validar': {
      if (op.alvo === 'alheia') {
        return { descricao: 'validarVersao(de B)', userId: op.validador, fazer: (ctx) => svc.validarVersao({ versaoId: VERSAO_B }, ctx), esperado: naoEncontrado };
      }
      const recente = versoes[versoes.length - 1];
      const anteriores = versoes.slice(0, -1);
      const querAnterior = op.alvo === 'anterior' || recente.estado !== 'PENDING';
      if (querAnterior && anteriores.length > 0) {
        const v = escolher(anteriores, op.indice) as Linha;
        return {
          descricao: `validarVersao(v${String(v.numero)}, anterior)`,
          userId: op.validador,
          fazer: (ctx) => svc.validarVersao({ versaoId: String(v.id), observacao: op.observacao }, ctx),
          esperado: { tipo: 'erro', codigos: [VERSAO_DESACTUALIZADA], semEscritas: false },
        };
      }
      if (recente.estado !== 'PENDING') return null; // revalidar uma VALIDATED não está especificado
      return {
        descricao: `validarVersao(v${String(recente.numero)})`,
        userId: op.validador,
        fazer: (ctx) => svc.validarVersao({ versaoId: String(recente.id), observacao: op.observacao }, ctx),
        esperado: { tipo: 'validar', versaoId: String(recente.id), validador: op.validador, observacao: op.observacao ?? null },
      };
    }
  }
}

const arbAlvo = fc.constantFrom<Alvo>('propria', 'propria', 'propria', 'propria', 'alheia', 'inexistente', 'apagada');
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      k: fc.constant('mapear' as const),
      conta: fc.nat(),
      rubrica: fc.nat(),
      alvoConta: fc.constantFrom<Alvo>('propria', 'propria', 'propria', 'propria', 'alheia', 'inexistente'),
      alvoRubrica: arbAlvo,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('desmapear' as const),
      conta: fc.nat(),
      alvo: fc.constantFrom('mapeada', 'mapeada', 'mapeada', 'naoMapeada', 'alheia', 'inexistente'),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('criar' as const),
      codigo: fc.constantFrom('novo', 'novo', 'novo', 'repetido', 'alheio'),
      atividade: fc.constantFrom(...SECCOES),
      sinal: fc.constantFrom(...SINAIS),
      ordem: fc.oneof(fc.constantFrom(0, 9999), fc.integer({ min: 0, max: 9999 })),
      designacao: fc.constantFrom(...DESIGNACOES),
    }),
  },
  {
    weight: 3,
    arbitrary: fc.record(
      {
        k: fc.constant('editar' as const),
        rubrica: fc.nat(),
        alvo: fc.constantFrom('propria', 'propria', 'propria', 'propria', 'alheia', 'apagada'),
        designacao: fc.constantFrom('mesma', ...DESIGNACOES),
        ordem: fc.oneof(fc.constant('mesma' as const), fc.constantFrom(0, 9999), fc.integer({ min: 0, max: 9999 })),
        ativo: fc.boolean(),
        sinal: fc.constantFrom(...SINAIS),
        atividade: fc.constantFrom(...SECCOES),
      },
      { requiredKeys: ['k', 'rubrica', 'alvo'] },
    ),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('eliminar' as const),
      rubrica: fc.nat(),
      alvo: fc.constantFrom('propria', 'propria', 'propria', 'alheia', 'apagada'),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      k: fc.constant('caixa' as const),
      contas: fc.shuffledSubarray([...IDS_CONTAS_A], { minLength: 1 }),
      comAlheia: fc.boolean(),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record(
      {
        k: fc.constant('validar' as const),
        alvo: fc.constantFrom('recente', 'recente', 'recente', 'anterior', 'alheia'),
        indice: fc.nat(),
        validador: fc.constantFrom(...CONTABILISTAS),
        observacao: fc.constantFrom('Conforme', 'Revisto pelo contabilista, sem reservas'),
      },
      { requiredKeys: ['k', 'alvo', 'indice', 'validador'] },
    ),
  },
);

describe('[property] V1 + V2 + V3 + I10 + MINOR-2 — sequências de escritas contra o serviço real', () => {
  it(
    '[property] depois de CADA escrita: o vivo é o previsto, V1 vale, versão n+1 PENDING numa só tx ⇔ o mapeamento mudou, recusas não deixam rasto, B intocado',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.constantFrom('PENDING' as const, 'VALIDATED' as const), fc.array(arbOp, { minLength: 1, maxLength: 12 }), async (estadoV1, ops) => {
          duplo.repor(mundo(estadoV1));
          const ref = referenciaInicial();
          const b0 = tudoDe(B);
          afirmarV1(versoesDe(A), instantaneoVivo());

          for (const op of ops) {
            const antes = { ref: clonarRef(ref), versoes: versoesDe(A) };
            const plano = planear(ref, antes.versoes, op);
            if (!plano) continue;
            const { r, chamadas, escritas, trancas } = await observar(plano.fazer, plano.userId);
            const e = plano.esperado;
            const onde = `${plano.descricao} [esperado ${e.tipo}${e.tipo === 'erro' ? ` ${e.codigos.join('|')}` : ''}]`;

            // Auditoria: nunca upsert/*Many.
            expect(proibidasDe(chamadas), onde).toEqual([]);

            // O desfecho que a especificação obriga.
            if (e.tipo === 'ok' || e.tipo === 'validar') {
              if (!r.ok) throw new Error(`${onde}: devia passar e lançou ${codigoDe(r.erro)}`);
              if (e.tipo === 'ok') plano.aplicar?.(ref, r.valor);
            } else if (e.tipo === 'erro') {
              if (r.ok) throw new Error(`${onde}: TEM de lançar e passou`);
              expect(e.codigos, onde).toContain(codigoDe(r.erro));
              if (e.semEscritas) expect(escritas, `${onde}: NotFoundError ANTES de escrever`).toEqual([]);
            } else if (e.tipo === 'erroQualquer') {
              if (r.ok) throw new Error(`${onde}: TEM de lançar e passou`);
            }

            // O vivo é exactamente o previsto (efeito quando passa, nada quando recusa).
            expect(formaDoVivo(), onde).toEqual(formaDaReferencia(ref));
            expect(tudoDe(B), `${onde}: tenant B`).toEqual(b0);

            const depois = versoesDe(A);
            const mudouMapa = instantaneoDaReferencia(antes.ref) !== instantaneoDaReferencia(ref);
            if (mudouMapa) {
              // V2
              afirmarVersaoNova(antes.versoes, depois);
              afirmarMesmaTransaccao(escritas);
            } else if (e.tipo === 'validar') {
              // V3: a mais recente passa a VALIDATED; nada mais muda; uma só escrita, trancada.
              expect(depois.slice(0, -1), onde).toEqual(antes.versoes.slice(0, -1));
              const { estado: _a, validadoPorId: _b, validadoEm, observacao: _c, ...resto } = depois[depois.length - 1];
              const { estado: _d, validadoPorId: _f, validadoEm: _g, observacao: _h, ...resto0 } = antes.versoes[antes.versoes.length - 1];
              expect(resto, onde).toEqual(resto0);
              expect(depois[depois.length - 1], onde).toMatchObject({ id: e.versaoId, estado: 'VALIDATED', validadoPorId: e.validador, observacao: e.observacao });
              expect(validadoEm, onde).toBeInstanceOf(Date);
              expect(escritas.map((c) => `${c.modelo}.${c.operacao}`), onde).toEqual(['versaoMapeamentoFluxo.update']);
              const tranca = trancas.find((t) => t.modelo === 'versaoMapeamentoFluxo' && t.modo === 'FOR UPDATE' && t.ids.includes(e.versaoId));
              expect(tranca, `${onde}: FOR UPDATE`).toBeDefined();
              expect(tranca?.txId, onde).toBe(escritas[0].txId);
              expect(tranca?.txId, onde).not.toBeNull();
            } else {
              // Nada mudou ⇒ nenhuma versão, e as existentes intactas.
              expect(depois, `${onde}: sem mudança não há versão`).toEqual(antes.versoes);
            }

            // V3: fora de validarVersao, nenhuma escrita toca numa versão existente.
            if (e.tipo !== 'validar') {
              expect(
                escritas.filter((c) => c.modelo === 'versaoMapeamentoFluxo' && c.operacao !== 'create'),
                `${onde}: validar é a única escrita sobre uma versão`,
              ).toEqual([]);
            }

            // V1, sempre.
            afirmarV1(depois, instantaneoVivo());
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    600_000,
  );

});
