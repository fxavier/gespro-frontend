/**
 * Oráculo da issue #270 (nó C:caixa-sessoes-pos-orfas-270) — escrito pelo verificador.
 * Alterar este ficheiro do lado de quem implementa é BLOCKER (doutrina 00 §2).
 *
 * Problema: `fecharSessao` e `cancelarSessao` (caixa.service.ts) mudavam o estado da SessaoCaixa e
 * deixavam as SessaoPOS desse caixa em ABERTA/SUSPENSA (órfãs). O /pos mostrava o terminal e cada
 * venda falhava com SESSAO_CAIXA_FECHADA.
 *
 * Contrato (decisão conservadora do orquestrador — recusar > fechar às cegas):
 *   - fechar OU cancelar a sessão de caixa fecha, NA MESMA TRANSACÇÃO, todas as SessaoPOS ABERTA e
 *     SUSPENSA que apontam para ela (`sessaoCaixaId`), seja qual for o vendedor: status FECHADA e
 *     `fechadoEm` preenchido. Depois disso nenhuma SessaoPOS ABERTA/SUSPENSA fica sobre esse caixa.
 *   - se alguma dessas SessaoPOS tiver vendas PENDENTE, a operação inteira é RECUSADA com
 *     BusinessRuleError('SESSAO_COM_VENDAS_PENDENTES') e mensagem que fala das vendas pendentes —
 *     o mesmo código do `sessaoPOSService.fechar` — e NADA é escrito: o caixa continua ABERTA, sem
 *     movimento FECHAMENTO, e nenhuma SessaoPOS muda (nem as que não tinham pendentes).
 *   - SessaoPOS já FECHADA não é reescrita (o `fechadoEm` original fica); SessaoPOS de outros caixas
 *     e de outros tenants ficam como estavam, e as vendas PENDENTE delas não bloqueiam este caixa.
 *
 * O tenant é montado pelos serviços reais (`bootstrapContabilidade`, `abrirSessao` do caixa,
 * `sessaoPOSService.abrir/suspender/fechar`). Fixtures directas, cada uma justificada:
 *   - a Venda PENDENTE (o número sai da série VENDA pelo `proximoNumeroSerie` real, nunca inventado);
 *   - uma SessaoPOS «legada» de outro vendedor sobre o caixa (estado que existe na base anterior à
 *     validação SESSAO_CAIXA_DE_OUTRO_UTILIZADOR do `abrir`).
 * A sessão (auth) é fronteira e é o único duplo.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

type Ctx = { tenantId: string; userId: string };

describe.skipIf(skip)('#270 — fechar/cancelar o caixa não deixa SessaoPOS órfãs (DB efémera, Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let sessaoPOSService: (typeof import('@/server/services/comercial'))['sessaoPOSService'];
  let proximoNumeroSerie: (typeof import('@/server/services/financas/faturacao.service'))['proximoNumeroSerie'];
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];

  const sufixo = Date.now();
  const TENANT = `tenant-cx-pos-270-${sufixo}`;
  const OUTRO_TENANT = `tenant-cx-pos-270-outro-${sufixo}`;
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
    const userId = `ccxpos270${sufixo}u${seq}`;
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `cx-pos-270-${sufixo}-${seq}@test.mz`,
        nome: `Operador ${seq}`,
        keycloakSub: `kc-cx-pos-270-${sufixo}-${seq}`,
      },
    });
    return { tenantId, userId };
  }

  /** Utilizador novo com a sua caixa aberta pelo serviço real. */
  async function comCaixa(tenantId = TENANT): Promise<{ ctx: Ctx; sessaoCaixaId: string }> {
    const ctx = await novoUtilizador(tenantId);
    const sc: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    return { ctx, sessaoCaixaId: sc.id };
  }

  async function abrirPOS(ctx: Ctx, sessaoCaixaId: string): Promise<string> {
    const s: any = await runCtx(ctx, () => sessaoPOSService.abrir({ sessaoCaixaId }, ctx));
    return s.id as string;
  }

  /** Venda POS PENDENTE na sessão POS — número pela série VENDA real. */
  async function vendaPendente(ctx: Ctx, sessaoPOSId: string, sessaoCaixaId: string): Promise<string> {
    const v: any = await runCtx(ctx, () =>
      db.$transaction(async (tx: any) => {
        const numero = await proximoNumeroSerie(tx, 'VENDA' as any, ctx, new Date());
        return tx.venda.create({
          data: {
            tenantId: ctx.tenantId,
            numero,
            origem: 'POS',
            status: 'PENDENTE',
            vendedorId: ctx.userId,
            sessaoPOSId,
            sessaoCaixaId,
            subtotal: new Prisma.Decimal('100'),
            ivaTotal: new Prisma.Decimal('16'),
            total: new Prisma.Decimal('116'),
          },
        });
      }),
    );
    return v.id as string;
  }

  async function sessaoPOS(id: string) {
    return db.sessaoPOS.findFirst({ where: { id } });
  }

  async function fotoCaixa(sessaoCaixaId: string) {
    const sc = await db.sessaoCaixa.findFirst({ where: { id: sessaoCaixaId } });
    return {
      status: sc.status,
      dataFechamento: sc.dataFechamento,
      fechamentos: await db.movimentoCaixa.count({ where: { sessaoCaixaId, tipo: 'FECHAMENTO' } }),
    };
  }

  async function fotoPOS(ids: string[]) {
    const rows = await db.sessaoPOS.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
    return rows.map((r: any) => `${r.id}:${r.status}:${r.fechadoEm?.toISOString() ?? '-'}`);
  }

  async function orfasSobre(sessaoCaixaId: string) {
    return db.sessaoPOS.count({ where: { sessaoCaixaId, status: { in: ['ABERTA', 'SUSPENSA'] } } });
  }

  async function fechar(ctx: Ctx, sessaoCaixaId: string) {
    return runCtx(ctx, () => (caixa as any).fecharSessao({ sessaoCaixaId, fundoFinal: 1000 }, ctx));
  }

  async function cancelar(ctx: Ctx, sessaoCaixaId: string) {
    return runCtx(ctx, () => (caixa as any).cancelarSessao(sessaoCaixaId, 'Aberto por engano', ctx));
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    caixa = await import('@/server/services/financas/caixa.service');
    ({ sessaoPOSService } = await import('@/server/services/comercial'));
    ({ proximoNumeroSerie } = await import('@/server/services/financas/faturacao.service'));
    ({ BusinessRuleError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, slug, nuitSufixo] of [
      [TENANT, `cx-pos-270-${sufixo}`, '3'],
      [OUTRO_TENANT, `cx-pos-270-outro-${sufixo}`, '4'],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant caixa/POS 270 ${slug}`, slug, nuit: `${nuitSufixo}${String(sufixo).slice(-8)}` } });
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, id), { timeout: 60_000 });
    }
  });

  // -------------------------------------------------------------------------
  // Fecho
  // -------------------------------------------------------------------------

  it('fechar o caixa com uma SessaoPOS ABERTA → caixa FECHADA e a SessaoPOS FECHADA com fechadoEm', async () => {
    const { ctx, sessaoCaixaId } = await comCaixa();
    const posId = await abrirPOS(ctx, sessaoCaixaId);
    expect((await sessaoPOS(posId)).status, 'pré-condição').toBe('ABERTA');

    await fechar(ctx, sessaoCaixaId);

    expect((await fotoCaixa(sessaoCaixaId)).status).toBe('FECHADA');
    const pos = await sessaoPOS(posId);
    expect(pos.status).toBe('FECHADA');
    expect(pos.fechadoEm).not.toBeNull();
    expect(await orfasSobre(sessaoCaixaId)).toBe(0);
  });

  it('fechar o caixa com uma SessaoPOS SUSPENSA → a SessaoPOS fica FECHADA', async () => {
    const { ctx, sessaoCaixaId } = await comCaixa();
    const posId = await abrirPOS(ctx, sessaoCaixaId);
    await runCtx(ctx, () => sessaoPOSService.suspender(posId, ctx));
    expect((await sessaoPOS(posId)).status, 'pré-condição').toBe('SUSPENSA');

    await fechar(ctx, sessaoCaixaId);

    const pos = await sessaoPOS(posId);
    expect(pos.status).toBe('FECHADA');
    expect(pos.fechadoEm).not.toBeNull();
    expect(await orfasSobre(sessaoCaixaId)).toBe(0);
  });

  it('fecha TODAS as SessaoPOS do caixa (também a legada de outro vendedor), não reescreve a já FECHADA e não toca noutros caixas nem noutro tenant', async () => {
    const { ctx, sessaoCaixaId } = await comCaixa();

    // P1: aberta e fechada pelo vendedor antes do fecho do caixa — fechadoEm original tem de ficar.
    const p1 = await abrirPOS(ctx, sessaoCaixaId);
    await runCtx(ctx, () => sessaoPOSService.fechar({ sessaoPOSId: p1 } as any, ctx));
    const p1Antes = await sessaoPOS(p1);
    expect(p1Antes.status, 'pré-condição').toBe('FECHADA');
    // P2: a sessão POS corrente do dono do caixa.
    const p2 = await abrirPOS(ctx, sessaoCaixaId);
    // P3: legada, de outro vendedor, sobre este caixa (fixture — ver cabeçalho).
    const outroVendedor = await novoUtilizador();
    const p3 = (
      await db.sessaoPOS.create({
        data: { tenantId: TENANT, vendedorId: outroVendedor.userId, sessaoCaixaId, status: 'ABERTA', abertoEm: new Date() },
      })
    ).id as string;

    // Vizinho do mesmo tenant: outro caixa com SessaoPOS ABERTA e uma venda PENDENTE.
    const vizinho = await comCaixa();
    const pVizinho = await abrirPOS(vizinho.ctx, vizinho.sessaoCaixaId);
    await vendaPendente(vizinho.ctx, pVizinho, vizinho.sessaoCaixaId);
    // Outro tenant: caixa com SessaoPOS ABERTA.
    const estrangeiro = await comCaixa(OUTRO_TENANT);
    const pEstrangeiro = await abrirPOS(estrangeiro.ctx, estrangeiro.sessaoCaixaId);
    const alheiasAntes = await fotoPOS([pVizinho, pEstrangeiro]);

    await fechar(ctx, sessaoCaixaId);

    expect((await fotoCaixa(sessaoCaixaId)).status).toBe('FECHADA');
    expect(await orfasSobre(sessaoCaixaId)).toBe(0);
    for (const id of [p2, p3]) {
      const s = await sessaoPOS(id);
      expect(s.status, `SessaoPOS ${id}`).toBe('FECHADA');
      expect(s.fechadoEm, `SessaoPOS ${id}`).not.toBeNull();
    }
    const p1Depois = await sessaoPOS(p1);
    expect(p1Depois.status).toBe('FECHADA');
    expect(p1Depois.fechadoEm?.toISOString(), 'a SessaoPOS já FECHADA não é reescrita').toBe(p1Antes.fechadoEm?.toISOString());

    expect(await fotoPOS([pVizinho, pEstrangeiro]), 'SessaoPOS de outros caixas/tenants intactas').toEqual(alheiasAntes);
    expect((await fotoCaixa(vizinho.sessaoCaixaId)).status).toBe('ABERTA');
    expect((await fotoCaixa(estrangeiro.sessaoCaixaId)).status).toBe('ABERTA');
  });

  it('fechar o caixa com uma venda PENDENTE numa SessaoPOS dele → SESSAO_COM_VENDAS_PENDENTES e nada é escrito', async () => {
    const { ctx, sessaoCaixaId } = await comCaixa();
    // Sessão limpa (legada, outro vendedor) + sessão com venda pendente: nenhuma das duas pode mudar.
    const outroVendedor = await novoUtilizador();
    const limpa = (
      await db.sessaoPOS.create({
        data: { tenantId: TENANT, vendedorId: outroVendedor.userId, sessaoCaixaId, status: 'ABERTA', abertoEm: new Date() },
      })
    ).id as string;
    const comPendente = await abrirPOS(ctx, sessaoCaixaId);
    await vendaPendente(ctx, comPendente, sessaoCaixaId);

    const caixaAntes = await fotoCaixa(sessaoCaixaId);
    const posAntes = await fotoPOS([limpa, comPendente]);

    const erro = await capturarErro(() => fechar(ctx, sessaoCaixaId));

    esperarRegra(erro, 'SESSAO_COM_VENDAS_PENDENTES');
    expect(String(erro.message)).toMatch(/pendente/i);
    expect(await fotoCaixa(sessaoCaixaId)).toEqual(caixaAntes);
    expect(caixaAntes.status).toBe('ABERTA');
    expect(caixaAntes.fechamentos).toBe(0);
    expect(await fotoPOS([limpa, comPendente]), 'nenhuma SessaoPOS muda (atomicidade)').toEqual(posAntes);
  });

  it('venda PENDENTE numa SessaoPOS SUSPENSA do caixa também recusa o fecho', async () => {
    const { ctx, sessaoCaixaId } = await comCaixa();
    const posId = await abrirPOS(ctx, sessaoCaixaId);
    await vendaPendente(ctx, posId, sessaoCaixaId);
    await runCtx(ctx, () => sessaoPOSService.suspender(posId, ctx));
    const caixaAntes = await fotoCaixa(sessaoCaixaId);

    esperarRegra(await capturarErro(() => fechar(ctx, sessaoCaixaId)), 'SESSAO_COM_VENDAS_PENDENTES');

    expect(await fotoCaixa(sessaoCaixaId)).toEqual(caixaAntes);
    expect((await sessaoPOS(posId)).status).toBe('SUSPENSA');
  });

  // -------------------------------------------------------------------------
  // Cancelamento
  // -------------------------------------------------------------------------

  it('cancelar o caixa com SessaoPOS ABERTA e SUSPENSA → caixa CANCELADA e as duas FECHADA', async () => {
    const { ctx, sessaoCaixaId } = await comCaixa();
    const aberta = await abrirPOS(ctx, sessaoCaixaId);
    const outroVendedor = await novoUtilizador();
    const suspensa = (
      await db.sessaoPOS.create({
        data: { tenantId: TENANT, vendedorId: outroVendedor.userId, sessaoCaixaId, status: 'SUSPENSA', abertoEm: new Date() },
      })
    ).id as string;

    await cancelar(ctx, sessaoCaixaId);

    expect((await fotoCaixa(sessaoCaixaId)).status).toBe('CANCELADA');
    for (const id of [aberta, suspensa]) {
      const s = await sessaoPOS(id);
      expect(s.status, `SessaoPOS ${id}`).toBe('FECHADA');
      expect(s.fechadoEm, `SessaoPOS ${id}`).not.toBeNull();
    }
    expect(await orfasSobre(sessaoCaixaId)).toBe(0);
  });

  it('cancelar o caixa com uma venda PENDENTE numa SessaoPOS dele → SESSAO_COM_VENDAS_PENDENTES e nada é escrito', async () => {
    const { ctx, sessaoCaixaId } = await comCaixa();
    const posId = await abrirPOS(ctx, sessaoCaixaId);
    await vendaPendente(ctx, posId, sessaoCaixaId);
    const caixaAntes = await fotoCaixa(sessaoCaixaId);
    const posAntes = await fotoPOS([posId]);

    const erro = await capturarErro(() => cancelar(ctx, sessaoCaixaId));

    esperarRegra(erro, 'SESSAO_COM_VENDAS_PENDENTES');
    expect(String(erro.message)).toMatch(/pendente/i);
    expect(await fotoCaixa(sessaoCaixaId)).toEqual(caixaAntes);
    expect(caixaAntes.status).toBe('ABERTA');
    expect(await fotoPOS([posId])).toEqual(posAntes);
  });

  it('depois do fecho, o vendedor abre caixa e sessão POS novas sem SESSAO_JA_ABERTA', async () => {
    const { ctx, sessaoCaixaId } = await comCaixa();
    const antiga = await abrirPOS(ctx, sessaoCaixaId);
    await fechar(ctx, sessaoCaixaId);
    // Sem a ajuda do `abrir` (que fecha órfãs): a antiga já tem de estar FECHADA na base.
    expect((await sessaoPOS(antiga)).status).toBe('FECHADA');

    const nova: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial: 500 }, ctx));
    const novaPOS = await abrirPOS(ctx, nova.id);
    expect((await sessaoPOS(novaPOS)).status).toBe('ABERTA');
  });
});
