// ---------------------------------------------------------------------------
// DUPLO COM ESTADO da configuração da DFC (nó `config-v` do grafo dfc, gate do
// ticket 7) — escrito pelo verificador-fluxo-caixa. FICHEIRO PROTEGIDO: um
// agente feat-* que o altere é BLOCKER (doutrina 00 §2; grafo dfc, «Ficheiros
// protegidos»). Se o serviço precisar de uma consulta que isto não simula, o
// autor descreve-a e escala ao verificador; não muda o duplo.
//
// Substitui `prisma` e `prismaBase` de `@/server/db/client` por uma base em
// memória, com estado, para seis modelos: ContaPGC, PeriodoContabil,
// ExercicioContabil (só leitura — a configuração não lhes escreve) e
// RubricaFluxoCaixa, MapeamentoContaFluxo, VersaoMapeamentoFluxo.
//
// O que simula, porque é o que o gate mede:
//  - TRANSACÇÕES a sério: `$transaction(async (tx) => …)` trabalha sobre uma
//    cópia; só um `fn` que resolve faz commit; uma excepção a meio descarta
//    TUDO o que a transacção escreveu (V2 «na mesma $transaction»). Cada
//    chamada fica registada com o `txId` em que correu (null = fora de tx).
//  - A tenant-extension, pela letra de `tenant-extension.ts`: no cliente
//    `prisma`, modelos com `tenantId` exigem contexto (SEM_CONTEXTO_TENANT),
//    `create` recebe o `tenantId` do contexto, e as leituras/escritas em lote de
//    INJECT_WHERE recebem `tenantId` (+ `deletedAt: null` em modelos com soft
//    delete). `findUnique`, `update`, `delete` e todo o `prismaBase` NÃO são
//    escopados — o `where` do serviço é o único escopo (I10).
//  - FKs não escopadas por tenant, como a migração 22b: um mapeamento aceita um
//    `contaId`/`rubricaId` de OUTRO tenant (P2003 só se não existir em lado
//    nenhum). Unicidades do schema (P2002). `delete` de rubrica com mapeamentos
//    falha (P2003, onDelete Restrict).
//  - Auditoria: `upsert`, `createMany`, `createManyAndReturn`, `updateMany`,
//    `updateManyAndReturn` e `deleteMany` passam SEM AuditLog na
//    audit-extension; aqui ficam registados E lançam. O teste conta-os.
//  - SQL cru: só `SELECT … FROM "<Modelo>" WHERE a = $1 AND … [ORDER BY …]
//    [LIMIT n] FOR UPDATE|FOR SHARE` (fica registado como tranca, com o txId) e
//    `pg_advisory_xact_lock`. Qualquer outro SQL lança.
//  - Falhas injectadas: `falharNa({ modelo, operacao, ordem })` faz a n-ésima
//    chamada correspondente lançar — é assim que se mostra que uma falha a meio
//    não deixa nem a escrita nem a versão.
//
// Limites conhecidos (lançam, não fingem): `$transaction([…])` em array (as
// promessas do duplo não são preguiçosas), `groupBy`, `distinct`, `cursor`,
// `orderBy` por relação, escritas aninhadas além de `connect`.
// ---------------------------------------------------------------------------
import { Prisma } from '@prisma/client';
import {
  requireTenantContext,
  SOFT_DELETE_MODELS,
  TENANT_MODELS,
} from '@/server/db/tenant-extension';

export type Modelo =
  | 'contaPGC'
  | 'periodoContabil'
  | 'exercicioContabil'
  | 'rubricaFluxoCaixa'
  | 'mapeamentoContaFluxo'
  | 'versaoMapeamentoFluxo';

export type Linha = Record<string, unknown>;
export type Tabelas = Record<Modelo, Linha[]>;
export type Origem = 'prisma' | 'prismaBase';

interface Relacao {
  /** `null` = modelo que o duplo não simula: usar a relação lança. */
  alvo: Modelo | null;
  lista: boolean;
  local: string;
  remoto: string;
}

interface Esquema {
  nome: string;
  campos: readonly string[];
  obrigatorios: readonly string[];
  omissoes: Readonly<Record<string, () => unknown>>;
  unicos: readonly (readonly string[])[];
  json: readonly string[];
  actualizadoEm: boolean;
  soLeitura: boolean;
  relacoes: Readonly<Record<string, Relacao>>;
}

let seqId = 0;
const novoId = (prefixo: string) => `${prefixo}-${(++seqId).toString(36).padStart(6, '0')}`;
const agora = () => new Date();

