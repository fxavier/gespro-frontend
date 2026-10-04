/**
 * Oráculo — issue #347: o servidor valida o `contaMaeId` do plano de contas.
 *
 * `criarConta` e `atualizarConta` (contabilidade.service) aceitavam qualquer
 * `contaMaeId`. Três regras, cada uma com o estado da base verificado depois:
 *
 *   1. Fronteira de tenant: mãe de OUTRO tenant, ou id inexistente → `NotFoundError`
 *      (nunca aceite; a conta não é criada / a mãe não muda).
 *   2. A própria conta como mãe (`atualizarConta(id, { contaMaeId: id })`) → recusada
 *      (a issue diz «recusar»; o teste exige um `BusinessRuleError` e a base intacta,
 *      sem fixar o código).
 *   3. Um descendente (filho, neto) como mãe → `BusinessRuleError('CONTA_MAE_CICLO')`
 *      e a base intacta.
 *
 * Guardas (verdes já hoje — fixam o que não pode partir com o fix):
 *   - uma mãe válida do mesmo tenant, não descendente, continua aceite (criar e actualizar);
 *   - omitir `contaMaeId` na actualização não mexe na mãe;
 *   - `contaMaeId: null` tira a mãe (a peça que falta para isto chegar da UI é o schema —
 *     ver src/lib/validations/__tests__/conta-mae-nullable.test.ts).
 *
 * Dois tenants: A com o `bootstrapContabilidade` real; B só com uma conta própria.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('contaMaeId validado no servidor (#347) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');

  const sufixo = Date.now();
  const TENANT_A = `tenant-mae347-a-${sufixo}`;
  const TENANT_B = `tenant-mae347-b-${sufixo}`;
  const USER_A = `user-mae347-a-${sufixo}`;
  const ctxA = { tenantId: TENANT_A, userId: USER_A };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctxA, fn);

  /** Conta de B — nunca pode servir de mãe a uma conta de A. */
  let contaB: { id: string; codigo: string; nome: string };

  let seq = 0;
  const novoCodigo = () => `89.347.${++seq}`;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  const lerConta = (id: string) => db.contaPGC.findFirst({ where: { id } });

  /** Cria uma conta em A directamente na base (montagem, não é o que se testa). */
  async function contaA(contaMaeId: string | null = null) {
    return db.contaPGC.create({
      data: {
        tenantId: TENANT_A,
        codigo: novoCodigo(),
        nome: `Conta teste #347 ${seq}`,
        classe: 'CLASSE_8',
        tipo: 'RESULTADO',
        natureza: 'CREDORA',
        nivel: 3,
        contaMaeId,
      },
    });
  }

  const inputCriar = (contaMaeId?: string) => ({
    codigo: novoCodigo(),
    nome: `Conta criada #347 ${seq}`,
    classe: 'CLASSE_8' as const,
    tipo: 'RESULTADO' as const,
    natureza: 'CREDORA' as const,
    nivel: 3,
    aceitaLancamento: false,
    ...(contaMaeId !== undefined ? { contaMaeId } : {}),
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT_A, nome: 'Tenant A #347', slug: `mae347-a-${sufixo}`, nuit: `1${`${sufixo}`.slice(-8)}` },
    });
    await db.tenant.create({
      data: { id: TENANT_B, nome: 'Tenant B #347', slug: `mae347-b-${sufixo}`, nuit: `2${`${sufixo}`.slice(-8)}` },
    });
    await db.user.create({
      data: {
        id: USER_A,
        tenantId: TENANT_A,
        email: `mae347-a-${sufixo}@test.mz`,
        nome: 'Contabilista A',
        keycloakSub: `kc-mae347-a-${sufixo}`,
      },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT_A), { timeout: 60_000 });

    contaB = await db.contaPGC.create({
      data: {
        id: randomUUID(),
        tenantId: TENANT_B,
        codigo: '89.347.0',
        nome: 'Conta secreta do tenant B',
        classe: 'CLASSE_8',
        tipo: 'RESULTADO',
        natureza: 'CREDORA',
        nivel: 3,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Regra 1 — fronteira de tenant / existência
  // -------------------------------------------------------------------------

  it('criarConta com mãe de OUTRO tenant → NotFoundError e a conta não é criada', async () => {
    const input = inputCriar(contaB.id);

    const erro = await capturarErro(() => noCtx(() => contab.criarConta(input as never, ctxA)));

    expect(erro, 'a criação tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('NotFoundError');
    expect(await db.contaPGC.count({ where: { tenantId: TENANT_A, codigo: input.codigo } })).toBe(0);
  });

  it('criarConta com mãe inexistente → NotFoundError e a conta não é criada', async () => {
    const input = inputCriar(randomUUID());

    const erro = await capturarErro(() => noCtx(() => contab.criarConta(input as never, ctxA)));

    expect(erro, 'a criação tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('NotFoundError');
    expect(await db.contaPGC.count({ where: { tenantId: TENANT_A, codigo: input.codigo } })).toBe(0);
  });

  it('atualizarConta com mãe de OUTRO tenant → NotFoundError e a mãe não muda', async () => {
    const conta = await contaA();
    const antes = await lerConta(conta.id);

    const erro = await capturarErro(() =>
      noCtx(() => contab.atualizarConta({ id: conta.id, contaMaeId: contaB.id } as never, ctxA)),
    );

    expect(erro, 'a actualização tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('NotFoundError');
    expect(await lerConta(conta.id)).toEqual(antes);
  });

  it('atualizarConta com mãe inexistente → NotFoundError e a mãe não muda', async () => {
    const conta = await contaA();
    const antes = await lerConta(conta.id);

    const erro = await capturarErro(() =>
      noCtx(() => contab.atualizarConta({ id: conta.id, contaMaeId: randomUUID() } as never, ctxA)),
    );

    expect(erro, 'a actualização tinha de ser recusada').toBeDefined();
    expect(erro.name).toBe('NotFoundError');
    expect(await lerConta(conta.id)).toEqual(antes);
  });

  // -------------------------------------------------------------------------
  // Regra 2 — a própria conta como mãe
  // -------------------------------------------------------------------------

  it('atualizarConta(id, { contaMaeId: id }) → recusada (BusinessRuleError) e a base fica igual', async () => {
    const conta = await contaA();
    const antes = await lerConta(conta.id);

    const erro = await capturarErro(() =>
      noCtx(() => contab.atualizarConta({ id: conta.id, contaMaeId: conta.id } as never, ctxA)),
    );

    expect(erro, 'a conta não pode ser mãe de si própria').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(await lerConta(conta.id)).toEqual(antes);
  });

  // -------------------------------------------------------------------------
  // Regra 3 — ciclos
  // -------------------------------------------------------------------------

  it('um FILHO escolhido como mãe → CONTA_MAE_CICLO e a base fica igual', async () => {
    const avo = await contaA();
    const filho = await contaA(avo.id);
    const antesAvo = await lerConta(avo.id);
    const antesFilho = await lerConta(filho.id);

    const erro = await capturarErro(() =>
      noCtx(() => contab.atualizarConta({ id: avo.id, contaMaeId: filho.id } as never, ctxA)),
    );

    expect(erro, 'escolher um filho como mãe cria um ciclo').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('CONTA_MAE_CICLO');
    expect(await lerConta(avo.id)).toEqual(antesAvo);
    expect(await lerConta(filho.id)).toEqual(antesFilho);
  });

  it('um NETO escolhido como mãe → CONTA_MAE_CICLO e a base fica igual', async () => {
    const avo = await contaA();
    const filho = await contaA(avo.id);
    const neto = await contaA(filho.id);
    const antesAvo = await lerConta(avo.id);

    const erro = await capturarErro(() =>
      noCtx(() => contab.atualizarConta({ id: avo.id, contaMaeId: neto.id } as never, ctxA)),
    );

    expect(erro, 'escolher um neto como mãe cria um ciclo').toBeDefined();
    expect(erro.name).toBe('BusinessRuleError');
    expect(erro.code).toBe('CONTA_MAE_CICLO');
    expect(await lerConta(avo.id)).toEqual(antesAvo);
  });

  // -------------------------------------------------------------------------
  // Guardas — o que tem de continuar a funcionar
  // -------------------------------------------------------------------------

  it('guarda: criarConta com mãe válida do mesmo tenant continua aceite', async () => {
    const mae = await contaA();
    const input = inputCriar(mae.id);

    const criada = await noCtx(() => contab.criarConta(input as never, ctxA));

    expect((await lerConta(criada.id)).contaMaeId).toBe(mae.id);
  });

  it('guarda: atualizarConta para uma mãe válida não descendente (irmã/tia) continua aceite', async () => {
    const raiz = await contaA();
    const conta = await contaA(raiz.id);
    const outra = await contaA(raiz.id);

    await noCtx(() => contab.atualizarConta({ id: conta.id, contaMaeId: outra.id } as never, ctxA));

    expect((await lerConta(conta.id)).contaMaeId).toBe(outra.id);
  });

  it('guarda: mover uma conta para debaixo de uma conta real do PGC do tenant continua aceite', async () => {
    const pgc = await db.contaPGC.findFirst({ where: { tenantId: TENANT_A, codigo: '71' } });
    expect(pgc, 'o bootstrap cria a conta 71').toBeTruthy();
    const conta = await contaA();

    await noCtx(() => contab.atualizarConta({ id: conta.id, contaMaeId: pgc.id } as never, ctxA));

    expect((await lerConta(conta.id)).contaMaeId).toBe(pgc.id);
  });

  it('guarda: omitir contaMaeId na actualização não mexe na mãe', async () => {
    const mae = await contaA();
    const conta = await contaA(mae.id);

    await noCtx(() => contab.atualizarConta({ id: conta.id, nome: 'Só o nome muda' } as never, ctxA));

    const depois = await lerConta(conta.id);
    expect(depois.nome).toBe('Só o nome muda');
    expect(depois.contaMaeId).toBe(mae.id);
  });

  it('contaMaeId: null tira a mãe à conta', async () => {
    const mae = await contaA();
    const conta = await contaA(mae.id);

    await noCtx(() => contab.atualizarConta({ id: conta.id, contaMaeId: null } as never, ctxA));

    expect((await lerConta(conta.id)).contaMaeId).toBeNull();
  });
});
