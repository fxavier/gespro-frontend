/**
 * Oráculo — issue #557: transições da ordem de produção sem tranca.
 *
 * `transitarStatus` lia a ordem sem `FOR UPDATE` e terminava com `update` incondicional: duas
 * transições iguais em paralelo passavam ambas no `transitar` e cada uma reservava a BOM inteira
 * (libertar) ou dava entrada do produto acabado (concluir).
 *
 * Corrida determinista (padrão da #612): a tx do teste tranca a linha de `SaldoStock` em que as
 * duas transições vão escrever, espera até haver DUAS sessões à espera de tranca e só então
 * liberta. Sem a tranca da ordem, as duas ficam à espera do saldo depois de terem lido o mesmo
 * estado; com ela, a segunda espera pela ordem e lê o estado já escrito pela primeira.
 *
 * Contrato: uma só reserva / uma só entrada, saldos certos, e a segunda transição recusada com
 * `TRANSICAO_INVALIDA`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: { id: string; tenantId: string; permissions: string[]; acesso: 'aberto' | 'leitura' | 'fechado' };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: unknown; error?: { code: string; message: string } };

describe.skipIf(skip)('Produção: transições concorrentes da ordem trancadas (#557) — DB efémera', () => {
  let db: any;
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;
  let entradaStock: (tx: any, data: any, ctx: any) => Promise<unknown>;

  const sufixo = Date.now();
  const TENANT = `tenant-po-557-${sufixo}`;
  const GESTOR = `user-po-557-gestor-${sufixo}`;
  const PERMS = ['producao:ordens:create', 'producao:ordens:update', 'producao:ordens:read'];
  const ctx = { tenantId: TENANT, userId: GESTOR };

  let categoriaId = '';
  let MP = '';
  let PA = '';
  let seq = 0;

  type Produto = { id: string; sku: string; nome: string };

  h.sessao = { user: { id: GESTOR, tenantId: TENANT, permissions: PERMS, acesso: 'aberto' } };

  async function produto(nome: string): Promise<Produto> {
    seq += 1;
    return db.produto.create({
      data: {
        tenantId: TENANT,
        sku: `PO557-${seq}-${sufixo}`,
        nome: `${nome} ${seq}`,
        categoriaId,
        unidadeMedida: 'UN',
        precoVenda: '100.00',
        precoCompra: '40.00',
        margemLucro: '0.60',
        stockMinimo: '0',
      },
      select: { id: true, sku: true, nome: true },
    });
  }

  async function darEntrada(produtoId: string, localizacaoId: string, quantidade: number) {
    await db.$transaction((tx: any) =>
      entradaStock(tx, { produtoId, localizacaoDestinoId: localizacaoId, quantidade, documentoReferenciaTipo: 'SetupOraculo557' }, ctx),
    );
  }

  async function saldo(produtoId: string, localizacaoId: string) {
    const s = await db.saldoStock.findFirst({ where: { tenantId: TENANT, produtoId, localizacaoId } });
    return { saldo: Number(s?.saldo ?? 0), reservado: Number(s?.saldoReservado ?? 0) };
  }

  async function criarOrdem(acabado: Produto, quantidade: number): Promise<string> {
    const r = await actions.criarOrdemProducaoAction({
      produtoId: acabado.id,
      codigoProduto: acabado.sku,
      nomeProduto: acabado.nome,
      quantidade,
      unidadeMedida: 'UN',
      prioridade: 'MEDIA',
      dataPrevisaoInicio: new Date(Date.UTC(2026, 9, 1, 10)),
      dataPrevisaoFim: new Date(Date.UTC(2026, 9, 10, 10)),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return (r.data as { id: string }).id;
  }

  const transitar = (id: string, novoStatus: string) => actions.transitarStatusOrdemProducaoAction({ id, novoStatus });

  /**
   * Tranca a linha de saldo (produto, localização), lança duas transições iguais e só liberta a
   * tranca quando as duas estiverem à espera de uma tranca qualquer (do saldo ou da ordem).
   */
  async function corridaDupla(id: string, novoStatus: string, produtoId: string, localizacaoId: string) {
    let corridas!: Promise<Resultado[]>;
    await db.$transaction(
      async (tx: any) => {
        await tx.$queryRaw`
          SELECT id FROM "SaldoStock"
          WHERE "tenantId" = ${TENANT} AND "produtoId" = ${produtoId} AND "localizacaoId" = ${localizacaoId}
          FOR UPDATE`;
        corridas = Promise.all([transitar(id, novoStatus), transitar(id, novoStatus)]);
        let n = 0;
        for (let i = 0; i < 100 && n < 2; i++) {
          await new Promise((res) => setTimeout(res, 50));
          [{ n }] = await db.$queryRaw`
            SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        }
        expect(n, 'as duas transições não chegaram a esperar por tranca').toBe(2);
      },
      { timeout: 30_000 },
    );
    return corridas;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    actions = (await import('@/server/actions/producao.actions')) as unknown as typeof actions;
    ({ entradaStock } = (await import('@/server/services/inventario/stock.service')) as any);
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({ data: { id: TENANT, nome: `Tenant 557`, slug: `po-557-${sufixo}`, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: GESTOR, tenantId: TENANT, email: `po-557-${sufixo}@test.mz`, nome: 'Gestor', keycloakSub: `kc-po-557-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
    categoriaId = (await db.categoriaProduto.create({ data: { tenantId: TENANT, nome: 'Mobiliário 557' } })).id;
    for (const codigo of ['MP', 'PA'] as const) {
      const l = await db.localizacao.create({
        data: { tenantId: TENANT, codigo, nome: `Armazém ${codigo}`, tipo: 'ARMAZEM' },
        select: { id: true },
      });
      if (codigo === 'MP') MP = l.id;
      else PA = l.id;
    }
  }, 120_000);

  it('duplo «Libertar» concorrente: uma só reserva da BOM; a segunda recusa com TRANSICAO_INVALIDA', async () => {
    const acabado = await produto('Cadeira');
    const madeira = await produto('Madeira');
    await db.estruturaProduto.create({
      data: {
        tenantId: TENANT,
        produtoId: acabado.id,
        codigo: `BOM-PO557-${sufixo}`,
        nome: 'BOM Cadeira',
        versao: '1',
        status: 'ATIVO',
        unidadeProducao: 'UN',
        componentes: {
          create: [
            {
              tenantId: TENANT,
              componenteProdutoId: madeira.id,
              codigoComponente: madeira.sku,
              nomeComponente: madeira.nome,
              categoria: 'MATERIA_PRIMA',
              quantidade: '2',
              unidadeMedida: 'UN',
              custoUnitario: '40.00',
            },
          ],
        },
      },
    });
    await darEntrada(madeira.id, MP, 100);
    const id = await criarOrdem(acabado, 5);

    const rs = await corridaDupla(id, 'LIBERADA', madeira.id, MP);

    expect(rs.filter((r) => r.ok), JSON.stringify(rs)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)?.error?.code).toBe('TRANSICAO_INVALIDA');
    expect(await db.reservaStock.count({ where: { documentoReferenciaId: id } })).toBe(1);
    expect(await db.consumoProducao.count({ where: { ordemProducaoId: id } })).toBe(1);
    expect(await saldo(madeira.id, MP)).toEqual({ saldo: 100, reservado: 10 });
    expect((await db.ordemProducao.findUnique({ where: { id } })).status).toBe('LIBERADA');
  });

  it('duplo «Concluir» concorrente (sem BOM): uma só entrada de produto acabado; a segunda recusa', async () => {
    const acabado = await produto('Mesa');
    // A linha de saldo em PA tem de existir para o teste a poder trancar.
    await darEntrada(acabado.id, PA, 1);
    const id = await criarOrdem(acabado, 3);
    for (const s of ['LIBERADA', 'EM_PRODUCAO']) {
      const r = await transitar(id, s);
      expect(r.ok, JSON.stringify(r)).toBe(true);
    }
    const q = await actions.aprovarQualidadeOrdemAction({ id });
    expect(q.ok, JSON.stringify(q)).toBe(true);

    const rs = await corridaDupla(id, 'CONCLUIDA', acabado.id, PA);

    expect(rs.filter((r) => r.ok), JSON.stringify(rs)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)?.error?.code).toBe('TRANSICAO_INVALIDA');
    const entradas = await db.movimentoStock.count({
      where: { documentoReferenciaId: id, produtoId: acabado.id, tipo: 'ENTRADA' },
    });
    expect(entradas).toBe(1);
    expect(await saldo(acabado.id, PA)).toEqual({ saldo: 4, reservado: 0 });
    expect((await db.ordemProducao.findUnique({ where: { id } })).status).toBe('CONCLUIDA');
  });
});