/** Campos escalares por modelo — um teste compara-os com o `Prisma.dmmf` para o duplo não derivar do schema. */
export const ESQUEMA: Readonly<Record<Modelo, Esquema>> = {
  contaPGC: {
    nome: 'ContaPGC',
    campos: ['id', 'tenantId', 'codigo', 'nome', 'classe', 'tipo', 'natureza', 'nivel', 'contaMaeId', 'aceitaLancamento', 'ativo', 'descricao', 'createdAt', 'updatedAt'],
    obrigatorios: [],
    omissoes: {},
    unicos: [['id'], ['tenantId', 'codigo']],
    json: [],
    actualizadoEm: true,
    soLeitura: true,
    relacoes: {
      mapeamentosFluxo: { alvo: 'mapeamentoContaFluxo', lista: true, local: 'id', remoto: 'contaId' },
      contaMae: { alvo: 'contaPGC', lista: false, local: 'contaMaeId', remoto: 'id' },
      subContas: { alvo: 'contaPGC', lista: true, local: 'id', remoto: 'contaMaeId' },
      partidas: { alvo: null, lista: true, local: 'id', remoto: 'contaId' },
      contasBancarias: { alvo: null, lista: true, local: 'id', remoto: 'contaContabilId' },
    },
  },
  periodoContabil: {
    nome: 'PeriodoContabil',
    campos: ['id', 'tenantId', 'exercicioId', 'ordem', 'codigo', 'dataInicio', 'dataFim', 'estado', 'fechadoEm', 'fechadoPorId', 'createdAt', 'updatedAt'],
    obrigatorios: [],
    omissoes: {},
    unicos: [['id'], ['tenantId', 'codigo']],
    json: [],
    actualizadoEm: true,
    soLeitura: true,
    relacoes: {
      exercicio: { alvo: 'exercicioContabil', lista: false, local: 'exercicioId', remoto: 'id' },
      lancamentos: { alvo: null, lista: true, local: 'id', remoto: 'periodoId' },
      reaberturasRegistos: { alvo: null, lista: true, local: 'id', remoto: 'periodoId' },
      apuramentosIva: { alvo: null, lista: true, local: 'id', remoto: 'periodoId' },
    },
  },
  exercicioContabil: {
    nome: 'ExercicioContabil',
    campos: ['id', 'tenantId', 'codigo', 'dataInicio', 'dataFim', 'estado', 'anteriorId', 'criadoPorId', 'createdAt', 'updatedAt'],
    obrigatorios: [],
    omissoes: {},
    unicos: [['id'], ['tenantId', 'codigo']],
    json: [],
    actualizadoEm: true,
    soLeitura: true,
    relacoes: {
      periodos: { alvo: 'periodoContabil', lista: true, local: 'id', remoto: 'exercicioId' },
    },
  },
  rubricaFluxoCaixa: {
    nome: 'RubricaFluxoCaixa',
    campos: ['id', 'tenantId', 'codigo', 'designacao', 'atividade', 'sinal', 'ordem', 'origem', 'ativo', 'createdAt', 'updatedAt', 'deletedAt'],
    obrigatorios: ['tenantId', 'codigo', 'designacao', 'atividade', 'sinal', 'ordem', 'origem'],
    omissoes: { id: () => novoId('rub'), ativo: () => true, createdAt: agora, updatedAt: agora, deletedAt: () => null },
    unicos: [['id'], ['tenantId', 'codigo']],
    json: [],
    actualizadoEm: true,
    soLeitura: false,
    relacoes: {
      mapeamentos: { alvo: 'mapeamentoContaFluxo', lista: true, local: 'id', remoto: 'rubricaId' },
      compromissos: { alvo: null, lista: true, local: 'id', remoto: 'rubricaId' },
    },
  },
  mapeamentoContaFluxo: {
    nome: 'MapeamentoContaFluxo',
    campos: ['id', 'tenantId', 'contaId', 'rubricaId', 'createdAt', 'updatedAt'],
    obrigatorios: ['tenantId', 'contaId', 'rubricaId'],
    omissoes: { id: () => novoId('map'), createdAt: agora, updatedAt: agora },
    unicos: [['id'], ['tenantId', 'contaId']],
    json: [],
    actualizadoEm: true,
    soLeitura: false,
    relacoes: {
      conta: { alvo: 'contaPGC', lista: false, local: 'contaId', remoto: 'id' },
      rubrica: { alvo: 'rubricaFluxoCaixa', lista: false, local: 'rubricaId', remoto: 'id' },
    },
  },
  versaoMapeamentoFluxo: {
    nome: 'VersaoMapeamentoFluxo',
    campos: ['id', 'tenantId', 'numero', 'estado', 'instantaneo', 'validadoPorId', 'validadoEm', 'observacao', 'createdAt'],
    obrigatorios: ['tenantId', 'numero', 'instantaneo'],
    omissoes: {
      id: () => novoId('ver'),
      estado: () => 'PENDING',
      validadoPorId: () => null,
      validadoEm: () => null,
      observacao: () => null,
      createdAt: agora,
    },
    unicos: [['id'], ['tenantId', 'numero']],
    json: ['instantaneo'],
    actualizadoEm: false,
    soLeitura: false,
    relacoes: {},
  },
};

const MODELOS = Object.keys(ESQUEMA) as Modelo[];
const MODELO_POR_NOME = new Map(MODELOS.map((m) => [ESQUEMA[m].nome, m]));

export const OPERACOES_PROIBIDAS = new Set([
  'upsert',
  'createMany',
  'createManyAndReturn',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);
export const OPERACOES_ESCRITA = new Set(['create', 'update', 'delete', ...OPERACOES_PROIBIDAS]);
const INJECT_WHERE = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy']);
const INJECT_DATA = new Set(['create', 'createMany', 'createManyAndReturn']);
const OPERACOES = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'create',
  'update',
  'delete',
  ...OPERACOES_PROIBIDAS,
] as const;

