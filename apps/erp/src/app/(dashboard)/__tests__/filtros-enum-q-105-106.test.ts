/**
 * Oráculo — issues #105 e #106: filtros com valores que não existem no enum, e a caixa de pesquisa
 * da `FilterBar` (que escreve `q` no URL) sem efeito na página.
 *
 * Defeito (lido no código em `2990eb8`/`c7eefc6`):
 *   #105 — `projetos/lista` oferece `EM_EXECUCAO`/`EM_PAUSA` (o enum é `EM_ANDAMENTO`/`PAUSADO`);
 *          `projetos/orcamento` oferece `PENDENTE`/`ENCERRADO` e falta `REVISAO`; BOM e roteiros
 *          oferecem `ACTIVO`/`INACTIVO` (o enum é `ATIVO`/`INATIVO`); capacidade oferece
 *          `PRODUCAO`/`MONTAGEM`/… (o enum é `MAQUINA|PESSOA|CELULA|LINHA`); manutenção de viatura
 *          oferece `REVISAO`/`INSPECAO`/`PNEUS`/`OUTRO` (o enum é `PREVENTIVA|CORRECTIVA`);
 *          movimentações oferecem `TRANSFERENCIA`/`BAIXA` (o enum tem `TRANSFERENCIA_ENTRADA`/
 *          `TRANSFERENCIA_SAIDA`). Escolher um destes valores devolve sempre uma lista vazia — ou um
 *          erro do Prisma.
 *   #106 — a `FilterBar` escreve `q` por omissão; as páginas leem `search` (projectos, produção),
 *          declaram `searchKey="pesquisa"`/`"search"` (tickets, movimentações) ou declaram `q` e
 *          nunca o passam ao serviço (transporte, notificações). A pesquisa não filtra nada.
 *
 * Contrato (decisão do orquestrador, não se reabre):
 *   1. As opções de cada filtro de enum são valores REAIS do enum Prisma do campo filtrado
 *      (geradas do enum ou de uma constante partilhada em `src/lib` — o oráculo não olha para a
 *      origem, olha para o valor). Nos filtros citados no #105 há PARIDADE: o conjunto de opções
 *      é exactamente o conjunto do enum (o critério de aceitação da issue).
 *   2. Nenhuma opção tem `value: ''` (sentinela «todos» quando for preciso uma opção explícita).
 *   3. Contrato único `q`: a página renderiza a `FilterBar` (de `@/components/patterns`) sem
 *      `searchKey` ou com `searchKey="q"`, lê `q` dos searchParams e o texto chega à consulta como
 *      pesquisa por texto parcial e sem distinção de maiúsculas (`contains` + `mode: 'insensitive'`,
 *      o padrão já usado por `ProjetoService.listar`/`producao.service`) — ou numa consulta SQL crua.
 *   4. O valor escolhido num filtro de enum (estado/tipo/prioridade) é lido dos searchParams e
 *      chega à consulta: renderizar a página com o filtro produz consultas que contêm esse valor
 *      MAIS vezes do que sem ele (prova diferencial — um KPI com o literal fixo não conta).
 *
 * Como se prova (sem depender do desenho escolhido): cada `page.tsx` é renderizada como o servidor
 * a renderiza — chama-se o Server Component e resolvem-se os Server Components assíncronos da
 * árvore (as secções dentro de `<Suspense>`). Os SERVIÇOS são os reais; só o cliente Prisma
 * (`@/server/db/client`) é um duplo que GRAVA cada consulta (modelo, método, argumentos) e devolve
 * vazio. Assim o oráculo não fixa nomes de serviços nem de funções: fixa que a pesquisa do
 * utilizador chega à base de dados. Também se dobram `@/lib/auth` (sessão) e `next/headers`.
 *
 * ESTADO ESPERADO antes da implementação: RED nas páginas e regras acima.
 *
 * Escrito pelo verificador do nó A:filtros-enum-q-105-106; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as PrismaClientModule from '@prisma/client';

// ─── Duplo do cliente Prisma: grava consultas, devolve vazio ─────────────────────────────────

type Consulta = { modelo: string; metodo: string; args: unknown[] };

const gravadas = vi.hoisted(() => ({ lista: [] as Array<{ modelo: string; metodo: string; args: unknown[] }> }));

vi.mock('@/server/db/client', () => {
  const vazioDe = (metodo: string): unknown => {
    if (metodo === 'findMany' || metodo === 'groupBy' || metodo === 'createManyAndReturn') return [];
    if (metodo === 'count') return 0;
    if (metodo === 'findFirst' || metodo === 'findUnique') return null;
    if (metodo === 'findFirstOrThrow' || metodo === 'findUniqueOrThrow') {
      throw Object.assign(new Error('No record found'), { code: 'P2025' });
    }
    if (metodo === 'aggregate') return { _sum: {}, _avg: {}, _min: {}, _max: {}, _count: { _all: 0 } };
    return {};
  };
  const modelo = (nome: string) =>
    new Proxy(
      {},
      {
        get(_t, metodo: string | symbol) {
          if (typeof metodo !== 'string') return undefined;
          if (metodo === 'then') return undefined;
          return (...args: unknown[]) => {
            gravadas.lista.push({ modelo: nome, metodo, args });
            return Promise.resolve().then(() => vazioDe(metodo));
          };
        },
      },
    );
  const cliente: any = new Proxy(
    {},
    {
      get(_t, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;
        if (prop === 'then') return undefined;
        if (prop === '$transaction') {
          return (arg: unknown) =>
            Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(cliente);
        }
        if (prop === '$extends') return () => cliente;
        if (prop.startsWith('$queryRaw') || prop.startsWith('$executeRaw')) {
          return (...args: unknown[]) => {
            gravadas.lista.push({ modelo: '$raw', metodo: prop, args });
            return Promise.resolve([]);
          };
        }
        if (prop.startsWith('$')) return () => Promise.resolve(undefined);
        return modelo(prop);
      },
    },
  );
  return { prisma: cliente, prismaBase: cliente };
});

vi.mock('@/lib/auth', () => ({
  auth: async () => ({
    user: {
      id: 'user-oraculo-105',
      tenantId: 'tenant-oraculo-105',
      email: 'admin@oraculo.mz',
      name: 'Oráculo',
      role: 'ADMIN',
      papel: 'ADMIN',
      permissions: ['*'],
      permissoes: ['*'],
      acesso: 'ESCRITA',
    },
  }),
  signIn: async () => undefined,
  signOut: async () => undefined,
}));

vi.mock('@/server/email', () => ({ emailProvider: { enviar: async () => undefined } }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }),
  headers: async () => new Headers(),
}));

// ─── Mapa das páginas ─────────────────────────────────────────────────────────────────────────

/** Filtro de enum: chave do URL → campo Prisma (Modelo.campo). `paridade` = citado no #105. */
type FiltroEnum = { chave: string; campo: string; paridade?: boolean };

