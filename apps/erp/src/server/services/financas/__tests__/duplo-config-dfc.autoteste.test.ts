import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import type { InstantaneoMapeamento } from '../dfc.interface';
import { DuploConfigDfc, ESQUEMA, type Modelo } from './helpers/duplo-config-dfc';
import { afirmarV1 } from './helpers/juiz-v1-dfc';
// ---------------------------------------------------------------------------
// AUTOTESTE do oráculo do nó `config-v` (grafo dfc) — verificador-fluxo-caixa.
// FICHEIRO PROTEGIDO. Não testa a implementação: testa o DUPLO e o JUIZ do V1
// que `dfc-config.test.ts` usa, para que um verde lá signifique alguma coisa.
// Um duplo que fizesse commit de uma transacção falhada, aceitasse um upsert
// calado ou escopasse um findUnique esconderia exactamente os defeitos que o
// gate do ticket 7 procura. Por isso passa já, sem implementação nenhuma.
// ---------------------------------------------------------------------------

type Delegado = Record<string, (a?: unknown) => Promise<unknown>>;
type Cliente = Record<string, unknown> & {
  $transaction: (fn: (tx: Record<string, Delegado>) => Promise<unknown>) => Promise<unknown>;
  $queryRaw: (s: TemplateStringsArray | Prisma.Sql, ...v: unknown[]) => Promise<unknown>;
};
const del = (c: unknown, m: Modelo) => (c as Record<string, Delegado>)[m];

const T = 't-auto';
const OUTRO = 't-auto-outro';
const T0 = new Date(Date.UTC(2026, 0, 1, 10));
const rub = (tenantId: string, id: string, codigo: string, atividade = 'OPERACIONAL') => ({
  id,
  tenantId,
  codigo,
  designacao: codigo,
  atividade,
  sinal: 'VARIACAO',
  ordem: 1,
  origem: 'SISTEMA',
  ativo: true,
  createdAt: T0,
  updatedAt: T0,
  deletedAt: null,
});

function novo(): DuploConfigDfc {
  const d = new DuploConfigDfc();
  d.repor({
    contaPGC: [
      { id: 'c1', tenantId: T, codigo: '111', nome: 'Caixa', classe: 'CLASSE_1', tipo: 'ATIVO', natureza: 'DEVEDORA', nivel: 3, contaMaeId: null, aceitaLancamento: true, ativo: true, descricao: null, createdAt: T0, updatedAt: T0 },
      { id: 'c-outro', tenantId: OUTRO, codigo: '111', nome: 'Caixa', classe: 'CLASSE_1', tipo: 'ATIVO', natureza: 'DEVEDORA', nivel: 3, contaMaeId: null, aceitaLancamento: true, ativo: true, descricao: null, createdAt: T0, updatedAt: T0 },
    ],
    rubricaFluxoCaixa: [rub(T, 'r1', 'CX-01', 'CAIXA'), rub(T, 'r-apagada', 'OP-80'), rub(OUTRO, 'r-outro', 'FIN-99')].map((r) =>
      r.id === 'r-apagada' ? { ...r, deletedAt: T0 } : r,
    ),
    mapeamentoContaFluxo: [{ id: 'm1', tenantId: T, contaId: 'c1', rubricaId: 'r1', createdAt: T0, updatedAt: T0 }],
    versaoMapeamentoFluxo: [
      { id: 'v1', tenantId: T, numero: 1, estado: 'PENDING', instantaneo: { rubricas: [], mapeamentos: [] }, validadoPorId: null, validadoEm: null, observacao: null, createdAt: T0 },
    ],
  });
  return d;
}
const emT = <R>(fn: () => Promise<R>) => runWithTenantContext({ tenantId: T, userId: 'u' }, fn);