export interface Chamada {
  modelo: Modelo | '$raw';
  operacao: string;
  origem: Origem;
  txId: number | null;
  args: unknown;
}

export interface Tranca {
  txId: number | null;
  modelo: Modelo | null;
  modo: 'FOR UPDATE' | 'FOR SHARE' | 'ADVISORY';
  ids: string[];
  sql: string;
  /** Posição na lista de chamadas — para provar que a tranca veio ANTES da escrita. */
  indiceChamada: number;
}

export interface Falha {
  modelo: Modelo;
  /** Operação exacta, ou `'*escrita'` para a n-ésima escrita (create/update/delete) sobre o modelo. */
  operacao: string;
  /** 1 = a primeira chamada correspondente (omissão). */
  ordem?: number;
}

interface Transaccao {
  id: number;
  dados: Tabelas;
  aberta: boolean;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function erroDuplo(msg: string): Error {
  return new Error(
    `[duplo da configuração da DFC] ${msg} — o serviço usa uma forma que o duplo não simula. ` +
      'Não se muda o duplo no nó do autor: descreve a consulta e escala ao verificador.',
  );
}

function erroPrisma(code: 'P2002' | 'P2003' | 'P2025', msg: string): Error {
  return new Prisma.PrismaClientKnownRequestError(`[duplo] ${msg}`, { code, clientVersion: 'duplo' });
}

function ePlano(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const clonar = <T>(v: T): T => structuredClone(v);
const emLista = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a == null || b == null) return a == null && b == null;
  return a === b;
}

function comparar(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last (Postgres, ASC)
  if (b == null) return -1;
  const x = a instanceof Date ? a.getTime() : (a as number | string | boolean);
  const y = b instanceof Date ? b.getTime() : (b as number | string | boolean);
  return x < y ? -1 : x > y ? 1 : 0;
}

function vazio(): Tabelas {
  return Object.fromEntries(MODELOS.map((m) => [m, [] as Linha[]])) as unknown as Tabelas;
}

// ---------------------------------------------------------------------------
// O duplo
// ---------------------------------------------------------------------------

export class DuploConfigDfc {
  private dados: Tabelas = vazio();
  private seqTx = 0;
  private falhas: Array<Required<Falha> & { vistas: number }> = [];
  readonly chamadas: Chamada[] = [];
  readonly trancas: Tranca[] = [];
  readonly commits: number[] = [];
  readonly rollbacks: number[] = [];
  readonly prisma: Record<string, unknown>;
  readonly prismaBase: Record<string, unknown>;

  constructor() {
    this.prisma = this.cliente('prisma', null);
    this.prismaBase = this.cliente('prismaBase', null);
  }

  /** Substitui o estado inteiro e limpa registos e falhas. */
  repor(tabelas: Partial<Tabelas>): void {
    this.dados = { ...vazio(), ...clonar(tabelas) };
    this.chamadas.length = 0;
    this.trancas.length = 0;
    this.commits.length = 0;
    this.rollbacks.length = 0;
    this.falhas = [];
  }

  /** Cópia das linhas COMMITADAS de um modelo (opcionalmente de um tenant). */
  linhas(modelo: Modelo, tenantId?: string): Linha[] {
    const ls = this.dados[modelo].filter((l) => tenantId === undefined || l.tenantId === tenantId);
    return clonar(ls);
  }

  falharNa(f: Falha): void {
    this.falhas.push({ ordem: 1, ...f, vistas: 0 });
  }

  // -------------------------------------------------------------------------

  private cliente(origem: Origem, tx: Transaccao | null): Record<string, unknown> {
    const delegados: Record<string, unknown> = {};
    for (const modelo of MODELOS) {
      const d: Record<string, (args?: unknown) => Promise<unknown>> = {};
      for (const op of OPERACOES) {
        d[op] = async (args?: unknown) => this.executar(origem, tx, modelo, op, args);
      }
      delegados[modelo] = d;
    }
    const raw = (op: string) => async (primeiro: unknown, ...resto: unknown[]) =>
      this.sqlCru(origem, tx, op, primeiro, resto);
    delegados.$queryRaw = raw('$queryRaw');
    delegados.$executeRaw = raw('$executeRaw');
    delegados.$queryRawUnsafe = raw('$queryRawUnsafe');
    delegados.$executeRawUnsafe = raw('$executeRawUnsafe');
    delegados.$transaction = async (fn: unknown) => {
      if (tx) throw erroDuplo('$transaction aninhada num cliente de transacção (o Prisma não a tem)');
      if (typeof fn !== 'function') {
        throw erroDuplo('$transaction em array: use a forma interactiva $transaction(async (tx) => …)');
      }
      const nova: Transaccao = { id: ++this.seqTx, dados: clonar(this.dados), aberta: true };
      try {
        const r = await (fn as (c: unknown) => Promise<unknown>)(this.cliente(origem, nova));
        nova.aberta = false;
        this.dados = nova.dados;
        this.commits.push(nova.id);
        return r;
      } catch (e) {
        nova.aberta = false;
        this.rollbacks.push(nova.id);
        throw e;
      }
    };
    return new Proxy(delegados, {
      get(alvo, prop) {
        if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
        if (prop in alvo) return alvo[prop];
        throw erroDuplo(`cliente.${prop} não simulado`);
      },
    });
  }

