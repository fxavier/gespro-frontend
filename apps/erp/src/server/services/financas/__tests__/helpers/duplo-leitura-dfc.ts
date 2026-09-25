// ---------------------------------------------------------------------------
// DUPLO DE LEITURA da DFC (nó `servico-v` do grafo dfc, ticket 5.3) — escrito
// pelo verificador-fluxo-caixa. FICHEIRO PROTEGIDO: um agente feat-* que o
// altere é BLOCKER (doutrina 00 §2; grafo dfc, «Ficheiros protegidos»).
//
// Porquê um duplo «por cima» da base e não uma base em memória: o gate do
// ticket 5 pede «apagar um mapeamento no teste devolve impedimentos e nenhum
// mapa», e este verificador NÃO escreve na base. O duplo envolve `prisma` e
// `prismaBase` de `@/server/db/client` e deixa passar TODAS as leituras para a
// base real (balancete, DRE, períodos, contas — tudo o que a golden já fixa);
// só altera o que o cenário activo manda, sobre o RESULTADO das leituras:
//
//  - `desmapear`        — as linhas de MapeamentoContaFluxo destas contas não
//                         existem (em qualquer leitura, incluída por `include`,
//                         SQL cru ou dentro do instantâneo da versão).
//  - `semVersao`        — o tenant não tem VersaoMapeamentoFluxo nenhuma.
//  - `linhasAlheias`    — a base tem OUTRO tenant com uma rubrica, uma versão
//                         (nº 99, VALIDATED) e um mapeamento da conta X do demo
//                         para a rubrica dele (as FKs da 22b não são
//                         tenant-scoped). Só as vê quem lê SEM âmbito de tenant.
//  - `rubricaAlheia`    — o mapeamento da conta X do PRÓPRIO demo aponta para a
//                         rubrica do outro tenant (estado que a FK permite).
//  - `periodoSintetico` — existe um período 2025-12 num exercício 2025 do demo
//                         (para V4: o seed só tem 2026).
//
// «Com âmbito de tenant» = pelo cliente `prisma` numa operação que a
// tenant-extension escopa (lista copiada de INJECT_WHERE em tenant-extension.ts),
// ou com `tenantId` do demo explícito no `where`. `findUnique` e `prismaBase`
// não são escopados pela extensão: só o `where` os escopa.
//
// Qualquer ESCRITA através do duplo lança: `gerarDFC` só lê (gate-periodo), e
// este ficheiro garante também que os testes nunca mexem na base.
// Limite conhecido: no cenário `linhasAlheias`, SQL cru não recebe as linhas do
// outro tenant (o duplo não interpreta SQL); nos outros cenários é tratado.
// ---------------------------------------------------------------------------
import { Prisma } from '@prisma/client';

export const TENANT_ALHEIO = 'tenant-alheio-i10';
export const RUBRICA_ALHEIA_ID = 'rubrica-alheia-i10';
export const RUBRICA_ALHEIA_CODIGO = 'FIN-99';
export const VERSAO_ALHEIA_ID = 'versao-alheia-i10';
export const MAPEAMENTO_ALHEIO_ID = 'mapeamento-alheio-i10';
export const PERIODO_SINTETICO_ID = 'periodo-sintetico-2025-12';
export const EXERCICIO_SINTETICO_ID = 'exercicio-sintetico-2025';

export type Cenario =
  | { tipo: 'passagem' }
  | { tipo: 'desmapear'; contaIds: ReadonlySet<string> }
  | { tipo: 'semVersao' }
  | { tipo: 'linhasAlheias'; tenantId: string; contaId: string }
  | { tipo: 'rubricaAlheia'; tenantId: string; contaId: string }
  | { tipo: 'periodoSintetico'; tenantId: string };

let cenario: Cenario = { tipo: 'passagem' };

export function definirCenario(c: Cenario): void {
  cenario = c;
}

/** Operações que a tenant-extension escopa (cópia de INJECT_WHERE em tenant-extension.ts). */
const ESCOPADAS_PELA_EXTENSAO = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);
const LEITURAS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);
const ESCRITAS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