type Pagina = {
  rota: string;
  importar: () => Promise<{ default: (p: { searchParams: Promise<Record<string, string>> }) => unknown }>;
  filtros: FiltroEnum[];
};

const PAGINAS: Pagina[] = [
  // Projectos
  {
    rota: 'projetos/lista',
    importar: () => import('../projetos/lista/page'),
    filtros: [
      { chave: 'status', campo: 'Projeto.status', paridade: true },
      { chave: 'prioridade', campo: 'Projeto.prioridade' },
    ],
  },
  {
    rota: 'projetos/marcos',
    importar: () => import('../projetos/marcos/page'),
    filtros: [{ chave: 'status', campo: 'Marco.status' }],
  },
  {
    rota: 'projetos/equipa',
    importar: () => import('../projetos/equipa/page'),
    filtros: [{ chave: 'status', campo: 'Equipa.status' }],
  },
  {
    rota: 'projetos/orcamento',
    importar: () => import('../projetos/orcamento/page'),
    filtros: [{ chave: 'status', campo: 'OrcamentoProjeto.status', paridade: true }],
  },
  {
    rota: 'projetos/timesheet',
    importar: () => import('../projetos/timesheet/page'),
    filtros: [{ chave: 'tipo', campo: 'Timesheet.tipo' }],
  },
  // Produção
  {
    rota: 'producao/ordens',
    importar: () => import('../producao/ordens/page'),
    filtros: [
      { chave: 'status', campo: 'OrdemProducao.status' },
      { chave: 'prioridade', campo: 'OrdemProducao.prioridade' },
    ],
  },
  {
    rota: 'producao/estrutura',
    importar: () => import('../producao/estrutura/page'),
    filtros: [{ chave: 'status', campo: 'EstruturaProduto.status', paridade: true }],
  },
  {
    rota: 'producao/roteiros',
    importar: () => import('../producao/roteiros/page'),
    filtros: [{ chave: 'status', campo: 'Roteiro.status', paridade: true }],
  },
  {
    rota: 'producao/capacidade',
    importar: () => import('../producao/capacidade/page'),
    filtros: [{ chave: 'tipo', campo: 'CentroTrabalho.tipo', paridade: true }],
  },
  // Transporte
  {
    rota: 'transporte/rotas',
    importar: () => import('../transporte/rotas/page'),
    filtros: [{ chave: 'estado', campo: 'Rota.estado' }],
  },
  {
    rota: 'transporte/motoristas',
    importar: () => import('../transporte/motoristas/page'),
    filtros: [{ chave: 'estadoOperacional', campo: 'Motorista.estadoOperacional' }],
  },
  {
    rota: 'transporte/atividades',
    importar: () => import('../transporte/atividades/page'),
    filtros: [
      { chave: 'estado', campo: 'Atividade.estado' },
      { chave: 'prioridade', campo: 'Atividade.prioridade' },
      { chave: 'tipoActividade', campo: 'Atividade.tipoActividade' },
    ],
  },
  {
    rota: 'transporte/combustivel',
    importar: () => import('../transporte/combustivel/page'),
    filtros: [{ chave: 'tipoCombustivel', campo: 'Abastecimento.tipoCombustivel' }],
  },
  {
    rota: 'transporte/manutencao',
    importar: () => import('../transporte/manutencao/page'),
    filtros: [{ chave: 'tipo', campo: 'ManutencaoViatura.tipo', paridade: true }],
  },
  {
    rota: 'transporte/entregas',
    importar: () => import('../transporte/entregas/page'),
    filtros: [
      { chave: 'estado', campo: 'Entrega.estado' },
      { chave: 'prioridade', campo: 'Entrega.prioridade' },
    ],
  },
  // Tickets
  {
    rota: 'tickets/lista',
    importar: () => import('../tickets/lista/page'),
    filtros: [
      { chave: 'estado', campo: 'Ticket.estado' },
      { chave: 'prioridade', campo: 'Ticket.prioridade' },
      { chave: 'tipo', campo: 'Ticket.tipo' },
    ],
  },
  {
    rota: 'tickets/meus',
    importar: () => import('../tickets/meus/page'),
    filtros: [{ chave: 'estado', campo: 'Ticket.estado' }],
  },
  {
    rota: 'tickets/resolvidos',
    importar: () => import('../tickets/resolvidos/page'),
    filtros: [],
  },
  // Inventário
  {
    rota: 'inventario/movimentacoes',
    importar: () => import('../inventario/movimentacoes/page'),
    filtros: [{ chave: 'tipo', campo: 'MovimentoStock.tipo', paridade: true }],
  },
  // Notificações
  {
    rota: 'notificacoes',
    importar: () => import('../notificacoes/page'),
    filtros: [{ chave: 'tipo', campo: 'Notificacao.tipo' }],
  },
];

