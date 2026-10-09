/**
 * Oráculo da issue #267 (nó D:pos-terminais-267) — escrito pelo verificador.
 * Alterar este ficheiro do lado de quem implementa é BLOCKER (doutrina 00 §2).
 *
 * Problema: não há terminal POS. `abrirSessao` (caixa.service.ts) só conhece o utilizador
 * (`SESSAO_JA_ABERTA` por `responsavelId`), `sessaoPOSService.abrir` recusa uma segunda SessaoPOS
 * do vendedor seja qual for o posto, e `fecharSessao` não verifica quem fecha.
 *
 * Contrato (decisão do orquestrador; opções conservadoras do verificador marcadas com «[C]»):
 *   Modelo
 *   - Há um modelo `TerminalPOS` por tenant: `{ id, tenantId, codigo, nome, ativo }`. [C] O
 *     terminal é FK escalar opcional em `SessaoCaixa.terminalId` (as sessões antigas ficam sem
 *     terminal; nenhuma é migrada). Aqui o terminal é criado por fixture directa — o oráculo não
 *     fixa o ecrã nem o serviço de gestão de terminais.
 *   Abertura do caixa — `caixa.abrirSessao({ fundoInicial, terminalId }, ctx)`
 *   - grava `terminalId` na SessaoCaixa;
 *   - o MESMO utilizador pode ter caixas ABERTAS em terminais diferentes ao mesmo tempo;
 *   - uma segunda abertura no mesmo terminal enquanto ele tem caixa ABERTA é recusada com
 *     BusinessRuleError('TERMINAL_COM_SESSAO_ABERTA') — seja o mesmo utilizador ou outro — e
 *     nada é escrito (nem sessão, nem movimento, nem número de série consumido);
 *   - a regra vale dentro da transacção, com tranca: duas aberturas concorrentes no mesmo
 *     terminal ⇒ exactamente uma passa e a outra é TERMINAL_COM_SESSAO_ABERTA (nunca um erro de
 *     base de dados cru);
 *   - depois de o caixa do terminal fechar, o terminal volta a abrir;
 *   - [C] terminal inactivo ⇒ BusinessRuleError('TERMINAL_INATIVO'); terminal de outro tenant ou
 *     inexistente ⇒ NotFoundError;
 *   - sem `terminalId` o comportamento antigo fica (um caixa sem terminal por utilizador,
 *     `SESSAO_JA_ABERTA`).
 *   Sessão POS — `sessaoPOSService.abrir({ sessaoCaixaId }, ctx)`
 *   - o mesmo vendedor pode ter uma SessaoPOS ABERTA por terminal, cada uma sobre o caixa desse
 *     terminal; a segunda no mesmo terminal continua `SESSAO_JA_ABERTA` (o /pos trata-o como
 *     «já está aberta»).
 *   Leitura por terminal
 *   - `caixa.obterSessaoAtual(ctx, { terminalId })` devolve o caixa ABERTO do utilizador NESSE
 *     terminal (ou null); `sessaoPOSService.obterAtual(ctx, { terminalId })` idem para a SessaoPOS.
 *   Fecho
 *   - fechar o caixa do terminal A fecha esse caixa e as SessaoPOS dele; o caixa e a SessaoPOS do
 *     terminal B ficam ABERTAS; fechar a SessaoPOS de A não toca na de B;
 *   - só quem abriu fecha: `fecharSessao` por outro utilizador ⇒
 *     BusinessRuleError('SESSAO_CAIXA_DE_OUTRO_UTILIZADOR') (o código que o `abrir` do POS já usa)
 *     e nada é escrito. [C] O fecho forçado por supervisor fica fora (decisão em aberto na issue):
 *     recusa-se. [C] O mesmo vale para `cancelarSessao`.
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`, `abrirSessao`/`fecharSessao`/
 * `cancelarSessao` do caixa, `sessaoPOSService`). Fixtures directas: o `User` e o `TerminalPOS`.
 * A sessão (auth) é fronteira e é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

type Ctx = { tenantId: string; userId: string };

describe.skipIf(skip)('#267 — vários terminais POS, cada um com o seu caixa (DB efémera, Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let caixa: any;
  let sessaoPOSService: any;
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-term-267-${sufixo}`;
  const OUTRO_TENANT = `tenant-pos-term-267-outro-${sufixo}`;
  let seq = 0;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function esperarRegra(erro: any, codigo: string) {
    expect(erro, `esperava BusinessRuleError ${codigo}, nada foi lançado`).toBeDefined();
    expect(erro, `esperava BusinessRuleError ${codigo}, veio ${erro?.constructor?.name}: ${erro?.message}`).toBeInstanceOf(
      BusinessRuleError,
    );
    expect(erro.code).toBe(codigo);
  }

  async function novoUtilizador(tenantId = TENANT): Promise<Ctx> {
    seq += 1;
    const userId = `cposterm267${sufixo}u${seq}`;
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `pos-term-267-${sufixo}-${seq}@test.mz`,
        nome: `Operador ${seq}`,
        keycloakSub: `kc-pos-term-267-${sufixo}-${seq}`,
      },
    });
    return { tenantId, userId };
  }

  /** Fixture: terminal POS do tenant (o oráculo não fixa o serviço de gestão de terminais). */
  async function novoTerminal(tenantId = TENANT, ativo = true): Promise<string> {
    seq += 1;
    expect(db.terminalPOS, 'modelo TerminalPOS inexistente no Prisma client').toBeDefined();
    const t = await db.terminalPOS.create({
      data: { tenantId, codigo: `T267-${sufixo}-${seq}`, nome: `Balcão ${seq}`, ativo },
    });
    return t.id as string;
  }

  async function abrirCaixa(ctx: Ctx, terminalId?: string, fundoInicial = 1000): Promise<any> {
    const input: any = terminalId === undefined ? { fundoInicial } : { fundoInicial, terminalId };
    return runCtx(ctx, () => caixa.abrirSessao(input, ctx));
  }

  async function abrirPOS(ctx: Ctx, sessaoCaixaId: string): Promise<string> {
    const s: any = await runCtx(ctx, () => sessaoPOSService.abrir({ sessaoCaixaId }, ctx));
    return s.id as string;
  }

  async function fechar(ctx: Ctx, sessaoCaixaId: string) {
    return runCtx(ctx, () => caixa.fecharSessao({ sessaoCaixaId, fundoFinal: 1000 }, ctx));
  }

  async function fotoCaixa(sessaoCaixaId: string) {
    const sc = await db.sessaoCaixa.findFirst({ where: { id: sessaoCaixaId } });
    return {
      status: sc.status,
      dataFechamento: sc.dataFechamento?.toISOString() ?? null,
      fundoFinal: sc.fundoFinal?.toString() ?? null,
      movimentos: await db.movimentoCaixa.count({ where: { sessaoCaixaId } }),
    };
  }

  async function sessaoPOS(id: string) {
    return db.sessaoPOS.findFirst({ where: { id } });
  }

  async function contagemDoTerminal(terminalId: string) {
    return {
      sessoes: await db.sessaoCaixa.count({ where: { terminalId } }),
      abertas: await db.sessaoCaixa.count({ where: { terminalId, status: 'ABERTA' } }),
    };
  }

  async function proximoNumeroSessaoCaixa(tenantId = TENANT) {
    const series = await db.serieDocumento.findMany({ where: { tenantId, tipo: 'SESSAO_CAIXA' } });
    return series.map((s: any) => `${s.id}:${s.proximoNumero}`).sort();
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    caixa = await import('@/server/services/financas/caixa.service');
    ({ sessaoPOSService } = await import('@/server/services/comercial'));
    ({ BusinessRuleError, NotFoundError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuitSufixo] of [
      [TENANT, `pos-term-267-${sufixo}`, '5'],
      [OUTRO_TENANT, `pos-term-267-outro-${sufixo}`, '6'],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant terminais 267 ${slug}`, slug, nuit: `${nuitSufixo}${String(sufixo).slice(-8)}` } });
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, id), { timeout: 60_000 });
    }
  });

  // -------------------------------------------------------------------------
  // Abertura do caixa por terminal
  // -------------------------------------------------------------------------

  it('o mesmo utilizador abre caixa em dois terminais ao mesmo tempo; cada sessão fica com o seu terminalId', async () => {
    const ctx = await novoUtilizador();
    const t1 = await novoTerminal();
    const t2 = await novoTerminal();

    const c1 = await abrirCaixa(ctx, t1);
    const c2 = await abrirCaixa(ctx, t2);

    expect(c1.id).not.toBe(c2.id);
    const s1 = await db.sessaoCaixa.findFirst({ where: { id: c1.id } });
    const s2 = await db.sessaoCaixa.findFirst({ where: { id: c2.id } });
    expect(s1.terminalId).toBe(t1);
    expect(s2.terminalId).toBe(t2);
    expect(s1.status).toBe('ABERTA');
    expect(s2.status).toBe('ABERTA');
    expect(s1.responsavelId).toBe(ctx.userId);
    expect(s2.responsavelId).toBe(ctx.userId);
    expect(s1.numero, 'cada caixa com o seu número de série').not.toBe(s2.numero);
  });

  it('dois utilizadores, dois terminais, dois caixas abertos em simultâneo', async () => {
    const a = await novoUtilizador();
    const b = await novoUtilizador();
    const t1 = await novoTerminal();
    const t2 = await novoTerminal();

    const ca = await abrirCaixa(a, t1);
    const cb = await abrirCaixa(b, t2);

    expect((await fotoCaixa(ca.id)).status).toBe('ABERTA');
    expect((await fotoCaixa(cb.id)).status).toBe('ABERTA');
    expect(await contagemDoTerminal(t1)).toEqual({ sessoes: 1, abertas: 1 });
    expect(await contagemDoTerminal(t2)).toEqual({ sessoes: 1, abertas: 1 });
  });

  it('segunda abertura no mesmo terminal pelo MESMO utilizador → TERMINAL_COM_SESSAO_ABERTA e nada é escrito', async () => {
    const ctx = await novoUtilizador();
    const t1 = await novoTerminal();
    await abrirCaixa(ctx, t1);
    const serieAntes = await proximoNumeroSessaoCaixa();

    const erro = await capturarErro(() => abrirCaixa(ctx, t1, 500));

    esperarRegra(erro, 'TERMINAL_COM_SESSAO_ABERTA');
    expect(await contagemDoTerminal(t1)).toEqual({ sessoes: 1, abertas: 1 });
    expect(await proximoNumeroSessaoCaixa(), 'número de série não consumido').toEqual(serieAntes);
  });

  it('segunda abertura no mesmo terminal por OUTRO utilizador → TERMINAL_COM_SESSAO_ABERTA e nada é escrito', async () => {
    const dono = await novoUtilizador();
    const outro = await novoUtilizador();
    const t1 = await novoTerminal();
    await abrirCaixa(dono, t1);
    const movimentosAntes = await db.movimentoCaixa.count({ where: { tenantId: TENANT, responsavelId: outro.userId } });

    const erro = await capturarErro(() => abrirCaixa(outro, t1, 500));

    esperarRegra(erro, 'TERMINAL_COM_SESSAO_ABERTA');
    expect(await contagemDoTerminal(t1)).toEqual({ sessoes: 1, abertas: 1 });
    expect(await db.sessaoCaixa.count({ where: { tenantId: TENANT, responsavelId: outro.userId } })).toBe(0);
    expect(await db.movimentoCaixa.count({ where: { tenantId: TENANT, responsavelId: outro.userId } })).toBe(movimentosAntes);
  });

  it('duas aberturas concorrentes no mesmo terminal → exactamente uma passa; a outra é TERMINAL_COM_SESSAO_ABERTA', async () => {
    const a = await novoUtilizador();
    const b = await novoUtilizador();
    const t1 = await novoTerminal();

    const resultados = await Promise.allSettled([abrirCaixa(a, t1), abrirCaixa(b, t1)]);

    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const recusas = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok, 'exactamente uma abertura passa').toHaveLength(1);
    expect(recusas).toHaveLength(1);
    esperarRegra(recusas[0].reason, 'TERMINAL_COM_SESSAO_ABERTA');
    expect(await contagemDoTerminal(t1)).toEqual({ sessoes: 1, abertas: 1 });
  });

  it('depois de o caixa do terminal fechar, o terminal volta a abrir (por outro utilizador, inclusive)', async () => {
    const dono = await novoUtilizador();
    const seguinte = await novoUtilizador();
    const t1 = await novoTerminal();
    const c1 = await abrirCaixa(dono, t1);
    await fechar(dono, c1.id);

    const c2 = await abrirCaixa(seguinte, t1, 300);

    const s2 = await db.sessaoCaixa.findFirst({ where: { id: c2.id } });
    expect(s2.status).toBe('ABERTA');
    expect(s2.terminalId).toBe(t1);
    expect(await contagemDoTerminal(t1)).toEqual({ sessoes: 2, abertas: 1 });
  });

  it('terminal inactivo → TERMINAL_INATIVO, sem sessão', async () => {
    const ctx = await novoUtilizador();
    const inativo = await novoTerminal(TENANT, false);

    esperarRegra(await capturarErro(() => abrirCaixa(ctx, inativo)), 'TERMINAL_INATIVO');
    expect(await contagemDoTerminal(inativo)).toEqual({ sessoes: 0, abertas: 0 });
  });

  it('terminal de outro tenant ou inexistente → NotFoundError, sem sessão', async () => {
    const ctx = await novoUtilizador();
    const alheio = await novoTerminal(OUTRO_TENANT);

    const e1 = await capturarErro(() => abrirCaixa(ctx, alheio));
    expect(e1, `esperava NotFoundError, veio ${e1?.constructor?.name}: ${e1?.message}`).toBeInstanceOf(NotFoundError);
    const e2 = await capturarErro(() => abrirCaixa(ctx, 'cterminalinexistente267xx'));
    expect(e2, `esperava NotFoundError, veio ${e2?.constructor?.name}: ${e2?.message}`).toBeInstanceOf(NotFoundError);

    expect(await contagemDoTerminal(alheio)).toEqual({ sessoes: 0, abertas: 0 });
    expect(await db.sessaoCaixa.count({ where: { tenantId: TENANT, responsavelId: ctx.userId } })).toBe(0);
  });

  it('sem terminal fica o comportamento antigo: segundo caixa sem terminal do mesmo utilizador → SESSAO_JA_ABERTA', async () => {
    const ctx = await novoUtilizador();
    await abrirCaixa(ctx);

    esperarRegra(await capturarErro(() => abrirCaixa(ctx)), 'SESSAO_JA_ABERTA');
    expect(await db.sessaoCaixa.count({ where: { tenantId: TENANT, responsavelId: ctx.userId } })).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Sessão POS por terminal
  // -------------------------------------------------------------------------

  it('o mesmo vendedor abre uma SessaoPOS em cada terminal, cada uma sobre o caixa desse terminal', async () => {
    const ctx = await novoUtilizador();
    const t1 = await novoTerminal();
    const t2 = await novoTerminal();
    const c1 = await abrirCaixa(ctx, t1);
    const c2 = await abrirCaixa(ctx, t2);

    const p1 = await abrirPOS(ctx, c1.id);
    const p2 = await abrirPOS(ctx, c2.id);

    const s1 = await sessaoPOS(p1);
    const s2 = await sessaoPOS(p2);
    expect(s1.status).toBe('ABERTA');
    expect(s2.status, 'abrir no terminal B não fecha a SessaoPOS do terminal A').toBe('ABERTA');
    expect((await sessaoPOS(p1)).status).toBe('ABERTA');
    expect(s1.sessaoCaixaId).toBe(c1.id);
    expect(s2.sessaoCaixaId).toBe(c2.id);
  });

  it('segunda SessaoPOS no mesmo terminal → SESSAO_JA_ABERTA, sem SessaoPOS nova', async () => {
    const ctx = await novoUtilizador();
    const t1 = await novoTerminal();
    const c1 = await abrirCaixa(ctx, t1);
    await abrirPOS(ctx, c1.id);

    esperarRegra(await capturarErro(() => abrirPOS(ctx, c1.id)), 'SESSAO_JA_ABERTA');
    expect(await db.sessaoPOS.count({ where: { tenantId: TENANT, sessaoCaixaId: c1.id } })).toBe(1);
  });

  it('obterSessaoAtual / obterAtual com { terminalId } devolvem o caixa e a SessaoPOS desse terminal', async () => {
    const ctx = await novoUtilizador();
    const t1 = await novoTerminal();
    const t2 = await novoTerminal();
    const t3 = await novoTerminal();
    const c1 = await abrirCaixa(ctx, t1);
    const c2 = await abrirCaixa(ctx, t2);
    const p1 = await abrirPOS(ctx, c1.id);
    const p2 = await abrirPOS(ctx, c2.id);

    const caixaT1: any = await runCtx(ctx, () => caixa.obterSessaoAtual(ctx, { terminalId: t1 }));
    const caixaT2: any = await runCtx(ctx, () => caixa.obterSessaoAtual(ctx, { terminalId: t2 }));
    const caixaT3: any = await runCtx(ctx, () => caixa.obterSessaoAtual(ctx, { terminalId: t3 }));
    expect(caixaT1?.id).toBe(c1.id);
    expect(caixaT2?.id).toBe(c2.id);
    expect(caixaT3, 'terminal sem caixa aberto').toBeNull();

    const posT1: any = await runCtx(ctx, () => sessaoPOSService.obterAtual(ctx, { terminalId: t1 }));
    const posT2: any = await runCtx(ctx, () => sessaoPOSService.obterAtual(ctx, { terminalId: t2 }));
    const posT3: any = await runCtx(ctx, () => sessaoPOSService.obterAtual(ctx, { terminalId: t3 }));
    expect(posT1?.id).toBe(p1);
    expect(posT2?.id).toBe(p2);
    expect(posT3).toBeNull();

    // O caixa do terminal pertence a quem o abriu: outro utilizador não o vê como «seu».
    const outro = await novoUtilizador();
    expect(await runCtx(outro, () => caixa.obterSessaoAtual(outro, { terminalId: t1 }))).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Fecho: o do terminal certo, e só por quem abriu
  // -------------------------------------------------------------------------

  it('fechar o caixa do terminal A fecha A e a SessaoPOS de A; o caixa e a SessaoPOS de B ficam ABERTAS', async () => {
    const ctx = await novoUtilizador();
    const tA = await novoTerminal();
    const tB = await novoTerminal();
    const cA = await abrirCaixa(ctx, tA);
    const cB = await abrirCaixa(ctx, tB);
    const pA = await abrirPOS(ctx, cA.id);
    const pB = await abrirPOS(ctx, cB.id);
    const caixaBAntes = await fotoCaixa(cB.id);

    await fechar(ctx, cA.id);

    expect((await fotoCaixa(cA.id)).status).toBe('FECHADA');
    expect((await sessaoPOS(pA)).status).toBe('FECHADA');
    expect(await fotoCaixa(cB.id), 'caixa do terminal B intacto').toEqual(caixaBAntes);
    expect((await sessaoPOS(pB)).status).toBe('ABERTA');
    expect(await contagemDoTerminal(tB)).toEqual({ sessoes: 1, abertas: 1 });
  });

  it('fechar a SessaoPOS do terminal A não toca na SessaoPOS nem no caixa do terminal B', async () => {
    const ctx = await novoUtilizador();
    const tA = await novoTerminal();
    const tB = await novoTerminal();
    const cA = await abrirCaixa(ctx, tA);
    const cB = await abrirCaixa(ctx, tB);
    const pA = await abrirPOS(ctx, cA.id);
    const pB = await abrirPOS(ctx, cB.id);

    await runCtx(ctx, () => sessaoPOSService.fechar({ sessaoPOSId: pA }, ctx));

    expect((await sessaoPOS(pA)).status).toBe('FECHADA');
    expect((await sessaoPOS(pB)).status).toBe('ABERTA');
    expect((await fotoCaixa(cA.id)).status, 'fechar a SessaoPOS não fecha o caixa').toBe('ABERTA');
    expect((await fotoCaixa(cB.id)).status).toBe('ABERTA');
  });

  it('fecho do caixa por OUTRO utilizador → SESSAO_CAIXA_DE_OUTRO_UTILIZADOR e nada é escrito (caixa e SessaoPOS)', async () => {
    const dono = await novoUtilizador();
    const intruso = await novoUtilizador();
    const t1 = await novoTerminal();
    const c1 = await abrirCaixa(dono, t1);
    const p1 = await abrirPOS(dono, c1.id);
    const antes = await fotoCaixa(c1.id);

    esperarRegra(await capturarErro(() => fechar(intruso, c1.id)), 'SESSAO_CAIXA_DE_OUTRO_UTILIZADOR');

    expect(await fotoCaixa(c1.id)).toEqual(antes);
    expect(antes.status).toBe('ABERTA');
    expect((await sessaoPOS(p1)).status, 'a SessaoPOS do dono não fecha').toBe('ABERTA');
    expect(await db.movimentoCaixa.count({ where: { sessaoCaixaId: c1.id, tipo: 'FECHAMENTO' } })).toBe(0);

    // E o dono fecha normalmente a seguir.
    await fechar(dono, c1.id);
    expect((await fotoCaixa(c1.id)).status).toBe('FECHADA');
  });

  it('fecho por outro utilizador é recusado também num caixa sem terminal (a regra é do caixa, não do terminal)', async () => {
    const dono = await novoUtilizador();
    const intruso = await novoUtilizador();
    const c = await abrirCaixa(dono);
    const antes = await fotoCaixa(c.id);

    esperarRegra(await capturarErro(() => fechar(intruso, c.id)), 'SESSAO_CAIXA_DE_OUTRO_UTILIZADOR');
    expect(await fotoCaixa(c.id)).toEqual(antes);
  });

  it('cancelar o caixa de outro utilizador → SESSAO_CAIXA_DE_OUTRO_UTILIZADOR e nada é escrito', async () => {
    const dono = await novoUtilizador();
    const intruso = await novoUtilizador();
    const t1 = await novoTerminal();
    const c1 = await abrirCaixa(dono, t1);
    const antes = await fotoCaixa(c1.id);

    esperarRegra(
      await capturarErro(() => runCtx(intruso, () => caixa.cancelarSessao(c1.id, 'Aberto por engano', intruso))),
      'SESSAO_CAIXA_DE_OUTRO_UTILIZADOR',
    );
    expect(await fotoCaixa(c1.id)).toEqual(antes);
    expect(await contagemDoTerminal(t1)).toEqual({ sessoes: 1, abertas: 1 });
  });
});
