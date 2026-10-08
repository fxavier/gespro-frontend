/**
 * Oráculo #119 — CRUD de categorias de produto (`catalogoProdutoService`), o serviço por trás
 * do ecrã novo `/produtos/categorias` (lista, nova, [id]/editar).
 *
 * O serviço já existia sem ecrã; o ecrã expõe-o a utilizadores, e com ele dois caminhos que
 * hoje rebentam com o erro cru do Prisma (P2002 no `@@unique([tenantId, nome])`) — o
 * utilizador veria «Erro interno»:
 *   - renomear uma categoria para o nome de outra do mesmo tenant;
 *   - criar uma categoria com o nome de uma categoria ARQUIVADA (soft delete: a linha continua
 *     lá e a constraint não sabe de `deletedAt`).
 * Decisão conservadora (orquestrador): ambos são RECUSADOS com `BusinessRuleError`
 * `CATEGORIA_DUPLICADA` e nada muda na base (nem reactivação silenciosa, nem linha nova).
 *
 * Também tranca o que o ecrã precisa e já funciona (regressão): criar/obter/listar/actualizar
 * (nome, descrição, cor, activo), filtro por `ativo`, actualizar sem mudar o nome, e o
 * isolamento entre tenants (outro tenant → NotFoundError, linha alheia intacta).
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('#119 — CRUD de categorias de produto — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any;

  const sufixo = Date.now();
  const TENANT = `tenant-cat-prod-119-${sufixo}`;
  const OUTRO = `tenant-cat-prod-119-outro-${sufixo}`;
  const USER = `user-cat-prod-119-${sufixo}`;
  const USER_OUTRO = `user-cat-prod-119-outro-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxOutro = { tenantId: OUTRO, userId: USER_OUTRO };
  const noCtx = (fn: () => Promise<any>): Promise<any> => runCtx(ctx, fn);
  const noOutro = (fn: () => Promise<any>): Promise<any> => runCtx(ctxOutro, fn);

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  const linhas = (tenantId: string, nome: string) =>
    db.categoriaProduto.findMany({ where: { tenantId, nome } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ catalogoProdutoService: svc } = await import('@/server/services/inventario/catalogo.service'));

    for (const [id, user, slug] of [
      [TENANT, USER, `cat-prod-119-${sufixo}`],
      [OUTRO, USER_OUTRO, `cat-prod-119-outro-${sufixo}`],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit: `${sufixo}${id.length}`.slice(-9) } });
      await db.user.create({
        data: { id: user, tenantId: id, email: `${slug}@test.mz`, nome: 'Gestor', keycloakSub: `kc-${slug}` },
      });
    }
  });

  it('criar → obter e listar devolvem a categoria com os campos gravados', async () => {
    const criada = await noCtx(() =>
      svc.criarCategoria({ nome: 'Bebidas', descricao: 'Refrigerantes e águas', cor: '#112233', ativo: true }, ctx),
    );
    expect(criada.id).toBeTruthy();
    expect(criada).toMatchObject({ tenantId: TENANT, nome: 'Bebidas', descricao: 'Refrigerantes e águas', cor: '#112233', ativo: true });

    const obtida = await noCtx(() => svc.obterCategoria(criada.id, ctx));
    expect(obtida).toMatchObject({ id: criada.id, nome: 'Bebidas', cor: '#112233' });

    const lista = await noCtx(() => svc.listarCategorias({ take: 100 }, ctx));
    expect(lista.items.map((c: any) => c.id)).toContain(criada.id);
  });

  it('actualizar nome, descrição, cor e activo persiste; o filtro `ativo` separa as inactivas', async () => {
    const c = await noCtx(() => svc.criarCategoria({ nome: 'Limpeza', cor: '#6366f1', ativo: true }, ctx));

    const act = await noCtx(() =>
      svc.actualizarCategoria(c.id, { nome: 'Higiene e Limpeza', descricao: 'Detergentes', cor: '#AA00FF', ativo: false }, ctx),
    );
    expect(act).toMatchObject({ id: c.id, nome: 'Higiene e Limpeza', descricao: 'Detergentes', cor: '#AA00FF', ativo: false });

    const naBase = await db.categoriaProduto.findFirst({ where: { id: c.id, tenantId: TENANT } });
    expect(naBase).toMatchObject({ nome: 'Higiene e Limpeza', descricao: 'Detergentes', cor: '#AA00FF', ativo: false });

    const inactivas = await noCtx(() => svc.listarCategorias({ take: 100, ativo: false }, ctx));
    const activas = await noCtx(() => svc.listarCategorias({ take: 100, ativo: true }, ctx));
    expect(inactivas.items.map((x: any) => x.id)).toContain(c.id);
    expect(activas.items.map((x: any) => x.id)).not.toContain(c.id);
  });

  it('actualizar mantendo o próprio nome (só a descrição) não é duplicado', async () => {
    const c = await noCtx(() => svc.criarCategoria({ nome: 'Papelaria', cor: '#6366f1', ativo: true }, ctx));
    const act = await noCtx(() => svc.actualizarCategoria(c.id, { nome: 'Papelaria', descricao: 'Cadernos' }, ctx));
    expect(act).toMatchObject({ nome: 'Papelaria', descricao: 'Cadernos' });
  });

  it('criar com o nome de uma categoria activa → CATEGORIA_DUPLICADA e só fica uma linha', async () => {
    await noCtx(() => svc.criarCategoria({ nome: 'Mercearia', cor: '#6366f1', ativo: true }, ctx));
    const erro = await capturarErro(() =>
      noCtx(() => svc.criarCategoria({ nome: 'Mercearia', cor: '#6366f1', ativo: true }, ctx)),
    );
    expect(erro, 'a criação duplicada tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('CATEGORIA_DUPLICADA');
    expect(await linhas(TENANT, 'Mercearia')).toHaveLength(1);
  });

  it('renomear para o nome de outra categoria do tenant → CATEGORIA_DUPLICADA (não P2002) e nada muda', async () => {
    await noCtx(() => svc.criarCategoria({ nome: 'Electrónica', cor: '#6366f1', ativo: true }, ctx));
    const b = await noCtx(() => svc.criarCategoria({ nome: 'Electrodomésticos', cor: '#6366f1', ativo: true }, ctx));
    const antes = await db.categoriaProduto.findFirst({ where: { id: b.id, tenantId: TENANT } });

    const erro = await capturarErro(() => noCtx(() => svc.actualizarCategoria(b.id, { nome: 'Electrónica' }, ctx)));

    expect(erro, 'o renomear para um nome existente tinha de ser recusado').toBeDefined();
    expect(erro.name, `erro recebido: ${erro?.name} ${erro?.code ?? ''} ${erro?.message ?? ''}`).toBe('BusinessRuleError');
    expect(erro.code).toBe('CATEGORIA_DUPLICADA');
    expect(await db.categoriaProduto.findFirst({ where: { id: b.id, tenantId: TENANT } })).toEqual(antes);
  });

  it('criar com o nome de uma categoria ARQUIVADA → CATEGORIA_DUPLICADA (não P2002) e a arquivada continua arquivada', async () => {
    const velha = await noCtx(() => svc.criarCategoria({ nome: 'Brinquedos', cor: '#6366f1', ativo: true }, ctx));
    await noCtx(() => svc.arquivarCategoria(velha.id, ctx));
    const arquivada = await db.categoriaProduto.findFirst({ where: { id: velha.id, tenantId: TENANT } });
    expect(arquivada.deletedAt, 'pré-condição: a categoria ficou arquivada').not.toBeNull();

    const erro = await capturarErro(() =>
      noCtx(() => svc.criarCategoria({ nome: 'Brinquedos', cor: '#6366f1', ativo: true }, ctx)),
    );

    expect(erro, 'a criação com nome de categoria arquivada tinha de ser recusada').toBeDefined();
    expect(erro.name, `erro recebido: ${erro?.name} ${erro?.code ?? ''} ${erro?.message ?? ''}`).toBe('BusinessRuleError');
    expect(erro.code).toBe('CATEGORIA_DUPLICADA');
    const todas = await linhas(TENANT, 'Brinquedos');
    expect(todas).toHaveLength(1);
    expect(todas[0]).toEqual(arquivada);
  });

  it('o mesmo nome noutro tenant é permitido', async () => {
    await noCtx(() => svc.criarCategoria({ nome: 'Ferragens', cor: '#6366f1', ativo: true }, ctx));
    const noOutroTenant = await noOutro(() => svc.criarCategoria({ nome: 'Ferragens', cor: '#6366f1', ativo: true }, ctxOutro));
    expect(noOutroTenant.tenantId).toBe(OUTRO);
  });

  it('categoria de outro tenant: obter e actualizar → NotFoundError, e a linha alheia fica intacta', async () => {
    const alheia = await noOutro(() => svc.criarCategoria({ nome: 'Alheia', cor: '#6366f1', ativo: true }, ctxOutro));
    const antes = await db.categoriaProduto.findFirst({ where: { id: alheia.id } });

    const eObter = await capturarErro(() => noCtx(() => svc.obterCategoria(alheia.id, ctx)));
    expect(eObter?.name).toBe('NotFoundError');

    const eAct = await capturarErro(() => noCtx(() => svc.actualizarCategoria(alheia.id, { nome: 'Roubada' }, ctx)));
    expect(eAct?.name).toBe('NotFoundError');

    const lista = await noCtx(() => svc.listarCategorias({ take: 100 }, ctx));
    expect(lista.items.map((c: any) => c.id)).not.toContain(alheia.id);
    expect(await db.categoriaProduto.findFirst({ where: { id: alheia.id } })).toEqual(antes);
  });
});
