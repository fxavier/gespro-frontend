/**
 * Oráculo — issue #126: `/stock/reposicao` mostrava ids truncados em vez de nomes.
 *
 * Contrato (decisão do orquestrador): `stockService.obterAlertasStockMinimo` passa a devolver o
 * nome e o código do produto e o nome da localização (join, com o tenant explícito), e a página
 * mostra-os. A parte de UI está no oráculo unit
 * `src/app/(dashboard)/stock/__tests__/reposicao-nomes-126.test.ts`.
 *
 * Forma escolhida pelo verificador (marcada [CONSERVADORA] — a mesma do `SaldoStockComDetalheDto`
 * que o `listarSaldos` já devolve, para não inventar um segundo formato):
 *   - cada alerta traz `produto: { codigo, nome }` (`codigo` = SKU) e `localizacao: { nome }`;
 *   - [CONSERVADORA] a SEMÂNTICA do alerta não muda: um alerta por produto, quando o saldo TOTAL
 *     (todas as localizações) está abaixo do `stockMinimo`; os mesmos produtos de antes, com os
 *     mesmos saldos — o KPI do painel de stock conta esta lista e não pode mudar;
 *   - quando o produto só tem saldo numa localização, `localizacao.nome` é o nome dessa
 *     localização (o join);
 *   - quando tem saldo em várias, ou em nenhuma, `localizacao.nome` é texto legível: nunca vazio,
 *     nunca um id, nunca a sentinela `__total__` — o texto exacto fica com quem implementa;
 *   - isolamento: produtos e localizações de outro tenant nunca aparecem, mesmo com SKU igual.
 *
 * Tudo real: Postgres efémero, extensão de tenant, serviço. Catálogo e saldos escritos pelo
 * client cru (não são documentos numerados).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:reposicao-nomes-126; um agente de implementação que o altere
 * é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type Alerta = {
  id: string;
  produtoId: string;
  localizacaoId: string;
  saldo: string;
  produto?: { codigo?: string; nome?: string };
  localizacao?: { nome?: string };
};

describe.skipIf(skip)('Reposição de stock — nomes em vez de ids (#126) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: falha o caso, não o ficheiro.
  let stock: any;

  const sufixo = Date.now();
  const TENANT = `tenant-rep-126-${sufixo}`;
  const OUTRO = `tenant-rep-126-b-${sufixo}`;
  const USER = `cuser126${sufixo}a`;
  const USER_B = `cuser126${sufixo}b`;
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxB = { tenantId: OUTRO, userId: USER_B };

  const NOME_LOC_CENTRAL = `Armazém Central 126-${sufixo}`;
  const NOME_LOC_LOJA = `Loja da Baixa 126-${sufixo}`;
  const NOME_LOC_INTRUSA = `Armazém Intruso 126-${sufixo}`;

  const p = {
    umaLoc: { id: '', sku: `CIM-126-${sufixo}`, nome: 'Cimento Portland 126' },
    duasLocs: { id: '', sku: `PAR-126-${sufixo}`, nome: 'Parafuso Sextavado 126' },
    semSaldo: { id: '', sku: `TIN-126-${sufixo}`, nome: 'Tinta Branca 126' },
    acima: { id: '', sku: `TUB-126-${sufixo}`, nome: 'Tubo PVC 126' },
    minimoZero: { id: '', sku: `FIO-126-${sufixo}`, nome: 'Fio Eléctrico 126' },
    apagado: { id: '', sku: `VEL-126-${sufixo}`, nome: 'Velho Apagado 126' },
    outro: { id: '', sku: `CIM-126-${sufixo}`, nome: 'Cimento do Intruso 126' },
  };
  let locCentral = '';
  let locLoja = '';
  let locIntrusa = '';

  const alertas = (c = ctx) =>
    runCtx(c, () => stock.obterAlertasStockMinimo(c)) as Promise<Alerta[]>;

  const pareceId = (s: string) => /^c[a-z0-9]{20,}$/i.test(s) || /^[0-9a-f-]{36}$/i.test(s);

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    stock = (await import('@/server/services/inventario/stock.service')).stockService;

    for (const [id, tag] of [[TENANT, 'a'], [OUTRO, 'b']] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant rep #126 ${tag}`, slug: `rep-126-${tag}-${sufixo}`, nuit: `${sufixo}${tag === 'a' ? 1 : 2}`.slice(-9) },
      });
    }
    for (const [id, tenantId, tag] of [[USER, TENANT, 'a'], [USER_B, OUTRO, 'b']] as const) {
      await db.user.create({
        data: { id, tenantId, email: `rep-126-${tag}-${sufixo}@test.mz`, nome: `Fiel ${tag}`, keycloakSub: `kc-rep-126-${tag}-${sufixo}` },
      });
    }

    const loc = async (tenantId: string, tag: string, nome: string) =>
      (await db.localizacao.create({
        data: { tenantId, codigo: `LOC-126-${tag}-${sufixo}`, nome, tipo: 'ARMAZEM', ativa: true },
      })).id as string;
    locCentral = await loc(TENANT, 'C', NOME_LOC_CENTRAL);
    locLoja = await loc(TENANT, 'L', NOME_LOC_LOJA);
    locIntrusa = await loc(OUTRO, 'X', NOME_LOC_INTRUSA);

    const produto = async (
      tenantId: string,
      x: { sku: string; nome: string },
      stockMinimo: string,
      extra: Record<string, unknown> = {},
    ) => {
      const cat = await db.categoriaProduto.upsert({
        where: { tenantId_nome: { tenantId, nome: 'Mercadorias' } },
        update: {},
        create: { tenantId, nome: 'Mercadorias' },
      });
      return (await db.produto.create({
        data: {
          tenantId, sku: x.sku, nome: x.nome, categoriaId: cat.id, unidadeMedida: 'UN',
          precoVenda: '10.00', precoCompra: '5.00', margemLucro: '1', taxaIva: '0.16', stockMinimo,
          ...extra,
        },
      })).id as string;
    };
    p.umaLoc.id = await produto(TENANT, p.umaLoc, '10');
    p.duasLocs.id = await produto(TENANT, p.duasLocs, '10');
    p.semSaldo.id = await produto(TENANT, p.semSaldo, '5');
    p.acima.id = await produto(TENANT, p.acima, '5');
    p.minimoZero.id = await produto(TENANT, p.minimoZero, '0');
    p.apagado.id = await produto(TENANT, p.apagado, '10', { deletedAt: new Date() });
    p.outro.id = await produto(OUTRO, p.outro, '10');

    const saldo = async (tenantId: string, produtoId: string, localizacaoId: string, valor: string) =>
      db.saldoStock.create({ data: { tenantId, produtoId, localizacaoId, saldo: valor, saldoReservado: '0' } });
    await saldo(TENANT, p.umaLoc.id, locCentral, '3');
    await saldo(TENANT, p.duasLocs.id, locCentral, '4');
    await saldo(TENANT, p.duasLocs.id, locLoja, '2');
    await saldo(TENANT, p.acima.id, locCentral, '20');
    await saldo(TENANT, p.minimoZero.id, locLoja, '0');
    await saldo(TENANT, p.apagado.id, locCentral, '1');
    await saldo(OUTRO, p.outro.id, locIntrusa, '1');
  });

  // ─── Semântica do alerta (não muda) ─────────────────────────────────────────

  it('os produtos em alerta são os mesmos de antes: saldo TOTAL abaixo do mínimo, um alerta por produto', async () => {
    const r = await alertas();
    expect(r.map((a) => a.produtoId).sort()).toEqual([p.umaLoc.id, p.duasLocs.id, p.semSaldo.id].sort());
  });

  it('os saldos continuam a ser o total do produto (todas as localizações)', async () => {
    const r = await alertas();
    const por = new Map(r.map((a) => [a.produtoId, a]));
    expect(Number(por.get(p.umaLoc.id)?.saldo)).toBe(3);
    expect(Number(por.get(p.duasLocs.id)?.saldo)).toBe(6);
    expect(Number(por.get(p.semSaldo.id)?.saldo)).toBe(0);
  });

  it('as chaves das linhas continuam únicas (a DataTable usa row.id)', async () => {
    const r = await alertas();
    expect(new Set(r.map((a) => a.id)).size).toBe(r.length);
  });

  // ─── Produto: nome e código ─────────────────────────────────────────────────

  it('cada alerta traz o nome e o código (SKU) do produto', async () => {
    const r = await alertas();
    const por = new Map(r.map((a) => [a.produtoId, a]));
    for (const x of [p.umaLoc, p.duasLocs, p.semSaldo]) {
      const a = por.get(x.id) as Alerta;
      expect(a, `alerta de ${x.nome}`).toBeDefined();
      expect((a as any).produto?.nome, `produto.nome de ${x.sku}`).toBe(x.nome);
      expect((a as any).produto?.codigo, `produto.codigo de ${x.nome}`).toBe(x.sku);
    }
  });

  // ─── Localização: nome ──────────────────────────────────────────────────────

  it('produto com saldo numa só localização: localizacao.nome é o nome dessa localização', async () => {
    const r = await alertas();
    const a = r.find((x) => x.produtoId === p.umaLoc.id) as any;
    expect(a?.localizacao?.nome).toBe(NOME_LOC_CENTRAL);
  });

  it('produto com saldo em várias localizações, ou em nenhuma: localizacao.nome é texto legível, não id nem sentinela', async () => {
    const r = await alertas();
    for (const id of [p.duasLocs.id, p.semSaldo.id]) {
      const a = r.find((x) => x.produtoId === id) as any;
      const nome = a?.localizacao?.nome;
      expect(typeof nome, `localizacao.nome do produto ${id}`).toBe('string');
      expect((nome as string).trim().length).toBeGreaterThan(0);
      expect(nome).not.toContain('__total__');
      expect(pareceId(nome), `«${nome}» parece um id`).toBe(false);
      for (const lid of [locCentral, locLoja, locIntrusa]) expect(nome).not.toContain(lid);
    }
  });

  // ─── Isolamento ─────────────────────────────────────────────────────────────

  it('isolamento: o produto e a localização do outro tenant (SKU igual) nunca aparecem', async () => {
    const r = await alertas();
    const texto = JSON.stringify(r);
    expect(r.some((a) => a.produtoId === p.outro.id)).toBe(false);
    expect(texto).not.toContain('Cimento do Intruso 126');
    expect(texto).not.toContain(NOME_LOC_INTRUSA);
    expect(texto).not.toContain(locIntrusa);
  });

  it('isolamento: o outro tenant vê o seu alerta com os SEUS nomes, e nada do primeiro', async () => {
    const r = await alertas(ctxB);
    expect(r.map((a) => a.produtoId)).toEqual([p.outro.id]);
    expect((r[0] as any).produto?.nome).toBe(p.outro.nome);
    expect((r[0] as any).produto?.codigo).toBe(p.outro.sku);
    expect((r[0] as any).localizacao?.nome).toBe(NOME_LOC_INTRUSA);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(NOME_LOC_CENTRAL);
    expect(texto).not.toContain('Cimento Portland 126');
  });
});