type Registo = Record<string, unknown>;
type Origem = 'prisma' | 'prismaBase';

function ePlano(v: unknown): v is Registo {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function erroDuplo(msg: string): Error {
  return new Error(
    `[duplo de leitura da DFC] ${msg} — o serviço lê de uma forma que o duplo não simula. ` +
      'Não se muda o duplo no nó do autor: descreve a consulta e escala ao verificador.',
  );
}

const eMapeamento = (o: Registo): boolean => 'contaId' in o && 'rubricaId' in o;
const eVersao = (o: Registo): boolean => 'numero' in o && 'estado' in o && 'instantaneo' in o;
const eRubrica = (o: Registo): boolean => 'atividade' in o && 'codigo' in o && 'designacao' in o;

// ---------------------------------------------------------------------------
// Linhas fabricadas (existem só no resultado das leituras; nunca na base)
// ---------------------------------------------------------------------------

const INSTANTE = new Date(Date.UTC(2026, 0, 1, 10));

function rubricaAlheia(): Registo {
  return {
    id: RUBRICA_ALHEIA_ID,
    tenantId: TENANT_ALHEIO,
    codigo: RUBRICA_ALHEIA_CODIGO,
    designacao: 'Rubrica de outro tenant',
    atividade: 'FINANCIAMENTO',
    sinal: 'VARIACAO',
    ordem: 1,
    origem: 'TENANT',
    ativo: true,
    createdAt: INSTANTE,
    updatedAt: INSTANTE,
    deletedAt: null,
  };
}

function versaoAlheia(): Registo {
  return {
    id: VERSAO_ALHEIA_ID,
    tenantId: TENANT_ALHEIO,
    numero: 99,
    estado: 'VALIDATED',
    instantaneo: { rubricas: [], mapeamentos: [] },
    validadoPorId: 'utilizador-alheio-i10',
    validadoEm: INSTANTE,
    observacao: null,
    createdAt: INSTANTE,
  };
}

function mapeamentoAlheio(contaId: string): Registo {
  return {
    id: MAPEAMENTO_ALHEIO_ID,
    tenantId: TENANT_ALHEIO,
    contaId,
    rubricaId: RUBRICA_ALHEIA_ID,
    createdAt: INSTANTE,
    updatedAt: INSTANTE,
  };
}

function exercicioSintetico(tenantId: string): Registo {
  return {
    id: EXERCICIO_SINTETICO_ID,
    tenantId,
    codigo: '2025',
    dataInicio: new Date(Date.UTC(2025, 0, 1) - 2 * 3_600_000),
    dataFim: new Date(Date.UTC(2025, 11, 31, 21, 59, 59, 999)),
    estado: 'ABERTO',
    anteriorId: null,
    criadoPorId: null,
    createdAt: INSTANTE,
    updatedAt: INSTANTE,
  };
}

function periodoSintetico(tenantId: string): Registo {
  return {
    id: PERIODO_SINTETICO_ID,
    tenantId,
    exercicioId: EXERCICIO_SINTETICO_ID,
    ordem: 12,
    codigo: '2025-12',
    dataInicio: new Date(Date.UTC(2025, 11, 1) - 2 * 3_600_000),
    dataFim: new Date(Date.UTC(2025, 11, 31, 21, 59, 59, 999)),
    estado: 'ABERTO',
    fechadoEm: null,
    fechadoPorId: null,
    createdAt: INSTANTE,
    updatedAt: INSTANTE,
  };
}

/**
 * Dá à linha fabricada a forma das irmãs (as mesmas chaves) ou do `select`;
 * relações pedidas por `include`/`select` recebem o que o cenário manda.
 */
function projectar(
  linha: Registo,
  modelo: string,
  args: Registo | undefined,
  irma: Registo | undefined,
  relacao: (nome: string, forma: unknown) => unknown,
): Registo {
  const select = ePlano(args?.select) ? (args!.select as Registo) : undefined;
  const include = ePlano(args?.include) ? (args!.include as Registo) : undefined;
  const chaves = irma
    ? Object.keys(irma)
    : select
      ? Object.keys(select).filter((k) => select[k])
      : [...Object.keys(linha), ...(include ? Object.keys(include).filter((k) => include[k]) : [])];
  const out: Registo = {};
  for (const k of chaves) {
    if (k in linha) out[k] = linha[k];
    else if (k === '_count') out[k] = irma?._count;
    else out[k] = relacao(k, irma ? irma[k] : (select?.[k] ?? include?.[k]));
  }
  void modelo;
  return out;
}

function recortarPara(forma: unknown, linha: Registo): Registo {
  if (ePlano(forma)) {
    const out: Registo = {};
    for (const k of Object.keys(forma)) if (k in linha) out[k] = linha[k];
    return out;
  }
  return linha;
}

// ---------------------------------------------------------------------------
// Âmbito de tenant
// ---------------------------------------------------------------------------

function whereFixaTenant(where: unknown, tenantId: string): boolean {
  if (!ePlano(where)) return false;
  const v = where.tenantId;
  if (v === tenantId) return true;
  if (ePlano(v)) {
    if (v.equals === tenantId) return true;
    if (Array.isArray(v.in) && v.in.length > 0 && v.in.every((x) => x === tenantId)) return true;
  }
  const and = where.AND;
  if (Array.isArray(and) && and.some((w) => whereFixaTenant(w, tenantId))) return true;
  if (ePlano(and) && whereFixaTenant(and, tenantId)) return true;
  for (const [k, val] of Object.entries(where)) {
    if (k.startsWith('tenantId_') && ePlano(val) && val.tenantId === tenantId) return true;
  }
  return false;
}

function escopado(origem: Origem, op: string, args: Registo | undefined, tenantId: string): boolean {
  if (origem === 'prisma' && ESCOPADAS_PELA_EXTENSAO.has(op)) return true;
  return whereFixaTenant(args?.where, tenantId);
}

/** O `where` deixa passar uma linha com este id? (só se olha para `id`: igual, `in`, `equals`) */
function idAdmitido(where: unknown, id: string): boolean {
  if (!ePlano(where)) return true;
  const v = where.id;
  if (v === undefined) return true;
  if (typeof v === 'string') return v === id;
  if (ePlano(v)) {
    if (typeof v.equals === 'string') return v.equals === id;
    if (Array.isArray(v.in)) return v.in.includes(id);
    if (Array.isArray(v.notIn)) return !v.notIn.includes(id);
  }
  return true;
}

function referePorId(where: unknown, id: string): boolean {
  if (!ePlano(where)) return false;
  const v = where.id;
  if (v === id) return true;
  if (ePlano(v)) return v.equals === id || (Array.isArray(v.in) && v.in.includes(id));
  if (Array.isArray(where.AND)) return where.AND.some((w) => referePorId(w, id));
  return false;
}

// ---------------------------------------------------------------------------
// Transformações sobre resultados
// ---------------------------------------------------------------------------

/** Tira de TODAS as listas (a qualquer profundidade) os objectos que `fora` apanha. */
function podar(valor: unknown, fora: (o: Registo) => boolean): unknown {
  if (Array.isArray(valor)) {
    return valor.filter((x) => !(ePlano(x) && fora(x))).map((x) => podar(x, fora));
  }
  if (ePlano(valor)) {
    const out: Registo = {};
    for (const [k, v] of Object.entries(valor)) {
      out[k] = ePlano(v) && fora(v) ? null : podar(v, fora);
    }
    return out;
  }
  return valor;
}

/** `rubricaAlheia`: o mapeamento de X (do demo) aponta para a rubrica alheia. */
function reescreverParaRubricaAlheia(valor: unknown, contaId: string, tenantId: string, pai?: Registo): unknown {
  const doDemo = (o: Registo) =>
    eMapeamento(o) && o.contaId === contaId && (o.tenantId === undefined || o.tenantId === tenantId);
  if (Array.isArray(valor)) {
    return valor
      .filter((x) => !(ePlano(x) && doDemo(x) && pai && eRubrica(pai) && pai.id !== RUBRICA_ALHEIA_ID))
      .map((x) => reescreverParaRubricaAlheia(x, contaId, tenantId, pai));
  }
  if (ePlano(valor)) {
    const out: Registo = {};
    for (const [k, v] of Object.entries(valor)) out[k] = reescreverParaRubricaAlheia(v, contaId, tenantId, valor);
    if (doDemo(valor)) {
      out.rubricaId = RUBRICA_ALHEIA_ID;
      if (ePlano(valor.rubrica)) out.rubrica = recortarPara(valor.rubrica, rubricaAlheia());
    }
    return out;
  }
  return valor;
}

/** `linhasAlheias`: listas `mapeamentosFluxo` da conta X (FK seguida por include) ganham o mapeamento alheio. */
function anexarMapeamentoAlheioAninhado(valor: unknown, contaId: string): unknown {
  if (Array.isArray(valor)) return valor.map((x) => anexarMapeamentoAlheioAninhado(x, contaId));
  if (ePlano(valor)) {
    const out: Registo = {};
    for (const [k, v] of Object.entries(valor)) out[k] = anexarMapeamentoAlheioAninhado(v, contaId);
    if (valor.id === contaId && Array.isArray(valor.mapeamentosFluxo)) {
      const lista = valor.mapeamentosFluxo as unknown[];
      const irma = lista.find(ePlano);
      const alheio = mapeamentoAlheio(contaId);
      const forma = irma
        ? projectar(alheio, 'mapeamentoContaFluxo', undefined, irma, (nome, f) =>
            nome === 'rubrica' ? recortarPara(f, rubricaAlheia()) : null,
          )
        : alheio;
      out.mapeamentosFluxo = [...(out.mapeamentosFluxo as unknown[]), forma];
    }
    return out;
  }
  return valor;
}

/** Junta uma linha fabricada ao resultado de uma leitura, conforme a operação. */
function juntar(
  op: string,
  args: Registo | undefined,
  resultado: unknown,
  linha: (irma: Registo | undefined) => Registo,
  primeiro: boolean,
): unknown {
  switch (op) {
    case 'findMany': {
      const arr = Array.isArray(resultado) ? resultado : [];
      const nova = linha(arr.find(ePlano) as Registo | undefined);
      const juntos = primeiro ? [nova, ...arr] : [...arr, nova];
      return typeof args?.take === 'number' ? juntos.slice(0, Math.abs(args.take)) : juntos;
    }
    case 'findFirst':
    case 'findFirstOrThrow':
      return primeiro || resultado === null || resultado === undefined
        ? linha(ePlano(resultado) ? resultado : undefined)
        : resultado;
    case 'findUnique':
    case 'findUniqueOrThrow':
      return resultado ?? linha(undefined);
    case 'count':
      if (typeof resultado === 'number') return resultado + 1;
      throw erroDuplo('count com select sobre linhas alheias');
    default:
      throw erroDuplo(`${op} sem âmbito de tenant num modelo do mapeamento`);
  }
}

function vazioPara(op: string, resultado: unknown): unknown {
  switch (op) {
    case 'findMany':
    case 'groupBy':
      return [];
    case 'findFirst':
    case 'findUnique':
      return null;
    case 'findFirstOrThrow':
    case 'findUniqueOrThrow':
      throw new Prisma.PrismaClientKnownRequestError('No record was found for a query.', {
        code: 'P2025',
        clientVersion: Prisma.prismaVersion.client,
      });
    case 'count':
      return typeof resultado === 'number' ? 0 : podar(resultado, () => false);
    case 'aggregate': {
      if (!ePlano(resultado)) return resultado;
      const out: Registo = {};
      for (const [k, v] of Object.entries(resultado)) {
        if (k === '_count') out[k] = typeof v === 'number' ? 0 : ePlano(v) ? Object.fromEntries(Object.keys(v).map((c) => [c, 0])) : v;
        else out[k] = ePlano(v) ? Object.fromEntries(Object.keys(v).map((c) => [c, null])) : v;
      }
      return out;
    }
    default:
      return resultado;
  }
}

type Tentativa = { ok: true; r: unknown } | { ok: false; e: unknown };

function aposLeitura(modelo: string, op: string, args: Registo | undefined, origem: Origem, t: Tentativa): unknown {
  const c = cenario;
  const r = t.ok ? t.r : undefined;
  const lancar = () => {
    if (!t.ok) throw t.e;
  };

  switch (c.tipo) {
    case 'passagem':
      lancar();
      return r;

    case 'desmapear': {
      lancar();
      if (modelo === 'mapeamentoContaFluxo') {
        if (op === 'count' || op === 'aggregate' || op === 'groupBy') {
          throw erroDuplo(`mapeamentoContaFluxo.${op} (o duplo só retira linhas, não recontas)`);
        }
        const linhas = Array.isArray(r) ? r : r ? [r] : [];
        if (linhas.some((l) => ePlano(l) && !('contaId' in l && 'rubricaId' in l))) {
          throw erroDuplo('mapeamentoContaFluxo lido sem contaId/rubricaId no select');
        }
      }
      const fora = (o: Registo) => eMapeamento(o) && c.contaIds.has(o.contaId as string);
      if (ePlano(r) && fora(r)) {
        if (op.endsWith('OrThrow')) return vazioPara(op, r);
        return null;
      }
      return podar(r, fora);
    }

    case 'semVersao': {
      if (modelo === 'versaoMapeamentoFluxo') return vazioPara(op, r);
      lancar();
      if (ePlano(r) && eVersao(r)) return null;
      return podar(r, eVersao);
    }

    case 'rubricaAlheia': {
      let out: unknown = r;
      if (
        modelo === 'rubricaFluxoCaixa' &&
        !escopado(origem, op, args, c.tenantId) &&
        referePorId(args?.where, RUBRICA_ALHEIA_ID)
      ) {
        out = juntar(op, args, t.ok ? r : null, (irma) => projectar(rubricaAlheia(), modelo, args, irma, () => []), false);
      } else {
        lancar();
      }
      return reescreverParaRubricaAlheia(out, c.contaId, c.tenantId);
    }

    case 'linhasAlheias': {
      let out: unknown = r;
      const semAmbito = !escopado(origem, op, args, c.tenantId);
      if (semAmbito && modelo === 'rubricaFluxoCaixa' && idAdmitido(args?.where, RUBRICA_ALHEIA_ID)) {
        out = juntar(op, args, t.ok ? r : null, (irma) => projectar(rubricaAlheia(), modelo, args, irma, () => []), false);
      } else if (semAmbito && modelo === 'versaoMapeamentoFluxo' && idAdmitido(args?.where, VERSAO_ALHEIA_ID)) {
        out = juntar(op, args, t.ok ? r : null, (irma) => projectar(versaoAlheia(), modelo, args, irma, () => null), true);
      } else if (semAmbito && modelo === 'mapeamentoContaFluxo' && idAdmitido(args?.where, MAPEAMENTO_ALHEIO_ID)) {
        out = juntar(
          op,
          args,
          t.ok ? r : null,
          (irma) =>
            projectar(mapeamentoAlheio(c.contaId), modelo, args, irma, (nome, forma) => {
              if (nome === 'rubrica') return recortarPara(forma, rubricaAlheia());
              if (nome === 'conta') {
                const arr = Array.isArray(r) ? r : [];
                const daConta = arr.find((x) => ePlano(x) && x.contaId === c.contaId) as Registo | undefined;
                if (!daConta) throw erroDuplo('mapeamento alheio com include de conta sem irmã da mesma conta');
                return daConta.conta;
              }
              return null;
            }),
          false,
        );
      } else {
        lancar();
      }
      return anexarMapeamentoAlheioAninhado(out, c.contaId);
    }

    case 'periodoSintetico': {
      if (modelo === 'periodoContabil' && referePorId(args?.where, PERIODO_SINTETICO_ID)) {
        return juntar(
          op,
          args,
          t.ok ? r : null,
          (irma) =>
            projectar(periodoSintetico(c.tenantId), modelo, args, irma, (nome, forma) =>
              nome === 'exercicio' ? recortarPara(forma, exercicioSintetico(c.tenantId)) : [],
            ),
          false,
        );
      }
      if (modelo === 'exercicioContabil' && referePorId(args?.where, EXERCICIO_SINTETICO_ID)) {
        return juntar(
          op,
          args,
          t.ok ? r : null,
          (irma) => projectar(exercicioSintetico(c.tenantId), modelo, args, irma, () => []),
          false,
        );
      }
      lancar();
      return r;
    }
  }
}

/** SQL cru: as mesmas podas, sobre as linhas devolvidas. */
function aposSqlCru(r: unknown): unknown {
  const c = cenario;
  switch (c.tipo) {
    case 'desmapear':
      return podar(r, (o) => eMapeamento(o) && c.contaIds.has(o.contaId as string));
    case 'semVersao':
      return podar(r, eVersao);
    case 'rubricaAlheia':
      return reescreverParaRubricaAlheia(r, c.contaId, c.tenantId);
    default:
      return r;
  }
}

// ---------------------------------------------------------------------------
// O envelope
// ---------------------------------------------------------------------------

function eDelegado(v: unknown): v is Record<string, (...a: unknown[]) => Promise<unknown>> {
  return v !== null && typeof v === 'object' && typeof (v as Registo).findMany === 'function';
}

function envolverDelegado(modelo: string, delegado: Record<string, (...a: unknown[]) => Promise<unknown>>, origem: Origem) {
  return new Proxy(delegado, {
    get(alvo, op: string | symbol) {
      const original = (alvo as Registo)[op as string];
      if (typeof op !== 'string' || typeof original !== 'function') return original;
      if (ESCRITAS.has(op)) {
        return () => {
          throw new Error(`[duplo de leitura da DFC] escrita ${modelo}.${op} — a DFC só lê, e estes testes nunca escrevem.`);
        };
      }
      if (!LEITURAS.has(op)) return (original as (...a: unknown[]) => unknown).bind(alvo);
      return async (args?: Registo) => {
        let t: Tentativa;
        try {
          t = { ok: true, r: await (original as (a?: Registo) => Promise<unknown>).call(alvo, args) };
        } catch (e) {
          t = { ok: false, e };
        }
        return aposLeitura(modelo, op, args, origem, t);
      };
    },
  });
}

export function envolverCliente<T extends object>(cliente: T, origem: Origem): T {
  const cache = new Map<string, unknown>();
  return new Proxy(cliente, {
    get(alvo, prop: string | symbol) {
      const valor = (alvo as Registo)[prop as string];
      if (typeof prop !== 'string') return valor;
      if (prop === '$transaction') {
        return (arg: unknown, opcoes?: unknown) => {
          if (typeof arg === 'function') {
            return (alvo as unknown as { $transaction: (f: (tx: unknown) => unknown, o?: unknown) => Promise<unknown> }).$transaction(
              (tx) => (arg as (tx: unknown) => unknown)(envolverCliente(tx as object, origem)),
              opcoes,
            );
          }
          // Forma em lista: as promessas já são as do duplo; ler em paralelo é equivalente.
          return Promise.all(arg as unknown[]);
        };
      }
      if (prop === '$executeRaw' || prop === '$executeRawUnsafe') {
        return () => {
          throw new Error('[duplo de leitura da DFC] $executeRaw — a DFC só lê.');
        };
      }
      if (prop === '$queryRaw' || prop === '$queryRawUnsafe' || prop === '$queryRawTyped') {
        return async (...a: unknown[]) =>
          aposSqlCru(await (valor as (...x: unknown[]) => Promise<unknown>).apply(alvo, a));
      }
      if (typeof valor === 'function') return (valor as (...a: unknown[]) => unknown).bind(alvo);
      if (eDelegado(valor)) {
        if (!cache.has(prop)) cache.set(prop, envolverDelegado(prop, valor, origem));
        return cache.get(prop);
      }
      return valor;
    },
  });
}
