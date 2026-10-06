/**
 * Oráculo P1 — ecrã da conta por natureza de nota de débito (ADR-0039 §1; issue #139)
 *
 * Contra Postgres real (Testcontainers), com o `bootstrapContabilidade` real:
 *   (R) `ROTULO_NATUREZA_ND` (lib/nota-debito) dá o rótulo PT de cada uma das 5 naturezas.
 *   (Z) `DefinirContaNaturezaNotaDebitoSchema` (validations/contabilidade): natureza ∈ as 5,
 *       `contaId` por `idEntidade()` e anulável — aceita uuid (as contas PGC do bootstrap são
 *       uuid) e `null`; recusa natureza desconhecida.
 *   (L) `listarContasNaturezaNotaDebito(ctx)` devolve exactamente 5 linhas
 *       `{ natureza, contaId, codigo, nome }`, pela ordem de `NATUREZAS_NOTA_DEBITO`; depois do
 *       bootstrap: ACERTO_PRECO 711, JUROS_MORA 781, PENALIZACAO 769, DESPESAS_REPERCUTIDAS e
 *       OUTRO sem conta; reflecte `definirContaNaturezaNotaDebito` (definir e retirar); isolada
 *       por tenant.
 *
 * Os exports novos acedem-se por `as any` dentro de cada teste: um export em falta põe o
 * teste respectivo vermelho, não o ficheiro inteiro.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const ORDEM = ['ACERTO_PRECO', 'JUROS_MORA', 'DESPESAS_REPERCUTIDAS', 'PENALIZACAO', 'OUTRO'];

describe.skipIf(skip)('Conta por natureza de nota de débito — listagem e contrato do ecrã — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // '@/server/services/financas/natureza-nota-debito.service'
  let lib: any; // '@/lib/nota-debito'
  let valCont: any; // '@/lib/validations/contabilidade'
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-nd-cfg-${sufixo}`;
  const TENANT_B = `tenant-nd-cfg-b-${sufixo}`;
  const USER = `user-nd-cfg-${sufixo}`;
  const USER_B = `user-nd-cfg-b-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxB = { tenantId: TENANT_B, userId: USER_B };

  const noCtx = <T>(c: typeof ctx, fn: () => Promise<T>) => runCtx(c, fn);

  async function conta(tenantId: string, codigo: string) {
    const c = await db.contaPGC.findFirst({ where: { tenantId, codigo } });
    expect(c, `ContaPGC ${codigo} no tenant ${tenantId}`).not.toBeNull();
    return c as { id: string; codigo: string; nome: string };
  }

  async function listar(c: typeof ctx = ctx): Promise<any[]> {
    expect(typeof svc.listarContasNaturezaNotaDebito, 'listarContasNaturezaNotaDebito exportada').toBe('function');
    return noCtx(c, () => svc.listarContasNaturezaNotaDebito(c));
  }

  const definir = (natureza: string, contaId: string | null, c: typeof ctx = ctx) =>
    noCtx(c, () => svc.definirContaNaturezaNotaDebito({ natureza, contaId }, c));

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ NotFoundError } = await import('@/lib/errors'));
    svc = await import('@/server/services/financas/natureza-nota-debito.service');
    lib = await import('@/lib/nota-debito');
    valCont = await import('@/lib/validations/contabilidade');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, user, n] of [
      [TENANT, USER, 0],
      [TENANT_B, USER_B, 1],
    ] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant ND cfg ${n}`, slug: `nd-cfg-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
      await db.user.create({
        data: { id: user, tenantId: id, email: `nd-cfg-${n}-${sufixo}@test.mz`, nome: 'Utilizador ND', keycloakSub: `kc-nd-cfg-${n}-${sufixo}` },
      });
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, id), { timeout: 60_000 });
    }
  });

  // -------------------------------------------------------------------------
  // (R) rótulos
  // -------------------------------------------------------------------------

  it('ROTULO_NATUREZA_ND dá o rótulo de cada uma das 5 naturezas', () => {
    expect(lib.ROTULO_NATUREZA_ND).toEqual({
      ACERTO_PRECO: 'Acerto de preço',
      JUROS_MORA: 'Juros de mora',
      DESPESAS_REPERCUTIDAS: 'Despesas repercutidas',
      PENALIZACAO: 'Penalização',
      OUTRO: 'Outro',
    });
    expect(Object.keys(lib.ROTULO_NATUREZA_ND).sort()).toEqual([...lib.NATUREZAS_NOTA_DEBITO].sort());
  });

  // -------------------------------------------------------------------------
  // (Z) schema da action
  // -------------------------------------------------------------------------

  it('DefinirContaNaturezaNotaDebitoSchema aceita uuid (contas PGC do bootstrap) e null; recusa natureza desconhecida', async () => {
    const S = valCont.DefinirContaNaturezaNotaDebitoSchema;
    expect(S, 'DefinirContaNaturezaNotaDebitoSchema exportado').toBeDefined();

    const c781 = await conta(TENANT, '781');
    // A conta real do bootstrap: se o schema usasse .cuid(), rejeitava-a.
    expect(S.safeParse({ natureza: 'JUROS_MORA', contaId: c781.id }).success).toBe(true);
    expect(S.parse({ natureza: 'JUROS_MORA', contaId: c781.id })).toEqual({ natureza: 'JUROS_MORA', contaId: c781.id });
    expect(S.parse({ natureza: 'OUTRO', contaId: null })).toEqual({ natureza: 'OUTRO', contaId: null });
    for (const n of ORDEM) expect(S.safeParse({ natureza: n, contaId: null }).success, n).toBe(true);

    expect(S.safeParse({ natureza: 'DESCONHECIDA', contaId: c781.id }).success).toBe(false);
    expect(S.safeParse({ natureza: 'JUROS_MORA', contaId: '' }).success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (L) listagem
  // -------------------------------------------------------------------------

  it('depois do bootstrap: 5 linhas pela ordem de NATUREZAS_NOTA_DEBITO, com 711 / 781 / 769 e duas sem conta', async () => {
    const lista = await listar();
    expect(lista).toHaveLength(5);
    expect(lista.map((l) => l.natureza)).toEqual(ORDEM);
    expect(lista.map((l) => l.natureza)).toEqual([...lib.NATUREZAS_NOTA_DEBITO]);

    const [c711, c781, c769] = [await conta(TENANT, '711'), await conta(TENANT, '781'), await conta(TENANT, '769')];
    const por = Object.fromEntries(lista.map((l) => [l.natureza, l]));
    expect(por.ACERTO_PRECO).toMatchObject({ natureza: 'ACERTO_PRECO', contaId: c711.id, codigo: '711', nome: c711.nome });
    expect(por.JUROS_MORA).toMatchObject({ natureza: 'JUROS_MORA', contaId: c781.id, codigo: '781', nome: c781.nome });
    expect(por.PENALIZACAO).toMatchObject({ natureza: 'PENALIZACAO', contaId: c769.id, codigo: '769', nome: c769.nome });
    expect(por.DESPESAS_REPERCUTIDAS).toMatchObject({ natureza: 'DESPESAS_REPERCUTIDAS', contaId: null, codigo: null, nome: null });
    expect(por.OUTRO).toMatchObject({ natureza: 'OUTRO', contaId: null, codigo: null, nome: null });
  });

  it('reflecte definir: Juros de mora passa a 7819 e Despesas repercutidas ganha 632; o resto fica igual', async () => {
    const [c7819, c632, c711] = [await conta(TENANT, '7819'), await conta(TENANT, '632'), await conta(TENANT, '711')];
    await definir('JUROS_MORA', c7819.id);
    await definir('DESPESAS_REPERCUTIDAS', c632.id);

    const lista = await listar();
    expect(lista.map((l) => l.natureza)).toEqual(ORDEM);
    const por = Object.fromEntries(lista.map((l) => [l.natureza, l]));
    expect(por.JUROS_MORA).toMatchObject({ natureza: 'JUROS_MORA', contaId: c7819.id, codigo: '7819', nome: c7819.nome });
    expect(por.DESPESAS_REPERCUTIDAS).toMatchObject({
      natureza: 'DESPESAS_REPERCUTIDAS',
      contaId: c632.id,
      codigo: '632',
      nome: c632.nome,
    });
    expect(por.ACERTO_PRECO.codigo).toBe('711');
    expect(por.ACERTO_PRECO.contaId).toBe(c711.id);
    expect(por.PENALIZACAO.codigo).toBe('769');
    expect(por.OUTRO.contaId).toBeNull();
  });

  it('reflecte retirar: com contaId null a natureza volta a «sem conta», e só essa', async () => {
    await definir('DESPESAS_REPERCUTIDAS', null);
    await definir('PENALIZACAO', null);

    const lista = await listar();
    expect(lista).toHaveLength(5);
    expect(lista.map((l) => l.natureza)).toEqual(ORDEM);
    const por = Object.fromEntries(lista.map((l) => [l.natureza, l]));
    expect(por.DESPESAS_REPERCUTIDAS).toMatchObject({ natureza: 'DESPESAS_REPERCUTIDAS', contaId: null, codigo: null, nome: null });
    expect(por.PENALIZACAO).toMatchObject({ natureza: 'PENALIZACAO', contaId: null, codigo: null, nome: null });
    expect(por.JUROS_MORA.codigo).toBe('7819');
    expect(por.ACERTO_PRECO.codigo).toBe('711');

    // repor o que o resto do ficheiro espera
    await definir('JUROS_MORA', (await conta(TENANT, '781')).id);
    await definir('PENALIZACAO', (await conta(TENANT, '769')).id);
    const depois = Object.fromEntries((await listar()).map((l) => [l.natureza, l]));
    expect(depois.JUROS_MORA.codigo).toBe('781');
    expect(depois.PENALIZACAO.codigo).toBe('769');
  });

  it('isolada por tenant: mudar o tenant A não toca no B, e o B vê as suas próprias contas (ids do B)', async () => {
    await definir('JUROS_MORA', (await conta(TENANT, '7819')).id);
    await definir('OUTRO', (await conta(TENANT, '789')).id);

    const listaB = await listar(ctxB);
    expect(listaB).toHaveLength(5);
    expect(listaB.map((l) => l.natureza)).toEqual(ORDEM);
    const porB = Object.fromEntries(listaB.map((l) => [l.natureza, l]));
    expect(porB.JUROS_MORA.codigo).toBe('781');
    expect(porB.JUROS_MORA.contaId).toBe((await conta(TENANT_B, '781')).id);
    expect(porB.ACERTO_PRECO.contaId).toBe((await conta(TENANT_B, '711')).id);
    expect(porB.OUTRO).toMatchObject({ natureza: 'OUTRO', contaId: null, codigo: null, nome: null });

    const porA = Object.fromEntries((await listar()).map((l) => [l.natureza, l]));
    expect(porA.JUROS_MORA.codigo).toBe('7819');
    expect(porA.OUTRO.codigo).toBe('789');
    for (const l of Object.values(porA) as any[]) {
      if (l.contaId) expect((await db.contaPGC.findFirst({ where: { id: l.contaId } })).tenantId).toBe(TENANT);
    }
  });

  it('definir com a conta de outro tenant → NotFoundError, e a listagem não muda', async () => {
    const antes = await listar();
    const erro = await capturarErro(() => definir('JUROS_MORA', '00000000-0000-4000-8000-000000000000'));
    expect(erro).toBeInstanceOf(NotFoundError);
    const erroB = await capturarErro(async () => definir('JUROS_MORA', (await conta(TENANT_B, '7819')).id));
    expect(erroB).toBeInstanceOf(NotFoundError);
    expect(await listar()).toEqual(antes);
  });
});