// ─── Enums reais (Prisma) ─────────────────────────────────────────────────────────────────────

function valoresDoEnum(campo: string): string[] {
  const [modelo, nomeCampo] = campo.split('.');
  const m = PrismaClientModule.Prisma.dmmf.datamodel.models.find((x) => x.name === modelo);
  const f = m?.fields.find((x) => x.name === nomeCampo);
  expect(f?.kind, `${campo} não é um campo enum no schema`).toBe('enum');
  const E = (PrismaClientModule as any).$Enums?.[f!.type] ?? (PrismaClientModule as any)[f!.type];
  const valores = Object.values(E ?? {}) as string[];
  expect(valores.length, `enum ${f!.type} sem valores no cliente gerado`).toBeGreaterThan(0);
  return valores;
}

// ─── Renderização de Server Components ────────────────────────────────────────────────────────

type Elemento = { type: unknown; props: Record<string, unknown> };

function eElemento(x: unknown): x is Elemento {
  return !!x && typeof x === 'object' && '$$typeof' in (x as object) && 'props' in (x as object);
}

function eAssincrona(f: unknown): f is (p: unknown) => Promise<unknown> {
  return typeof f === 'function' && f.constructor?.name === 'AsyncFunction';
}

/**
 * Percorre a árvore como o servidor: chama os Server Components assíncronos (secções dentro de
 * `<Suspense>`) e desce pelas props que levam elementos. Componentes síncronos (os de cliente,
 * como a `FilterBar`) NÃO são chamados — só se recolhem.
 */
