/**
 * Oráculo — issue #465: conta bancária não se desactiva nem reactiva pela UI.
 *
 * Contrato (decidido pelo orquestrador):
 *   - `definirContaBancariaActiva(id, ativo, ctx)` em `financas/contabilidade.service.ts`
 *     (junto de criar/actualizar ContaBancaria): muda SÓ `ativo`, tenant explícito
 *     (conta de outro tenant → NotFoundError, nada muda), escrita SINGULAR que fica no
 *     AuditLog (entity `ContaBancaria`, action `UPDATE`, before/after com o `ativo`);
 *   - action `definirContaBancariaActiva({ id, ativo })` em `contabilidade.actions.ts`, com a
 *     permissão `financas:banca:contas:escrita` (a mesma de criar/editar), `revalidate` de
 *     `/contabilidade/contas-bancarias`, e travada em modo de Leitura (é escrita);
 *   - desactivar uma conta configurada num meio do POS NÃO bloqueia nem apaga a configuração
 *     (o ecrã dos meios mostra `contaBancariaInativa`);
 *   - uma conta inactiva é recusada nos pagamentos (`resolverContaMeioPagamento`) e na
 *     configuração dos meios POS (`CONTA_BANCARIA_INATIVA`); reactivar volta a permitir;
 *   - efeito esperado: com Millennium bim, BCI e M-Pesa na mesma conta PGC (121) a
 *     reconciliação marca `pgcPartilhada`; desactivar BCI e M-Pesa desbloqueia o Millennium bim
 *     (`pgcPartilhada` passa a false); reactivar o BCI volta a partilhar.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache`
 * é dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:conta-bancaria-desactivar-465; um agente de implementação
 * que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: {
      id: string;
      tenantId: string;
      permissions: string[];
      acesso: 'aberto' | 'leitura' | 'fechado';
      emailVerificado: boolean;
    };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: unknown; error?: { code: string; message: string } };

describe.skipIf(skip)('Desactivar/reactivar conta bancária (#465) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];
  // Acesso dinâmico: a operação ainda não existe — falha o caso, não o ficheiro.
  let contab: Record<string, any>;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;
  let mp: any; // '@/server/services/financas/meio-pagamento.service'
  let consulta: any; // '@/server/services/reconciliacao/consulta.service'
  let nextCache: any;

  const sufixo = Date.now();
  const TENANT = `tenant-cb-465-${sufixo}`;
  const TENANT_B = `tenant-cb-465-b-${sufixo}`;
  const USER = `user-cb-465-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let bim: { id: string };
  let bci: { id: string };
  let mpesa: { id: string };
  let contaOutroTenant: { id: string };

  function sessao(permissions: string[], acesso: 'aberto' | 'leitura' = 'aberto') {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso, emailVerificado: true } };
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function servico(): (id: string, ativo: boolean, c: typeof ctx) => Promise<any> {
    const fn = contab.definirContaBancariaActiva;
    expect(typeof fn, 'definirContaBancariaActiva não está exportada de contabilidade.service.ts').toBe('function');
    return fn;
  }

  function action() {
    const fn = actions.definirContaBancariaActiva;
    expect(typeof fn, 'definirContaBancariaActiva não está exportada de contabilidade.actions.ts').toBe('function');
    return fn;
  }

  const definirActiva = (id: string, ativo: boolean) => noCtx(() => servico()(id, ativo, ctx));
  const ler = (id: string) => db.contaBancaria.findUnique({ where: { id } });

  async function reconciliacao(): Promise<any[]> {
    return noCtx(() => consulta.listarContasReconciliacao(ctx));
  }

  async function pagarCom(forma: string, contaBancariaId: string) {
    return noCtx(() =>
      db.$transaction((tx: any) => mp.resolverContaMeioPagamento(tx, { forma, contaBancariaId }, ctx)),
    );
  }

  async function auditUpdates(entityId: string, minimo: number): Promise<any[]> {
    // A auditoria de modelos não críticos é assíncrona: espera até 5 s.
    let logs: any[] = [];
    for (let i = 0; i < 50; i++) {
      logs = await db.auditLog.findMany({
        where: { tenantId: TENANT, entity: 'ContaBancaria', entityId, action: 'UPDATE' },
        orderBy: { createdAt: 'asc' },
      });
      if (logs.length >= minimo) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return logs;
  }

  async function criarConta(tenantId: string, banco: string, numero: string, tipoConta: string, codigoPGC = '121') {
    const pgc = await db.contaPGC.findFirst({ where: { tenantId, codigo: codigoPGC } });
    expect(pgc, `ContaPGC ${codigoPGC} no tenant ${tenantId}`).not.toBeNull();
    return db.contaBancaria.create({
      data: {
        tenantId,
        banco,
        agencia: '0001',
        numeroConta: `${numero}-${sufixo}`,
        tipoConta,
        contaContabilId: pgc.id,
      },
    });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ NotFoundError } = await import('@/lib/errors'));
    contab = (await import('@/server/services/financas/contabilidade.service')) as unknown as Record<string, any>;
    actions = (await import('@/server/actions/contabilidade.actions')) as unknown as typeof actions;
    mp = await import('@/server/services/financas/meio-pagamento.service');
    consulta = await import('@/server/services/reconciliacao/consulta.service');
    nextCache = await import('next/cache');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant contas bancárias 465', slug: `cb-465-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `cb-465-${sufixo}@test.mz`, nome: 'Financeiro', keycloakSub: `kc-cb-465-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    await db.tenant.create({
      data: { id: TENANT_B, nome: 'Tenant contas bancárias 465 B', slug: `cb-465-b-${sufixo}`, nuit: `${sufixo + 1}`.slice(-9) },
    });
    await db.contaPGC.create({
      data: {
        tenantId: TENANT_B,
        codigo: '121',
        nome: 'Depósitos à ordem',
        classe: 'CLASSE_1',
        tipo: 'ATIVO',
        natureza: 'DEVEDORA',
        nivel: 3,
        aceitaLancamento: true,
      },
    });

    // O retrato do seed `demo`: três contas activas na mesma conta PGC 121.
    bim = await criarConta(TENANT, 'Millennium bim', '178903456', 'CORRENTE');
    bci = await criarConta(TENANT, 'BCI', '48920174501', 'CORRENTE');
    mpesa = await criarConta(TENANT, 'M-Pesa', '841234567', 'CARTEIRA_MOVEL');
    contaOutroTenant = await criarConta(TENANT_B, 'BCI', '0000001', 'CORRENTE');

    // M-Pesa configurada como conta do meio MPESA do POS.
    await noCtx(() => mp.definirContaMeioPagamentoPOS({ metodo: 'MPESA', contaBancariaId: mpesa.id }, ctx));
  }, 90_000);

  beforeEach(() => {
    sessao(['financas:banca:contas:escrita', 'financas:leitura']);
    vi.mocked(nextCache.revalidatePath).mockClear();
  });

  // -------------------------------------------------------------------------
  // Partida
  // -------------------------------------------------------------------------

  it('partida: as três contas na 121 estão activas e o Millennium bim aparece com pgcPartilhada', async () => {
    const linhas = await reconciliacao();
    const linhaBim = linhas.find((c) => c.id === bim.id);
    expect(linhaBim, 'Millennium bim na lista de reconciliação').toBeDefined();
    expect(linhaBim.pgcPartilhada).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Serviço
  // -------------------------------------------------------------------------

  it('desactivar o BCI grava ativo=false e não toca em mais nenhum campo', async () => {
    const antes = await ler(bci.id);
    const devolvida = await definirActiva(bci.id, false);
    expect(devolvida?.id).toBe(bci.id);
    expect(devolvida?.ativo).toBe(false);

    const depois = await ler(bci.id);
    expect(depois.ativo).toBe(false);
    for (const campo of ['tenantId', 'banco', 'agencia', 'numeroConta', 'tipoConta', 'moeda', 'contaContabilId']) {
      expect(depois[campo], campo).toEqual(antes[campo]);
    }
    expect(depois.saldoAtual.toString()).toBe(antes.saldoAtual.toString());
    expect(depois.toleranciaValor.toString()).toBe(antes.toleranciaValor.toString());
  });

  it('a desactivação fica no AuditLog (UPDATE de ContaBancaria, before ativo=true, after ativo=false, pelo utilizador)', async () => {
    const logs = await auditUpdates(bci.id, 1);
    expect(logs.length, 'AuditLog UPDATE da ContaBancaria BCI').toBeGreaterThan(0);
    const ultimo = logs[logs.length - 1];
    expect(ultimo.userId).toBe(USER);
    expect(ultimo.data?.before?.ativo).toBe(true);
    expect(ultimo.data?.after?.ativo).toBe(false);
  });

  it('a conta inactiva continua na listagem de contas bancárias (para se poder reactivar), marcada inactiva', async () => {
    const lista: any[] = await noCtx(() => contab.listarContasBancarias(ctx));
    const linha = lista.find((c) => c.id === bci.id);
    expect(linha, 'BCI continua listada').toBeDefined();
    expect(linha.ativo).toBe(false);
  });

  it('conta inactiva é recusada num pagamento por transferência (CONTA_BANCARIA_INATIVA)', async () => {
    const erro = await capturarErro(() => pagarCom('TRANSFERENCIA_BANCARIA', bci.id));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro.code).toBe('CONTA_BANCARIA_INATIVA');
  });

  it('desactivar a M-Pesa configurada no POS não bloqueia nem apaga a configuração; o meio passa a mostrar a conta inactiva', async () => {
    const devolvida = await definirActiva(mpesa.id, false);
    expect(devolvida?.ativo).toBe(false);
    expect((await ler(mpesa.id)).ativo).toBe(false);

    const linhas = await db.contaMeioPagamentoPOS.findMany({ where: { tenantId: TENANT, metodo: 'MPESA' } });
    expect(linhas, 'a configuração do meio MPESA mantém-se').toHaveLength(1);
    expect(linhas[0].contaBancariaId).toBe(mpesa.id);

    const meios: any[] = await noCtx(() => mp.listarContasMeioPagamentoPOS(ctx));
    expect(meios.find((m) => m.metodo === 'MPESA')?.contaBancariaInativa).toBe(true);

    const erro = await capturarErro(() =>
      noCtx(() => mp.definirContaMeioPagamentoPOS({ metodo: 'MPESA', contaBancariaId: mpesa.id }, ctx)),
    );
    expect(erro, 'configurar uma conta inactiva tinha de ser recusado').toBeDefined();
    expect(erro.code).toBe('CONTA_BANCARIA_INATIVA');
  });

  it('efeito: BCI e M-Pesa inactivas desbloqueiam a reconciliação do Millennium bim (pgcPartilhada=false)', async () => {
    const linhas = await reconciliacao();
    const ids = linhas.map((c) => c.id);
    expect(ids).toContain(bim.id);
    expect(ids).not.toContain(bci.id);
    expect(ids).not.toContain(mpesa.id);
    expect(linhas.find((c) => c.id === bim.id).pgcPartilhada).toBe(false);
  });

  it('reactivar o BCI grava ativo=true, deixa novo UPDATE no AuditLog e volta a partilhar a 121', async () => {
    const antes = (await auditUpdates(bci.id, 1)).length;
    const devolvida = await definirActiva(bci.id, true);
    expect(devolvida?.ativo).toBe(true);
    expect((await ler(bci.id)).ativo).toBe(true);

    const logs = await auditUpdates(bci.id, antes + 1);
    expect(logs.length).toBe(antes + 1);
    const ultimo = logs[logs.length - 1];
    expect(ultimo.data?.before?.ativo).toBe(false);
    expect(ultimo.data?.after?.ativo).toBe(true);

    const linhas = await reconciliacao();
    expect(linhas.find((c) => c.id === bim.id).pgcPartilhada).toBe(true);
    expect(linhas.find((c) => c.id === bci.id)?.pgcPartilhada).toBe(true);
  });

  it('reactivado, o BCI volta a ser aceite num pagamento por transferência', async () => {
    const r: any = await pagarCom('TRANSFERENCIA_BANCARIA', bci.id);
    expect(r.contaCodigo).toBe('121');
    expect(r.diarioTipo).toBe('BANCO');
  });

  it('reactivar a M-Pesa volta a permitir configurá-la no POS e tira o aviso de conta inactiva', async () => {
    await definirActiva(mpesa.id, true);
    expect((await ler(mpesa.id)).ativo).toBe(true);

    await noCtx(() => mp.definirContaMeioPagamentoPOS({ metodo: 'MPESA', contaBancariaId: mpesa.id }, ctx));
    const meios: any[] = await noCtx(() => mp.listarContasMeioPagamentoPOS(ctx));
    const linha = meios.find((m) => m.metodo === 'MPESA');
    expect(linha.contaBancariaId).toBe(mpesa.id);
    expect(linha.contaBancariaInativa).toBe(false);
  });

  it('conta de outro tenant → NotFoundError e a conta do outro tenant continua activa', async () => {
    const erro = await capturarErro(() => definirActiva(contaOutroTenant.id, false));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro).toBeInstanceOf(NotFoundError);
    expect((await ler(contaOutroTenant.id)).ativo).toBe(true);
  });

  it('id inexistente → NotFoundError', async () => {
    const erro = await capturarErro(() => definirActiva(`cnaoexiste${sufixo}`, false));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro).toBeInstanceOf(NotFoundError);
  });

  // -------------------------------------------------------------------------
  // Action
  // -------------------------------------------------------------------------

  it('action com financas:banca:contas:escrita desactiva e reactiva, e revalida /contabilidade/contas-bancarias', async () => {
    const r1 = await action()({ id: bci.id, ativo: false });
    expect(r1.ok, JSON.stringify(r1)).toBe(true);
    expect((await ler(bci.id)).ativo).toBe(false);
    expect(vi.mocked(nextCache.revalidatePath)).toHaveBeenCalledWith('/contabilidade/contas-bancarias');

    const r2 = await action()({ id: bci.id, ativo: true });
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    expect((await ler(bci.id)).ativo).toBe(true);
  });

  it('action sem financas:banca:contas:escrita → SEM_PERMISSAO e nada muda', async () => {
    sessao(['financas:leitura', 'financas:banca:contas:leitura', 'financas:banca:escrita']);
    const r = await action()({ id: bci.id, ativo: false });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect((await ler(bci.id)).ativo).toBe(true);
  });

  it('action em modo de Leitura → ACESSO_LEITURA e nada muda', async () => {
    sessao(['financas:banca:contas:escrita', 'financas:leitura'], 'leitura');
    const r = await action()({ id: bci.id, ativo: false });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ACESSO_LEITURA');
    expect((await ler(bci.id)).ativo).toBe(true);
  });

  it('action sobre conta de outro tenant → NAO_ENCONTRADO e nada muda', async () => {
    const r = await action()({ id: contaOutroTenant.id, ativo: false });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect((await ler(contaOutroTenant.id)).ativo).toBe(true);
  });
});
