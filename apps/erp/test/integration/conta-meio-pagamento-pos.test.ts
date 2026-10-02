/**
 * Oráculo S3 — conta por meio de pagamento POS configurável (ADR-0041 §4; issue #307)
 *
 * Contra Postgres real (Testcontainers):
 *   (R) regras de `definirContaMeioPagamentoPOS` (meio-pagamento.service):
 *       só CARTAO, TRANSFERENCIA, MPESA e EMOLA são configuráveis (DINHEIRO/CREDITO →
 *       METODO_NAO_CONFIGURAVEL); compatibilidade com o tipo da ContaBancaria (MPESA/EMOLA só
 *       CARTEIRA_MOVEL; CARTAO/TRANSFERENCIA só CORRENTE/POUPANCA/DEPOSITO_PRAZO, senão
 *       CONTA_BANCARIA_INCOMPATIVEL); conta inactiva → CONTA_BANCARIA_INATIVA; conta de outro
 *       tenant → NotFoundError; redefinir substitui (uma linha por tenant+método); `null` remove;
 *       a criação deixa AuditLog (escrita singular).
 *   (L) `listarContasMeioPagamentoPOS` devolve os 4 meios configuráveis, com/sem conta.
 *   (P) `resolverContasPagamentoPOS(tx, ctx)` devolve método → código da conta contabilística
 *       das contas configuradas, e nada para os meios sem configuração.
 *   (V) venda POS pelo caminho real `vendaService.criar`: MPESA configurado para uma
 *       CARTEIRA_MOVEL debita a conta contabilística dessa carteira; CARTAO sem configuração
 *       continua em 121; DINHEIRO continua em 111; removida a configuração, MPESA volta a 121.
 *
 * CONTA_CONTABIL_BANCARIA_EM_FALTA não é exercitada: `ContaBancaria.contaContabilId` é
 * obrigatório e tem FK, e ContaPGC não tem soft delete — o estado não é construível na base.
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

const CONFIGURAVEIS = ['CARTAO', 'TRANSFERENCIA', 'MPESA', 'EMOLA'];

describe.skipIf(skip)('ContaMeioPagamentoPOS — configuração e débito da venda POS — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let vendaService: (typeof import('@/server/services/comercial'))['vendaService'];
  let CreateVendaSchema: (typeof import('@/lib/validations/vendas'))['CreateVendaSchema'];
  let mp: any; // '@/server/services/financas/meio-pagamento.service'
  let NotFoundError: (typeof import('@/lib/errors'))['NotFoundError'];

  const sufixo = Date.now();
  const TENANT = `tenant-pos-mp-${sufixo}`;
  const TENANT_B = `tenant-pos-mp-b-${sufixo}`;
  // CreateVendaSchema exige cuid em vendedorId: forma `c` + alfanuméricos.
  const USER = `cposmp${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let produtoId: string;
  let localizacaoId: string;
  let sessaoCaixaId: string;
  let sessaoPOSId: string;

  // ContaBancaria de partida (tenant A) e respectivos códigos PGC.
  let carteira: { id: string }; // CARTEIRA_MOVEL → 122
  let carteira2: { id: string }; // CARTEIRA_MOVEL → 123
  let corrente: { id: string }; // CORRENTE → 123
  let poupanca: { id: string }; // POUPANCA → 122
  let carteiraInativa: { id: string }; // CARTEIRA_MOVEL inactiva → 122
  let contaOutroTenant: { id: string }; // CARTEIRA_MOVEL do tenant B

  // ── helpers ────────────────────────────────────────────────────────────────
  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  const definir = (metodo: string, contaBancariaId: string | null) =>
    noCtx(() => mp.definirContaMeioPagamentoPOS({ metodo, contaBancariaId }, ctx));

  async function linhasDe(metodo: string) {
    return db.contaMeioPagamentoPOS.findMany({ where: { tenantId: TENANT, metodo } });
  }

  async function resolver(): Promise<Record<string, string | undefined>> {
    return noCtx(() => db.$transaction((tx: any) => mp.resolverContasPagamentoPOS(tx, ctx)));
  }

  async function criarContaBancaria(tenantId: string, codigoPGC: string, tipoConta: string, ativo = true, sufixoConta = '') {
    const pgc = await db.contaPGC.findFirst({ where: { tenantId, codigo: codigoPGC } });
    expect(pgc, `ContaPGC ${codigoPGC} no tenant ${tenantId}`).not.toBeNull();
    return db.contaBancaria.create({
      data: {
        tenantId,
        banco: `Banco ${tipoConta}${sufixoConta}`,
        agencia: '0001',
        numeroConta: `${tipoConta}-${codigoPGC}-${sufixoConta}-${sufixo}`,
        tipoConta,
        contaContabilId: pgc.id,
        ativo,
      },
    });
  }

  function inputVenda(pagamentos: unknown[]) {
    // 1 × 1000 @16% → 1000 + 160 = 1160
    return CreateVendaSchema.parse({
      origem: 'POS',
      vendedorId: USER,
      sessaoPOSId,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [{ produtoId, nomeProduto: 'Artigo 1000', quantidade: 1, precoUnitario: 1000, desconto: 0, taxaIva: 0.16 }],
      pagamentos,
    });
  }

  async function partidasDaVenda(pagamentos: unknown[]) {
    const row: any = await noCtx(() => vendaService.criar(inputVenda(pagamentos), ctx));
    const venda = await db.venda.findFirst({ where: { id: row.id, tenantId: TENANT } });
    expect(venda?.faturaId, 'Venda.faturaId').toBeTruthy();
    const fatura = await db.fatura.findFirst({ where: { id: venda.faturaId, tenantId: TENANT } });
    expect(fatura?.lancamentoId, 'Fatura.lancamentoId').toBeTruthy();
    const partidas = await db.partidaLancamento.findMany({
      where: { lancamentoId: fatura.lancamentoId, tenantId: TENANT },
      include: { conta: { select: { codigo: true } } },
    });
    return {
      fatura,
      partidas: partidas.map((p: any) => ({ codigo: p.conta.codigo as string, tipo: p.tipo as string, valor: dec(p.valor) })),
    };
  }

  function somar(partidas: Array<{ codigo: string; tipo: string; valor: Prisma.Decimal }>, tipo: string, codigo?: string) {
    return partidas
      .filter((p) => p.tipo === tipo && (codigo === undefined || p.codigo === codigo))
      .reduce((a, p) => a.plus(p.valor), ZERO);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ vendaService } = await import('@/server/services/comercial'));
    ({ CreateVendaSchema } = await import('@/lib/validations/vendas'));
    ({ NotFoundError } = await import('@/lib/errors'));
    mp = await import('@/server/services/financas/meio-pagamento.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    const caixa = await import('@/server/services/financas/caixa.service');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant POS meios', slug: `pos-mp-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `pos-mp-${sufixo}@test.mz`, nome: 'Vendedor POS', keycloakSub: `kc-pos-mp-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    // Tenant B: só o necessário para ter uma ContaBancaria que não é do tenant A.
    await db.tenant.create({
      data: { id: TENANT_B, nome: 'Tenant POS meios B', slug: `pos-mp-b-${sufixo}`, nuit: `${sufixo + 1}`.slice(-9) },
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

    carteira = await criarContaBancaria(TENANT, '122', 'CARTEIRA_MOVEL', true, 'a');
    carteira2 = await criarContaBancaria(TENANT, '123', 'CARTEIRA_MOVEL', true, 'b');
    corrente = await criarContaBancaria(TENANT, '123', 'CORRENTE', true, 'c');
    poupanca = await criarContaBancaria(TENANT, '122', 'POUPANCA', true, 'd');
    carteiraInativa = await criarContaBancaria(TENANT, '122', 'CARTEIRA_MOVEL', false, 'e');
    contaOutroTenant = await criarContaBancaria(TENANT_B, '121', 'CARTEIRA_MOVEL', true, 'f');

    // Catálogo, stock, caixa e sessão POS de partida (como no oráculo S2).
    const categoria = await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mercadorias' } });
    const produto = await db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `SKU-POS-MP-${sufixo}`,
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
      data: { tenantId: TENANT, codigo: `ARM-POS-MP-${sufixo}`, nome: 'Armazém', tipo: 'ARMAZEM', ativa: true },
    });
    localizacaoId = loc.id;
    await db.saldoStock.create({
      data: { tenantId: TENANT, produtoId, varianteProdutoId: '', localizacaoId, saldo: 10_000, saldoReservado: 0 },
    });
    const sessaoCaixa: any = await noCtx(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    sessaoCaixaId = sessaoCaixa.id;
    const sessaoPOS = await db.sessaoPOS.create({
      data: { tenantId: TENANT, vendedorId: USER, sessaoCaixaId, status: 'ABERTA' },
    });
    sessaoPOSId = sessaoPOS.id;
  });

  // -------------------------------------------------------------------------
  // (L) estado inicial
  // -------------------------------------------------------------------------

  it('sem configuração: a listagem tem os 4 meios configuráveis, todos sem conta; o resolvedor não devolve nada', async () => {
    const lista: any[] = await noCtx(() => mp.listarContasMeioPagamentoPOS(ctx));
    expect(lista.map((l) => l.metodo).sort()).toEqual([...CONFIGURAVEIS].sort());
    expect(lista.every((l) => l.contaBancariaId === null)).toBe(true);

    const contas = await resolver();
    for (const m of [...CONFIGURAVEIS, 'DINHEIRO', 'CREDITO']) expect(contas[m], m).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // (R) regras
  // -------------------------------------------------------------------------

  it.each(['DINHEIRO', 'CREDITO'])('%s não é configurável → METODO_NAO_CONFIGURAVEL, nada gravado', async (metodo) => {
    const erro = await capturarErro(() => definir(metodo, corrente.id));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro.code).toBe('METODO_NAO_CONFIGURAVEL');
    expect(await db.contaMeioPagamentoPOS.count({ where: { tenantId: TENANT } })).toBe(0);
  });

  it.each([
    ['MPESA', 'corrente'],
    ['EMOLA', 'poupanca'],
    ['CARTAO', 'carteira'],
    ['TRANSFERENCIA', 'carteira'],
  ])('%s com conta %s → CONTA_BANCARIA_INCOMPATIVEL, nada gravado', async (metodo, qual) => {
    const conta = { corrente, poupanca, carteira }[qual as 'corrente' | 'poupanca' | 'carteira'];
    const erro = await capturarErro(() => definir(metodo, conta.id));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro.code).toBe('CONTA_BANCARIA_INCOMPATIVEL');
    expect(await db.contaMeioPagamentoPOS.count({ where: { tenantId: TENANT } })).toBe(0);
  });

  it('conta bancária inactiva → CONTA_BANCARIA_INATIVA, nada gravado', async () => {
    const erro = await capturarErro(() => definir('MPESA', carteiraInativa.id));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro.code).toBe('CONTA_BANCARIA_INATIVA');
    expect(await db.contaMeioPagamentoPOS.count({ where: { tenantId: TENANT } })).toBe(0);
  });

  it('conta bancária de outro tenant → NotFoundError, nada gravado em nenhum tenant', async () => {
    const erro = await capturarErro(() => definir('MPESA', contaOutroTenant.id));
    expect(erro, 'tinha de recusar').toBeDefined();
    expect(erro).toBeInstanceOf(NotFoundError);
    expect(await db.contaMeioPagamentoPOS.count({ where: { tenantId: { in: [TENANT, TENANT_B] } } })).toBe(0);
  });

  it('configurações compatíveis gravam uma linha por meio, e a criação fica no AuditLog', async () => {
    await definir('MPESA', carteira.id);
    await definir('TRANSFERENCIA', corrente.id);
    await definir('CARTAO', poupanca.id);

    const [mpesa] = await linhasDe('MPESA');
    expect(mpesa.contaBancariaId).toBe(carteira.id);
    expect((await linhasDe('TRANSFERENCIA'))[0].contaBancariaId).toBe(corrente.id);
    expect((await linhasDe('CARTAO'))[0].contaBancariaId).toBe(poupanca.id);

    // A auditoria do cliente estendido pode ser assíncrona: espera até 5 s.
    let logs: any[] = [];
    for (let i = 0; i < 50 && logs.length === 0; i++) {
      logs = await db.auditLog.findMany({
        where: { tenantId: TENANT, entity: 'ContaMeioPagamentoPOS', entityId: mpesa.id, action: 'CREATE' },
      });
      if (logs.length === 0) await new Promise((r) => setTimeout(r, 100));
    }
    expect(logs.length, 'AuditLog CREATE da ContaMeioPagamentoPOS de MPESA').toBeGreaterThan(0);
    expect(logs[0].userId).toBe(USER);
  });

  it('a listagem reflecte as configurações; o resolvedor devolve o código contabilístico de cada conta configurada', async () => {
    const lista: any[] = await noCtx(() => mp.listarContasMeioPagamentoPOS(ctx));
    expect(lista.map((l) => l.metodo).sort()).toEqual([...CONFIGURAVEIS].sort());
    const por = Object.fromEntries(lista.map((l) => [l.metodo, l]));
    expect(por.MPESA.contaBancariaId).toBe(carteira.id);
    expect(por.TRANSFERENCIA.contaBancariaId).toBe(corrente.id);
    expect(por.CARTAO.contaBancariaId).toBe(poupanca.id);
    expect(por.EMOLA.contaBancariaId).toBeNull();
    if (por.MPESA.contaCodigo !== undefined) expect(por.MPESA.contaCodigo).toBe('122');
    if (por.TRANSFERENCIA.contaCodigo !== undefined) expect(por.TRANSFERENCIA.contaCodigo).toBe('123');

    const contas = await resolver();
    expect(contas.MPESA).toBe('122');
    expect(contas.TRANSFERENCIA).toBe('123');
    expect(contas.CARTAO).toBe('122');
    expect(contas.EMOLA).toBeUndefined();
    expect(contas.DINHEIRO).toBeUndefined();
    expect(contas.CREDITO).toBeUndefined();
  });

  it('redefinir substitui: continua a haver uma só linha para o meio, com a conta nova', async () => {
    await definir('MPESA', carteira2.id);
    const linhas = await linhasDe('MPESA');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].contaBancariaId).toBe(carteira2.id);
    expect((await resolver()).MPESA).toBe('123');

    // e volta à carteira original, para o resto do ficheiro
    await definir('MPESA', carteira.id);
    expect(await linhasDe('MPESA')).toHaveLength(1);
    expect((await resolver()).MPESA).toBe('122');
  });

  it('contaBancariaId null remove a configuração do meio (e só desse meio)', async () => {
    await definir('CARTAO', null);
    expect(await linhasDe('CARTAO')).toHaveLength(0);
    expect(await linhasDe('MPESA')).toHaveLength(1);
    expect(await linhasDe('TRANSFERENCIA')).toHaveLength(1);

    const lista: any[] = await noCtx(() => mp.listarContasMeioPagamentoPOS(ctx));
    expect(lista.find((l) => l.metodo === 'CARTAO').contaBancariaId).toBeNull();
    expect((await resolver()).CARTAO).toBeUndefined();

    // remover o que já não existe não falha nem cria nada
    await definir('CARTAO', null);
    expect(await linhasDe('CARTAO')).toHaveLength(0);
  });

  it('a configuração de um tenant não aparece no outro', async () => {
    expect(await db.contaMeioPagamentoPOS.count({ where: { tenantId: TENANT_B } })).toBe(0);
    const ctxB = { tenantId: TENANT_B, userId: USER };
    const contasB = await runCtx(ctxB, () => db.$transaction((tx: any) => mp.resolverContasPagamentoPOS(tx, ctxB)));
    expect(contasB.MPESA).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // (V) venda POS
  // -------------------------------------------------------------------------

  it('venda mista: MPESA configurado debita 122 (conta da carteira); CARTAO sem configuração debita 121; DINHEIRO debita 111', async () => {
    const pagamentos = [
      { tipo: 'DINHEIRO', valor: 160 },
      { tipo: 'MPESA', valor: 500, referencia: 'MP-307' },
      { tipo: 'CARTAO', valor: 500 },
    ];
    const { fatura, partidas } = await partidasDaVenda(pagamentos);

    expect(somar(partidas, 'DEBITO', '111').equals(dec('160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '122').equals(dec('500'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '121').equals(dec('500'))).toBe(true);
    expect(somar(partidas, 'DEBITO').equals(dec(fatura.total))).toBe(true);
    expect(somar(partidas, 'DEBITO').equals(somar(partidas, 'CREDITO'))).toBe(true);

    // Igual ao que a função pura constrói com as contas configuradas.
    const { construirLancamentoVendaPOS } = await import('@/server/services/financas/faturacao.service');
    const esperado = construirLancamentoVendaPOS(
      {
        id: fatura.id,
        numero: fatura.numero,
        dataEmissao: fatura.dataEmissao,
        subtotal: dec(fatura.subtotal),
        ivaTotal: dec(fatura.ivaTotal),
        total: dec(fatura.total),
      },
      pagamentos.map((p) => ({ tipo: p.tipo as never, valor: dec(p.valor) })),
      { MPESA: '122', TRANSFERENCIA: '123' },
    );
    const chave = (p: { codigo: string; tipo: string; valor: Prisma.Decimal }) => `${p.codigo}|${p.tipo}|${p.valor.toFixed(2)}`;
    expect(partidas.map(chave).sort()).toEqual(
      esperado.partidas.map((p) => chave({ codigo: p.contaCodigo, tipo: p.tipo, valor: dec(p.valor) })).sort(),
    );
  });

  it('TRANSFERENCIA configurada para conta corrente debita 123', async () => {
    const { partidas } = await partidasDaVenda([{ tipo: 'TRANSFERENCIA', valor: 1160 }]);
    expect(somar(partidas, 'DEBITO', '123').equals(dec('1160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '121').equals(ZERO)).toBe(true);
  });

  it('removida a configuração do MPESA, a venda seguinte volta a debitar 121', async () => {
    await definir('MPESA', null);
    const { partidas } = await partidasDaVenda([{ tipo: 'MPESA', valor: 1160, referencia: 'MP-307b' }]);
    expect(somar(partidas, 'DEBITO', '121').equals(dec('1160'))).toBe(true);
    expect(somar(partidas, 'DEBITO', '122').equals(ZERO)).toBe(true);
  });
});