  private registar(c: Chamada): number {
    this.chamadas.push(c);
    return this.chamadas.length - 1;
  }

  private injectarFalha(modelo: Modelo, operacao: string): void {
    for (const f of this.falhas) {
      const corresponde =
        f.modelo === modelo &&
        (f.operacao === operacao || (f.operacao === '*escrita' && OPERACOES_ESCRITA.has(operacao)));
      if (!corresponde) continue;
      f.vistas += 1;
      if (f.vistas === f.ordem) {
        throw new Error(`[duplo] falha injectada em ${modelo}.${operacao} (#${f.ordem})`);
      }
    }
  }

  private async executar(origem: Origem, tx: Transaccao | null, modelo: Modelo, op: string, argsIn: unknown) {
    if (tx && !tx.aberta) throw erroDuplo(`chamada a ${modelo}.${op} numa transacção já fechada`);
    const args: Record<string, unknown> = ePlano(argsIn) ? { ...argsIn } : {};
    this.registar({ modelo, operacao: op, origem, txId: tx?.id ?? null, args: argsIn });

    if (OPERACOES_PROIBIDAS.has(op)) {
      throw erroDuplo(
        `${modelo}.${op} é proibido nesta configuração: escritas em lote e upsert passam SEM AuditLog ` +
          '(CLAUDE.md «Auditoria só vê escritas singulares»)',
      );
    }
    const esq = ESQUEMA[modelo];
    if (OPERACOES_ESCRITA.has(op) && esq.soLeitura) {
      throw erroDuplo(`escrita ${modelo}.${op}: a configuração da DFC não escreve neste modelo`);
    }
    this.injectarFalha(modelo, op);

    // Emulação da tenant-extension (só no cliente `prisma`).
    if (origem === 'prisma' && TENANT_MODELS.has(esq.nome)) {
      const ctx = requireTenantContext();
      if (INJECT_DATA.has(op)) {
        args.data = { ...(args.data as object), tenantId: ctx.tenantId };
      } else if (INJECT_WHERE.has(op)) {
        args.where = {
          ...(args.where as object),
          tenantId: ctx.tenantId,
          ...(SOFT_DELETE_MODELS.has(esq.nome) ? { deletedAt: null } : {}),
        };
      }
    }

    const dados = tx ? tx.dados : this.dados;
    switch (op) {
      case 'findMany':
        return this.encontrar(dados, modelo, args).map((l) => this.projectar(dados, modelo, l, args));
      case 'findFirst':
      case 'findFirstOrThrow': {
        const [l] = this.encontrar(dados, modelo, { ...args, take: 1 });
        if (!l && op === 'findFirstOrThrow') throw erroPrisma('P2025', `${modelo}.findFirstOrThrow sem resultado`);
        return l ? this.projectar(dados, modelo, l, args) : null;
      }
      case 'findUnique':
      case 'findUniqueOrThrow': {
        const ls = this.filtrar(dados, modelo, args.where);
        if (ls.length > 1) throw erroDuplo(`${modelo}.findUnique com um where que não é único`);
        if (!ls[0] && op === 'findUniqueOrThrow') throw erroPrisma('P2025', `${modelo}.findUniqueOrThrow sem resultado`);
        return ls[0] ? this.projectar(dados, modelo, ls[0], args) : null;
      }
      case 'count':
        if (args.select !== undefined) throw erroDuplo(`${modelo}.count com select`);
        return this.encontrar(dados, modelo, args).length;
      case 'aggregate':
        return this.agregar(dados, modelo, args);
      case 'groupBy':
        throw erroDuplo(`${modelo}.groupBy`);
      case 'create':
        return this.criar(dados, modelo, args);
      case 'update':
        return this.actualizar(dados, modelo, args);
      case 'delete':
        return this.apagar(dados, modelo, args);
      default:
        throw erroDuplo(`${modelo}.${op}`);
    }
  }

  // -------------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------------

  private filtrar(dados: Tabelas, modelo: Modelo, where: unknown): Linha[] {
    return dados[modelo].filter((l) => this.corresponde(dados, modelo, l, where));
  }

  private encontrar(dados: Tabelas, modelo: Modelo, args: Record<string, unknown>): Linha[] {
    if (args.distinct !== undefined) throw erroDuplo(`${modelo} com distinct`);
    if (args.cursor !== undefined) throw erroDuplo(`${modelo} com cursor`);
    let ls = this.filtrar(dados, modelo, args.where);
    if (args.orderBy !== undefined) ls = this.ordenar(modelo, ls, args.orderBy);
    const skip = typeof args.skip === 'number' ? args.skip : 0;
    const take = typeof args.take === 'number' ? args.take : undefined;
    if (take !== undefined && take < 0) throw erroDuplo(`${modelo} com take negativo`);
    return ls.slice(skip, take === undefined ? undefined : skip + take);
  }

