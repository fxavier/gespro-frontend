/**
 * Conta de crédito por natureza de ND (ADR-0039 §1). Estado lido por um predicado
 * de decisão, por isso a transição é provada nos DOIS sentidos contra um duplo
 * COM ESTADO: o que `definir` escreve é o que `resolver` lê a seguir — não um
 * mock que devolve o que lhe mandam devolver.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

type Conta = { id: string; tenantId: string; codigo: string; classe: string; aceitaLancamento: boolean; ativo: boolean };
type Linha = { id: string; tenantId: string; natureza: string; contaId: string };

const estado = vi.hoisted(() => ({ contas: [] as Conta[], linhas: [] as Linha[] }));
const bate = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => row[k] === v);

const db = vi.hoisted(() => ({
  contaPGC: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      estado.contas.find((c) => bate(c, where)) ?? null),
  },
  contaNaturezaNotaDebito: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      estado.linhas.find((l) => bate(l, where)) ?? null),
    create: vi.fn(async ({ data }: { data: Omit<Linha, 'id'> }) => {
      const nova = { id: `l${estado.linhas.length + 1}`, ...data };
      estado.linhas.push(nova);
      return nova;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { contaId: string } }) =>
      Object.assign(estado.linhas.find((l) => l.id === where.id)!, data)),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const l = estado.linhas.find((x) => x.id === where.id)!;
      estado.linhas = estado.linhas.filter((x) => x !== l);
      return l;
    }),
    // Presentes só para provar que NÃO são usados (a audit-extension não os vê).
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock('@/server/db/client', () => ({ prisma: db, prismaBase: db }));

import { definirContaNaturezaNotaDebito, resolverContaNaturezaNotaDebito } from '../natureza-nota-debito.service';

const ctx = { tenantId: 'tenant-a', userId: 'u1' };
const conta = (id: string, codigo: string, extra: Partial<Conta> = {}): Conta => ({
  id, tenantId: 'tenant-a', codigo, classe: `CLASSE_${codigo[0]}`, aceitaLancamento: true, ativo: true, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  estado.contas = [
    conta('c711', '711'), conta('c781', '781'), conta('c789', '789'), conta('c622', '622'),
    conta('c78', '78', { aceitaLancamento: false }),
    conta('c769x', '769', { ativo: false }),
    conta('alheia', '781', { tenantId: 'tenant-b' }),
  ];
  // Omissão como o provisionamento a deixa.
  estado.linhas = [{ id: 'l0', tenantId: 'tenant-a', natureza: 'JUROS_MORA', contaId: 'c781' }];
});

describe('transição da conta por natureza — nos dois sentidos', () => {
  it('omissão → redefinida → lida a nova', async () => {
    expect(await resolverContaNaturezaNotaDebito(db as never, 'JUROS_MORA', ctx)).toMatchObject({ codigo: '781' });
    await definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: 'c789' }, ctx);
    expect(await resolverContaNaturezaNotaDebito(db as never, 'JUROS_MORA', ctx)).toMatchObject({ id: 'c789', codigo: '789' });
    expect(estado.linhas).toHaveLength(1); // actualiza, não duplica
  });

  it('só escreve por create/update/delete singulares — os que a audit-extension audita', async () => {
    await definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: 'c789' }, ctx);
    await definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: null }, ctx);
    await definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: 'c781' }, ctx);
    const m = db.contaNaturezaNotaDebito;
    expect([m.update.mock.calls.length, m.delete.mock.calls.length, m.create.mock.calls.length]).toEqual([1, 1, 1]);
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.deleteMany).not.toHaveBeenCalled();
  });

  it('retirada (null) → a natureza passa a exigir escolha no acto; e volta a ter omissão quando definida', async () => {
    await definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: null }, ctx);
    expect(await resolverContaNaturezaNotaDebito(db as never, 'JUROS_MORA', ctx)).toBeNull();
    await definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: 'c781' }, ctx);
    expect(await resolverContaNaturezaNotaDebito(db as never, 'JUROS_MORA', ctx)).toMatchObject({ codigo: '781' });
  });

  it('DESPESAS_REPERCUTIDAS aceita conta de gasto (classe 6) e recusa rendimento', async () => {
    await definirContaNaturezaNotaDebito({ natureza: 'DESPESAS_REPERCUTIDAS', contaId: 'c622' }, ctx);
    expect(await resolverContaNaturezaNotaDebito(db as never, 'DESPESAS_REPERCUTIDAS', ctx)).toMatchObject({ codigo: '622' });
    await expect(definirContaNaturezaNotaDebito({ natureza: 'DESPESAS_REPERCUTIDAS', contaId: 'c711' }, ctx))
      .rejects.toMatchObject({ code: 'CONTA_NATUREZA_INVALIDA' });
  });
});

describe('recusas — e nenhuma escreve', () => {
  it.each([
    ['classe errada (gasto para juros)', 'c622'],
    ['conta de agregação (não é folha)', 'c78'],
    ['conta inactiva', 'c769x'],
  ])('%s → CONTA_NATUREZA_INVALIDA', async (_, contaId) => {
    const erro = await definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId }, ctx).catch((e) => e);
    expect(erro).toBeInstanceOf(BusinessRuleError);
    expect(erro.code).toBe('CONTA_NATUREZA_INVALIDA');
    expect(db.contaNaturezaNotaDebito.create).not.toHaveBeenCalled();
    expect(db.contaNaturezaNotaDebito.update).not.toHaveBeenCalled();
    expect(await resolverContaNaturezaNotaDebito(db as never, 'JUROS_MORA', ctx)).toMatchObject({ codigo: '781' });
  });

  it('conta de outro tenant → NotFoundError (404), nunca 403', async () => {
    await expect(definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: 'alheia' }, ctx))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(db.contaNaturezaNotaDebito.create).not.toHaveBeenCalled();
    expect(db.contaNaturezaNotaDebito.update).not.toHaveBeenCalled();
  });
});

describe('isolamento por tenant', () => {
  it('a omissão de um tenant não é visível a outro', async () => {
    expect(await resolverContaNaturezaNotaDebito(db as never, 'JUROS_MORA', { tenantId: 'tenant-b', userId: 'u2' })).toBeNull();
  });

  it('todas as queries levam tenantId', async () => {
    await definirContaNaturezaNotaDebito({ natureza: 'JUROS_MORA', contaId: 'c789' }, ctx);
    await definirContaNaturezaNotaDebito({ natureza: 'PENALIZACAO', contaId: null }, ctx);
    await resolverContaNaturezaNotaDebito(db as never, 'JUROS_MORA', ctx);
    const wheres = [
      ...db.contaPGC.findFirst.mock.calls.map((c) => c[0].where),
      ...db.contaNaturezaNotaDebito.findFirst.mock.calls.map((c) => c[0].where),
      ...db.contaNaturezaNotaDebito.create.mock.calls.map((c) => c[0].data),
    ];
    expect(wheres.length).toBeGreaterThan(0);
    for (const w of wheres) expect(w.tenantId).toBe('tenant-a');
  });
});