async function resolver(no: unknown, recolhidos: Elemento[], profundidade = 0): Promise<void> {
  if (profundidade > 60 || no == null || typeof no !== 'object') return;
  if (Array.isArray(no)) {
    for (const n of no) await resolver(n, recolhidos, profundidade + 1);
    return;
  }
  if (no instanceof Promise) {
    await resolver(await no, recolhidos, profundidade + 1);
    return;
  }
  if (!eElemento(no)) return;
  recolhidos.push(no);
  if (eAssincrona(no.type)) {
    await resolver(await no.type(no.props), recolhidos, profundidade + 1);
    return;
  }
  for (const v of Object.values(no.props ?? {})) {
    if (eElemento(v) || Array.isArray(v)) await resolver(v, recolhidos, profundidade + 1);
  }
}

async function renderizar(pagina: Pagina, params: Record<string, string>) {
  gravadas.lista.length = 0;
  const mod = await pagina.importar();
  const recolhidos: Elemento[] = [];
  const raiz = await mod.default({ searchParams: Promise.resolve(params) });
  await resolver(raiz, recolhidos);
  const consultas: Consulta[] = gravadas.lista.slice();
  return { recolhidos, consultas };
}

// ─── Leitura das consultas gravadas ───────────────────────────────────────────────────────────

/** O texto aparece como `contains` com `mode: 'insensitive'` (ou dentro de uma consulta SQL crua). */
function pesquisaChegou(consultas: Consulta[], texto: string): boolean {
  const visitar = (x: unknown, dentroRaw: boolean): boolean => {
    if (x == null) return false;
    if (typeof x === 'string') return dentroRaw && x.includes(texto);
    if (typeof x !== 'object') return false;
    if (Array.isArray(x)) return x.some((y) => visitar(y, dentroRaw));
    const o = x as Record<string, unknown>;
    if (typeof o.contains === 'string' && o.contains.includes(texto) && o.mode === 'insensitive') return true;
    return Object.values(o).some((y) => visitar(y, dentroRaw));
  };
  return consultas.some((c) => visitar(c.args, c.modelo === '$raw'));
}

