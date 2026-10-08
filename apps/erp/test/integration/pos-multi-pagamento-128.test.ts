/**
 * Oráculo #128 — o que o terminal POS envia com vários pagamentos é o que o servidor aceita.
 *
 * O terminal transforma a lista do operador (meio + valor recebido) em `pagamentos` pela regra
 * pura `resolverPagamentosPOS` (`@/lib/pos-pagamentos`, ver o oráculo unitário
 * `src/lib/__tests__/pos-pagamentos-128.test.ts`). Aqui prova-se, contra Postgres real
 * (Testcontainers) e pelo caminho real `CreateVendaSchema` → `vendaService.criar`, que essa
 * saída fecha o ciclo:
 *   - cartão 100 + dinheiro recebido 100 numa venda de 185,60 → venda CONCLUIDA com dois
 *     PagamentoVenda (CARTAO 100 / DINHEIRO 85,60 com troco 14,40), Factura-Recibo PAGA,
 *     MovimentoCaixa só pelo dinheiro que fica na gaveta (85,60, não os 100 recebidos) e
 *     lançamento D 111 85,60 + D 121 100 / C 711 160 / C 44331 25,60;
 *   - três meios electrónicos que somam o total → nenhum MovimentoCaixa, D 121 = total;
 *   - a lista em bruto (dinheiro recebido acima do total, sem resolver) o servidor recusa com
 *     PAGAMENTOS_NAO_BATEM_TOTAL — é por isso que o terminal tem de resolver antes de enviar,
 *     e não pode submeter enquanto a resolução recusar.
 *
 * Fase vermelha: `@/lib/pos-pagamentos` ainda não existe (import dinâmico por caminho em
 * variável, para falhar o caso e não o ficheiro).
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
const MODULO = '@/lib/pos-pagamentos';

describe.skipIf(skip)('#128 — pagamentos múltiplos do terminal POS aceites pelo servidor — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-multi-128-${sufixo}`;
  const USER = `cposmulti${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;

  // 1 × 160 @16 % → 160 + 25,60 = 185,60
  const itens = () => [
    { produtoId, nomeProduto: 'Tomada', quantidade: 1, precoUnitario: 160, desconto: 0, taxaIva: 0.16 },
  ];
  const TOTAL = '185.60';

  async function resolver(entradas: Array<{ tipo: string; valor: number | string }>): Promise<any> {
    const mod: any = await import(/* @vite-ignore */ MODULO);
    expect(typeof mod.resolverPagamentosPOS, 'resolverPagamentosPOS exportada por @/lib/pos-pagamentos').toBe('function');
    const { calcularTotaisVendaPOS } = await import('@/lib/vendas-totais');
    const { total } = calcularTotaisVendaPOS(itens());
    expect(total.toFixed(2)).toBe(TOTAL);
    return mod.resolverPagamentosPOS(total, entradas);
  }

  async function vender(pagamentos: unknown[]) {
    const input = CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: itens(),
      pagamentos,
    });
    const row: any = await noCtx(() => vendaService.criar(input, ctx));
    const venda = await db.venda.findFirst({
      where: { id: row.id, tenantId: TENANT },
      include: { pagamentos: true },
    });
    expect(venda, 'venda gravada').not.toBeNull();
    return venda;
  }

  async function partidasDaFatura(faturaId: string) {
    const fatura = await db.fatura.findFirst({ where: { id: faturaId, tenantId: TENANT } });
    expect(fatura.status).toBe('PAGA');
    expect(fatura.lancamentoId).toBeTruthy();
    const partidas = await db.partidaLancamento.findMany({
      where: { lancamentoId: fatura.lancamentoId, tenantId: TENANT },
      include: { conta: { select: { codigo: true } } },
    });
    return partidas.map((p: any) => ({ codigo: p.conta.codigo as string, tipo: p.tipo as string, valor: dec(p.valor) }));
  }

  const somar = (ps: Array<{ codigo: string; tipo: string; valor: Prisma.Decimal }>, tipo: string, codigo: string) =>
    ps.filter((p) => p.tipo === tipo && p.codigo === codigo).reduce((a, p) => a.plus(p.valor), ZERO);

  async function movimentosDaVenda(vendaId: string) {
    return db.movimentoCaixa.findMany({
      where: { tenantId: TENANT, sessaoCaixaId, tipo: 'VENDA', documentoOrigemId: vendaId },
    });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const caixa = await import('@/server/services/financas/caixa.service');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS multi-pagamento', slug: `pos-multi-128-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `pos-multi-128-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-pos-multi-128-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Material Eléctrico' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-MULTI-${sufixo}`,
        nome: 'Tomada Schuko de Embutir',
        categoriaId: categoria.id,
        unidadeMedida: 'UN',
        precoVenda: 160,
        precoCompra: 95,
        margemLucro: 0.4,
        taxaIva: 0.16,
      },
    });
    produtoId = produto.id;
    const loc = await db.localizacao.create({
      data: { tenantId: TENANT, codigo: `ARM-POS-MULTI-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
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

  it('cartão 100 + dinheiro recebido 100: dois pagamentos, troco só no dinheiro, gaveta recebe 85,60 e o lançamento fecha', async () => {
    const r = await resolver([
      { tipo: 'CARTAO', valor: 100 },
      { tipo: 'DINHEIRO', valor: '100,00' },
    ]);
    expect(r.ok, `resolução recusada: ${JSON.stringify(r)}`).toBe(true);

    const venda = await vender(r.pagamentos);
    expect(venda.status).toBe('CONCLUIDA');
    expect(dec(venda.total).toFixed(2)).toBe(TOTAL);

    const pags = venda.pagamentos.map((p: any) => ({
      tipo: p.tipo,
      valor: dec(p.valor).toFixed(2),
      troco: p.troco == null ? null : dec(p.troco).toFixed(2),
    }));
    const porTipo = (t: string) => pags.filter((p: any) => p.tipo === t);
    expect(porTipo('CARTAO')).toEqual([{ tipo: 'CARTAO', valor: '100.00', troco: null }]);
    expect(porTipo('DINHEIRO')).toHaveLength(1);
    expect(porTipo('DINHEIRO')[0]).toEqual({ tipo: 'DINHEIRO', valor: '85.60', troco: '14.40' });
    expect(pags).toHaveLength(2);

    // Só o dinheiro que fica na gaveta (não o recebido) entra na caixa.
    const mov = await movimentosDaVenda(venda.id);
    expect(mov).toHaveLength(1);
    expect(dec(mov[0].valor).toFixed(2)).toBe('85.60');

    expect(venda.faturaId).toBeTruthy();
    const partidas = await partidasDaFatura(venda.faturaId);
    expect(somar(partidas, 'DEBITO', '111').toFixed(2)).toBe('85.60');
    expect(somar(partidas, 'DEBITO', '121').toFixed(2)).toBe('100.00');
    expect(somar(partidas, 'CREDITO', '711').toFixed(2)).toBe('160.00');
    expect(somar(partidas, 'CREDITO', '44331').toFixed(2)).toBe('25.60');
  });

  it('M-Pesa + e-Mola + transferência que somam o total: aceites, sem troco nem movimento de caixa', async () => {
    const r = await resolver([
      { tipo: 'MPESA', valor: 50 },
      { tipo: 'EMOLA', valor: 35.6 },
      { tipo: 'TRANSFERENCIA', valor: 100 },
    ]);
    expect(r.ok, `resolução recusada: ${JSON.stringify(r)}`).toBe(true);

    const venda = await vender(r.pagamentos);
    expect(venda.status).toBe('CONCLUIDA');
    expect(venda.pagamentos).toHaveLength(3);
    expect(venda.pagamentos.every((p: any) => p.troco == null || dec(p.troco).isZero())).toBe(true);
    expect(await movimentosDaVenda(venda.id)).toHaveLength(0);

    const partidas = await partidasDaFatura(venda.faturaId);
    expect(somar(partidas, 'DEBITO', '121').toFixed(2)).toBe(TOTAL);
  });

  it('o que a resolução recusa o terminal não envia: em falta / troco fora do dinheiro', async () => {
    const emFalta = await resolver([{ tipo: 'CARTAO', valor: 100 }]);
    expect(emFalta.ok).toBe(false);
    expect(emFalta.motivo).toBe('EM_FALTA');
    expect(dec(emFalta.emFalta).toFixed(2)).toBe('85.60');

    const semDinheiro = await resolver([{ tipo: 'MPESA', valor: 200 }]);
    expect(semDinheiro.ok).toBe(false);
    expect(semDinheiro.motivo).toBe('EXCESSO_SEM_DINHEIRO');
  });

  it('a lista em bruto (dinheiro recebido acima do total) o servidor recusa: PAGAMENTOS_NAO_BATEM_TOTAL, nada gravado', async () => {
    const antes = await db.venda.count({ where: { tenantId: TENANT } });
    let erro: any;
    try {
      await vender([{ tipo: 'DINHEIRO', valor: 200 }]);
    } catch (e) {
      erro = e;
    }
    expect(erro?.code ?? erro?.codigo).toBe('PAGAMENTOS_NAO_BATEM_TOTAL');
    expect(await db.venda.count({ where: { tenantId: TENANT } })).toBe(antes);
  });
});
