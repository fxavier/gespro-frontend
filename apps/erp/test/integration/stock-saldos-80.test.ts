/**
 * Oráculo do nó A:stock-saldos-80 (issue #80) — saldo de stock por produto e por localização.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * O defeito: `listarSaldos` (inventario/stock.service.ts) existe e não tem consumidor; devolve só
 * ids (sem produto nem localização), ignora o filtro `stockBaixo` que o schema aceita e ordena por
 * `updatedAt`. O detalhe do produto (`/produtos/[id]`) não mostra stock nenhum.
 *
 * Contrato (decisão do orquestrador):
 *   S1 Cada item de `listarSaldos` traz `produto: { codigo, nome, unidade }` (codigo = SKU,
 *      unidade = unidade de medida) e `localizacao: { nome }`, mantendo saldo / saldoReservado /
 *      saldoDisponivel (= saldo − reservado) como Decimal serializado.
 *   S2 Ordena por localização (nome, ascendente).
 *   S3 `stockBaixo: true` devolve só as linhas abaixo do stock mínimo do produto; sem o filtro
 *      (ou `false`) devolve todas.
 *   S4 Filtra por tenant: linhas de outro tenant nunca aparecem, nem pedindo o produto dele.
 *   P1 O detalhe do produto tem a secção «Stock por localização» com uma tabela
 *      Localização / Quantidade / Reservada / Disponível e uma linha por localização.
 *   P2 Produto sem saldos: a secção existe e mostra um estado vazio.
 *
 * A página é lida renderizando o próprio Server Component com `auth` dobrado e a base efémera
 * real; a árvore é percorrida chamando os componentes de servidor e, quando um componente não
 * pode ser chamado fora do React (hooks de cliente), percorrendo as suas props (as tabs do
 * DetailShell levam o conteúdo em `props.tabs[].content`).
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const sessao = vi.hoisted(() => ({ atual: null as null | { user: Record<string, unknown> } }));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => sessao.atual),
}));

type T = { tenantId: string; userId: string; categoriaId: string };

describe.skipIf(skip)('#80 — saldos de stock por produto e localização — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // stockService

  const sufixo = Date.now();
  let seq = 0;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ stockService: svc } = await import('@/server/services/inventario/stock.service'));
  });

  async function novoTenant(rotulo: string): Promise<T> {
    seq += 1;
    const tenantId = `tenant-ss80-${rotulo}-${sufixo}-${seq}`;
    const userId = `user-ss80-${rotulo}-${sufixo}-${seq}`;
    const slug = `ss80-${rotulo}-${sufixo}-${seq}`;
    await db.tenant.create({ data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${sufixo + seq}`.slice(-9) } });
    await db.user.create({
      data: { id: userId, tenantId, email: `${userId}@test.mz`, nome: 'Armazém', keycloakSub: `kc-${userId}` },
    });
    const cat = await db.categoriaProduto.create({ data: { tenantId, nome: `Cat ${slug}` } });
    return { tenantId, userId, categoriaId: cat.id };
  }

  async function produto(t: T, sku: string, nome: string, unidade: string, stockMinimo: number) {
    return db.produto.create({
      data: {
        tenantId: t.tenantId,
        sku,
        nome,
        categoriaId: t.categoriaId,
        unidadeMedida: unidade,
        precoVenda: '100.00',
        precoCompra: '80.00',
        margemLucro: '0.25',
        stockMinimo: String(stockMinimo),
      },
    });
  }

  async function localizacao(t: T, codigo: string, nome: string) {
    return db.localizacao.create({ data: { tenantId: t.tenantId, codigo, nome, tipo: 'ARMAZEM' } });
  }

  async function saldo(t: T, produtoId: string, localizacaoId: string, qtd: string, reservado = '0') {
    return db.saldoStock.create({
      data: { tenantId: t.tenantId, produtoId, localizacaoId, saldo: qtd, saldoReservado: reservado },
    });
  }

  function ctxDe(t: T) {
    return { tenantId: t.tenantId, userId: t.userId };
  }

  async function listar(t: T, filtro: Record<string, unknown>): Promise<any[]> {
    const ctx = ctxDe(t);
    const r = await runCtx(ctx, () => svc.listarSaldos({ take: 100, ...filtro }, ctx));
    return (r as any).items;
  }

  /** Produto em três armazéns criados fora de ordem alfabética, mais um produto de outro tenant. */
  async function cenario() {
    const t = await novoTenant('a');
    const outro = await novoTenant('b');
    const p = await produto(t, `CIM-${seq}`, 'Cimento Portland 50kg', 'SACO', 10);
    const lC = await localizacao(t, `C-${seq}`, `Cacimba ${sufixo}`);
    const lA = await localizacao(t, `A-${seq}`, `Armazém Central ${sufixo}`);
    const lB = await localizacao(t, `B-${seq}`, `Beira Loja ${sufixo}`);
    await saldo(t, p.id, lC.id, '7', '0');
    await saldo(t, p.id, lA.id, '120', '20');
    await saldo(t, p.id, lB.id, '35.5', '5.5');

    const pOutro = await produto(outro, `CIM-OUT-${seq}`, 'Cimento do Outro', 'SACO', 10);
    const lOutro = await localizacao(outro, `O-${seq}`, `Armazém Alheio ${sufixo}`);
    await saldo(outro, pOutro.id, lOutro.id, '999', '0');
    return { t, outro, p, lA, lB, lC, pOutro, lOutro };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // S1–S4 — serviço
  // ───────────────────────────────────────────────────────────────────────────

  it('S1: cada saldo traz produto {codigo, nome, unidade} e localizacao {nome}, e o disponível = saldo − reservado', async () => {
    const c = await cenario();
    const itens = await listar(c.t, { produtoId: c.p.id });
    expect(itens).toHaveLength(3);
    for (const i of itens) {
      expect(i.produto, 'item sem produto').toBeTruthy();
      expect(i.produto.codigo).toBe(c.p.sku);
      expect(i.produto.nome).toBe('Cimento Portland 50kg');
      expect(i.produto.unidade).toBe('SACO');
      expect(i.localizacao, 'item sem localizacao').toBeTruthy();
      expect(typeof i.localizacao.nome).toBe('string');
    }
    const porLoc = new Map(itens.map((i) => [i.localizacaoId, i]));
    const a = porLoc.get(c.lA.id);
    expect(a.localizacao.nome).toBe(c.lA.nome);
    expect(Number(a.saldo)).toBe(120);
    expect(Number(a.saldoReservado)).toBe(20);
    expect(Number(a.saldoDisponivel)).toBe(100);
    const b = porLoc.get(c.lB.id);
    expect(b.localizacao.nome).toBe(c.lB.nome);
    expect(Number(b.saldoDisponivel)).toBe(30);
    expect(typeof b.saldo).toBe('string');
  });

  it('S2: ordena por localização (nome ascendente), não pela data de actualização', async () => {
    const c = await cenario();
    // O mais recentemente actualizado passa a ser o da primeira localização criada (Cacimba):
    // com a ordem antiga (updatedAt desc) viria à cabeça.
    await db.saldoStock.updateMany({ where: { tenantId: c.t.tenantId, localizacaoId: c.lC.id }, data: { saldo: '8' } });
    const itens = await listar(c.t, { produtoId: c.p.id });
    expect(itens.map((i) => i.localizacao?.nome)).toEqual([c.lA.nome, c.lB.nome, c.lC.nome]);
  });

  it('S3: stockBaixo=true devolve só as linhas abaixo do stock mínimo; sem filtro devolve todas', async () => {
    const t = await novoTenant('baixo');
    const loc = await localizacao(t, `L-${seq}`, `Armazém Único ${sufixo}`);
    const baixo = await produto(t, `BX-${seq}`, 'Prego 3"', 'KG', 10);
    const folgado = await produto(t, `FG-${seq}`, 'Tinta Branca', 'LT', 10);
    const semMinimoAcima = await produto(t, `SM-${seq}`, 'Areia', 'M3', 0);
    await saldo(t, baixo.id, loc.id, '2');
    await saldo(t, folgado.id, loc.id, '50');
    await saldo(t, semMinimoAcima.id, loc.id, '5');

    const soBaixos = await listar(t, { stockBaixo: true });
    expect(soBaixos.map((i) => i.produtoId)).toEqual([baixo.id]);

    const todos = await listar(t, {});
    expect(todos.map((i) => i.produtoId).sort()).toEqual([baixo.id, folgado.id, semMinimoAcima.id].sort());

    const falso = await listar(t, { stockBaixo: false });
    expect(falso).toHaveLength(3);
  });

  it('S4: linhas de outro tenant nunca aparecem, nem pedindo o produto dele', async () => {
    const c = await cenario();
    const todos = await listar(c.t, {});
    expect(todos.every((i) => i.tenantId === c.t.tenantId)).toBe(true);
    expect(todos.some((i) => i.produtoId === c.pOutro.id)).toBe(false);

    const doOutro = await listar(c.t, { produtoId: c.pOutro.id });
    expect(doOutro).toEqual([]);

    const daLocAlheia = await listar(c.t, { localizacaoId: c.lOutro.id });
    expect(daLocAlheia).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // P1/P2 — detalhe do produto /produtos/[id]
  // ───────────────────────────────────────────────────────────────────────────

  /** Recolhe todo o texto da árvore devolvida pela página. */
  async function recolherTexto(no: unknown, saida: string[], prof = 0): Promise<void> {
    if (prof > 60 || no == null || typeof no === 'boolean') return;
    if (typeof no === 'string' || typeof no === 'number') {
      saida.push(String(no));
      return;
    }
    if (typeof no !== 'object') return;
    if (Array.isArray(no)) {
      for (const filho of no) await recolherTexto(filho, saida, prof + 1);
      return;
    }
    if (typeof (no as any).then === 'function') {
      await recolherTexto(await (no as Promise<unknown>), saida, prof + 1);
      return;
    }
    const el = no as { $$typeof?: unknown; type?: unknown; props?: Record<string, unknown> };
    if (!el.$$typeof) {
      // objecto simples (ex.: { key, label, content } das tabs, { label, value } dos metadados)
      for (const v of Object.values(no as Record<string, unknown>)) await recolherTexto(v, saida, prof + 1);
      return;
    }
    const props = el.props ?? {};
    if (typeof el.type === 'function') {
      try {
        const out = await (el.type as (p: unknown) => unknown)(props);
        await recolherTexto(out, saida, prof + 1);
        return;
      } catch {
        // componente de cliente (hooks) — percorre as props em vez de o chamar
      }
    }
    for (const [k, v] of Object.entries(props)) {
      if (k === 'className' || k === 'href' || k === 'key') continue;
      await recolherTexto(v, saida, prof + 1);
    }
  }

  async function textoDoDetalhe(t: T, produtoId: string): Promise<string> {
    sessao.atual = {
      user: { id: t.userId, tenantId: t.tenantId, emailVerificado: true, permissions: ['inventario:ver'] },
    };
    const { default: Pagina } = await import('@/app/(dashboard)/produtos/[id]/page');
    const arvore = await (Pagina as any)({ params: Promise.resolve({ id: produtoId }) });
    const textos: string[] = [];
    await recolherTexto(arvore, textos);
    return textos.join(' ¦ ');
  }

  it('P1: o detalhe do produto mostra «Stock por localização» com Localização / Quantidade / Reservada / Disponível e uma linha por localização', async () => {
    const c = await cenario();
    const texto = await textoDoDetalhe(c.t, c.p.id);
    expect(texto).toMatch(/Stock por localização/i);
    for (const cab of ['Localização', 'Quantidade', 'Reservada', 'Disponível']) {
      expect(texto, `falta a coluna «${cab}»`).toContain(cab);
    }
    for (const l of [c.lA, c.lB, c.lC]) {
      expect(texto, `falta a linha de ${l.nome}`).toContain(l.nome);
    }
    expect(texto).not.toContain(c.lOutro.nome);
  });

  it('P2: produto sem saldos — a secção existe e mostra estado vazio, sem linhas de localização', async () => {
    const t = await novoTenant('vazio');
    const outraLoc = await localizacao(t, `V-${seq}`, `Armazém Sem Este Produto ${sufixo}`);
    const pVazio = await produto(t, `VZ-${seq}`, 'Produto Sem Movimento', 'UN', 5);
    const pCheio = await produto(t, `CH-${seq}`, 'Produto Com Stock', 'UN', 5);
    await saldo(t, pCheio.id, outraLoc.id, '40');

    const texto = await textoDoDetalhe(t, pVazio.id);
    expect(texto).toMatch(/Stock por localização/i);
    expect(texto).not.toContain(outraLoc.nome);
    expect(texto).toMatch(/sem stock|sem saldo|nenhum (stock|saldo)|não há stock|não tem stock/i);
  });
});
