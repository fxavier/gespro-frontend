/**
 * Oráculo do nó C:comissoes-vendedores-131 (issues #131 e #135, parte do perfil).
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * O defeito: as transições das comissões (`aprovar`, `marcarPaga`, `cancelar`) e as actions
 * `aprovarComissao`/`marcarComissaoPaga`/`cancelarComissao` existem mas nenhum ecrã as chama; o
 * vendedor não se edita nem se desactiva pela UI; e o perfil do vendedor filtra as comissões pelo
 * id do `Vendedor`, quando `Comissao.vendedorId` é o id do `User` (o POS grava `vendedorId = userId`)
 * — o perfil mostra sempre «Nenhuma comissão».
 *
 * Contrato (decisão do orquestrador; os pormenores em aberto fixados pelo verificador na opção
 * mais conservadora):
 *   C1 Aprovar: PENDENTE → APROVADA pela action `aprovarComissao({ id })` (permissão
 *      `comissoes:gerir`). Segundo pedido → ok:false `TRANSICAO_INVALIDA`, nada muda.
 *   C2 Pagar: APROVADA → PAGA pela action `marcarComissaoPaga({ id })` (permissão
 *      `comissoes:pagar`), `pagoEm` preenchido. PENDENTE não se paga (`TRANSICAO_INVALIDA`).
 *      DECISÃO CONSERVADORA: pagar NÃO lança na contabilidade (não há contrato de lançamento de
 *      comissões; muda só o estado, como `registarPagamento` das facturas) — zero `Lancamento`.
 *   C3 Cancelar: PENDENTE|APROVADA → CANCELADA pela action `cancelarComissao({ id, motivo })`
 *      (permissão `comissoes:gerir`, motivo ≥ 10 caracteres, que fica registado). PAGA e
 *      CANCELADA não se cancelam (`TRANSICAO_INVALIDA`).
 *   C4 Âmbito: comissão de outro tenant → `NotFoundError` (ok:false `NAO_ENCONTRADO`), nada muda.
 *      Sem a permissão da acção → ok:false e nada muda.
 *   C5 Concorrência: agora que dois botões vivem no mesmo ecrã, pagar × cancelar sobre a mesma
 *      APROVADA nunca dá estado incoerente — exactamente um passa, o outro recebe erro de domínio
 *      (ok:false), e o estado final é coerente: PAGA ⇒ `pagoEm` preenchido; CANCELADA ⇒ `pagoEm`
 *      nulo. (Compare-and-set, molde de `encomenda-transicoes-129`.)
 *   V1 Desactivar vendedor (não apagar): `vendedorService.desativar(id, ctx)` e a action
 *      `desativarVendedor({ id })` exportada de `vendas.actions`, com a permissão
 *      `vendas:vendedores:excluir` (a mais restrita — substitui o «excluir» no ecrã). Grava
 *      `status = 'INATIVO'` e deixa `deletedAt` a null: `obter` devolve-o e `listar` mostra-o
 *      (sem filtro e com `status: 'INATIVO'`, não com `status: 'ATIVO'`). As comissões do
 *      vendedor não mudam.
 *   V2 Desactivar vendedor de outro tenant, ou já apagado → `NotFoundError`; nada muda.
 *   V3 Editar: a action `atualizarVendedor({ id, data })` grava nome/meta (e `status: 'ATIVO'`
 *      reactiva um desactivado); de outro tenant → ok:false `NAO_ENCONTRADO`.
 *   P1 (#135) `vendedorService.listarComissoes(vendedorId, filtro, ctx)` devolve as comissões do
 *      vendedor pela chave certa (`Comissao.vendedorId = Vendedor.userId`), não as de outro
 *      utilizador; respeita `status`; vendedor sem `userId` → lista vazia (recusar > número
 *      errado); vendedor de outro tenant → `NotFoundError`.
 *
 * Postgres real e efémero; sessão dobrada.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

/** Sessão mutável: actor do caso e permissões. */
const sessao = vi.hoisted(() => ({
  actual: {
    id: 'ninguem',
    tenantId: 'x',
    permissions: [] as string[],
    emailVerificado: true as boolean,
    acesso: 'aberto' as const,
  },
}));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { ...sessao.actual } })),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };
type T = { tenantId: string; userId: string; ctx: { tenantId: string; userId: string } };

