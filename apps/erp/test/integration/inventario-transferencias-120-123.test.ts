/**
 * Oráculo — issues #120 e #121: listagem de movimentos de stock.
 *
 * #120 — `/inventario/transferencias` filtrava `m.tipo === 'TRANSFERENCIA'` em memória sobre os 25
 *        movimentos mais recentes; os tipos reais são `TRANSFERENCIA_ENTRADA`/`TRANSFERENCIA_SAIDA`,
 *        por isso a página ficava sempre vazia.
 * #121 — `/inventario/movimentacoes`: o filtro «Tipo» e a pesquisa nunca chegavam à query.
 *
 * Contrato (decisão do orquestrador: filtrar pelo enum real, na query; a forma escolhida pelo
 * verificador vai marcada [CONSERVADORA]):
 *   - [CONSERVADORA] o filtro de movimentos (`MovimentoStockFilterSchema` e
 *     `stockService.listarMovimentos`) aceita, além dos cinco valores do enum, o valor de grupo
 *     `TRANSFERENCIA`, que significa «`TRANSFERENCIA_ENTRADA` ou `TRANSFERENCIA_SAIDA`» — é o valor
 *     que a opção «Transferência» do filtro já envia e o que a página de transferências usa. Nenhum
 *     outro valor livre passa (`BAIXA`, `XPTO` → recusados pelo schema);
 *   - o filtro é aplicado NA QUERY, antes da paginação: uma transferência mais antiga do que 30
 *     entradas continua a aparecer na primeira página do filtro;
 *   - um tipo exacto (`TRANSFERENCIA_ENTRADA`) continua a filtrar só esse tipo;
 *   - `search` (texto livre) filtra por nome OU SKU do produto, sem distinguir maiúsculas, e
 *     combina (E) com `tipo` e com `localizacaoId` — o filtro de localização já usa um `OR`, e um
 *     segundo `OR` espalhado no mesmo `where` apagaria o primeiro;
 *   - isolamento: movimentos de outro tenant nunca aparecem, mesmo com a pesquisa a casar.
 *
 * As páginas (que ligam estes filtros) e as etiquetas estão no oráculo unit
 * `src/app/(dashboard)/inventario/__tests__/inventario-transferencias-120-123.test.ts`.
 *
 * Tudo real: Postgres efémero, extensão de tenant, serviço. Catálogo e movimentos escritos pelo
 * client cru (não são documentos numerados).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:inventario-transferencias-120-123; um agente de implementação
 * que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('Movimentos de stock — filtros (#120, #121) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: falha o caso, não o ficheiro.
  let stock: any;
  let FilterSchema: any;

  const sufixo = Date.now();
  const TENANT = `tenant-mov-120-${sufixo}`;
  const OUTRO = `tenant-mov-120-b-${sufixo}`;
  const USER = `cuser120${sufixo}a`;
  const ctx = { tenantId: TENANT, userId: USER };

  let locA: string;
  let locB: string;
  let locC: string;
  let pParafuso: string; // nome «Parafuso Sextavado», SKU PAR-…
  let pCimento: string; // nome «Cimento 50kg», SKU CIM-…

  const ids = {
    transfSaida: '',
    transfEntrada: '',
    transfCimentoSaida: '',
    transfCimentoEntrada: '',
    ajuste: '',
    saidaParafusoLocC: '',
    entradaParafusoLocA: '',
    outroTenant: '',
  };

  const listar = (filtro: Record<string, unknown>) =>
    runCtx(ctx, () => stock.listarMovimentos({ take: 25, ...filtro }, ctx)) as Promise<{
      items: { id: string; tipo: string; produtoId: string }[];
      nextCursor: string | null;
    }>;

  const idsDe = (r: { items: { id: string }[] }) => r.items.map((m) => m.id).sort();

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    stock = (await import('@/server/services/inventario/stock.service')).stockService;
    FilterSchema = (await import('@/lib/validations/stock')).MovimentoStockFilterSchema;

    for (const [id, tag] of [[TENANT, 'a'], [OUTRO, 'b']] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant mov #120 ${tag}`, slug: `mov-120-${tag}-${sufixo}`, nuit: `${sufixo}${tag === 'a' ? 1 : 2}`.slice(-9) },
      });
    }
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `mov-120-${sufixo}@test.mz`, nome: 'Fiel de armazém', keycloakSub: `kc-mov-120-${sufixo}` },
    });

    const loc = async (tenantId: string, tag: string) =>
      (await db.localizacao.create({
        data: { tenantId, codigo: `LOC-120-${tag}-${sufixo}`, nome: `Armazém ${tag}`, tipo: 'ARMAZEM', ativa: true },
      })).id as string;
    locA = await loc(TENANT, 'A');
    locB = await loc(TENANT, 'B');
    locC = await loc(TENANT, 'C');
    const locOutro = await loc(OUTRO, 'X');

    const produto = async (tenantId: string, sku: string, nome: string) => {
      const cat = await db.categoriaProduto.upsert({
        where: { tenantId_nome: { tenantId, nome: 'Mercadorias' } },
        update: {},
        create: { tenantId, nome: 'Mercadorias' },
      });
      return (await db.produto.create({
        data: {
          tenantId, sku, nome, categoriaId: cat.id, unidadeMedida: 'UN',
          precoVenda: '10.00', precoCompra: '5.00', margemLucro: '1', taxaIva: '0.16',
        },
      })).id as string;
    };
    pParafuso = await produto(TENANT, `PAR-${sufixo}`, 'Parafuso Sextavado');
    pCimento = await produto(TENANT, `CIM-${sufixo}`, 'Cimento 50kg');
    const pOutro = await produto(OUTRO, `PAR-${sufixo}`, 'Parafuso Sextavado');

    // Instantes fixos, do mais antigo para o mais recente.
    let t = Date.UTC(2026, 0, 5, 8, 0, 0);
    const mov = async (data: Record<string, unknown>) =>
      (await db.movimentoStock.create({
        data: { tenantId: TENANT, criadoPor: USER, quantidade: '1', createdAt: new Date((t += 60_000)), ...data },
      })).id as string;

    // As transferências são as MAIS ANTIGAS: um filtro em memória sobre a 1.ª página não as vê.
    ids.transfSaida = await mov({ produtoId: pParafuso, tipo: 'TRANSFERENCIA_SAIDA', localizacaoOrigemId: locA, transferenciaRefId: `tr-1-${sufixo}` });
    ids.transfEntrada = await mov({ produtoId: pParafuso, tipo: 'TRANSFERENCIA_ENTRADA', localizacaoDestinoId: locB, transferenciaRefId: `tr-1-${sufixo}` });
    ids.transfCimentoSaida = await mov({ produtoId: pCimento, tipo: 'TRANSFERENCIA_SAIDA', localizacaoOrigemId: locB, transferenciaRefId: `tr-2-${sufixo}` });
    ids.transfCimentoEntrada = await mov({ produtoId: pCimento, tipo: 'TRANSFERENCIA_ENTRADA', localizacaoDestinoId: locC, transferenciaRefId: `tr-2-${sufixo}` });
    ids.ajuste = await mov({ produtoId: pCimento, tipo: 'AJUSTE', localizacaoDestinoId: locA });
    ids.saidaParafusoLocC = await mov({ produtoId: pParafuso, tipo: 'SAIDA', localizacaoOrigemId: locC });
    ids.entradaParafusoLocA = await mov({ produtoId: pParafuso, tipo: 'ENTRADA', localizacaoDestinoId: locA });
    for (let i = 0; i < 30; i++) {
      await mov({ produtoId: pCimento, tipo: 'ENTRADA', localizacaoDestinoId: locA });
    }

    ids.outroTenant = (await db.movimentoStock.create({
      data: {
        tenantId: OUTRO, criadoPor: USER, produtoId: pOutro, quantidade: '1', tipo: 'TRANSFERENCIA_ENTRADA',
        localizacaoDestinoId: locOutro, transferenciaRefId: `tr-x-${sufixo}`, createdAt: new Date(t + 3_600_000),
      },
    })).id;
  });

  // ─── #120 — grupo TRANSFERENCIA ───────────────────────────────────────────

  it('#120 — schema: `tipo: TRANSFERENCIA` é aceite (valor da opção «Transferência»)', () => {
    const r = FilterSchema.safeParse({ tipo: 'TRANSFERENCIA' });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(r.data.tipo).toBe('TRANSFERENCIA');
  });

  it('#120 — schema: valores fora do enum (e do grupo) continuam recusados', () => {
    for (const tipo of ['BAIXA', 'XPTO', 'transferencia']) {
      expect(FilterSchema.safeParse({ tipo }).success, `tipo=${tipo}`).toBe(false);
    }
  });

  it('#120 — `tipo: TRANSFERENCIA` devolve as duas pernas de cada transferência, e só elas', async () => {
    const r = await listar({ tipo: 'TRANSFERENCIA' });
    expect(idsDe(r)).toEqual(
      [ids.transfSaida, ids.transfEntrada, ids.transfCimentoSaida, ids.transfCimentoEntrada].sort(),
    );
    for (const m of r.items) expect(['TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA']).toContain(m.tipo);
  });

  it('#120 — filtrado na query: transferências mais antigas do que 30 entradas aparecem na 1.ª página (take 25)', async () => {
    const r = await listar({ tipo: 'TRANSFERENCIA', take: 25 });
    expect(r.items.length).toBe(4);
    expect(r.nextCursor ?? null).toBeNull();
  });

  it('#120 — sem filtro, a 1.ª página (25) já não contém transferências (prova de que o filtro em memória não chega)', async () => {
    const r = await listar({});
    expect(r.items.length).toBe(25);
    expect(r.items.some((m) => m.tipo.startsWith('TRANSFERENCIA'))).toBe(false);
  });

  it('#121 — tipo exacto continua exacto: TRANSFERENCIA_ENTRADA só devolve entradas de transferência', async () => {
    const r = await listar({ tipo: 'TRANSFERENCIA_ENTRADA' });
    expect(idsDe(r)).toEqual([ids.transfEntrada, ids.transfCimentoEntrada].sort());
  });

  it('#121 — tipo AJUSTE devolve só o ajuste', async () => {
    const r = await listar({ tipo: 'AJUSTE' });
    expect(idsDe(r)).toEqual([ids.ajuste]);
  });

  // ─── #121 — pesquisa ──────────────────────────────────────────────────────

  it('#121 — schema: `search` é aceite e preservado', () => {
    const r = FilterSchema.safeParse({ search: 'parafuso', tipo: 'TRANSFERENCIA' });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(r.data.search).toBe('parafuso');
  });

  it('#121 — `search` por nome do produto, sem distinguir maiúsculas', async () => {
    const r = await listar({ search: 'pArAfUsO' });
    expect(idsDe(r)).toEqual(
      [ids.transfSaida, ids.transfEntrada, ids.saidaParafusoLocC, ids.entradaParafusoLocA].sort(),
    );
    for (const m of r.items) expect(m.produtoId).toBe(pParafuso);
  });

  it('#121 — `search` por SKU do produto', async () => {
    const r = await listar({ search: `par-${sufixo}` });
    expect(r.items.length).toBe(4);
    for (const m of r.items) expect(m.produtoId).toBe(pParafuso);
  });

  it('#121 — `search` sem correspondência → lista vazia (não ignora o filtro)', async () => {
    const r = await listar({ search: `inexistente-${sufixo}` });
    expect(r.items).toEqual([]);
  });

  it('#121 — `search` E `tipo` combinam (E)', async () => {
    const r = await listar({ search: 'cimento', tipo: 'TRANSFERENCIA' });
    expect(idsDe(r)).toEqual([ids.transfCimentoSaida, ids.transfCimentoEntrada].sort());
  });

  it('#121 — `search` E `localizacaoId` combinam (o OR da localização não é apagado pelo da pesquisa)', async () => {
    // Parafuso em locA: a saída de transferência (origem A) e a entrada (destino A). Não a saída de C
    // nem a entrada de transferência em B; nenhum movimento de cimento em A.
    const r = await listar({ search: 'parafuso', localizacaoId: locA });
    expect(idsDe(r)).toEqual([ids.transfSaida, ids.entradaParafusoLocA].sort());
  });

  it('isolamento — o movimento do outro tenant nunca aparece, mesmo com a pesquisa a casar', async () => {
    const r1 = await listar({ search: 'parafuso', take: 100 });
    const r2 = await listar({ tipo: 'TRANSFERENCIA', take: 100 });
    expect(r1.items.map((m) => m.id)).not.toContain(ids.outroTenant);
    expect(r2.items.map((m) => m.id)).not.toContain(ids.outroTenant);
  });
});
