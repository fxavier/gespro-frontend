/**
 * Oráculo do nó C:empresa-config-fiscal-177 (issue #177) — dados da empresa e configuração fiscal.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * O defeito: `actualizarTenant`/`actualizarConfiguracaoFiscal` existem mas nenhum ecrã os consome; e
 * nenhum serve o admin do tenant — o primeiro recebe o `id` do tenant do CLIENTE e recusa mexer no
 * NUIT, o segundo escreve por `upsert` no `prismaBase` (sem `AuditLog`). Os dados que saem no
 * cabeçalho do PDF fiscal (nome, NUIT, morada, regime de IVA) não têm como ser corrigidos.
 *
 * Contrato (decisão do orquestrador; nomes e códigos escolhidos pelo verificador):
 *   E1 `tenantAdminService.actualizarDadosEmpresa(input, ctx)` grava, no tenant de `ctx.tenantId`,
 *      `Tenant.nome`, `Tenant.nuit` e, na `ConfiguracaoFiscal`, `regimeIva`, `endereco`, `cidade`,
 *      `provincia`, `codigoPostal`, `email`, `telefone`; devolve o `TenantRow` actualizado.
 *      `slug`, `planoAssinatura` e `statusAtivo` ficam como estavam. Outro tenant não muda.
 *   E2 NUIT já usado por OUTRO tenant → `BusinessRuleError` (`NUIT_DUPLICADO`, ou o
 *      `TENANT_DUPLICADO` que o `criar` já usa) — nunca o P2002 cru (500) — e NADA muda (nem o
 *      nome enviado no mesmo pedido). Manter o próprio NUIT não é duplicado.
 *   E3 Auditoria por escrita singular: há `AuditLog` `UPDATE` de `Tenant` (entityId = tenant) e de
 *      `ConfiguracaoFiscal` (entityId = id da configuração), com o `userId` do autor e o valor
 *      novo em `data.after`. Tenant sem `ConfiguracaoFiscal` → a configuração é criada por um
 *      `create` singular (`AuditLog` `CREATE`), não por `upsert` (que passa sem trilho).
 *   E4 O PDF fiscal (`obterModeloFatura`) mostra no emitente o nome, o NUIT, a morada e o regime
 *      gravados.
 *   A1 A Server Action `actualizarDadosEmpresa` (a do ecrã) usa `DadosEmpresaSchema`, exige
 *      `core_tenancy:configurar` e tira o tenant da SESSÃO: um `id`/`tenantId` vindo do cliente é
 *      ignorado, e `planoAssinatura`/`statusAtivo`/`slug` enviados não chegam à base.
 *   A2 NUIT inválido → `ok:false` (VALIDACAO), nada gravado. Sem a permissão → `ok:false`
 *      (SEM_PERMISSAO), nada gravado. Em Leitura → `ok:false` (ACESSO_LEITURA), nada gravado.
 *   A3 NUIT de outro tenant pela action → `ok:false` com o código de E2, nunca `ERRO_INTERNO`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

/** Sessão mutável: aponta para o actor do caso, com as permissões dele. */
const sessao = vi.hoisted(() => ({
  actual: {
    id: 'ninguem',
    tenantId: 'x',
    permissions: [] as string[],
    emailVerificado: true,
    acesso: 'aberto' as 'aberto' | 'leitura',
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

const CODIGOS_DUPLICADO = ['NUIT_DUPLICADO', 'TENANT_DUPLICADO'];

describe.skipIf(skip)('#177 — dados da empresa e configuração fiscal — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // tenantAdminService
  let acao: (input: unknown) => Promise<Resultado>;
  let documentos: any;
  let fat: any;
  let val: typeof import('@/lib/validations/faturacao');

  const sufixo = Date.now();
  const s8 = `${sufixo}`.slice(-8);
  const TENANT = `tenant-ecf177-${sufixo}`;
  const OUTRO = `tenant-ecf177-b-${sufixo}`;
  const SEM_CFG = `tenant-ecf177-c-${sufixo}`;
  const USER = `user-ecf177-${sufixo}`;
  const USER_OUTRO = `user-ecf177-b-${sufixo}`;
  const USER_SEM_CFG = `user-ecf177-c-${sufixo}`;

  // NUITs de 9 dígitos válidos e distintos entre si.
  const NUIT_INICIAL = `1${s8}`;
  const NUIT_OUTRO = `2${s8}`;
  const NUIT_SEM_CFG = `3${s8}`;
  const NUIT_NOVO = `5${s8}`;
  const NUIT_ACAO = `6${s8}`;
  const NUIT_CLIENTE = `7${s8}`;

  const ADMIN_PERMS = ['core_tenancy:configurar', 'core_tenancy:ver'];
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(c: { tenantId: string; userId: string }, fn: () => Promise<T>) => runCtx(c, fn);

  let cfgId: string;
  let faturaId: string;

  function sessaoDe(o: { id?: string; tenantId?: string; perms?: string[]; acesso?: 'aberto' | 'leitura' } = {}) {
    sessao.actual = {
      id: o.id ?? USER,
      tenantId: o.tenantId ?? TENANT,
      permissions: [...(o.perms ?? ADMIN_PERMS)],
      emailVerificado: true,
      acesso: o.acesso ?? 'aberto',
    };
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  const lerTenant = (id: string) => db.tenant.findFirst({ where: { id } });
  const lerCfg = (tenantId: string) => db.configuracaoFiscal.findFirst({ where: { tenantId } });

  /** A auditoria das entidades não críticas é assíncrona: espera até 5 s. */
  async function logsDe(where: Record<string, unknown>): Promise<any[]> {
    let logs: any[] = [];
    for (let i = 0; i < 50 && logs.length === 0; i++) {
      logs = await db.auditLog.findMany({ where, orderBy: { createdAt: 'asc' } });
      if (logs.length === 0) await new Promise((r) => setTimeout(r, 100));
    }
    return logs;
  }

  /** Estado de partida de cada caso: o tenant como foi criado no beforeAll. */
  async function repor(): Promise<void> {
    await db.tenant.update({ where: { id: TENANT }, data: { nome: 'Empresa #177', nuit: NUIT_INICIAL } });
    await db.configuracaoFiscal.update({
      where: { tenantId: TENANT },
      data: {
        regimeIva: 'NORMAL',
        endereco: 'Rua Antiga, 1',
        cidade: 'Beira',
        provincia: 'Sofala',
        codigoPostal: '2100',
        email: 'antigo@ecf177.mz',
        telefone: '820000177',
        planoAssinatura: 'BASICO',
        statusAtivo: true,
      },
    });
    await db.auditLog.deleteMany({ where: { tenantId: { in: [TENANT, OUTRO, SEM_CFG] } } });
  }

  const DADOS = {
    nome: 'Empresa Corrigida #177, Lda',
    nuit: NUIT_NOVO,
    regimeIva: 'SIMPLIFICADO',
    endereco: 'Av. Julius Nyerere, 177',
    cidade: 'Maputo',
    provincia: 'Maputo Cidade',
    codigoPostal: '1100',
    email: 'geral@ecf177.mz',
    telefone: '840000177',
  };

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ tenantAdminService: svc } = await import('@/server/services/plataforma/tenant-admin.service'));
    documentos = await import('@/server/services/plataforma/documentos.service');
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    // Acesso dinâmico: falha o caso, não o ficheiro.
    const actions = (await import('@/server/actions/plataforma.actions')) as unknown as Record<string, any>;
    acao = actions.actualizarDadosEmpresa;
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, nuit, user] of [
      [TENANT, NUIT_INICIAL, USER],
      [OUTRO, NUIT_OUTRO, USER_OUTRO],
      [SEM_CFG, NUIT_SEM_CFG, USER_SEM_CFG],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Empresa ${id}`, slug: id, nuit } });
      await db.user.create({
        data: { id: user, tenantId: id, email: `${user}@test.mz`, nome: user, keycloakSub: `kc-${user}` },
      });
    }
    await db.tenant.update({ where: { id: TENANT }, data: { nome: 'Empresa #177' } });
    const cfg = await db.configuracaoFiscal.create({ data: { tenantId: TENANT } });
    cfgId = cfg.id;
    await db.configuracaoFiscal.create({
      data: { tenantId: OUTRO, endereco: 'Rua do Outro, 9', cidade: 'Nampula', provincia: 'Nampula', regimeIva: 'ISENTO' },
    });

    // Uma factura emitida no tenant, para o modelo do PDF (E4).
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    const cliente = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: 'Cliente #177',
        tipo: 'JURIDICA',
        nuit: NUIT_CLIENTE,
        email: `cliente-ecf177-${sufixo}@test.mz`,
        telefone: '840001177',
        codigo: `CLI-ECF177-${sufixo}`,
      },
    });
    const dataEmissao = new Date();
    dataEmissao.setUTCHours(10, 0, 0, 0);
    const input = val.EmitirFaturaSchema.parse({
      clienteId: cliente.id,
      dataEmissao,
      dataVencimento: new Date(dataEmissao.getTime() + 30 * 86_400_000),
      linhas: [{ descricao: 'Serviço #177', quantidade: 1, precoUnitario: 1000, taxaIva: 0.16 }],
    });
    const f: any = await noCtx(ctx, () =>
      db.$transaction((tx: any) => fat.emitirDocumentoEmTx(tx, input, ctx), { timeout: 30_000 }),
    );
    faturaId = f.id;
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await repor();
    sessaoDe();
  });

  // ── E1 grava no tenant do contexto ──────────────────────────────────────────

  it('E1: grava nome, NUIT, regime e morada no tenant do contexto e devolve-os', async () => {
    expect(typeof svc.actualizarDadosEmpresa, 'tenantAdminService.actualizarDadosEmpresa não existe').toBe('function');
    const row: any = await noCtx(ctx, () => svc.actualizarDadosEmpresa(DADOS, ctx));

    const t = await lerTenant(TENANT);
    expect(t.nome).toBe(DADOS.nome);
    expect(t.nuit).toBe(NUIT_NOVO);
    expect(t.slug, 'o slug é imutável').toBe(TENANT);
    const c = await lerCfg(TENANT);
    expect(c).toMatchObject({
      regimeIva: 'SIMPLIFICADO',
      endereco: DADOS.endereco,
      cidade: DADOS.cidade,
      provincia: DADOS.provincia,
      codigoPostal: DADOS.codigoPostal,
      email: DADOS.email,
      telefone: DADOS.telefone,
      planoAssinatura: 'BASICO',
      statusAtivo: true,
    });
    expect(c.id, 'a configuração é actualizada, não substituída').toBe(cfgId);

    expect(row.id).toBe(TENANT);
    expect(row.nome).toBe(DADOS.nome);
    expect(row.nuit).toBe(NUIT_NOVO);
    expect(row.configuracaoFiscal?.regimeIva).toBe('SIMPLIFICADO');
    expect(row.configuracaoFiscal?.endereco).toBe(DADOS.endereco);
  });

  it('E1: o outro tenant não muda', async () => {
    const antesT = await lerTenant(OUTRO);
    const antesC = await lerCfg(OUTRO);
    await noCtx(ctx, () => svc.actualizarDadosEmpresa(DADOS, ctx));
    expect(await lerTenant(OUTRO)).toEqual(antesT);
    expect(await lerCfg(OUTRO)).toEqual(antesC);
  });

  it('E1: manter o próprio NUIT não é duplicado', async () => {
    await noCtx(ctx, () => svc.actualizarDadosEmpresa({ ...DADOS, nuit: NUIT_INICIAL }, ctx));
    const t = await lerTenant(TENANT);
    expect(t.nuit).toBe(NUIT_INICIAL);
    expect(t.nome).toBe(DADOS.nome);
  });

  // ── E2 NUIT de outro tenant ─────────────────────────────────────────────────

  it('E2: NUIT de outro tenant → BusinessRuleError, e nada muda (nem o nome do mesmo pedido)', async () => {
    const antesT = await lerTenant(TENANT);
    const antesC = await lerCfg(TENANT);
    const erro = await capturarErro(() =>
      noCtx(ctx, () => svc.actualizarDadosEmpresa({ ...DADOS, nuit: NUIT_OUTRO }, ctx)),
    );
    expect(erro, 'tinha de ser recusado').toBeDefined();
    expect(erro?.name, `erro de regra de negócio, não P2002/500 (${erro?.message})`).toBe('BusinessRuleError');
    expect(CODIGOS_DUPLICADO).toContain(erro?.code);
    expect(await lerTenant(TENANT)).toEqual(antesT);
    expect(await lerCfg(TENANT)).toEqual(antesC);
    expect((await lerTenant(OUTRO)).nuit).toBe(NUIT_OUTRO);
  });

  // ── E3 auditoria ────────────────────────────────────────────────────────────

  it('E3: AuditLog UPDATE de Tenant e de ConfiguracaoFiscal, com o autor e o valor novo', async () => {
    await noCtx(ctx, () => svc.actualizarDadosEmpresa(DADOS, ctx));

    const logsT = await logsDe({ tenantId: TENANT, entity: 'Tenant', entityId: TENANT, action: 'UPDATE' });
    expect(logsT.length, 'AuditLog UPDATE do Tenant').toBeGreaterThan(0);
    const ultT = logsT[logsT.length - 1];
    expect(ultT.userId).toBe(USER);
    expect(ultT.data?.after?.nuit).toBe(NUIT_NOVO);
    expect(ultT.data?.after?.nome).toBe(DADOS.nome);
    if (ultT.data?.before !== undefined) expect(ultT.data.before?.nuit).toBe(NUIT_INICIAL);

    const logsC = await logsDe({ tenantId: TENANT, entity: 'ConfiguracaoFiscal', entityId: cfgId, action: 'UPDATE' });
    expect(logsC.length, 'AuditLog UPDATE da ConfiguracaoFiscal').toBeGreaterThan(0);
    const ultC = logsC[logsC.length - 1];
    expect(ultC.userId).toBe(USER);
    expect(ultC.data?.after?.regimeIva).toBe('SIMPLIFICADO');
    expect(ultC.data?.after?.endereco).toBe(DADOS.endereco);
  });

  it('E3: um pedido recusado (NUIT duplicado) não deixa AuditLog de alteração', async () => {
    await capturarErro(() => noCtx(ctx, () => svc.actualizarDadosEmpresa({ ...DADOS, nuit: NUIT_OUTRO }, ctx)));
    await new Promise((r) => setTimeout(r, 500));
    const logs = await db.auditLog.findMany({
      where: { tenantId: TENANT, entity: { in: ['Tenant', 'ConfiguracaoFiscal'] } },
    });
    expect(logs).toEqual([]);
  });

  it('E3: tenant sem ConfiguracaoFiscal → é criada (AuditLog CREATE), com os dados enviados', async () => {
    const c = { tenantId: SEM_CFG, userId: USER_SEM_CFG };
    expect(await lerCfg(SEM_CFG), 'pré-condição: sem configuração').toBeNull();
    await noCtx(c, () =>
      svc.actualizarDadosEmpresa({ ...DADOS, nuit: NUIT_SEM_CFG, nome: 'Empresa Sem Cfg' }, c),
    );
    const cfg = await lerCfg(SEM_CFG);
    expect(cfg).not.toBeNull();
    expect(cfg).toMatchObject({ regimeIva: 'SIMPLIFICADO', endereco: DADOS.endereco, provincia: DADOS.provincia });
    const logs = await logsDe({ tenantId: SEM_CFG, entity: 'ConfiguracaoFiscal', entityId: cfg.id, action: 'CREATE' });
    expect(logs.length, 'AuditLog CREATE da ConfiguracaoFiscal (upsert passa sem trilho)').toBeGreaterThan(0);
    expect(logs[0].userId).toBe(USER_SEM_CFG);
  });

  // ── E4 o PDF fiscal ─────────────────────────────────────────────────────────

  it('E4: o modelo do PDF fiscal mostra no emitente os dados gravados', async () => {
    await noCtx(ctx, () => svc.actualizarDadosEmpresa(DADOS, ctx));
    const modelo: any = await noCtx(ctx, () => documentos.obterModeloFatura(faturaId, ctx));
    expect(modelo.emitente.nome).toBe(DADOS.nome);
    expect(modelo.emitente.nuit).toBe(NUIT_NOVO);
    expect(modelo.emitente.morada).toContain(DADOS.endereco);
    expect(modelo.emitente.morada).toContain(DADOS.cidade);
    expect(modelo.emitente.morada).toContain(DADOS.provincia);
    expect(String(modelo.emitente.regimeIva)).toMatch(/SIMPLIFICADO|Simplificado/i);
  });

  // ── A1–A3 a Server Action do ecrã ───────────────────────────────────────────

  it('A1: a action grava no tenant da SESSÃO, ignora id/tenantId do cliente e as chaves de outras autoridades', async () => {
    expect(typeof acao, 'actualizarDadosEmpresa não está exportada de plataforma.actions').toBe('function');
    const antesOutroT = await lerTenant(OUTRO);
    const antesOutroC = await lerCfg(OUTRO);
    const r = await acao({
      ...DADOS,
      nuit: NUIT_ACAO,
      id: OUTRO,
      tenantId: OUTRO,
      slug: 'sequestrado',
      planoAssinatura: 'EMPRESARIAL',
      statusAtivo: false,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const t = await lerTenant(TENANT);
    expect(t.nuit).toBe(NUIT_ACAO);
    expect(t.nome).toBe(DADOS.nome);
    expect(t.slug).toBe(TENANT);
    const c = await lerCfg(TENANT);
    expect(c.planoAssinatura).toBe('BASICO');
    expect(c.statusAtivo).toBe(true);
    expect(c.regimeIva).toBe('SIMPLIFICADO');

    expect(await lerTenant(OUTRO)).toEqual(antesOutroT);
    expect(await lerCfg(OUTRO)).toEqual(antesOutroC);
  });

  it('A2: NUIT inválido → ok:false VALIDACAO, nada gravado', async () => {
    expect(typeof acao, 'actualizarDadosEmpresa não está exportada de plataforma.actions').toBe('function');
    const antesT = await lerTenant(TENANT);
    const r = await acao({ ...DADOS, nuit: '111111111' });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('VALIDACAO');
    expect(await lerTenant(TENANT)).toEqual(antesT);
  });

  it('A2: sem core_tenancy:configurar (GESTOR) → ok:false SEM_PERMISSAO, nada gravado', async () => {
    expect(typeof acao, 'actualizarDadosEmpresa não está exportada de plataforma.actions').toBe('function');
    sessaoDe({ perms: ['core_tenancy:ver', 'admin:gerir_utilizadores'] });
    const antesT = await lerTenant(TENANT);
    const antesC = await lerCfg(TENANT);
    const r = await acao(DADOS);
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect(await lerTenant(TENANT)).toEqual(antesT);
    expect(await lerCfg(TENANT)).toEqual(antesC);
  });

  it('A2: em Leitura → ok:false ACESSO_LEITURA, nada gravado', async () => {
    expect(typeof acao, 'actualizarDadosEmpresa não está exportada de plataforma.actions').toBe('function');
    sessaoDe({ acesso: 'leitura' });
    const antesT = await lerTenant(TENANT);
    const r = await acao(DADOS);
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('ACESSO_LEITURA');
    expect(await lerTenant(TENANT)).toEqual(antesT);
  });

  it('A3: NUIT de outro tenant pela action → ok:false com o código de duplicado, nunca ERRO_INTERNO', async () => {
    expect(typeof acao, 'actualizarDadosEmpresa não está exportada de plataforma.actions').toBe('function');
    const antesT = await lerTenant(TENANT);
    const r = await acao({ ...DADOS, nuit: NUIT_OUTRO });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(CODIGOS_DUPLICADO).toContain(r.error?.code);
    expect(await lerTenant(TENANT)).toEqual(antesT);
  });
});
