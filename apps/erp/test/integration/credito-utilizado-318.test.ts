/**
 * Oráculo #318 — crédito utilizado derivado das facturas e aviso de limite de crédito.
 *
 * Escrito ANTES da implementação; quem implementa não o altera.
 *
 * Contrato (decisão do orquestrador, sem contador armazenado):
 *   - `creditoUtilizadoDoCliente(tx, clienteId, ctx)` — exportada por
 *     `@/server/services/financas/faturacao.service` (ou pelo índice `@/server/services/financas`,
 *     ou por `@/server/services/comercial/cliente.service`; o teste procura nos três) —
 *     devolve (Decimal ou string decimal) o saldo em aberto do cliente:
 *         Σ (total − totalPago) das facturas EMITIDA / PARCIALMENTE_PAGA / VENCIDA do cliente
 *       − Σ total das notas de crédito ainda EMITIDAS (não liquidadas, não canceladas) que
 *         abatem a essas facturas.
 *     É o saldo do cliente na 411: a NC emitida credita a 411; a NC CANCELADA foi estornada
 *     (não abate); a NC LIQUIDADA por COMPENSAÇÃO já está no `totalPago` da factura (não pode
 *     abater uma segunda vez). Facturas PAGA, CANCELADA e RASCUNHO não contam; facturas de
 *     outro cliente não contam.
 *   - `relatorioClientesImpl` («dívida total» e «top dívida») e
 *     `clienteService.desativar` (`CLIENTE_COM_DEBITOS_PENDENTES`) usam esse valor e deixam de
 *     ler `Cliente.creditoUtilizadoMT` (um valor velho no campo não decide nada).
 *   - Emissão a crédito (`emitirFatura`, série FATURA não paga; venda POS com parte CREDITO):
 *     se o crédito utilizado DEPOIS da emissão exceder `limiteCreditoMT` (> 0), a emissão NÃO é
 *     bloqueada e o resultado traz `avisos` (array não vazio; cada aviso é uma string ou um objecto
 *     com `mensagem`) a falar do limite de crédito. Igualar o limite não avisa. Limite 0 = sem
 *     limite definido (a regra que o `incrementarCreditoUtilizado` já seguia) — nunca avisa.
 *     Venda paga (Factura-Recibo) nunca avisa.
 *   - Nada escreve `Cliente.creditoUtilizadoMT`: fica no valor de criação depois de todas as
 *     emissões, pagamentos e NC deste ficheiro.
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
const ZERO = new Prisma.Decimal(0);
const DIA_MS = 24 * 60 * 60 * 1000;

describe.skipIf(skip)('#318 crédito utilizado derivado das facturas + aviso de limite — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: typeof import('@/server/services/financas/faturacao.service');
  let val: typeof import('@/lib/validations/faturacao');
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let clienteService: (typeof import('@/server/services/comercial'))['clienteService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let creditoUtilizadoDoCliente: (tx: unknown, clienteId: string, ctx: unknown) => Promise<unknown>;

  const sufixo = Date.now();
  const TENANT = `tenant-cred-util-318-${sufixo}`;
  // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
  const USER = `ccredutil318${sufixo}`;
  const ctx = {
    tenantId: TENANT,
    userId: USER,
    permissions: new Set(['faturacao:nc:liquidar', 'faturacao:nc:cancelar', 'faturacao:fatura:pagar', 'financas:banca:escrita']),
  };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let contaBancariaId: string;
  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;
  let nuitSeq = 400_318_000;

  // -------------------------------------------------------------------------
  // utilitários
  // -------------------------------------------------------------------------

  async function novoCliente(rotulo: string, extra: Record<string, unknown> = {}): Promise<string> {
    const c = await db.cliente.create({
      data: {
        tenantId: TENANT,
        nome: `Cliente ${rotulo}`,
        tipo: 'JURIDICA',
        nuit: String(nuitSeq++),
        email: `cli-318-${rotulo.toLowerCase()}-${sufixo}@test.mz`,
        telefone: '840000318',
        codigo: `CLI-318-${rotulo}-${sufixo}`,
        diasPagamento: 30,
        limiteCreditoMT: 0,
        ...extra,
      },
    });
    return c.id;
  }

  /** Factura a crédito (série FATURA, EMITIDA) de `quantidade` × 1000 a 16% → 1160 × quantidade. */
  async function emitirFatura(clienteId: string, quantidade = 1): Promise<any> {
    const hoje = new Date();
    const input = val.EmitirFaturaSchema.parse({
      clienteId,
      dataEmissao: hoje,
      dataVencimento: new Date(hoje.getTime() + 30 * DIA_MS),
      linhas: [{ descricao: 'Serviço #318', quantidade, precoUnitario: 1000, taxaIva: 0.16 }],
    });
    return noCtx(() => fat.emitirFatura(input, ctx));
  }

  async function pagar(faturaId: string, valor: number) {
    return noCtx(() =>
      fat.registarPagamento(
        {
          faturaId,
          valor,
          dataPagamento: new Date(),
          formaPagamento: 'TRANSFERENCIA_BANCARIA' as const,
          contaBancariaId,
        },
        ctx,
      ),
    );
  }

  /** NC de 1 × 100 a 16% → 116. */
  async function emitirNC(faturaOriginalId: string): Promise<any> {
    const input = val.EmitirNotaCreditoSchema.parse({
      faturaOriginalId,
      motivo: 'Devolução parcial #318',
      dataEmissao: new Date(),
      linhas: [{ descricao: 'Artigo devolvido', quantidade: 1, precoUnitario: 100, taxaIva: 0.16 }],
    });
    return noCtx(() => fat.emitirNotaCredito(input, ctx));
  }

  async function creditoUtilizado(clienteId: string): Promise<Prisma.Decimal> {
    const r = await db.$transaction((tx: any) => noCtx(() => creditoUtilizadoDoCliente(tx, clienteId, ctx)));
    expect(r, 'creditoUtilizadoDoCliente devolve um valor').not.toBeUndefined();
    expect(r).not.toBeNull();
    return dec(r);
  }

  /** Oráculo independente: o mesmo saldo calculado pela base, documento a documento. */
  async function saldoEmAbertoPelaBase(clienteId: string): Promise<Prisma.Decimal> {
    const faturas = await db.fatura.findMany({
      where: { tenantId: TENANT, clienteId, status: { in: ['EMITIDA', 'PARCIALMENTE_PAGA', 'VENCIDA'] } },
      select: { id: true, total: true, totalPago: true },
    });
    let saldo = ZERO;
    for (const f of faturas) {
      saldo = saldo.plus(dec(f.total)).minus(dec(f.totalPago));
      const ncs = await db.notaCredito.findMany({
        where: { tenantId: TENANT, faturaOriginalId: f.id, status: 'EMITIDA' },
        select: { total: true },
      });
      for (const nc of ncs) saldo = saldo.minus(dec(nc.total));
    }
    return saldo;
  }

  function textosAvisos(resultado: any): string[] {
    const avisos = resultado?.avisos;
    if (avisos === undefined || avisos === null) return [];
    expect(Array.isArray(avisos), '`avisos` é um array').toBe(true);
    return avisos.map((a: any) => (typeof a === 'string' ? a : String(a?.mensagem ?? a?.message ?? '')));
  }

  function esperarAvisoDeLimite(resultado: any) {
    const textos = textosAvisos(resultado);
    expect(textos.length, 'a emissão acima do limite tinha de trazer `avisos`').toBeGreaterThan(0);
    expect(
      textos.some((t) => /limite de cr[ée]dito/i.test(t)),
      `um dos avisos fala do limite de crédito: ${JSON.stringify(textos)}`,
    ).toBe(true);
  }

  function esperarSemAvisos(resultado: any) {
    expect(textosAvisos(resultado), 'sem avisos').toEqual([]);
  }

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  // POS: 1 × 1000 @16% → 1160
  function inputVenda(pagamentos: unknown[], clienteId: string) {
    return CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      clienteId,
      itens: [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos,
    });
  }

  async function vender(pagamentos: unknown[], clienteId: string): Promise<any> {
    return noCtx(() => vendaService.criar(inputVenda(pagamentos, clienteId), ctx));
  }

  async function campoCreditoUtilizadoMT(clienteId: string): Promise<Prisma.Decimal> {
    const c = await db.cliente.findFirst({ where: { id: clienteId, tenantId: TENANT }, select: { creditoUtilizadoMT: true } });
    return dec(c.creditoUtilizadoMT);
  }

  // -------------------------------------------------------------------------
  // montagem
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    ({ vendaService, clienteService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const caixa = await import('@/server/services/financas/caixa.service');

    // Acesso dinâmico: enquanto a função não existir, falham os casos, não o ficheiro.
    const candidatos: any[] = [
      fat,
      await import('@/server/services/financas'),
      await import('@/server/services/comercial/cliente.service'),
    ];
    const encontrada = candidatos.map((m) => m?.creditoUtilizadoDoCliente).find((f) => typeof f === 'function');
    creditoUtilizadoDoCliente =
      encontrada ??
      (async () => {
        throw new Error(
          'creditoUtilizadoDoCliente(tx, clienteId, ctx) não está exportada por financas/faturacao.service, ' +
            'pelo índice de financas nem por comercial/cliente.service',
        );
      });

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant crédito utilizado #318', slug: `cred-util-318-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `cred-util-318-${sufixo}@test.mz`, nome: 'Utilizador #318', keycloakSub: `kc-cred-util-318-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    const conta = await db.contaBancaria.create({
      data: {
        tenantId: TENANT,
        banco: 'Banco #318',
        agencia: '0001',
        numeroConta: `318-${sufixo}`,
        tipoConta: 'CORRENTE',
        contaContabilId: pgc123.id,
        ativo: true,
      },
    });
    contaBancariaId = conta.id;

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-318-${sufixo}`,
        nome: 'Artigo de balcão',
        categoriaId: categoria.id,
        unidadeMedida: 'UN',
        precoVenda: 1000,
        precoCompra: 700,
        margemLucro: 0.3,
        taxaIva: 0.16,
      },
    });
    produtoId = produto.id;
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-318-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 1_000, saldoReservado: 0 },
    });

    const sessaoCaixa: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sessaoCaixa.id;
    const sessaoPOS = await db.sessaoPOS.create({
      data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' },
    });
    sessaoPOSId = sessaoPOS.id;
  });

  // -------------------------------------------------------------------------
  // creditoUtilizadoDoCliente
  // -------------------------------------------------------------------------

  describe('creditoUtilizadoDoCliente(tx, clienteId, ctx)', () => {
    it('cliente sem facturas → 0, mesmo com um creditoUtilizadoMT velho no campo', async () => {
      const id = await novoCliente('VAZIO', { creditoUtilizadoMT: 4321 });
      expect((await creditoUtilizado(id)).equals(ZERO)).toBe(true);
    });

    it('factura EMITIDA conta pelo total; pagamento parcial abate; pagamento total zera', async () => {
      const id = await novoCliente('PAGAMENTOS');
      const f = await emitirFatura(id);
      expect((await creditoUtilizado(id)).equals(dec('1160'))).toBe(true);

      await pagar(f.id, 160);
      const parcial = await db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
      expect(parcial.status).toBe('PARCIALMENTE_PAGA');
      expect((await creditoUtilizado(id)).equals(dec('1000'))).toBe(true);

      await pagar(f.id, 1000);
      const paga = await db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
      expect(paga.status).toBe('PAGA');
      expect((await creditoUtilizado(id)).equals(ZERO)).toBe(true);
    });

    it('soma várias facturas em aberto do cliente (EMITIDA + VENCIDA) e ignora PAGA, CANCELADA, RASCUNHO e as de outro cliente', async () => {
      const id = await novoCliente('VARIAS');
      const outro = await novoCliente('OUTRO');

      await emitirFatura(id, 1); // 1160 EMITIDA
      const vencida = await emitirFatura(id, 2); // 2320 → VENCIDA
      await db.fatura.update({ where: { id: vencida.id }, data: { status: 'VENCIDA' } });
      const cancelada = await emitirFatura(id, 3); // 3480 → CANCELADA (não conta)
      await db.fatura.update({ where: { id: cancelada.id }, data: { status: 'CANCELADA' } });
      const rascunho = await emitirFatura(id, 4); // 4640 → RASCUNHO (não conta)
      await db.fatura.update({ where: { id: rascunho.id }, data: { status: 'RASCUNHO' } });
      const paga = await emitirFatura(id, 5); // 5800 → paga por inteiro (não conta)
      await pagar(paga.id, 5800);
      await emitirFatura(outro, 7); // 8120 de outro cliente (não conta)

      const v = await creditoUtilizado(id);
      expect(v.toFixed(2)).toBe('3480.00');
      expect(v.equals(await saldoEmAbertoPelaBase(id))).toBe(true);
      expect((await creditoUtilizado(outro)).toFixed(2)).toBe('8120.00');
    });

    it('NC EMITIDA abate; NC CANCELADA não abate; NC liquidada por COMPENSAÇÃO não abate duas vezes', async () => {
      const id = await novoCliente('NC');
      const f = await emitirFatura(id, 10); // 11600

      const ncEmitida = await emitirNC(f.id); // 116, fica EMITIDA
      expect(ncEmitida.status).toBe('EMITIDA');
      expect((await creditoUtilizado(id)).toFixed(2)).toBe('11484.00');

      const ncCancelada = await emitirNC(f.id);
      await noCtx(() => fat.cancelarNotaCredito(ncCancelada.id, 'Emitida por engano', ctx));
      expect((await creditoUtilizado(id)).toFixed(2)).toBe('11484.00');

      const ncCompensada = await emitirNC(f.id);
      await noCtx(() => fat.liquidarNotaCredito({ id: ncCompensada.id, forma: 'COMPENSACAO', data: new Date() }, ctx));
      const depois = await db.fatura.findFirst({ where: { id: f.id, tenantId: TENANT } });
      expect(dec(depois.totalPago).toFixed(2), 'a compensação entrou no totalPago').toBe('116.00');
      // 11600 − 116 (pago por compensação) − 116 (NC ainda emitida) = 11368
      expect((await creditoUtilizado(id)).toFixed(2)).toBe('11368.00');
      expect((await creditoUtilizado(id)).equals(await saldoEmAbertoPelaBase(id))).toBe(true);
    });

    it('venda POS a crédito (só CREDITO e misto) conta pelo saldo da factura, não pelo total', async () => {
      const id = await novoCliente('POS', { limiteCreditoMT: 1_000_000 });
      await vender([{ tipo: 'CREDITO', valor: 1160 }], id); // saldo 1160
      await vender([{ tipo: 'DINHEIRO', valor: 160 }, { tipo: 'CREDITO', valor: 1000 }], id); // saldo 1000
      await vender([{ tipo: 'CARTAO', valor: 1160 }], id); // Factura-Recibo PAGA: não conta

      expect((await creditoUtilizado(id)).toFixed(2)).toBe('2160.00');
    });
  });

  // -------------------------------------------------------------------------
  // Relatório de clientes
  // -------------------------------------------------------------------------

  describe('relatorioClientesImpl — dívida pelas facturas, não pelo campo armazenado', () => {
    it('dividaTotal = Σ saldo em aberto de todos os clientes; topDivida ordenado pela dívida real; campo velho ignorado', async () => {
      const grande = await novoCliente('REL-GRANDE');
      const pequeno = await novoCliente('REL-PEQ');
      const fantasma = await novoCliente('REL-FANTASMA', { creditoUtilizadoMT: 9_999_999 });
      await emitirFatura(grande, 50); // 58000 — maior do que qualquer outro cliente deste ficheiro
      await emitirFatura(pequeno, 1); // 1160

      const { relatorioClientesImpl } = await import('@/server/services/plataforma/relatorios.service');
      const r = await relatorioClientesImpl(TENANT);

      const clientes = await db.cliente.findMany({ where: { tenantId: TENANT, deletedAt: null }, select: { id: true } });
      let esperado = ZERO;
      for (const c of clientes) esperado = esperado.plus(await saldoEmAbertoPelaBase(c.id));
      expect(esperado.greaterThan(0)).toBe(true);
      expect(r.dividaTotal).toBe(esperado.toFixed(2));

      expect(r.topDivida.length).toBeGreaterThan(0);
      const grandeRow = await db.cliente.findFirst({ where: { id: grande, tenantId: TENANT } });
      expect(r.topDivida[0].codigo).toBe(grandeRow.codigo);
      expect(r.topDivida[0].divida).toBe('58000.00');
      const pequenoRow = await db.cliente.findFirst({ where: { id: pequeno, tenantId: TENANT } });
      const linhaPequeno = r.topDivida.find((t: any) => t.codigo === pequenoRow.codigo);
      if (linhaPequeno) expect(linhaPequeno.divida).toBe('1160.00');
      const fantasmaRow = await db.cliente.findFirst({ where: { id: fantasma, tenantId: TENANT } });
      expect(r.topDivida.map((t: any) => t.codigo)).not.toContain(fantasmaRow.codigo);
      for (let i = 1; i < r.topDivida.length; i++) {
        expect(Number(r.topDivida[i - 1].divida)).toBeGreaterThanOrEqual(Number(r.topDivida[i].divida));
      }
    });
  });

  // -------------------------------------------------------------------------
  // Desactivar cliente
  // -------------------------------------------------------------------------

  describe('clienteService.desativar — CLIENTE_COM_DEBITOS_PENDENTES pela dívida real', () => {
    it('cliente com factura em aberto (e campo armazenado a 0) → CLIENTE_COM_DEBITOS_PENDENTES, nada muda; depois de pago desactiva', async () => {
      const id = await novoCliente('DESAT-DIVIDA');
      const f = await emitirFatura(id);
      expect((await campoCreditoUtilizadoMT(id)).equals(ZERO)).toBe(true);

      const erro = await capturarErro(() => noCtx(() => clienteService.desativar(id, ctx)));
      expect(erro, 'desactivar um cliente com dívida tinha de ser recusado').toBeDefined();
      expect(erro.name).toBe('BusinessRuleError');
      expect(erro.code).toBe('CLIENTE_COM_DEBITOS_PENDENTES');
      const ainda = await db.cliente.findFirst({ where: { id, tenantId: TENANT } });
      expect(ainda.deletedAt).toBeNull();

      await pagar(f.id, 1160);
      await noCtx(() => clienteService.desativar(id, ctx));
      const desativado = await db.cliente.findFirst({ where: { id, tenantId: TENANT } });
      expect(desativado.deletedAt).not.toBeNull();
    });

    it('cliente sem facturas em aberto mas com creditoUtilizadoMT velho > 0 → desactiva', async () => {
      const id = await novoCliente('DESAT-FANTASMA', { creditoUtilizadoMT: 5000 });

      const erro = await capturarErro(() => noCtx(() => clienteService.desativar(id, ctx)));
      expect(erro, `o campo armazenado já não decide: ${String(erro?.message ?? '')}`).toBeUndefined();
      const desativado = await db.cliente.findFirst({ where: { id, tenantId: TENANT } });
      expect(desativado.deletedAt).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Aviso de limite de crédito — emitirFatura
  // -------------------------------------------------------------------------

  describe('emitirFatura a crédito — avisa acima do limite, nunca bloqueia', () => {
    it('limite 2320: 1.ª e 2.ª factura (até igualar) sem aviso; 3.ª excede → EMITIDA na mesma, com aviso', async () => {
      const id = await novoCliente('LIM-FAT', { limiteCreditoMT: 2320 });

      const f1 = await emitirFatura(id);
      esperarSemAvisos(f1);
      const f2 = await emitirFatura(id);
      esperarSemAvisos(f2); // 2320 = limite: não excede

      const f3 = await emitirFatura(id);
      expect(f3.status).toBe('EMITIDA');
      expect(f3.lancamentoId).toBeTruthy();
      esperarAvisoDeLimite(f3);
      expect(await db.fatura.count({ where: { tenantId: TENANT, clienteId: id, status: 'EMITIDA' } })).toBe(3);
      expect((await creditoUtilizado(id)).toFixed(2)).toBe('3480.00');
    });

    it('o limite é comparado com o saldo em aberto: depois de pagar, a mesma factura já não avisa', async () => {
      const id = await novoCliente('LIM-FAT-PAGO', { limiteCreditoMT: 1500 });
      const f1 = await emitirFatura(id);
      esperarSemAvisos(f1);
      await pagar(f1.id, 1160);

      const f2 = await emitirFatura(id); // saldo 1160 ≤ 1500
      esperarSemAvisos(f2);
      const f3 = await emitirFatura(id); // saldo 2320 > 1500
      esperarAvisoDeLimite(f3);
    });

    it('limite 0 (sem limite definido) nunca avisa', async () => {
      const id = await novoCliente('LIM-ZERO', { limiteCreditoMT: 0 });
      const f = await emitirFatura(id, 100); // 116000
      expect(f.status).toBe('EMITIDA');
      esperarSemAvisos(f);
    });
  });

  // -------------------------------------------------------------------------
  // Aviso de limite de crédito — venda POS
  // -------------------------------------------------------------------------

  describe('venda POS a crédito — avisa acima do limite, nunca bloqueia', () => {
    it('misto DINHEIRO 160 + CREDITO 1000 com limite 1100: conta o saldo (1000), não o total (1160) → sem aviso; a 2.ª excede → FATURADA com aviso', async () => {
      const id = await novoCliente('LIM-POS', { limiteCreditoMT: 1100 });
      const misto = [
        { tipo: 'DINHEIRO', valor: 160 },
        { tipo: 'CREDITO', valor: 1000 },
      ];

      const v1 = await vender(misto, id);
      esperarSemAvisos(v1);

      const v2 = await vender(misto, id);
      const venda = await db.venda.findFirst({ where: { id: v2.id, tenantId: TENANT } });
      expect(venda.status).toBe('FATURADA');
      const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
      expect(fatura.status).toBe('PARCIALMENTE_PAGA');
      esperarAvisoDeLimite(v2);
    });

    it('só CREDITO acima do limite → FATURADA com aviso; venda paga ao mesmo cliente (já acima) não avisa', async () => {
      const id = await novoCliente('LIM-POS-2', { limiteCreditoMT: 1000 });

      const v1 = await vender([{ tipo: 'CREDITO', valor: 1160 }], id);
      const venda = await db.venda.findFirst({ where: { id: v1.id, tenantId: TENANT } });
      expect(venda.status).toBe('FATURADA');
      esperarAvisoDeLimite(v1);

      const v2 = await vender([{ tipo: 'DINHEIRO', valor: 1160 }], id);
      const paga = await db.venda.findFirst({ where: { id: v2.id, tenantId: TENANT } });
      expect(paga.status).toBe('CONCLUIDA');
      esperarSemAvisos(v2);
    });

    it('limite 0 (sem limite definido) nunca avisa na venda a crédito', async () => {
      const id = await novoCliente('LIM-POS-ZERO', { limiteCreditoMT: 0 });
      const v = await vender([{ tipo: 'CREDITO', valor: 1160 }], id);
      esperarSemAvisos(v);
    });
  });

  // -------------------------------------------------------------------------
  // Nada escreve creditoUtilizadoMT
  // -------------------------------------------------------------------------

  it('depois de todas as emissões, pagamentos e NC deste ficheiro, nenhum Cliente.creditoUtilizadoMT mudou', async () => {
    const clientes = await db.cliente.findMany({
      where: { tenantId: TENANT, codigo: { startsWith: 'CLI-318-' } },
      select: { codigo: true, creditoUtilizadoMT: true },
    });
    expect(clientes.length).toBeGreaterThan(5);
    const esperadoPorCodigo: Record<string, string> = {
      [`CLI-318-VAZIO-${sufixo}`]: '4321.00',
      [`CLI-318-REL-FANTASMA-${sufixo}`]: '9999999.00',
      [`CLI-318-DESAT-FANTASMA-${sufixo}`]: '5000.00',
    };
    for (const c of clientes) {
      expect(dec(c.creditoUtilizadoMT).toFixed(2), c.codigo).toBe(esperadoPorCodigo[c.codigo] ?? '0.00');
    }
  });
});
