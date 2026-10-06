/**
 * Oráculo P2 — a natureza da nota de débito escolhe a conta de crédito (ADR-0039 §1; issue #85)
 *
 * Contra Postgres real (Testcontainers), tenant montado pelos serviços reais
 * (`bootstrapContabilidade`, `emitirFatura`, `definirContaNaturezaNotaDebito`):
 *   (S) `EmitirNotaDebitoSchema` ganha `natureza` (omissão ACERTO_PRECO) e `contaCreditoId`
 *       opcional por `idEntidade()` (aceita o uuid de uma conta PGC real).
 *   (C) `emitirNotaDebito`: conta de crédito = `contaCreditoId` (validada: do tenant — senão
 *       NotFoundError —, activa, de movimento, da classe que a natureza admite — senão
 *       CONTA_NATUREZA_INVALIDA) ?? omissão do tenant para a natureza; nenhuma →
 *       CONTA_CREDITO_OBRIGATORIA. Em qualquer erro nada fica gravado (sem ND, sem lançamento,
 *       série por avançar).
 *   (P) a ND grava `natureza` e `contaCreditoId` (sempre o id resolvido).
 *   (L) lançamento: D 411 total / C <conta> subtotal / C 44331 IVA se > 0, equilibrado.
 *   (F) `faturaReferenciaId`: de outro tenant ou inexistente → NotFoundError; de outro cliente →
 *       FATURA_DE_OUTRO_CLIENTE; RASCUNHO/CANCELADA → FATURA_NAO_REFERENCIAVEL; válida → gravada.
 *
 * Não há serviço que ponha uma factura em RASCUNHO ou CANCELADA: esses dois estados montam-se
 * com um UPDATE directo sobre uma factura emitida pelo serviço (fixture, não produto).
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const dec = (v: unknown) => new Prisma.Decimal(String(v));

type Partida = { codigo: string; tipo: string; valor: Prisma.Decimal };

describe.skipIf(skip)('Nota de débito — natureza e conta de crédito no lançamento — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: typeof import('@/server/services/financas/faturacao.service');
  let val: typeof import('@/lib/validations/faturacao');
  let nat: typeof import('@/server/services/financas/natureza-nota-debito.service');
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-nd-nat-${sufixo}`;
  const TENANT_B = `tenant-nd-nat-b-${sufixo}`;
  const USER = `user-nd-nat-${sufixo}`;
  const USER_B = `user-nd-nat-b-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxB = { tenantId: TENANT_B, userId: USER_B };
  const noCtx = <T>(c: typeof ctx, fn: () => Promise<T>) => runCtx(c, fn);

  let clienteId: string;
  let outroClienteId: string;
  let faturaId: string; // EMITIDA, do clienteId
  let faturaOutroClienteId: string;
  let faturaRascunhoId: string;
  let faturaCanceladaId: string;
  let faturaOutroTenantId: string;

  // ── helpers ────────────────────────────────────────────────────────────────
  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  async function conta(tenantId: string, codigo: string): Promise<{ id: string; codigo: string }> {
    const c = await db.contaPGC.findFirst({ where: { tenantId, codigo } });
    expect(c, `ContaPGC ${codigo} no tenant ${tenantId}`).not.toBeNull();
    return c;
  }

  async function criarCliente(tenantId: string, rotulo: string): Promise<string> {
    const c = await db.cliente.create({
      data: {
        tenantId,
        nome: `Cliente ND ${rotulo}`,
        tipo: 'JURIDICA',
        nuit: `4000000${{ a: '01', b: '02', c: '03' }[rotulo]}`,
        email: `cliente-nd-${rotulo}-${sufixo}@test.mz`,
        telefone: '840000000',
        codigo: `CLI-ND-${rotulo}-${sufixo}`,
      },
    });
    return c.id;
  }

  async function emitirFatura(c: typeof ctx, cliente: string): Promise<string> {
    const hoje = new Date();
    const input = val.EmitirFaturaSchema.parse({
      clienteId: cliente,
      dataEmissao: hoje,
      dataVencimento: new Date(hoje.getTime() + 30 * 86_400_000),
      linhas: [{ descricao: 'Mercadoria', quantidade: 2, precoUnitario: 500, taxaIva: 0.16 }],
    });
    const f = await noCtx(c, () => fat.emitirFatura(input, c));
    return f.id;
  }

  /** ND de 1 × 1000; `taxaIva` 0.16 → total 1160, 0 → total 1000. */
  function inputND(extra: Record<string, unknown> = {}, taxaIva = 0.16) {
    return val.EmitirNotaDebitoSchema.parse({
      clienteId,
      motivo: 'Débito adicional',
      dataEmissao: new Date(),
      linhas: [
        // motivoIsencao: inofensivo hoje (o schema descarta-o) e exigido quando o #329 ligar a regra.
        { descricao: 'Débito', quantidade: 1, precoUnitario: 1000, taxaIva, motivoIsencao: taxaIva === 0 ? 'Não sujeito' : undefined },
      ],
      ...extra,
    });
  }

  const emitirND = (extra: Record<string, unknown> = {}, taxaIva = 0.16) =>
    noCtx(ctx, () => fat.emitirNotaDebito(inputND(extra, taxaIva) as any, ctx));

  async function partidasDe(lancamentoId: string): Promise<Partida[]> {
    const ps = await db.partidaLancamento.findMany({
      where: { lancamentoId, tenantId: TENANT },
      include: { conta: { select: { codigo: true } } },
    });
    return ps.map((p: any) => ({ codigo: p.conta.codigo, tipo: p.tipo, valor: dec(p.valor) }));
  }

  const chave = (p: Partida) => `${p.tipo}|${p.codigo}|${p.valor.toFixed(2)}`;

  /** Emite, relê a ND gravada e devolve-a com as partidas do lançamento dela. */
  async function emitirEVerificar(extra: Record<string, unknown>, taxaIva = 0.16) {
    const r: any = await emitirND(extra, taxaIva);
    const nd = await db.notaDebito.findFirst({ where: { id: r.id, tenantId: TENANT } });
    expect(nd, 'ND gravada').not.toBeNull();
    expect(nd.status).toBe('EMITIDA');
    expect(nd.lancamentoId, 'NotaDebito.lancamentoId').toBeTruthy();
    const partidas = await partidasDe(nd.lancamentoId);
    const deb = partidas.filter((p) => p.tipo === 'DEBITO').reduce((a, p) => a.plus(p.valor), dec(0));
    const cred = partidas.filter((p) => p.tipo === 'CREDITO').reduce((a, p) => a.plus(p.valor), dec(0));
    expect(deb.equals(cred), `lançamento equilibrado: D ${deb} / C ${cred}`).toBe(true);
    return { nd, partidas };
  }

  async function esperarPartidas(partidas: Partida[], esperadas: Array<[string, string, string]>) {
    expect(partidas.map(chave).sort()).toEqual(
      esperadas.map(([tipo, codigo, valor]) => chave({ tipo, codigo, valor: dec(valor) })).sort(),
    );
  }

  async function estado() {
    const series = await db.serieDocumento.findMany({ where: { tenantId: TENANT, tipo: 'NOTA_DEBITO' } });
    return {
      nds: await db.notaDebito.count({ where: { tenantId: TENANT } }),
      lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
      serie: series.map((s: any) => `${s.id}:${s.proximoNumero}`).sort().join(','),
    };
  }

  /** Corre `fn`, exige que lance, e que não tenha deixado nada gravado. */
  async function recusaSemRasto(fn: () => Promise<unknown>): Promise<any> {
    const antes = await estado();
    const erro = await capturarErro(fn);
    expect(erro, 'a emissão tinha de ser recusada').toBeDefined();
    expect(await estado(), 'nada gravado: sem ND, sem lançamento, série por avançar').toEqual(antes);
    return erro;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    nat = await import('@/server/services/financas/natureza-nota-debito.service');
    ({ NotFoundError } = await import('@/lib/errors'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    for (const [id, user, n] of [
      [TENANT, USER, 0],
      [TENANT_B, USER_B, 1],
    ] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant ND nat ${n}`, slug: `nd-nat-${n}-${sufixo}`, nuit: `${sufixo + n}`.slice(-9) },
      });
      await db.user.create({
        data: { id: user, tenantId: id, email: `nd-nat-${n}-${sufixo}@test.mz`, nome: 'Utilizador ND', keycloakSub: `kc-nd-nat-${n}-${sufixo}` },
      });
      await db.$transaction((tx: any) => bootstrapContabilidade(tx, id), { timeout: 60_000 });
    }

    clienteId = await criarCliente(TENANT, 'a');
    outroClienteId = await criarCliente(TENANT, 'b');
    const clienteB = await criarCliente(TENANT_B, 'c');

    faturaId = await emitirFatura(ctx, clienteId);
    faturaOutroClienteId = await emitirFatura(ctx, outroClienteId);
    faturaRascunhoId = await emitirFatura(ctx, clienteId);
    faturaCanceladaId = await emitirFatura(ctx, clienteId);
    faturaOutroTenantId = await emitirFatura(ctxB, clienteB);
    await db.fatura.update({ where: { id: faturaRascunhoId }, data: { status: 'RASCUNHO' } });
    await db.fatura.update({ where: { id: faturaCanceladaId }, data: { status: 'CANCELADA' } });
  });

  // -------------------------------------------------------------------------
  // (S) schema
  // -------------------------------------------------------------------------

  it('(S) EmitirNotaDebitoSchema: natureza por omissão ACERTO_PRECO, guarda a escolhida, recusa desconhecida; contaCreditoId aceita uuid de conta PGC', async () => {
    const base = {
      clienteId: 'cliente-x',
      motivo: 'm',
      dataEmissao: new Date(),
      linhas: [{ descricao: 'd', quantidade: 1, precoUnitario: 10, taxaIva: 0.16 }],
    };
    const S = val.EmitirNotaDebitoSchema;
    expect((S.parse(base) as any).natureza).toBe('ACERTO_PRECO');
    for (const n of ['ACERTO_PRECO', 'JUROS_MORA', 'DESPESAS_REPERCUTIDAS', 'PENALIZACAO', 'OUTRO']) {
      expect((S.parse({ ...base, natureza: n }) as any).natureza, n).toBe(n);
    }
    expect(S.safeParse({ ...base, natureza: 'DESCONHECIDA' }).success).toBe(false);

    const c781 = await conta(TENANT, '781'); // uuid (bootstrap) — um .cuid() rejeitava-o
    const comConta: any = S.parse({ ...base, natureza: 'JUROS_MORA', contaCreditoId: c781.id });
    expect(comConta.contaCreditoId).toBe(c781.id);
    expect((S.parse(base) as any).contaCreditoId).toBeUndefined();
    expect(S.safeParse({ ...base, contaCreditoId: '' }).success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (C)(P)(L) resolução da conta e lançamento
  // -------------------------------------------------------------------------

  it('sem natureza → ACERTO_PRECO: D 411 1160 / C 711 1000 / C 44331 160; grava natureza e contaCreditoId = 711', async () => {
    const { nd, partidas } = await emitirEVerificar({});
    expect(nd.natureza).toBe('ACERTO_PRECO');
    expect(nd.contaCreditoId).toBe((await conta(TENANT, '711')).id);
    await esperarPartidas(partidas, [
      ['DEBITO', '411', '1160'],
      ['CREDITO', '711', '1000'],
      ['CREDITO', '44331', '160'],
    ]);
  });

  it('JUROS_MORA sem IVA → D 411 1000 / C 781 1000, sem 44331; grava natureza e contaCreditoId = 781', async () => {
    const { nd, partidas } = await emitirEVerificar({ natureza: 'JUROS_MORA' }, 0);
    expect(nd.natureza).toBe('JUROS_MORA');
    expect(nd.contaCreditoId).toBe((await conta(TENANT, '781')).id);
    await esperarPartidas(partidas, [
      ['DEBITO', '411', '1000'],
      ['CREDITO', '781', '1000'],
    ]);
  });

  it('PENALIZACAO → C 769 (omissão do bootstrap)', async () => {
    const { nd, partidas } = await emitirEVerificar({ natureza: 'PENALIZACAO' });
    expect(nd.natureza).toBe('PENALIZACAO');
    expect(nd.contaCreditoId).toBe((await conta(TENANT, '769')).id);
    await esperarPartidas(partidas, [
      ['DEBITO', '411', '1160'],
      ['CREDITO', '769', '1000'],
      ['CREDITO', '44331', '160'],
    ]);
  });

  it('a omissão do tenant mudada por definirContaNaturezaNotaDebito é honrada (JUROS_MORA → 7819)', async () => {
    const c7819 = await conta(TENANT, '7819');
    await noCtx(ctx, () => nat.definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: c7819.id }, ctx));
    try {
      const { nd, partidas } = await emitirEVerificar({ natureza: 'JUROS_MORA' });
      expect(nd.contaCreditoId).toBe(c7819.id);
      await esperarPartidas(partidas, [
        ['DEBITO', '411', '1160'],
        ['CREDITO', '7819', '1000'],
        ['CREDITO', '44331', '160'],
      ]);
    } finally {
      await noCtx(ctx, async () =>
        nat.definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: (await conta(TENANT, '781')).id }, ctx),
      );
    }
  });

  it('contaCreditoId explícito sobrepõe-se à omissão (JUROS_MORA com 785, omissão 781)', async () => {
    const c785 = await conta(TENANT, '785');
    const { nd, partidas } = await emitirEVerificar({ natureza: 'JUROS_MORA', contaCreditoId: c785.id });
    expect(nd.natureza).toBe('JUROS_MORA');
    expect(nd.contaCreditoId).toBe(c785.id);
    await esperarPartidas(partidas, [
      ['DEBITO', '411', '1160'],
      ['CREDITO', '785', '1000'],
      ['CREDITO', '44331', '160'],
    ]);
  });

  it('DESPESAS_REPERCUTIDAS com uma folha da classe 6 (632) credita-a', async () => {
    const c632 = await conta(TENANT, '632');
    const { nd, partidas } = await emitirEVerificar({ natureza: 'DESPESAS_REPERCUTIDAS', contaCreditoId: c632.id });
    expect(nd.natureza).toBe('DESPESAS_REPERCUTIDAS');
    expect(nd.contaCreditoId).toBe(c632.id);
    await esperarPartidas(partidas, [
      ['DEBITO', '411', '1160'],
      ['CREDITO', '632', '1000'],
      ['CREDITO', '44331', '160'],
    ]);
  });

  // -------------------------------------------------------------------------
  // (C) recusas — nada gravado
  // -------------------------------------------------------------------------

  it.each(['DESPESAS_REPERCUTIDAS', 'OUTRO'])('%s sem conta escolhida (não há omissão) → CONTA_CREDITO_OBRIGATORIA, sem rasto', async (natureza) => {
    const erro = await recusaSemRasto(() => emitirND({ natureza }));
    expect(erro.code).toBe('CONTA_CREDITO_OBRIGATORIA');
  });

  it('JUROS_MORA com a omissão retirada e sem conta escolhida → CONTA_CREDITO_OBRIGATORIA, sem rasto', async () => {
    await noCtx(ctx, () => nat.definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: null }, ctx));
    try {
      const erro = await recusaSemRasto(() => emitirND({ natureza: 'JUROS_MORA' }));
      expect(erro.code).toBe('CONTA_CREDITO_OBRIGATORIA');
    } finally {
      await noCtx(ctx, async () =>
        nat.definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: (await conta(TENANT, '781')).id }, ctx),
      );
    }
  });

  it.each([
    ['JUROS_MORA', '6112', 'classe 6 para uma natureza de rendimento'],
    ['OUTRO', '632', 'classe 6 para OUTRO'],
    ['DESPESAS_REPERCUTIDAS', '711', 'classe 7 para uma despesa repercutida'],
    ['JUROS_MORA', '78', 'conta agregadora (não aceita lançamento)'],
    ['ACERTO_PRECO', '411', 'conta de outra classe (4)'],
  ])('%s com contaCreditoId %s (%s) → CONTA_NATUREZA_INVALIDA, sem rasto', async (natureza, codigo) => {
    const c = await conta(TENANT, codigo);
    const erro = await recusaSemRasto(() => emitirND({ natureza, contaCreditoId: c.id }));
    expect(erro.code).toBe('CONTA_NATUREZA_INVALIDA');
  });

  it('contaCreditoId de uma conta inactiva → CONTA_NATUREZA_INVALIDA, sem rasto', async () => {
    const c7812 = await conta(TENANT, '7812');
    await db.contaPGC.update({ where: { id: c7812.id }, data: { ativo: false } });
    try {
      const erro = await recusaSemRasto(() => emitirND({ natureza: 'JUROS_MORA', contaCreditoId: c7812.id }));
      expect(erro.code).toBe('CONTA_NATUREZA_INVALIDA');
    } finally {
      await db.contaPGC.update({ where: { id: c7812.id }, data: { ativo: true } });
    }
  });

  it('contaCreditoId de outro tenant → NotFoundError, sem rasto', async () => {
    const cB = await conta(TENANT_B, '781');
    const erro = await recusaSemRasto(() => emitirND({ natureza: 'JUROS_MORA', contaCreditoId: cB.id }));
    expect(erro).toBeInstanceOf(NotFoundError);
  });

  // -------------------------------------------------------------------------
  // (F) factura de referência
  // -------------------------------------------------------------------------

  it('factura de referência válida (EMITIDA, mesmo cliente) fica gravada', async () => {
    const { nd } = await emitirEVerificar({ natureza: 'JUROS_MORA', faturaReferenciaId: faturaId });
    expect(nd.faturaReferenciaId).toBe(faturaId);
  });

  it('factura de referência de outro tenant → NotFoundError, sem rasto', async () => {
    const erro = await recusaSemRasto(() => emitirND({ faturaReferenciaId: faturaOutroTenantId }));
    expect(erro).toBeInstanceOf(NotFoundError);
  });

  it('factura de referência inexistente → NotFoundError, sem rasto', async () => {
    const erro = await recusaSemRasto(() => emitirND({ faturaReferenciaId: `cnaoexiste${sufixo}` }));
    expect(erro).toBeInstanceOf(NotFoundError);
  });

  it('factura de referência de outro cliente → FATURA_DE_OUTRO_CLIENTE, sem rasto', async () => {
    const erro = await recusaSemRasto(() => emitirND({ faturaReferenciaId: faturaOutroClienteId }));
    expect(erro.code).toBe('FATURA_DE_OUTRO_CLIENTE');
  });

  it.each([
    ['RASCUNHO', () => faturaRascunhoId],
    ['CANCELADA', () => faturaCanceladaId],
  ])('factura de referência %s → FATURA_NAO_REFERENCIAVEL, sem rasto', async (_estado, id) => {
    const erro = await recusaSemRasto(() => emitirND({ faturaReferenciaId: id() }));
    expect(erro.code).toBe('FATURA_NAO_REFERENCIAVEL');
  });
});