/** Quantas vezes o valor aparece (como string exacta, ou dentro de `in`) nos argumentos gravados. */
function ocorrencias(consultas: Consulta[], valor: string): number {
  let n = 0;
  const visitar = (x: unknown): void => {
    if (x == null) return;
    if (typeof x === 'string') {
      if (x === valor) n++;
      return;
    }
    if (typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(visitar);
    Object.values(x as Record<string, unknown>).forEach(visitar);
  };
  consultas.forEach((c) => visitar(c.args));
  return n;
}

// ─── Testes ───────────────────────────────────────────────────────────────────────────────────

const SENTINELA = 'zqOraculo105x';

describe('Filtros por enum e pesquisa `q` (#105, #106) — páginas renderizadas', () => {
  let FilterBar: unknown;

  beforeAll(async () => {
    FilterBar = (await import('@/components/patterns')).FilterBar;
  }, 60_000);

  function filterBars(recolhidos: Elemento[]): Elemento[] {
    return recolhidos.filter((e) => e.type === FilterBar);
  }

  for (const pagina of PAGINAS) {
    describe(pagina.rota, () => {
      it('renderiza a FilterBar de @/components/patterns com o contrato único `q`', async () => {
        const { recolhidos } = await renderizar(pagina, {});
        const barras = filterBars(recolhidos);
        expect(barras.length, `${pagina.rota}: a página não renderiza a FilterBar dos patterns`).toBeGreaterThan(0);
        for (const b of barras) {
          const chave = b.props.searchKey ?? 'q';
          expect(chave, `${pagina.rota}: a FilterBar escreve «${String(chave)}» e não «q»`).toBe('q');
        }
      });

      it('o texto de `q` chega à consulta (contains, insensível a maiúsculas)', async () => {
        const { consultas } = await renderizar(pagina, { q: SENTINELA });
        expect(
          pesquisaChegou(consultas, SENTINELA),
          `${pagina.rota}: ?q=${SENTINELA} não chega a nenhuma consulta — a pesquisa não filtra`,
        ).toBe(true);
      });

      if (pagina.filtros.length === 0) return;

      it('as opções dos filtros de enum são valores reais do enum, sem value=""', async () => {
        const { recolhidos } = await renderizar(pagina, {});
        const configs = filterBars(recolhidos).flatMap(
          (b) => (b.props.filters as Array<{ key: string; options: Array<{ value: string }> }>) ?? [],
        );
        for (const f of pagina.filtros) {
          const reais = valoresDoEnum(f.campo);
          const cfg = configs.find((c) => c.key === f.chave);
          expect(cfg, `${pagina.rota}: falta o filtro «${f.chave}» na FilterBar`).toBeDefined();
          const oferecidos = cfg!.options.map((o) => o.value);
          expect(oferecidos, `${pagina.rota}/${f.chave}: opção com value="" (usa a sentinela «todos»)`).not.toContain('');
          const fantasmas = oferecidos.filter((v) => !reais.includes(v));
          expect(fantasmas, `${pagina.rota}/${f.chave}: valores que não existem em ${f.campo}`).toEqual([]);
          if (f.paridade) {
            expect([...oferecidos].sort(), `${pagina.rota}/${f.chave}: paridade com o enum de ${f.campo}`).toEqual(
              [...reais].sort(),
            );
          }
        }
      });

      for (const f of pagina.filtros) {
        it(`o filtro «${f.chave}» é lido do URL e chega à consulta`, async () => {
          const reais = valoresDoEnum(f.campo);
          const sem = await renderizar(pagina, {});
          // Um valor que a própria FilterBar oferece E que existe no enum — o último, menos provável
          // de coincidir com um literal fixo de um KPI. Sem nenhum, o filtro não serve para nada.
          const oferecidos = filterBars(sem.recolhidos)
            .flatMap((b) => (b.props.filters as Array<{ key: string; options: Array<{ value: string }> }>) ?? [])
            .filter((c) => c.key === f.chave)
            .flatMap((c) => c.options.map((o) => o.value))
            .filter((v) => reais.includes(v));
          expect(oferecidos.length, `${pagina.rota}/${f.chave}: nenhuma opção válida do enum`).toBeGreaterThan(0);
          const valor = oferecidos[oferecidos.length - 1];
          const com = await renderizar(pagina, { [f.chave]: valor });
          expect(
            ocorrencias(com.consultas, valor),
            `${pagina.rota}: ?${f.chave}=${valor} não muda nenhuma consulta — o filtro é ignorado`,
          ).toBeGreaterThan(ocorrencias(sem.consultas, valor));
        });
      }
    });
  }
});