  private ordenar(modelo: Modelo, ls: Linha[], orderBy: unknown): Linha[] {
    const chaves = emLista(orderBy as Record<string, unknown> | Record<string, unknown>[]).map((o) => {
      const entradas = Object.entries(o);
      if (entradas.length !== 1) throw erroDuplo(`${modelo}.orderBy com mais de uma chave por objecto`);
      const [campo, dir] = entradas[0];
      if (!ESQUEMA[modelo].campos.includes(campo)) throw erroDuplo(`${modelo}.orderBy por ${campo}`);
      const sentido = typeof dir === 'string' ? dir : ePlano(dir) ? dir.sort : undefined;
      if (sentido !== 'asc' && sentido !== 'desc') throw erroDuplo(`${modelo}.orderBy ${campo}: ${String(dir)}`);
      return { campo, sinal: sentido === 'asc' ? 1 : -1 };
    });
    return [...ls].sort((a, b) => {
      for (const k of chaves) {
        const c = comparar(a[k.campo], b[k.campo]);
        if (c !== 0) return c * k.sinal;
      }
      return 0;
    });
  }

  private corresponde(dados: Tabelas, modelo: Modelo, linha: Linha, where: unknown): boolean {
    if (where === undefined || where === null) return true;
    if (!ePlano(where)) throw erroDuplo(`${modelo}.where não é um objecto`);
    const esq = ESQUEMA[modelo];
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === 'AND') {
        if (!emLista(v).every((w) => this.corresponde(dados, modelo, linha, w))) return false;
      } else if (k === 'OR') {
        if (!Array.isArray(v)) throw erroDuplo(`${modelo}.where.OR não é lista`);
        if (!v.some((w) => this.corresponde(dados, modelo, linha, w))) return false;
      } else if (k === 'NOT') {
        if (emLista(v).some((w) => this.corresponde(dados, modelo, linha, w))) return false;
      } else if (esq.campos.includes(k)) {
        if (!this.condicao(modelo, k, linha[k], v)) return false;
      } else if (k in esq.relacoes) {
        if (!this.condicaoRelacao(dados, modelo, k, linha, v)) return false;
      } else if (k.includes('_') && ePlano(v)) {
        // Chave única composta, ex.: tenantId_contaId: { tenantId, contaId }.
        for (const [c, cv] of Object.entries(v)) {
          if (!esq.campos.includes(c)) throw erroDuplo(`${modelo}.where.${k}.${c} desconhecido`);
          if (!igual(linha[c], cv)) return false;
        }
      } else {
        throw erroDuplo(`${modelo}.where.${k} desconhecido`);
      }
    }
    return true;
  }

  private condicao(modelo: Modelo, campo: string, valor: unknown, cond: unknown): boolean {
    if (!ePlano(cond)) return igual(valor, cond);
    const insensivel = cond.mode === 'insensitive';
    const txt = (x: unknown) => (insensivel ? String(x).toLowerCase() : String(x));
    for (const [op, arg] of Object.entries(cond)) {
      if (arg === undefined || op === 'mode') continue;
      switch (op) {
        case 'equals':
          if (!igual(valor, arg)) return false;
          break;
        case 'in':
          if (!(arg as unknown[]).some((x) => igual(valor, x))) return false;
          break;
        case 'notIn':
          if ((arg as unknown[]).some((x) => igual(valor, x))) return false;
          break;
        case 'not':
          if (ePlano(arg) ? this.condicao(modelo, campo, valor, arg) : igual(valor, arg)) return false;
          break;
        case 'lt':
          if (valor == null || !(comparar(valor, arg) < 0)) return false;
          break;
        case 'lte':
          if (valor == null || !(comparar(valor, arg) <= 0)) return false;
          break;
        case 'gt':
          if (valor == null || !(comparar(valor, arg) > 0)) return false;
          break;
        case 'gte':
          if (valor == null || !(comparar(valor, arg) >= 0)) return false;
          break;
        case 'contains':
          if (valor == null || !txt(valor).includes(txt(arg))) return false;
          break;
        case 'startsWith':
          if (valor == null || !txt(valor).startsWith(txt(arg))) return false;
          break;
        case 'endsWith':
          if (valor == null || !txt(valor).endsWith(txt(arg))) return false;
          break;
        default:
          throw erroDuplo(`${modelo}.where.${campo}.${op}`);
      }
    }
    return true;
  }

  private relacao(modelo: Modelo, nome: string): Relacao & { alvo: Modelo } {
    const r = ESQUEMA[modelo].relacoes[nome];
    if (!r) throw erroDuplo(`relação ${modelo}.${nome} desconhecida`);
    if (r.alvo === null) throw erroDuplo(`relação ${modelo}.${nome} aponta para um modelo não simulado`);
    return r as Relacao & { alvo: Modelo };
  }

  private relacionados(dados: Tabelas, modelo: Modelo, nome: string, linha: Linha): Linha[] {
    const r = this.relacao(modelo, nome);
    return dados[r.alvo].filter((t) => linha[r.local] != null && igual(t[r.remoto], linha[r.local]));
  }

  private condicaoRelacao(dados: Tabelas, modelo: Modelo, nome: string, linha: Linha, cond: unknown): boolean {
    const r = this.relacao(modelo, nome);
    const rel = this.relacionados(dados, modelo, nome, linha);
    const m = (w: unknown) => (t: Linha) => this.corresponde(dados, r.alvo, t, w);
    if (r.lista) {
      if (!ePlano(cond)) throw erroDuplo(`${modelo}.where.${nome} sem some/none/every`);
      for (const [op, w] of Object.entries(cond)) {
        if (op === 'some' && !rel.some(m(w))) return false;
        else if (op === 'none' && rel.some(m(w))) return false;
        else if (op === 'every' && !rel.every(m(w))) return false;
        else if (!['some', 'none', 'every'].includes(op)) throw erroDuplo(`${modelo}.where.${nome}.${op}`);
      }
      return true;
    }
    const alvo = rel[0];
    if (cond === null) return alvo === undefined;
    if (ePlano(cond) && ('is' in cond || 'isNot' in cond)) {
      if ('is' in cond && !(cond.is === null ? !alvo : !!alvo && m(cond.is)(alvo))) return false;
      if ('isNot' in cond && (cond.isNot === null ? !alvo : !!alvo && m(cond.isNot)(alvo))) return false;
      return true;
    }
    return !!alvo && m(cond)(alvo);
  }

  private projectar(dados: Tabelas, modelo: Modelo, linha: Linha, args: Record<string, unknown>): Linha {
    const esq = ESQUEMA[modelo];
    const { select, include } = args;
    if (select !== undefined && include !== undefined) throw erroDuplo(`${modelo} com select e include`);
    const out: Linha = {};
    const relacaoOuContagem = (k: string, v: unknown) => {
      if (k === '_count') out._count = this.contagem(dados, modelo, linha, v);
      else if (k in esq.relacoes) out[k] = this.projectarRelacao(dados, modelo, k, linha, v);
      else throw erroDuplo(`${modelo}.select/include.${k} desconhecido`);
    };
    if (select !== undefined) {
      if (!ePlano(select)) throw erroDuplo(`${modelo}.select inválido`);
      for (const [k, v] of Object.entries(select)) {
        if (!v) continue;
        if (esq.campos.includes(k)) out[k] = clonar(linha[k]);
        else relacaoOuContagem(k, v);
      }
      return out;
    }
    for (const c of esq.campos) out[c] = clonar(linha[c]);
    if (include !== undefined) {
      if (!ePlano(include)) throw erroDuplo(`${modelo}.include inválido`);
      for (const [k, v] of Object.entries(include)) if (v) relacaoOuContagem(k, v);
    }
    return out;
  }

  private projectarRelacao(dados: Tabelas, modelo: Modelo, nome: string, linha: Linha, v: unknown): unknown {
    const r = this.relacao(modelo, nome);
    const sub: Record<string, unknown> = ePlano(v) ? v : {};
    if (r.lista) {
      let ls = this.relacionados(dados, modelo, nome, linha).filter((t) => this.corresponde(dados, r.alvo, t, sub.where));
      if (sub.orderBy !== undefined) ls = this.ordenar(r.alvo, ls, sub.orderBy);
      const skip = typeof sub.skip === 'number' ? sub.skip : 0;
      const take = typeof sub.take === 'number' ? sub.take : undefined;
      ls = ls.slice(skip, take === undefined ? undefined : skip + take);
      return ls.map((t) => this.projectar(dados, r.alvo, t, sub));
    }
    const [alvo] = this.relacionados(dados, modelo, nome, linha);
    return alvo ? this.projectar(dados, r.alvo, alvo, sub) : null;
  }

  private contagem(dados: Tabelas, modelo: Modelo, linha: Linha, v: unknown): Record<string, number> {
    const esq = ESQUEMA[modelo];
    const pedidos: Array<[string, unknown]> =
      v === true
        ? Object.entries(esq.relacoes).filter(([, r]) => r.lista && r.alvo !== null).map(([k]) => [k, true])
        : ePlano(v) && ePlano(v.select)
          ? Object.entries(v.select)
          : (() => {
              throw erroDuplo(`${modelo}._count inválido`);
            })();
    const out: Record<string, number> = {};
    for (const [k, w] of pedidos) {
      if (!w) continue;
      const r = this.relacao(modelo, k);
      if (!r.lista) throw erroDuplo(`${modelo}._count.${k} não é lista`);
      const where = ePlano(w) ? w.where : undefined;
      out[k] = this.relacionados(dados, modelo, k, linha).filter((t) => this.corresponde(dados, r.alvo, t, where)).length;
    }
    return out;
  }

  private agregar(dados: Tabelas, modelo: Modelo, args: Record<string, unknown>): Record<string, unknown> {
    const ls = this.encontrar(dados, modelo, args);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (['where', 'orderBy', 'take', 'skip'].includes(k) || v === undefined) continue;
      if (k === '_count' && v === true) {
        out._count = ls.length;
        continue;
      }
      if (!['_max', '_min', '_sum', '_count'].includes(k) || !ePlano(v)) throw erroDuplo(`${modelo}.aggregate.${k}`);
      const r: Record<string, unknown> = {};
      for (const [campo, pedido] of Object.entries(v)) {
        if (!pedido) continue;
        if (!ESQUEMA[modelo].campos.includes(campo)) throw erroDuplo(`${modelo}.aggregate.${k}.${campo}`);
        const vals = ls.map((l) => l[campo]).filter((x) => x != null);
        if (k === '_count') r[campo] = vals.length;
        else if (vals.length === 0) r[campo] = null;
        else if (k === '_sum') r[campo] = (vals as number[]).reduce((a, b) => a + b, 0);
        else {
          const ord = [...vals].sort(comparar);
          r[campo] = clonar(k === '_max' ? ord[ord.length - 1] : ord[0]);
        }
      }
      out[k] = r;
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------------

  private aplicarDados(dados: Tabelas, modelo: Modelo, linha: Linha, data: unknown, criacao: boolean): void {
    if (!ePlano(data)) throw erroDuplo(`${modelo}.data não é um objecto`);
    const esq = ESQUEMA[modelo];
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (esq.campos.includes(k)) {
        let valor: unknown = v;
        if (ePlano(v)) {
          if (esq.json.includes(k)) valor = v;
          else if ('set' in v) valor = v.set;
          else if (!criacao && ('increment' in v || 'decrement' in v)) {
            const base = linha[k] as number;
            valor = 'increment' in v ? base + (v.increment as number) : base - (v.decrement as number);
          } else throw erroDuplo(`${modelo}.data.${k} com operação desconhecida`);
        }
        if (esq.json.includes(k)) {
          // A base guarda JSON: o que não se serializa não chega lá (Date vira string, undefined some).
          valor = valor === null ? null : JSON.parse(JSON.stringify(valor));
        }
        linha[k] = valor;
      } else if (k in esq.relacoes) {
        const r = this.relacao(modelo, k);
        if (r.lista || r.local === 'id') throw erroDuplo(`${modelo}.data.${k}: escrita aninhada em lista`);
        if (!ePlano(v) || !ePlano(v.connect) || Object.keys(v).length !== 1) {
          throw erroDuplo(`${modelo}.data.${k}: só se simula { connect: { … } }`);
        }
        const [alvo] = this.filtrar(dados, r.alvo, v.connect);
        if (!alvo) throw erroPrisma('P2025', `${modelo}.${k}.connect: registo não encontrado`);
        linha[r.local] = alvo[r.remoto];
      } else {
        throw erroDuplo(`${modelo}.data.${k} desconhecido`);
      }
    }
  }

  private verificarIntegridade(dados: Tabelas, modelo: Modelo, linha: Linha): void {
    const esq = ESQUEMA[modelo];
    for (const [nome, r] of Object.entries(esq.relacoes)) {
      if (r.lista || r.local === 'id' || r.alvo === null) continue;
      const v = linha[r.local];
      if (v == null) continue;
      // FK NÃO escopada por tenant (migração 22b): basta existir em algum tenant.
      if (!dados[r.alvo].some((t) => igual(t[r.remoto], v))) {
        throw erroPrisma('P2003', `FK ${modelo}.${nome} (${r.local} = ${String(v)}) sem registo`);
      }
    }
    for (const u of esq.unicos) {
      const repetido = dados[modelo].some((o) => o !== linha && o.id !== linha.id && u.every((c) => igual(o[c], linha[c])));
      if (repetido) throw erroPrisma('P2002', `unicidade ${modelo}(${u.join(', ')})`);
    }
  }

  private criar(dados: Tabelas, modelo: Modelo, args: Record<string, unknown>): Linha {
    const esq = ESQUEMA[modelo];
    const linha: Linha = {};
    this.aplicarDados(dados, modelo, linha, args.data, true);
    for (const c of esq.campos) {
      if (linha[c] !== undefined) continue;
      const omissao = esq.omissoes[c];
      if (omissao) linha[c] = omissao();
      else if (esq.obrigatorios.includes(c)) throw erroDuplo(`${modelo}.create sem o campo obrigatório ${c}`);
      else linha[c] = null;
    }
    this.verificarIntegridade(dados, modelo, linha);
    dados[modelo].push(linha);
    return this.projectar(dados, modelo, linha, args);
  }

  private alvoUnico(dados: Tabelas, modelo: Modelo, op: string, where: unknown): Linha {
    if (!ePlano(where)) throw erroDuplo(`${modelo}.${op} sem where`);
    const temChave = 'id' in where || Object.keys(where).some((k) => k.includes('_') && ePlano(where[k]));
    if (!temChave) throw erroDuplo(`${modelo}.${op} sem chave única no where`);
    const ls = this.filtrar(dados, modelo, where);
    if (ls.length === 0) throw erroPrisma('P2025', `${modelo}.${op}: registo não encontrado`);
    return ls[0];
  }

  private actualizar(dados: Tabelas, modelo: Modelo, args: Record<string, unknown>): Linha {
    const actual = this.alvoUnico(dados, modelo, 'update', args.where);
    const nova: Linha = clonar(actual);
    this.aplicarDados(dados, modelo, nova, args.data, false);
    if (ESQUEMA[modelo].actualizadoEm && !(ePlano(args.data) && 'updatedAt' in args.data)) nova.updatedAt = agora();
    this.verificarIntegridade(dados, modelo, nova);
    const i = dados[modelo].indexOf(actual);
    dados[modelo][i] = nova;
    return this.projectar(dados, modelo, nova, args);
  }

  private apagar(dados: Tabelas, modelo: Modelo, args: Record<string, unknown>): Linha {
    const actual = this.alvoUnico(dados, modelo, 'delete', args.where);
    // onDelete Restrict: ninguém pode ficar a apontar para a linha apagada.
    for (const m of MODELOS) {
      for (const [nome, r] of Object.entries(ESQUEMA[m].relacoes)) {
        if (r.alvo !== modelo || r.lista || r.local === 'id') continue;
        if (dados[m].some((t) => igual(t[r.local], actual[r.remoto]))) {
          throw erroPrisma('P2003', `delete ${modelo}: ${m}.${nome} ainda aponta para esta linha`);
        }
      }
    }
    const projectada = this.projectar(dados, modelo, actual, args);
    dados[modelo].splice(dados[modelo].indexOf(actual), 1);
    return projectada;
  }

  // -------------------------------------------------------------------------
  // SQL cru — só trancas
  // -------------------------------------------------------------------------

  private async sqlCru(origem: Origem, tx: Transaccao | null, op: string, primeiro: unknown, resto: unknown[]) {
    if (tx && !tx.aberta) throw erroDuplo(`${op} numa transacção já fechada`);
    let texto: string;
    let valores: unknown[];
    if (op.endsWith('Unsafe')) {
      texto = String(primeiro);
      valores = resto;
    } else {
      // Prisma 7 não expõe a classe `Sql` em runtime: reconhece-se pela forma.
      const eSql = (x: unknown): x is Prisma.Sql =>
        ePlano(x) === false && typeof x === 'object' && x !== null && Array.isArray((x as Prisma.Sql).strings) && Array.isArray((x as Prisma.Sql).values);
      const sql = eSql(primeiro) ? primeiro : Prisma.sql(primeiro as readonly string[], ...(resto as Prisma.Sql[]));
      texto = sql.strings.reduce((acc, s, i) => acc + (i === 0 ? '' : `$${i}`) + s, '');
      valores = sql.values;
    }
    const indice = this.registar({ modelo: '$raw', operacao: op, origem, txId: tx?.id ?? null, args: { texto, valores } });
    const t = texto.replace(/\s+/g, ' ').trim();

    if (/pg_advisory_xact_lock/i.test(t)) {
      this.trancas.push({ txId: tx?.id ?? null, modelo: null, modo: 'ADVISORY', ids: [], sql: t, indiceChamada: indice });
      return op.startsWith('$execute') ? 1 : [{ pg_advisory_xact_lock: '' }];
    }

    const modo = /\bFOR (NO KEY )?UPDATE\b/i.test(t) ? 'FOR UPDATE' : /\bFOR (KEY )?SHARE\b/i.test(t) ? 'FOR SHARE' : null;
    if (!modo || !/^SELECT\b/i.test(t)) throw erroDuplo(`SQL cru não simulado: ${t}`);
    const tabela = /\bFROM (?:"?public"?\.)?"?(\w+)"?/i.exec(t)?.[1];
    const modelo = tabela ? MODELO_POR_NOME.get(tabela) : undefined;
    if (!modelo) throw erroDuplo(`SQL cru sobre tabela não simulada: ${t}`);

    const valor = (tok: string): unknown => {
      const semCast = tok.replace(/::"?\w+"?$/, '');
      if (/^\$\d+$/.test(semCast)) return valores[Number(semCast.slice(1)) - 1];
      if (/^'.*'$/.test(semCast)) return semCast.slice(1, -1);
      if (/^\d+$/.test(semCast)) return Number(semCast);
      throw erroDuplo(`SQL cru: valor ${tok} não simulado`);
    };
    const condicoes: Array<[string, unknown]> = [];
    const w = /\bWHERE (.*?)(?:\bORDER BY\b|\bLIMIT\b|\bOFFSET\b|\bFOR (?:NO KEY |KEY )?(?:UPDATE|SHARE)\b|$)/i.exec(t)?.[1];
    if (w) {
      for (const parte of w.split(/\bAND\b/i)) {
        const m = /^\s*\(?\s*(?:"?\w+"?\.)?"?(\w+)"?\s*=\s*(\$\d+(?:::"?\w+"?)?|'[^']*'(?:::"?\w+"?)?|\d+)\s*\)?\s*$/.exec(parte);
        if (!m || !ESQUEMA[modelo].campos.includes(m[1])) throw erroDuplo(`SQL cru: condição «${parte.trim()}» não simulada`);
        condicoes.push([m[1], valor(m[2])]);
      }
    }
    const dados = tx ? tx.dados : this.dados;
    let ls = dados[modelo].filter((l) => condicoes.every(([c, v]) => igual(l[c], v)));
    const ord = /\bORDER BY (?:"?\w+"?\.)?"?(\w+)"?(?: (ASC|DESC))?/i.exec(t);
    if (ord) {
      if (!ESQUEMA[modelo].campos.includes(ord[1])) throw erroDuplo(`SQL cru: ORDER BY ${ord[1]}`);
      const s = ord[2]?.toUpperCase() === 'DESC' ? -1 : 1;
      ls = [...ls].sort((a, b) => comparar(a[ord[1]], b[ord[1]]) * s);
    }
    const lim = /\bLIMIT (\$\d+|\d+)/i.exec(t);
    if (lim) ls = ls.slice(0, Number(valor(lim[1])));
    this.trancas.push({
      txId: tx?.id ?? null,
      modelo,
      modo,
      ids: ls.map((l) => String(l.id)),
      sql: t,
      indiceChamada: indice,
    });
    return op.startsWith('$execute') ? ls.length : clonar(ls);
  }
}

/** A instância única que o `vi.mock('@/server/db/client')` do teste expõe. */
export const duploConfigDfc = new DuploConfigDfc();
