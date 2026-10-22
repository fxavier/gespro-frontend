/**
 * Oráculo — issue #550: a manutenção de activo aceitava um `ativoId` de outro tenant e mudava o
 * estado desse activo.
 *
 * Contrato:
 *   - criar manutenção no tenant A com `ativoId` do tenant B → `NAO_ENCONTRADO` (404), nada escrito;
 *   - idem com uma peça cujo `produtoId` é do tenant B;
 *   - uma manutenção de A que (por dados antigos) aponte para um activo de B não muda esse activo:
 *     iniciar/concluir é recusado com `NAO_ENCONTRADO` e o `Ativo.estado` de B fica inalterado;
 *   - o fluxo normal em A continua: criar → EM_ANDAMENTO (activo EM_MANUTENCAO) → CONCLUIDA (EM_USO).
 *
 * Sessão (`@/lib/auth`) e `next/cache` são os únicos duplos; actions, serviços e Postgres são reais.
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

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

type Resultado<T = any> = { ok: boolean; data?: T; error?: { code: string; message: string } };
type Action = (input: unknown) => Promise<Resultado>;

describe.skipIf(skip)('Manutenção de activo — isolamento entre tenants (#550)', () => {
  let db: any;
  let actions: Record<string, Action>;

  const sufixo = Date.now();
  const TENANT = `tenant-man-550-a-${sufixo}`;
  const OUTRO = `tenant-man-550-b-${sufixo}`;
  const USER = `cuser550${sufixo}a`;
  const USER_OUTRO = `cuser550${sufixo}b`;
  let seq = 0;

  const cat: Record<string, string> = {};
  const loc: Record<string, string> = {};
  let produtoOutro: string;

  const action = (nome: string): Action => {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada`).toBe('function');
    return fn;
  };

  async function criarAtivo(tenantId: string, estado = 'EM_USO'): Promise<string> {
    seq++;
    return (
      await db.ativo.create({
        data: {
          tenantId,
          codigoInterno: `AT-550-${sufixo}-${seq}`,
          nome: `Activo #550 ${seq}`,
          categoriaId: cat[tenantId],
          localizacaoId: loc[tenantId],
          dataAquisicao: new Date('2025-01-10T10:00:00Z'),
          valorCompra: 10000,
          vidaUtilAnos: 4,
          metodoAmortizacao: 'LINEAR',
          estado,
          criadoPor: tenantId === TENANT ? USER : USER_OUTRO,
        },
      })
    ).id;
  }

  const dadosManutencao = (ativoId: string, extra: Record<string, unknown> = {}) => ({
    ativoId,
    tipo: 'PREVENTIVA',
    dataAgendada: new Date('2026-11-01T10:00:00Z'),
    titulo: 'Revisão #550',
    descricao: 'Revisão periódica',
    ...extra,
  });

  const estadoDe = async (id: string) => (await db.ativo.findUnique({ where: { id } })).estado;
  const manutencoesDe = (ativoId: string) => db.manutencaoAtivo.count({ where: { ativoId } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    actions = (await import('@/server/actions/inventario.actions')) as unknown as typeof actions;

    for (const [id, tag] of [[TENANT, 'a'], [OUTRO, 'b']] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant #550 ${tag}`, slug: `man-550-${tag}-${sufixo}`, nuit: `${sufixo}${tag === 'a' ? 5 : 6}`.slice(-9) },
      });
    }
    for (const [id, tenantId, tag] of [[USER, TENANT, 'a'], [USER_OUTRO, OUTRO, 'b']] as const) {
      await db.user.create({
        data: { id, tenantId, email: `man-550-${tag}-${sufixo}@test.mz`, nome: `Utilizador ${tag}`, keycloakSub: `kc-man-550-${tag}-${sufixo}` },
      });
    }
    for (const tenantId of [TENANT, OUTRO]) {
      loc[tenantId] = (
        await db.localizacao.create({
          data: { tenantId, codigo: `LOC-550-${tenantId}`, nome: 'Oficina', tipo: 'SALA', ativa: true },
        })
      ).id;
      cat[tenantId] = (
        await db.categoriaAtivo.create({
          data: { tenantId, codigo: `CAT-550-${tenantId}`, nome: 'Equipamento', vidaUtilAnos: 4 },
        })
      ).id;
    }
    const categoriaProduto = await db.categoriaProduto.create({ data: { tenantId: OUTRO, nome: 'Peças' } });
    produtoOutro = (
      await db.produto.create({
        data: {
          tenantId: OUTRO, sku: `SKU-550-${sufixo}`, nome: 'Filtro', categoriaId: categoriaProduto.id,
          unidadeMedida: 'UN', precoVenda: 100, precoCompra: 70, margemLucro: 0.3, taxaIva: 0.16,
        },
      })
    ).id;
  }, 120_000);

  beforeEach(() => {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions: ['ativos:read', 'ativos:write'], acesso: 'aberto' } };
  });

  it('criar no tenant A com activo do tenant B → NAO_ENCONTRADO, nada escrito', async () => {
    const alheio = await criarAtivo(OUTRO);
    const r = await action('criarManutencaoAction')(dadosManutencao(alheio));
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect(await manutencoesDe(alheio)).toBe(0);
  });

  it('criar com uma peça cujo produto é do tenant B → NAO_ENCONTRADO, nada escrito', async () => {
    const meu = await criarAtivo(TENANT);
    const r = await action('criarManutencaoAction')(
      dadosManutencao(meu, {
        pecas: [{ produtoId: produtoOutro, nome: 'Filtro', quantidade: 1, custoUnitario: 70, custoTotal: 70 }],
      }),
    );
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect(await manutencoesDe(meu)).toBe(0);
  });

  it('manutenção de A apontada a activo de B: iniciar e concluir são recusados e o activo de B não muda', async () => {
    const alheio = await criarAtivo(OUTRO, 'EM_USO');
    // Dado antigo (anterior à correcção): gravado pelo client cru, como o serviço o gravava.
    const man = await db.manutencaoAtivo.create({
      data: { tenantId: TENANT, ativoId: alheio, tipo: 'PREVENTIVA', dataAgendada: new Date(), titulo: 'x', descricao: 'x', criadoPor: USER },
    });

    const r1 = await action('transitarStatusManutencaoAction')({ manutencaoId: man.id, novoStatus: 'EM_ANDAMENTO' });
    expect(r1.ok, JSON.stringify(r1)).toBe(false);
    expect(r1.error?.code).toBe('NAO_ENCONTRADO');
    expect(await estadoDe(alheio)).toBe('EM_USO');

    // Activo de B em manutenção e a manutenção de A já em andamento: concluir não o devolve a EM_USO.
    await db.ativo.update({ where: { id: alheio }, data: { estado: 'EM_MANUTENCAO' } });
    await db.manutencaoAtivo.update({ where: { id: man.id }, data: { status: 'EM_ANDAMENTO', dataInicio: new Date() } });
    const r2 = await action('transitarStatusManutencaoAction')({ manutencaoId: man.id, novoStatus: 'CONCLUIDA' });
    expect(r2.ok, JSON.stringify(r2)).toBe(false);
    expect(r2.error?.code).toBe('NAO_ENCONTRADO');
    expect(await estadoDe(alheio)).toBe('EM_MANUTENCAO');
  });

  it('fluxo normal em A: criar → EM_ANDAMENTO (activo EM_MANUTENCAO) → CONCLUIDA (activo EM_USO)', async () => {
    const meu = await criarAtivo(TENANT, 'EM_USO');
    const c = await action('criarManutencaoAction')(dadosManutencao(meu));
    expect(c.ok, JSON.stringify(c)).toBe(true);

    const r1 = await action('transitarStatusManutencaoAction')({ manutencaoId: c.data.id, novoStatus: 'EM_ANDAMENTO' });
    expect(r1.ok, JSON.stringify(r1)).toBe(true);
    expect(await estadoDe(meu)).toBe('EM_MANUTENCAO');

    const r2 = await action('transitarStatusManutencaoAction')({ manutencaoId: c.data.id, novoStatus: 'CONCLUIDA' });
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    expect(await estadoDe(meu)).toBe('EM_USO');
  });
});