const P_GERIR = 'comissoes:gerir';
const P_PAGAR = 'comissoes:pagar';
const P_VEND = [
  'vendas:vendedores:ver',
  'vendas:vendedores:criar',
  'vendas:vendedores:editar',
  'vendas:vendedores:excluir',
];
const TODAS = [P_GERIR, P_PAGAR, ...P_VEND];
const MOTIVO = 'Venda devolvida pelo cliente (#131)';
const RONDAS = 5;

describe.skipIf(skip)('#131/#135 — comissões e vendedores pela UI — DB efémera', () => {
  let db: any;
  let comissaoService: any;
  let vendedorService: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendasActions: Record<string, any>;
  let comissoesActions: Record<string, any>;

  const sufixo = Date.now();
  let seq = 0;
  const tenants: string[] = [];

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ comissaoService } = await import('@/server/services/comercial/comissao.service'));
    ({ vendedorService } = await import('@/server/services/comercial/vendedor.service'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    vendasActions = (await import('@/server/actions/vendas.actions')) as unknown as Record<string, any>;
    comissoesActions = (await import('@/server/actions/comissoes.actions')) as unknown as Record<string, any>;
  });

  afterAll(async () => {
    if (!db) return;
    if (tenants.length) {
      await db.comissao.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.venda.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.vendedor.deleteMany({ where: { tenantId: { in: tenants } } });
    }
    await db.$disconnect();
  });

  /** Ids com forma de cuid: os schemas das actions validam `id` com `.cuid()`. */
  function novoId(rotulo: string): string {
    seq += 1;
    return `cv131${rotulo}${seq}x${sufixo}`;
  }

  async function novoTenant(rotulo: string): Promise<T> {
    seq += 1;
    const tenantId = `tenant-cv131-${rotulo}-${sufixo}-${seq}`;
    const slug = `cv131-${rotulo}-${sufixo}-${seq}`;
    tenants.push(tenantId);
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${sufixo + seq * 11}`.slice(-9) },
    });
    const userId = novoId('u');
    await db.user.create({
      data: { id: userId, tenantId, email: `${userId}@cv131.mz`, nome: 'Gestor', keycloakSub: `kc-${userId}` },
    });
    return { tenantId, userId, ctx: { tenantId, userId } };
  }

  /** Fixa a sessão do actor do tenant. */
  function sessaoDe(t: T, perms: string[] = TODAS) {
    sessao.actual = {
      id: t.userId,
      tenantId: t.tenantId,
      permissions: [...perms],
      emailVerificado: true,
      acesso: 'aberto',
    };
  }

  /** Utilizador do tenant que faz de vendedor (Comissao.vendedorId = User.id, como no POS). */
  async function utilizador(t: T, rotulo: string): Promise<string> {
    const id = novoId(rotulo);
    await db.user.create({
      data: { id, tenantId: t.tenantId, email: `${id}@cv131.mz`, nome: `Vendedor ${rotulo}`, keycloakSub: `kc-${id}` },
    });
    return id;
  }

  /**
   * Comissão de uma venda do utilizador `vendedorUserId`. A venda é só a âncora da FK: tenant
   * descartável sem séries, número com marca do teste (nunca o «próximo» de uma série real).
   */
  async function comissao(
    t: T,
    vendedorUserId: string,
    status: 'PENDENTE' | 'APROVADA' | 'PAGA' | 'CANCELADA' = 'PENDENTE',
    valor = '50',
  ): Promise<string> {
    const vendaId = novoId('v');
    await db.venda.create({
      data: {
        id: vendaId,
        tenantId: t.tenantId,
        numero: `T131-${vendaId}`,
        vendedorId: vendedorUserId,
        subtotal: '1000',
        total: '1000',
      },
    });
    const id = novoId('c');
    await db.comissao.create({
      data: {
        id,
        tenantId: t.tenantId,
        vendaId,
        vendedorId: vendedorUserId,
        percentualAplicado: '5',
        valorBase: '1000',
        valorComissao: valor,
        regrasAplicadas: ['Comissão Base Padrão'],
        detalhes: 'Padrão: 5.00%',
        status,
        pagoEm: status === 'PAGA' ? new Date() : null,
      },
    });
    return id;
  }

  async function vendedor(t: T, extra: { userId?: string | null; deletedAt?: Date | null; nome?: string } = {}) {
    const id = novoId('vd');
    await db.vendedor.create({
      data: {
        id,
        tenantId: t.tenantId,
        userId: extra.userId ?? null,
        nome: extra.nome ?? `Vendedor ${id}`,
        deletedAt: extra.deletedAt ?? null,
      },
    });
    return id;
  }

  const linhaComissao = (id: string) =>
    db.comissao.findUnique({ where: { id }, select: { status: true, pagoEm: true, detalhes: true } });
  const linhaVendedor = (id: string) =>
    db.vendedor.findUnique({ where: { id }, select: { status: true, deletedAt: true, nome: true, metaMensal: true } });

  async function erroDe(p: Promise<unknown>): Promise<any> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    return null;
  }

  // ── C: comissões ─────────────────────────────────────────────────────────────

  describe('C — transições das comissões pelas actions', () => {
    it('C1: aprovarComissao PENDENTE → APROVADA; segundo pedido TRANSICAO_INVALIDA', async () => {
      const t = await novoTenant('c1');
      const u = await utilizador(t, 'c1');
      const c = await comissao(t, u);
      sessaoDe(t);

      const r: Resultado = await comissoesActions.aprovarComissao({ id: c });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect((await linhaComissao(c)).status).toBe('APROVADA');

      const r2: Resultado = await comissoesActions.aprovarComissao({ id: c });
      expect(r2.ok).toBe(false);
      expect(r2.error?.code).toBe('TRANSICAO_INVALIDA');
      expect((await linhaComissao(c)).status).toBe('APROVADA');
    });

    it('C2: marcarComissaoPaga APROVADA → PAGA com pagoEm, sem lançamento contabilístico', async () => {
      const t = await novoTenant('c2');
      const u = await utilizador(t, 'c2');
      const pendente = await comissao(t, u, 'PENDENTE');
      const aprovada = await comissao(t, u, 'APROVADA');
      sessaoDe(t);

      const recusa: Resultado = await comissoesActions.marcarComissaoPaga({ id: pendente });
      expect(recusa.ok, 'PENDENTE não se paga').toBe(false);
      expect(recusa.error?.code).toBe('TRANSICAO_INVALIDA');
      expect((await linhaComissao(pendente)).status).toBe('PENDENTE');

      const r: Resultado = await comissoesActions.marcarComissaoPaga({ id: aprovada });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const l = await linhaComissao(aprovada);
      expect(l.status).toBe('PAGA');
      expect(l.pagoEm).toBeInstanceOf(Date);

      expect(
        await db.lancamento.count({ where: { tenantId: t.tenantId } }),
        'pagar a comissão não lança (decisão conservadora)',
      ).toBe(0);
    });

    it('C3: cancelarComissao de PENDENTE e de APROVADA grava CANCELADA com o motivo; PAGA/CANCELADA recusam', async () => {
      const t = await novoTenant('c3');
      const u = await utilizador(t, 'c3');
      const pendente = await comissao(t, u, 'PENDENTE');
      const aprovada = await comissao(t, u, 'APROVADA');
      const paga = await comissao(t, u, 'PAGA');
      sessaoDe(t);

      for (const id of [pendente, aprovada]) {
        const r: Resultado = await comissoesActions.cancelarComissao({ id, motivo: MOTIVO });
        expect(r.ok, JSON.stringify(r)).toBe(true);
        const l = await linhaComissao(id);
        expect(l.status).toBe('CANCELADA');
        expect(l.pagoEm).toBeNull();
        expect(String(l.detalhes ?? ''), 'o motivo fica registado').toContain(MOTIVO);
      }

      const rPaga: Resultado = await comissoesActions.cancelarComissao({ id: paga, motivo: MOTIVO });
      expect(rPaga.ok).toBe(false);
      expect(rPaga.error?.code).toBe('TRANSICAO_INVALIDA');
      expect((await linhaComissao(paga)).status).toBe('PAGA');

      const rDupla: Resultado = await comissoesActions.cancelarComissao({ id: pendente, motivo: MOTIVO });
      expect(rDupla.ok).toBe(false);
      expect(rDupla.error?.code).toBe('TRANSICAO_INVALIDA');

      const curto: Resultado = await comissoesActions.cancelarComissao({ id: aprovada, motivo: 'curto' });
      expect(curto.ok, 'motivo com menos de 10 caracteres recusado').toBe(false);
    });

    it('C4: comissão de outro tenant → NOT_FOUND; sem a permissão → recusa; nada muda', async () => {
      const a = await novoTenant('c4a');
      const b = await novoTenant('c4b');
      const u = await utilizador(a, 'c4');
      const pendente = await comissao(a, u, 'PENDENTE');
      const aprovada = await comissao(a, u, 'APROVADA');

      sessaoDe(b);
      for (const [nome, args] of [
        ['aprovarComissao', { id: pendente }],
        ['marcarComissaoPaga', { id: aprovada }],
        ['cancelarComissao', { id: pendente, motivo: MOTIVO }],
      ] as const) {
        const r: Resultado = await comissoesActions[nome](args);
        expect(r.ok, `${nome} cross-tenant`).toBe(false);
        expect(r.error?.code, `${nome} cross-tenant`).toBe('NAO_ENCONTRADO');
      }
      const err = await erroDe(runCtx(b.ctx, () => comissaoService.aprovar(pendente, b.ctx)));
      expect(err?.constructor?.name).toBe('NotFoundError');

      // Quem só gere não paga; quem só paga não aprova nem cancela.
      sessaoDe(a, [P_GERIR]);
      expect(((await comissoesActions.marcarComissaoPaga({ id: aprovada })) as Resultado).ok).toBe(false);
      sessaoDe(a, [P_PAGAR]);
      expect(((await comissoesActions.aprovarComissao({ id: pendente })) as Resultado).ok).toBe(false);
      expect(((await comissoesActions.cancelarComissao({ id: pendente, motivo: MOTIVO })) as Resultado).ok).toBe(false);

      expect((await linhaComissao(pendente)).status).toBe('PENDENTE');
      expect((await linhaComissao(aprovada)).status).toBe('APROVADA');
    });

    it('C5: pagar × cancelar em simultâneo → um só passa e o estado final é coerente', async () => {
      const t = await novoTenant('c5');
      const u = await utilizador(t, 'c5');
      sessaoDe(t);

      for (let ronda = 1; ronda <= RONDAS; ronda++) {
        const c = await comissao(t, u, 'APROVADA');
        const [rp, rc] = await Promise.allSettled([
          runCtx(t.ctx, () => comissaoService.marcarPaga(c, t.ctx)),
          runCtx(t.ctx, () => comissaoService.cancelar(c, MOTIVO, t.ctx)),
        ]);
        const passaram = [rp, rc].filter((r) => r.status === 'fulfilled').length;
        expect(passaram, `ronda ${ronda}: exactamente uma transição passa`).toBe(1);
        const perdedor = [rp, rc].find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(
          ['BusinessRuleError', 'NotFoundError'],
          `ronda ${ronda}: quem perde recebe erro de domínio`,
        ).toContain(perdedor.reason?.constructor?.name);

        const l = await linhaComissao(c);
        if (l.status === 'PAGA') {
          expect(l.pagoEm, `ronda ${ronda}: PAGA tem pagoEm`).toBeInstanceOf(Date);
          expect(rp.status).toBe('fulfilled');
        } else {
          expect(l.status, `ronda ${ronda}`).toBe('CANCELADA');
          expect(l.pagoEm, `ronda ${ronda}: CANCELADA não tem pagoEm`).toBeNull();
          expect(rc.status).toBe('fulfilled');
        }
      }
    });
  });

  // ── V: vendedores ────────────────────────────────────────────────────────────

  describe('V — editar e desactivar vendedor', () => {
    it('V1: vendedorService.desativar grava INATIVO sem apagar; obter e listar continuam a vê-lo', async () => {
      expect(typeof vendedorService.desativar, 'vendedorService.desativar não existe').toBe('function');
      const t = await novoTenant('v1');
      const u = await utilizador(t, 'v1');
      const v = await vendedor(t, { userId: u, nome: 'Vendedor V1 131' });
      const c = await comissao(t, u, 'PENDENTE');

      await runCtx(t.ctx, () => vendedorService.desativar(v, t.ctx));

      const l = await linhaVendedor(v);
      expect(l.status).toBe('INATIVO');
      expect(l.deletedAt, 'desactivar não apaga').toBeNull();

      const obtido = await runCtx(t.ctx, () => vendedorService.obter(v, t.ctx));
      expect(obtido.status).toBe('INATIVO');

      const base = { take: 100, orderBy: 'nome', order: 'asc' };
      const todos = await runCtx(t.ctx, () => vendedorService.listar(base, t.ctx));
      expect(todos.items.map((i: any) => i.id)).toContain(v);
      const inactivos = await runCtx(t.ctx, () => vendedorService.listar({ ...base, status: 'INATIVO' }, t.ctx));
      expect(inactivos.items.map((i: any) => i.id)).toContain(v);
      const activos = await runCtx(t.ctx, () => vendedorService.listar({ ...base, status: 'ATIVO' }, t.ctx));
      expect(activos.items.map((i: any) => i.id)).not.toContain(v);

      expect((await linhaComissao(c)).status, 'as comissões do vendedor não mudam').toBe('PENDENTE');
    });

    it('V1: action desativarVendedor({ id }) com vendas:vendedores:excluir; sem ela recusa', async () => {
      expect(typeof vendasActions.desativarVendedor, 'desativarVendedor não está exportada de vendas.actions').toBe(
        'function',
      );
      const t = await novoTenant('v1a');
      const v = await vendedor(t);

      sessaoDe(t, ['vendas:vendedores:ver', 'vendas:vendedores:editar']);
      const recusa: Resultado = await vendasActions.desativarVendedor({ id: v });
      expect(recusa.ok, 'sem vendas:vendedores:excluir não desactiva').toBe(false);
      expect((await linhaVendedor(v)).status).toBe('ATIVO');

      sessaoDe(t, ['vendas:vendedores:excluir']);
      const r: Resultado = await vendasActions.desativarVendedor({ id: v });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const l = await linhaVendedor(v);
      expect(l.status).toBe('INATIVO');
      expect(l.deletedAt).toBeNull();
    });

    it('V2: desactivar vendedor de outro tenant ou já apagado → NotFoundError; nada muda', async () => {
      expect(typeof vendedorService.desativar, 'vendedorService.desativar não existe').toBe('function');
      const a = await novoTenant('v2a');
      const b = await novoTenant('v2b');
      const v = await vendedor(a);
      const apagado = await vendedor(a, { deletedAt: new Date('2026-01-01T00:00:00Z') });

      const e1 = await erroDe(runCtx(b.ctx, () => vendedorService.desativar(v, b.ctx)));
      expect(e1?.constructor?.name).toBe('NotFoundError');
      expect((await linhaVendedor(v)).status).toBe('ATIVO');

      const e2 = await erroDe(runCtx(a.ctx, () => vendedorService.desativar(apagado, a.ctx)));
      expect(e2?.constructor?.name).toBe('NotFoundError');
      expect((await linhaVendedor(apagado)).status).toBe('ATIVO');

      sessaoDe(b);
      const r: Resultado | undefined = vendasActions.desativarVendedor
        ? await vendasActions.desativarVendedor({ id: v })
        : undefined;
      expect(r?.ok).toBe(false);
      expect(r?.error?.code).toBe('NAO_ENCONTRADO');
    });

    it('V3: atualizarVendedor grava nome e meta, reactiva um INATIVO, e recusa outro tenant', async () => {
      const a = await novoTenant('v3a');
      const b = await novoTenant('v3b');
      const v = await vendedor(a, { nome: 'Nome Antigo 131' });
      await db.vendedor.update({ where: { id: v }, data: { status: 'INATIVO' } });

      sessaoDe(a);
      const r: Resultado = await vendasActions.atualizarVendedor({
        id: v,
        data: { nome: 'Nome Novo 131', metaMensal: 250000, status: 'ATIVO' },
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const l = await linhaVendedor(v);
      expect(l.nome).toBe('Nome Novo 131');
      expect(Number(String(l.metaMensal))).toBe(250000);
      expect(l.status).toBe('ATIVO');

      sessaoDe(b);
      const rb: Resultado = await vendasActions.atualizarVendedor({ id: v, data: { nome: 'Intruso' } });
      expect(rb.ok).toBe(false);
      expect(rb.error?.code).toBe('NAO_ENCONTRADO');
      expect((await linhaVendedor(v)).nome).toBe('Nome Novo 131');
    });
  });

  // ── P: perfil do vendedor (#135) ─────────────────────────────────────────────

  describe('P — comissões do perfil do vendedor pela chave certa (#135)', () => {
    it('P1: listarComissoes devolve as do User do vendedor, não as de outro, e respeita o status', async () => {
      expect(typeof vendedorService.listarComissoes, 'vendedorService.listarComissoes não existe').toBe('function');
      const t = await novoTenant('p1');
      const u = await utilizador(t, 'p1');
      const outro = await utilizador(t, 'p1o');
      const v = await vendedor(t, { userId: u });
      const minhaPendente = await comissao(t, u, 'PENDENTE');
      const minhaPaga = await comissao(t, u, 'PAGA');
      const alheia = await comissao(t, outro, 'PENDENTE');

      const filtro = { take: 100, orderBy: 'createdAt', order: 'desc' };
      const r = await runCtx(t.ctx, () => vendedorService.listarComissoes(v, filtro, t.ctx));
      const ids = r.items.map((i: any) => i.id).sort();
      expect(ids).toEqual([minhaPendente, minhaPaga].sort());
      expect(ids).not.toContain(alheia);

      const soPagas = await runCtx(t.ctx, () =>
        vendedorService.listarComissoes(v, { ...filtro, status: 'PAGA' }, t.ctx),
      );
      expect(soPagas.items.map((i: any) => i.id)).toEqual([minhaPaga]);
    });

    it('P1: vendedor sem utilizador → lista vazia; vendedor de outro tenant → NotFoundError', async () => {
      expect(typeof vendedorService.listarComissoes, 'vendedorService.listarComissoes não existe').toBe('function');
      const a = await novoTenant('p1b');
      const b = await novoTenant('p1c');
      const u = await utilizador(a, 'p1b');
      await comissao(a, u, 'PENDENTE');
      const semUser = await vendedor(a, { userId: null });
      const comUser = await vendedor(a, { userId: u });

      const filtro = { take: 100, orderBy: 'createdAt', order: 'desc' };
      const vazio = await runCtx(a.ctx, () => vendedorService.listarComissoes(semUser, filtro, a.ctx));
      expect(vazio.items).toEqual([]);

      const err = await erroDe(runCtx(b.ctx, () => vendedorService.listarComissoes(comUser, filtro, b.ctx)));
      expect(err?.constructor?.name).toBe('NotFoundError');
    });
  });
});
