/**
 * Oráculo — issue #296: a lista de mães do editor do plano de contas exclui a conta
 * E TODAS AS SUAS DESCENDENTES.
 *
 * O servidor já recusa o ciclo (#347, `validarContaMae` → CONTA_MAE_PROPRIA /
 * CONTA_MAE_CICLO; provado em conta-mae-validacao.test.ts). Falta a UI deixar de as
 * oferecer. Três peças, cada uma testada pelo que entrega:
 *
 *   H. `idsDescendentes(contaId, ctx)` (contabilidade.service) — CTE recursiva com
 *      `tenantId`: devolve filhos, netos, bisnetos; não devolve antepassados, irmãs,
 *      tias nem contas de outro tenant; termina sobre um ciclo já gravado na base.
 *      O tipo de retorno não é fixado (array ou Set): o teste normaliza com `new Set`.
 *   P. Primeira página do editor (`plano-contas/[id]/editar/page.tsx`): as
 *      `opcoesIniciais` entregues ao `ContaForm` não contêm a conta nem descendentes,
 *      e continuam a conter a mãe actual, antepassados e irmãs.
 *   A. `procurarContasMaeAction({ q, excluirId })`: a pesquisa não devolve a conta nem
 *      descendentes; sem `excluirId` (criação) devolve tudo o que casa.
 *
 * Tenant próprio sem bootstrap: só as contas do cenário, para caberem todas nas
 * primeiras 50 da página e nas 30 da pesquisa. Tenant B com uma conta cuja
 * `contaMaeId` aponta (à força) para uma conta de A — prova o `tenantId` na CTE.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: { id: string; tenantId: string; permissions: string[]; acesso: 'aberto'; emailVerificado: boolean };
  },
}));

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));

describe.skipIf(skip)('Mães oferecidas excluem descendentes (#296) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: any;

  const sufixo = Date.now();
  const TENANT_A = `tenant-mae296-a-${sufixo}`;
  const TENANT_B = `tenant-mae296-b-${sufixo}`;
  const USER_A = `user-mae296-a-${sufixo}`;
  const ctxA = { tenantId: TENANT_A, userId: USER_A };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctxA, fn);

  /** Prefixo de código único deste ficheiro — é o que a pesquisa usa. */
  const PREFIXO = '9296';

  // Árvore em A:
  //   raiz
  //   ├── conta            ← a conta que se edita
  //   │   ├── filho
  //   │   │   └── neto
  //   │   │       └── bisneto
  //   │   └── filho2
  //   └── irma
  //   tia (outra raiz)
  //   cicloX ⇄ cicloY      (ciclo já gravado — dados antigos)
  const c: Record<string, { id: string; codigo: string; nome: string }> = {};
  let contaB: { id: string };

  async function criar(tenantId: string, chave: string, codigo: string, contaMaeId: string | null) {
    const conta = await db.contaPGC.create({
      data: {
        tenantId,
        codigo,
        nome: `Conta #296 ${chave}`,
        classe: 'CLASSE_8',
        tipo: 'RESULTADO',
        natureza: 'CREDORA',
        nivel: 3,
        contaMaeId,
      },
    });
    return conta;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');

    await db.tenant.create({
      data: { id: TENANT_A, nome: 'Tenant A #296', slug: `mae296-a-${sufixo}`, nuit: `3${`${sufixo}`.slice(-8)}` },
    });
    await db.tenant.create({
      data: { id: TENANT_B, nome: 'Tenant B #296', slug: `mae296-b-${sufixo}`, nuit: `4${`${sufixo}`.slice(-8)}` },
    });
    await db.user.create({
      data: {
        id: USER_A,
        tenantId: TENANT_A,
        email: `mae296-a-${sufixo}@test.mz`,
        nome: 'Contabilista #296',
        keycloakSub: `kc-mae296-a-${sufixo}`,
      },
    });

    c.raiz = await criar(TENANT_A, 'raiz', `${PREFIXO}.1`, null);
    c.conta = await criar(TENANT_A, 'conta', `${PREFIXO}.1.1`, c.raiz.id);
    c.filho = await criar(TENANT_A, 'filho', `${PREFIXO}.1.1.1`, c.conta.id);
    c.neto = await criar(TENANT_A, 'neto', `${PREFIXO}.1.1.1.1`, c.filho.id);
    c.bisneto = await criar(TENANT_A, 'bisneto', `${PREFIXO}.1.1.1.1.1`, c.neto.id);
    c.filho2 = await criar(TENANT_A, 'filho2', `${PREFIXO}.1.1.2`, c.conta.id);
    c.irma = await criar(TENANT_A, 'irma', `${PREFIXO}.1.2`, c.raiz.id);
    c.tia = await criar(TENANT_A, 'tia', `${PREFIXO}.2`, null);
    c.cicloX = await criar(TENANT_A, 'cicloX', `${PREFIXO}.7.1`, null);
    c.cicloY = await criar(TENANT_A, 'cicloY', `${PREFIXO}.7.2`, c.cicloX.id);
    await db.contaPGC.update({ where: { id: c.cicloX.id }, data: { contaMaeId: c.cicloY.id } });

    // Conta de OUTRO tenant pendurada (à força) numa conta de A.
    contaB = await criar(TENANT_B, 'intrusa-B', `${PREFIXO}.1.1.9`, c.conta.id);
  });

  const DESCENDENTES = () => [c.filho.id, c.neto.id, c.bisneto.id, c.filho2.id];
  const PERMITIDAS = () => [c.raiz.id, c.irma.id, c.tia.id];

  // -------------------------------------------------------------------------
  // H — idsDescendentes no serviço
  // -------------------------------------------------------------------------

  async function descendentes(contaId: string): Promise<Set<string>> {
    expect(typeof contab.idsDescendentes, 'contabilidade.service exporta idsDescendentes(contaId, ctx)').toBe(
      'function',
    );
    const r = await noCtx(() => contab.idsDescendentes(contaId, ctxA));
    return new Set<string>(r as Iterable<string>);
  }

  it('H1: devolve filhos, netos e bisnetos da conta (todas as gerações)', async () => {
    const ids = await descendentes(c.conta.id);
    for (const id of DESCENDENTES()) expect(ids.has(id), `descendente ${id} em falta`).toBe(true);
  });

  it('H2: não devolve antepassados, irmãs nem tias', async () => {
    const ids = await descendentes(c.conta.id);
    for (const id of PERMITIDAS()) expect(ids.has(id), `${id} não é descendente`).toBe(false);
  });

  it('H3: não atravessa a fronteira de tenant (conta de B pendurada numa de A não aparece)', async () => {
    const ids = await descendentes(c.conta.id);
    expect(ids.has(contaB.id)).toBe(false);
  });

  it('H4: conta-folha não tem descendentes', async () => {
    const ids = await descendentes(c.bisneto.id);
    ids.delete(c.bisneto.id); // incluir-se a si própria é indiferente ao contrato
    expect([...ids]).toEqual([]);
  });

  it('H5: termina sobre um ciclo já gravado na base e devolve o outro elemento do ciclo', async () => {
    const ids = await descendentes(c.cicloX.id);
    expect(ids.has(c.cicloY.id)).toBe(true);
    for (const id of [...DESCENDENTES(), ...PERMITIDAS()]) expect(ids.has(id)).toBe(false);
  }, 15_000);

  // -------------------------------------------------------------------------
  // P — primeira página do editor
  // -------------------------------------------------------------------------

  /** Procura na árvore devolvida pelo Server Component o elemento com `opcoesIniciais`. */
  function acharOpcoes(no: unknown, prof = 0): Array<{ value: string; label: string }> | undefined {
    if (!no || typeof no !== 'object' || prof > 40) return undefined;
    if (Array.isArray(no)) {
      for (const x of no) {
        const r = acharOpcoes(x, prof + 1);
        if (r) return r;
      }
      return undefined;
    }
    const props = (no as { props?: Record<string, unknown> }).props;
    if (!props) return undefined;
    if (Array.isArray(props.opcoesIniciais)) return props.opcoesIniciais as Array<{ value: string; label: string }>;
    return 'children' in props ? acharOpcoes(props.children, prof + 1) : undefined;
  }

  async function opcoesDoEditor(contaId: string): Promise<Set<string>> {
    h.sessao = {
      user: { id: USER_A, tenantId: TENANT_A, permissions: ['financas:leitura'], acesso: 'aberto', emailVerificado: true },
    };
    const { default: Pagina } = await import('@/app/(dashboard)/contabilidade/plano-contas/[id]/editar/page');
    const arvore = await (Pagina as any)({ params: Promise.resolve({ id: contaId }) });
    const opcoes = acharOpcoes(arvore);
    expect(opcoes, 'a página entrega opcoesIniciais ao ContaForm').toBeDefined();
    return new Set(opcoes!.map((o) => o.value));
  }

  it('P1: as opções iniciais do editor não contêm a conta nem nenhuma descendente', async () => {
    const opcoes = await opcoesDoEditor(c.conta.id);
    expect(opcoes.has(c.conta.id), 'a própria conta').toBe(false);
    for (const id of DESCENDENTES()) expect(opcoes.has(id), `descendente ${id} oferecida como mãe`).toBe(false);
  });

  it('P2 (guarda): continuam oferecidas a mãe actual, a irmã e a tia', async () => {
    const opcoes = await opcoesDoEditor(c.conta.id);
    for (const id of PERMITIDAS()) expect(opcoes.has(id), `${id} devia ser oferecida`).toBe(true);
  });

  it('P3 (guarda): ao editar o neto, os antepassados (incl. a conta) são oferecidos e o bisneto não', async () => {
    const opcoes = await opcoesDoEditor(c.neto.id);
    for (const id of [c.raiz.id, c.conta.id, c.filho.id, c.filho2.id]) {
      expect(opcoes.has(id), `${id} devia ser oferecida`).toBe(true);
    }
    expect(opcoes.has(c.bisneto.id)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // A — pesquisa remota (ComboboxRemoto)
  // -------------------------------------------------------------------------

  async function pesquisar(input: { q: string; excluirId?: string }): Promise<Set<string>> {
    h.sessao = {
      user: { id: USER_A, tenantId: TENANT_A, permissions: ['financas:leitura'], acesso: 'aberto', emailVerificado: true },
    };
    const { procurarContasMaeAction } = await import('@/server/actions/contabilidade.actions');
    const r = await procurarContasMaeAction(input);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return new Set((r as { ok: true; data: Array<{ id: string }> }).data.map((x) => x.id));
  }

  it('A1: com excluirId, a pesquisa não devolve a conta nem nenhuma descendente', async () => {
    const ids = await pesquisar({ q: PREFIXO, excluirId: c.conta.id });
    expect(ids.has(c.conta.id), 'a própria conta').toBe(false);
    for (const id of DESCENDENTES()) expect(ids.has(id), `descendente ${id} oferecida como mãe`).toBe(false);
  });

  it('A2 (guarda): com excluirId, continuam a aparecer mãe, irmã e tia; nada de outro tenant', async () => {
    const ids = await pesquisar({ q: PREFIXO, excluirId: c.conta.id });
    for (const id of PERMITIDAS()) expect(ids.has(id), `${id} devia aparecer`).toBe(true);
    expect(ids.has(contaB.id)).toBe(false);
  });

  it('A3 (guarda): sem excluirId (criação) devolve todas as contas que casam, descendentes incluídas', async () => {
    const ids = await pesquisar({ q: PREFIXO });
    for (const id of [c.conta.id, ...DESCENDENTES(), ...PERMITIDAS()]) expect(ids.has(id)).toBe(true);
  });
});
