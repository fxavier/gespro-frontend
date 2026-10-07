/**
 * Oráculo das issues #86 e #266 — a combobox «Factura a creditar» só oferece facturas
 * com SALDO CREDITÁVEL, e diz qual é.
 *
 * Escrito ANTES da implementação; quem implementa não o altera.
 *
 * Saldo creditável de uma factura = total − Σ total das NC sobre ela que NÃO estão
 * `CANCELADA` (EMITIDA e LIQUIDADA contam). É a mesma conta da guarda `NC_EXCEDE_FATURA`
 * de `emitirNotaCreditoEmTx` — e este oráculo prova-o pelo comportamento: uma NC de valor
 * exactamente igual ao `saldoCreditavel` devolvido pela procura passa, um cêntimo acima
 * é recusada.
 *
 * Contrato de `procurarFaturasCreditaveis(q, ctx, clienteId?)`:
 *  - cada linha é `{ id, numero, dataEmissao, total, saldoCreditavel }` (só isso);
 *  - factura totalmente creditada (saldo ≤ 0) NÃO volta — nem pesquisando pelo número
 *    exacto, nem com `clienteId` (a procura da ND usa a mesma função);
 *  - factura parcialmente creditada volta, com o saldo que falta;
 *  - NC cancelada liberta saldo (a factura volta com o total);
 *  - facturas PAGA continuam creditáveis (#86);
 *  - só os estados de `ESTADOS_FATURA_CREDITAVEL` — nunca RASCUNHO nem CANCELADA;
 *  - só o tenant do contexto; `clienteId` restringe ao cliente;
 *  - `q` aparado, `contains` insensível a maiúsculas; vazio/espaços/undefined ⇒ sem filtro;
 *  - as 20 mais recentes (`dataEmissao desc`) DE ENTRE AS QUE TÊM SALDO: facturas
 *    totalmente creditadas não gastam lugares no top-20.
 *
 * (Os casos de forma que viviam no duplo de `__tests__/procurar-faturas-creditaveis.test.ts`
 * — tenant, estados, termo, top-20, campos — passaram para aqui, contra Postgres real:
 * o duplo afirmava sobre os argumentos de um `findMany` que o saldo deixa de poder ser.)
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

type Linha = Record<string, unknown> & { id: string; numero: string };

const dec = (v: unknown) => new Prisma.Decimal(String(v)).toFixed(2);

describe.skipIf(skip)('procurarFaturasCreditaveis — saldo creditável (#86, #266) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: typeof import('@/server/services/financas/faturacao.service');
  let val: typeof import('@/lib/validations/faturacao');
  let BusinessRuleError: (typeof import('@/lib/errors'))['BusinessRuleError'];
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const sufixo = Date.now();
  const TENANT = `tenant-nc-saldo-86-${sufixo}`;
  const USER = `user-nc-saldo-86-${sufixo}`;
  const TENANT_B = `tenant-nc-saldo-86-b-${sufixo}`;
  const USER_B = `user-nc-saldo-86-b-${sufixo}`;
  const permissions = new Set([
    'faturacao:nc:liquidar',
    'faturacao:nc:cancelar',
    'faturacao:fatura:pagar',
    'financas:banca:escrita',
  ]);
  const ctx = { tenantId: TENANT, userId: USER, permissions };
  const ctxB = { tenantId: TENANT_B, userId: USER_B, permissions };

  let clienteId: string;
  let clienteOutro: string;
  let clienteLotes: string;
  let clienteMuitos: string;
  let contaBancariaId: string;

  const noCtx = <T>(c: { tenantId: string; userId: string }, fn: () => Promise<T>) => runCtx(c, fn);

  /** Procura chamada como as actions a chamam; o resultado é lido sem assumir o tipo do saldo. */
  const procurar = (q: string | undefined, c = ctx, cliente?: string): Promise<Linha[]> =>
    noCtx(c, () => (fat.procurarFaturasCreditaveis as any)(q, c, cliente)) as Promise<Linha[]>;

  async function emitirFatura(opts: {
    cliente?: string;
    c?: typeof ctx;
    preco?: number;
    quantidade?: number;
    dataEmissao?: Date;
  } = {}): Promise<{ id: string; numero: string }> {
    const c = opts.c ?? ctx;
    const dataEmissao = opts.dataEmissao ?? new Date();
    const input = val.EmitirFaturaSchema.parse({
      clienteId: opts.cliente ?? clienteId,
      dataEmissao,
      dataVencimento: new Date(dataEmissao.getTime() + 30 * 86_400_000),
      linhas: [
        { descricao: 'Mercadoria #86', quantidade: opts.quantidade ?? 10, precoUnitario: opts.preco ?? 100, taxaIva: 0.16 },
      ],
    });
    const f = await noCtx(c, () => fat.emitirFatura(input, c));
    return { id: f.id, numero: f.numero };
  }

  /** NC de `quantidade × preco` a 16%. 10 × 100 = 1160 (o total da factura por omissão). */
  async function emitirNC(faturaOriginalId: string, preco: number, quantidade = 1): Promise<string> {
    const input = val.EmitirNotaCreditoSchema.parse({
      faturaOriginalId,
      motivo: 'nc-saldo-creditavel-86',
      dataEmissao: new Date(),
      linhas: [{ descricao: 'Crédito #86', quantidade, precoUnitario: preco, taxaIva: 0.16 }],
    });
    const nc = await noCtx(ctx, () => fat.emitirNotaCredito(input, ctx));
    return nc.id;
  }

  async function erroDe(p: Promise<unknown>): Promise<any> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error('esperava-se uma recusa, e a operação passou');
  }

  const porNumero = (linhas: Linha[], numero: string) => linhas.find((l) => l.numero === numero);

  async function criarTenant(id: string, user: string, slug: string) {
    await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit: `${Date.now()}`.slice(-9) } });
    await db.user.create({
      data: { id: user, tenantId: id, email: `${slug}@test.mz`, nome: 'Utilizador #86', keycloakSub: `kc-${slug}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, id), { timeout: 60_000 });
  }

  async function criarCliente(tenantId: string, rotulo: string, nuit: string): Promise<string> {
    const c = await db.cliente.create({
      data: {
        tenantId,
        nome: `Cliente ${rotulo}`,
        tipo: 'JURIDICA',
        nuit,
        email: `${rotulo}-${sufixo}@test.mz`,
        telefone: '840000000',
        codigo: `CLI-86-${rotulo}-${sufixo}`,
      },
    });
    return c.id;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    ({ BusinessRuleError } = await import('@/lib/errors'));
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));

    await criarTenant(TENANT, USER, `nc-saldo-86-${sufixo}`);
    clienteId = await criarCliente(TENANT, 'principal', '400000861');
    clienteOutro = await criarCliente(TENANT, 'outro', '400000862');
    clienteLotes = await criarCliente(TENANT, 'lotes', '400000863');
    clienteMuitos = await criarCliente(TENANT, 'muitos', '400000864');

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    const conta = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Banco #86',
        agencia: '0001',
        numeroConta: `NC86-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo: true,
      },
    });
    contaBancariaId = conta.id;
  }, 180_000);

  // ---------------------------------------------------------------------------
  // Saldo creditável
  // ---------------------------------------------------------------------------

  it('factura sem NC volta, com saldo creditável = total', async () => {
    const f = await emitirFatura();
    const linha = porNumero(await procurar(f.numero), f.numero);
    expect(linha, 'a factura sem NC tem de voltar').toBeDefined();
    expect(dec(linha!.total)).toBe('1160.00');
    expect(linha!.saldoCreditavel, 'cada linha traz `saldoCreditavel`').toBeDefined();
    expect(dec(linha!.saldoCreditavel)).toBe('1160.00');
  });

  it('cada linha é exactamente { id, numero, dataEmissao, total, saldoCreditavel }', async () => {
    const f = await emitirFatura();
    const linha = porNumero(await procurar(f.numero), f.numero);
    expect(linha).toBeDefined();
    expect(Object.keys(linha!).sort()).toEqual(['dataEmissao', 'id', 'numero', 'saldoCreditavel', 'total']);
    expect(linha!.id).toBe(f.id);
    expect(linha!.dataEmissao).toBeInstanceOf(Date);
  });

  it('factura parcialmente creditada volta, com o saldo que falta (1160 − 116 = 1044)', async () => {
    const f = await emitirFatura();
    await emitirNC(f.id, 100); // 116
    const linha = porNumero(await procurar(f.numero), f.numero);
    expect(linha, 'a factura parcialmente creditada tem de voltar').toBeDefined();
    expect(dec(linha!.total)).toBe('1160.00');
    expect(dec(linha!.saldoCreditavel)).toBe('1044.00');
  });

  it('factura totalmente creditada NÃO volta — nem pelo número exacto, nem sem termo, nem por cliente', async () => {
    const f = await emitirFatura();
    await emitirNC(f.id, 1000, 1); // 1160
    expect(porNumero(await procurar(f.numero), f.numero), 'pesquisa pelo número exacto').toBeUndefined();
    expect(porNumero(await procurar(undefined), f.numero), 'sem termo').toBeUndefined();
    expect(porNumero(await procurar(f.numero, ctx, clienteId), f.numero), 'com clienteId (ND)').toBeUndefined();
  });

  it('creditada em duas NC até ao total ⇒ deixa de voltar', async () => {
    const f = await emitirFatura();
    await emitirNC(f.id, 100); // 116
    expect(porNumero(await procurar(f.numero), f.numero)).toBeDefined();
    await emitirNC(f.id, 900); // 1044 — fecha o saldo
    expect(porNumero(await procurar(f.numero), f.numero)).toBeUndefined();
  });

  it('o saldo devolvido é o da guarda: NC = saldo passa; NC = saldo + 0,01 recusa NC_EXCEDE_FATURA', async () => {
    const f = await emitirFatura();
    await emitirNC(f.id, 100); // 116 → saldo 1044
    const linha = porNumero(await procurar(f.numero), f.numero);
    expect(dec(linha!.saldoCreditavel)).toBe('1044.00');

    // 900,01 × 1,16 = 900,01 + 144,00 = 1044,01 — um cêntimo acima do saldo.
    const erro = await erroDe(emitirNC(f.id, 900.01));
    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('NC_EXCEDE_FATURA');
    // A recusa não mexeu no saldo.
    expect(dec(porNumero(await procurar(f.numero), f.numero)!.saldoCreditavel)).toBe('1044.00');

    // Exactamente o saldo: passa, e a factura sai da procura.
    await emitirNC(f.id, 900); // 1044
    expect(porNumero(await procurar(f.numero), f.numero)).toBeUndefined();
  });

  it('NC cancelada liberta saldo: a factura volta com o total, e uma NC pelo total passa de novo', async () => {
    const f = await emitirFatura();
    const nc = await emitirNC(f.id, 1000); // 1160
    expect(porNumero(await procurar(f.numero), f.numero)).toBeUndefined();

    await noCtx(ctx, () => fat.cancelarNotaCredito(nc, 'Emitida por engano #86', ctx));

    const linha = porNumero(await procurar(f.numero), f.numero);
    expect(linha, 'cancelada a NC, a factura volta a ser creditável').toBeDefined();
    expect(dec(linha!.saldoCreditavel)).toBe('1160.00');

    // A guarda concorda: o total inteiro volta a poder ser creditado.
    await emitirNC(f.id, 1000);
    expect(porNumero(await procurar(f.numero), f.numero)).toBeUndefined();
  });

  it('NC LIQUIDADA (compensação) continua a abater o saldo — só CANCELADA o liberta', async () => {
    const f = await emitirFatura();
    const nc = await emitirNC(f.id, 100); // 116
    await noCtx(ctx, () => fat.liquidarNotaCredito({ id: nc, forma: 'COMPENSACAO', data: new Date() } as any, ctx));
    const gravada = await db.notaCredito.findFirst({ where: { id: nc, tenantId: TENANT } });
    expect(gravada.status).toBe('LIQUIDADA');

    const linha = porNumero(await procurar(f.numero), f.numero);
    expect(linha).toBeDefined();
    expect(dec(linha!.saldoCreditavel)).toBe('1044.00');
  });

  it('factura PAGA continua creditável (#86), com o saldo = total', async () => {
    const f = await emitirFatura();
    await noCtx(ctx, () =>
      fat.registarPagamento(
        {
          faturaId: f.id,
          valor: 1160,
          dataPagamento: new Date(),
          formaPagamento: 'TRANSFERENCIA_BANCARIA',
          contaBancariaId,
        } as any,
        ctx,
      ),
    );
    const gravada = await db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
    expect(gravada.status).toBe('PAGA');

    const linha = porNumero(await procurar(f.numero), f.numero);
    expect(linha, 'a factura paga tem de voltar').toBeDefined();
    expect(dec(linha!.saldoCreditavel)).toBe('1160.00');
  });

  // ---------------------------------------------------------------------------
  // Forma da procura (antes no duplo do findMany)
  // ---------------------------------------------------------------------------

  it('nunca RASCUNHO nem CANCELADA, mesmo com saldo', async () => {
    const r = await emitirFatura();
    const c = await emitirFatura();
    // Estado posto à mão: o serviço não tem caminho de factura emitida → RASCUNHO, e a
    // forma da procura é o que está em causa, não o fluxo de cancelamento.
    await db.fatura.update({ where: { id: r.id }, data: { status: 'RASCUNHO' } });
    await db.fatura.update({ where: { id: c.id }, data: { status: 'CANCELADA' } });

    const todas = await procurar(undefined);
    expect(porNumero(await procurar(r.numero), r.numero)).toBeUndefined();
    expect(porNumero(await procurar(c.numero), c.numero)).toBeUndefined();
    expect(porNumero(todas, r.numero)).toBeUndefined();
    expect(porNumero(todas, c.numero)).toBeUndefined();
  });

  it('só o tenant do contexto', async () => {
    await criarTenant(TENANT_B, USER_B, `nc-saldo-86-b-${sufixo}`);
    const clienteB = await criarCliente(TENANT_B, 'tenant-b', '400000869');
    const fB = await emitirFatura({ c: ctxB, cliente: clienteB });

    // Os números das séries recomeçam por tenant: o de B pode coincidir com um de A.
    // Por isso afirma-se pelo id.
    const deA = await procurar(fB.numero);
    expect(deA.map((l) => l.id)).not.toContain(fB.id);
    const deB = await procurar(fB.numero, ctxB);
    expect(deB.map((l) => l.id)).toContain(fB.id);
  }, 120_000);

  it('clienteId restringe ao cliente (procura da ND)', async () => {
    const meu = await emitirFatura({ cliente: clienteOutro });
    const alheia = await emitirFatura({ cliente: clienteId });
    const doOutro = await procurar(undefined, ctx, clienteOutro);
    expect(doOutro.map((l) => l.id)).toContain(meu.id);
    expect(doOutro.map((l) => l.id)).not.toContain(alheia.id);
  });

  it('termo aparado e insensível a maiúsculas; termo vazio/espaços/undefined não filtra', async () => {
    const f = await emitirFatura();
    const parte = f.numero.slice(1).toLowerCase();
    expect(parte, 'o número tem de ter letras para provar a insensibilidade').not.toBe(f.numero.slice(1));

    expect(porNumero(await procurar(`  ${parte}  `), f.numero)).toBeDefined();
    expect(await procurar('ZZZ/9999/999999')).toEqual([]);

    for (const q of ['', '   ', undefined]) {
      const linhas = await procurar(q, ctx, clienteId);
      expect(linhas.length, `q=${JSON.stringify(q)}`).toBeGreaterThan(1);
    }
  });

  it('as 20 mais recentes, por dataEmissao desc', async () => {
    const base = Date.now() - 60 * 60_000;
    const emitidas: Array<{ id: string; numero: string }> = [];
    for (let i = 0; i < 21; i++) {
      emitidas.push(
        await emitirFatura({ cliente: clienteMuitos, quantidade: 1, dataEmissao: new Date(base + i * 60_000) }),
      );
    }
    const linhas = await procurar(undefined, ctx, clienteMuitos);
    expect(linhas).toHaveLength(20);
    // A mais antiga fica de fora; as outras vêm da mais recente para a mais antiga.
    expect(linhas.map((l) => l.id)).toEqual(emitidas.slice(1).reverse().map((f) => f.id));
  }, 180_000);

  it('facturas totalmente creditadas não gastam lugares no top-20', async () => {
    const base = Date.now() - 2 * 60 * 60_000;
    // A mais antiga tem saldo; as 20 mais recentes ficam creditadas por inteiro.
    const antiga = await emitirFatura({ cliente: clienteLotes, quantidade: 1, dataEmissao: new Date(base) });
    for (let i = 1; i <= 20; i++) {
      const f = await emitirFatura({ cliente: clienteLotes, quantidade: 1, dataEmissao: new Date(base + i * 60_000) });
      await emitirNC(f.id, 100); // 116 = total
    }
    const linhas = await procurar(undefined, ctx, clienteLotes);
    expect(linhas.map((l) => l.id), 'só a antiga tem saldo — e tem de aparecer').toEqual([antiga.id]);
    expect(dec(linhas[0].saldoCreditavel)).toBe('116.00');
  }, 240_000);
});