describe('autoteste do duplo da configuração da DFC', () => {
  it('os campos e relações do duplo são os do schema (Prisma.dmmf) — o duplo não deriva', () => {
    for (const [m, esq] of Object.entries(ESQUEMA)) {
      const dm = Prisma.dmmf.datamodel.models.find((x) => x.name === esq.nome);
      expect(dm, m).toBeDefined();
      const escalares = dm?.fields.filter((f) => f.kind !== 'object').map((f) => f.name).sort();
      const relacoes = dm?.fields.filter((f) => f.kind === 'object').map((f) => f.name).sort();
      expect([...esq.campos].sort(), `${m}: campos`).toEqual(escalares);
      expect(Object.keys(esq.relacoes).sort(), `${m}: relações`).toEqual(relacoes);
    }
  });

  it('$transaction: uma excepção a meio desfaz TUDO; um fn que resolve faz commit', async () => {
    const d = novo();
    const c = d.prismaBase as Cliente;
    await expect(
      c.$transaction(async (tx) => {
        await tx.mapeamentoContaFluxo.delete({ where: { id: 'm1' } });
        await tx.versaoMapeamentoFluxo.create({ data: { tenantId: T, numero: 2, instantaneo: {} } });
        throw new Error('a meio');
      }),
    ).rejects.toThrow('a meio');
    expect(d.linhas('mapeamentoContaFluxo')).toHaveLength(1);
    expect(d.linhas('versaoMapeamentoFluxo')).toHaveLength(1);
    expect(d.rollbacks).toHaveLength(1);

    await c.$transaction(async (tx) => {
      await tx.versaoMapeamentoFluxo.create({ data: { tenantId: T, numero: 2, instantaneo: {} } });
    });
    expect(d.linhas('versaoMapeamentoFluxo', T).map((v) => v.numero)).toEqual([1, 2]);
    expect(d.linhas('versaoMapeamentoFluxo', T)[1]).toMatchObject({ estado: 'PENDING', validadoPorId: null });
    const txIds = d.chamadas.filter((x) => x.operacao !== 'findMany').map((x) => x.txId);
    expect(txIds.every((x) => x !== null)).toBe(true);
    expect(d.commits).toHaveLength(1);
  });

  it('a forma em array de $transaction e $transaction aninhada lançam', async () => {
    const d = novo();
    const c = d.prismaBase as Cliente;
    await expect((c.$transaction as (x: unknown) => Promise<unknown>)([])).rejects.toThrow(/array/);
    await expect(c.$transaction(async (tx) => (tx as unknown as Cliente).$transaction(async () => 1))).rejects.toThrow(/aninhada/);
  });

  it('upsert e *Many lançam e ficam registados', async () => {
    const d = novo();
    for (const op of ['upsert', 'createMany', 'createManyAndReturn', 'updateMany', 'updateManyAndReturn', 'deleteMany']) {
      await expect(del(d.prismaBase, 'mapeamentoContaFluxo')[op]({ where: {}, data: {} })).rejects.toThrow(/proibido/);
    }
    expect(d.chamadas.map((c) => c.operacao)).toHaveLength(6);
  });

  it('tenant-extension: o cliente `prisma` exige contexto, escopa findFirst (com deletedAt) e injecta tenantId no create; findUnique/update NÃO são escopados', async () => {
    const d = novo();
    await expect(del(d.prisma, 'rubricaFluxoCaixa').findFirst({ where: { id: 'r1' } })).rejects.toMatchObject({ code: 'SEM_CONTEXTO_TENANT' });
    await emT(async () => {
      expect(await del(d.prisma, 'rubricaFluxoCaixa').findFirst({ where: { id: 'r-outro' } })).toBeNull();
      expect(await del(d.prisma, 'rubricaFluxoCaixa').findFirst({ where: { id: 'r-apagada' } })).toBeNull();
      expect(await del(d.prisma, 'rubricaFluxoCaixa').findUnique({ where: { id: 'r-outro' } })).toMatchObject({ tenantId: OUTRO });
      const criado = await del(d.prisma, 'mapeamentoContaFluxo').create({ data: { contaId: 'c-outro', rubricaId: 'r-outro' } });
      expect(criado).toMatchObject({ tenantId: T });
    });
    // prismaBase não escopa nada.
    expect(await del(d.prismaBase, 'rubricaFluxoCaixa').findFirst({ where: { id: 'r-outro' } })).toMatchObject({ tenantId: OUTRO });
  });

  it('FKs não escopadas por tenant (como a 22b); P2003 para o inexistente, P2002 para a unicidade, Restrict no delete', async () => {
    const d = novo();
    const m = del(d.prismaBase, 'mapeamentoContaFluxo');
    await expect(m.create({ data: { tenantId: T, contaId: 'nao-existe', rubricaId: 'r1' } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(m.create({ data: { tenantId: T, contaId: 'c1', rubricaId: 'r1' } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(del(d.prismaBase, 'rubricaFluxoCaixa').delete({ where: { id: 'r1' } })).rejects.toMatchObject({ code: 'P2003' });
    // Uma rubrica de OUTRO tenant passa na FK — é o serviço que tem de a recusar.
    await expect(m.update({ where: { id: 'm1' }, data: { rubricaId: 'r-outro' } })).resolves.toMatchObject({ rubricaId: 'r-outro' });
  });

  it('SQL cru: FOR UPDATE regista a tranca com o txId e as linhas; outro SQL lança', async () => {
    const d = novo();
    const c = d.prismaBase as Cliente;
    const linhas = await c.$transaction(async (tx) =>
      (tx as unknown as Cliente).$queryRaw`SELECT id, numero FROM "VersaoMapeamentoFluxo" WHERE id = ${'v1'} AND "tenantId" = ${T} FOR UPDATE`,
    );
    expect(linhas).toEqual([expect.objectContaining({ id: 'v1', numero: 1 })]);
    expect(d.trancas).toEqual([expect.objectContaining({ modelo: 'versaoMapeamentoFluxo', modo: 'FOR UPDATE', ids: ['v1'], txId: 1 })]);
    const outro = await c.$queryRaw(
      Prisma.sql`SELECT * FROM "VersaoMapeamentoFluxo" WHERE "tenantId" = ${OUTRO} ORDER BY numero DESC LIMIT 1 FOR UPDATE`,
    );
    expect(outro).toEqual([]);
    await expect(c.$queryRaw`UPDATE "VersaoMapeamentoFluxo" SET estado = 'VALIDATED'`).rejects.toThrow(/não simulado/);
  });

  it('falharNa: a n-ésima escrita correspondente lança', async () => {
    const d = novo();
    d.falharNa({ modelo: 'versaoMapeamentoFluxo', operacao: '*escrita', ordem: 2 });
    const v = del(d.prismaBase, 'versaoMapeamentoFluxo');
    await v.create({ data: { tenantId: T, numero: 2, instantaneo: {} } });
    await expect(v.create({ data: { tenantId: T, numero: 3, instantaneo: {} } })).rejects.toThrow(/falha injectada/);
  });

  it('_count e filtros por relação funcionam (para «rubrica com contas»)', async () => {
    const d = novo();
    const r = await del(d.prismaBase, 'rubricaFluxoCaixa').findFirst({
      where: { id: 'r1', tenantId: T },
      select: { id: true, _count: { select: { mapeamentos: true } } },
    });
    expect(r).toEqual({ id: 'r1', _count: { mapeamentos: 1 } });
    const caixa = await del(d.prismaBase, 'mapeamentoContaFluxo').findMany({ where: { tenantId: T, rubrica: { atividade: 'CAIXA' } } });
    expect(caixa).toHaveLength(1);
  });
});

describe('autoteste do juiz do V1', () => {
  const vivo: InstantaneoMapeamento = {
    rubricas: [
      { id: 'r1', codigo: 'CX-01', designacao: 'Caixa', atividade: 'CAIXA', sinal: 'VARIACAO', ordem: 1, origem: 'SISTEMA', ativo: true },
      { id: 'r2', codigo: 'OP-01', designacao: 'Clientes', atividade: 'OPERACIONAL', sinal: 'ENTRADA', ordem: 1, origem: 'SISTEMA', ativo: true },
    ],
    mapeamentos: [
      { contaId: 'c1', rubricaId: 'r1' },
      { contaId: 'c2', rubricaId: 'r2' },
    ],
  };

  it('aceita a versão igual ao vivo, mesmo por outra ordem', () => {
    expect(() =>
      afirmarV1([{ numero: 1, instantaneo: { rubricas: [...vivo.rubricas].reverse(), mapeamentos: [...vivo.mapeamentos].reverse() } }], vivo),
    ).not.toThrow();
  });

  it('TEM de lançar com um só elemento adulterado, ou sem versão nenhuma', () => {
    const [m0, ...ms] = vivo.mapeamentos;
    const adulteradas: InstantaneoMapeamento[] = [
      { ...vivo, mapeamentos: ms },
      { ...vivo, mapeamentos: [{ contaId: m0.contaId, rubricaId: 'r2' }, ...ms] },
      { ...vivo, rubricas: vivo.rubricas.map((r, i) => (i === 0 ? { ...r, ativo: false } : r)) },
      { ...vivo, rubricas: vivo.rubricas.map((r, i) => (i === 1 ? { ...r, designacao: 'Outra' } : r)) },
    ];
    for (const inst of adulteradas) expect(() => afirmarV1([{ numero: 7, instantaneo: inst }], vivo)).toThrow();
    // Só conta a MAIS RECENTE: uma antiga igual ao vivo não salva uma recente diferente.
    expect(() => afirmarV1([{ numero: 1, instantaneo: vivo }, { numero: 2, instantaneo: adulteradas[0] }], vivo)).toThrow();
    expect(() => afirmarV1([], vivo)).toThrow();
  });
});
