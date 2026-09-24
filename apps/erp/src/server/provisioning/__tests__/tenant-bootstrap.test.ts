import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DIARIOS_INICIAIS,
  SERIES_INICIAIS,
  bootstrapContabilidade,
  bootstrapContasNaturezaNotaDebito,
  bootstrapDiarios,
  bootstrapPlanoContas,
  bootstrapRbac,
  bootstrapSeriesDocumento,
  classeEnum,
  derivarTipoConta,
  garantirCatalogoPermissoes,
} from '../tenant-bootstrap';
import { CONTA_PADRAO_NATUREZA_ND } from '@/lib/nota-debito';

interface Linha {
  id: string;
  tenantId: string;
  nivel: number;
  contaMaeId: string | null;
  tipo: string;
  ano: number;
  proximoNumero: number;
  permissionId: string;
}

type ArgsCreateMany = { data: Array<Partial<Linha>> };
type ArgsUpsert = {
  where: { tenantId_nome: { tenantId: string; nome: string } };
  create: { tenantId: string; nome: string };
};

function fakeTx() {
  const createMany = () =>
    vi.fn(async ({ data }: ArgsCreateMany) => ({ count: data.length }));
  return {
    contaPGC: {
      createMany: createMany(),
      // O plano semeado tem as três contas por omissão das naturezas de ND.
      findMany: vi.fn(async () => [
        { id: 'c711', codigo: '711', classe: 'CLASSE_7' },
        { id: 'c781', codigo: '781', classe: 'CLASSE_7' },
        { id: 'c769', codigo: '769', classe: 'CLASSE_7' },
      ]),
    },
    contaNaturezaNotaDebito: {
      createMany: vi.fn(async ({ data }: { data: unknown[]; skipDuplicates?: boolean }) => ({ count: data.length })),
    },
    diario: { createMany: createMany() },
    serieDocumento: { createMany: createMany() },
    permission: {
      createMany: vi.fn(async (_args: ArgsCreateMany) => ({ count: 0 })),
      findMany: vi.fn(async () => [{ id: 'p1', code: 'faturacao:ver' }]),
    },
    role: {
      upsert: vi.fn(async ({ create }: ArgsUpsert) => ({
        id: `role-${create.nome}`,
        nome: create.nome,
      })),
    },
    rolePermission: { createMany: vi.fn(async (_args: ArgsCreateMany) => ({ count: 1 })) },
  };
}

let tx: ReturnType<typeof fakeTx>;

beforeEach(() => {
  tx = fakeTx();
});

describe('derivação do plano PGC-NIRF', () => {
  it('mapeia a classe para o enum SCREAMING_SNAKE', () => {
    expect(classeEnum(1)).toBe('CLASSE_1');
    expect(classeEnum(8)).toBe('CLASSE_8');
  });

  it('deriva o tipo de conta pelas classes 5–8 e pela natureza nas classes 1–4', () => {
    expect(derivarTipoConta(5, 'CREDORA')).toBe('CAPITAL_PROPRIO');
    expect(derivarTipoConta(6, 'DEVEDORA')).toBe('GASTO');
    expect(derivarTipoConta(7, 'CREDORA')).toBe('RENDIMENTO');
    expect(derivarTipoConta(8, 'CREDORA')).toBe('RESULTADO');
    expect(derivarTipoConta(1, 'DEVEDORA')).toBe('ATIVO');
    expect(derivarTipoConta(2, 'CREDORA')).toBe('PASSIVO');
  });
});

describe('bootstrapPlanoContas', () => {
  it('cria o plano completo com tenantId explícito em cada linha', async () => {
    const total = await bootstrapPlanoContas(tx as never, 'tenant-1');

    expect(total).toBeGreaterThan(400); // 504 contas no PGC-NIRF
    const linhas = tx.contaPGC.createMany.mock.calls.flatMap((c) => c[0].data);
    expect(linhas.every((l) => l.tenantId === 'tenant-1')).toBe(true);
  });

  it('insere por nível ascendente — a mãe existe antes da subconta (FK auto-referencial)', async () => {
    await bootstrapPlanoContas(tx as never, 'tenant-1');
    const niveis = tx.contaPGC.createMany.mock.calls.map((c) => c[0].data[0].nivel as number);
    expect(niveis).toEqual([...niveis].sort((a, b) => a - b));
  });

  it('resolve contaMaeId para ids já emitidos, nunca para códigos', async () => {
    await bootstrapPlanoContas(tx as never, 'tenant-1');
    const linhas = tx.contaPGC.createMany.mock.calls.flatMap((c) => c[0].data);
    const ids = new Set(linhas.map((l) => l.id));

    // A hierarquia tem mesmo de existir. O `for` abaixo passa à mesma se TODAS
    // as contas ficarem órfãs — foi o que quase aconteceu ao renomear a chave
    // `contaMaeCodigo` no JSON: um nome trocado não dá erro de compilação,
    // deixa só o plano inteiro plano.
    const comMae = linhas.filter((l) => l.contaMaeId);
    expect(comMae.length).toBeGreaterThan(400);

    for (const l of linhas) {
      if (l.contaMaeId) expect(ids.has(l.contaMaeId)).toBe(true);
    }
  });

  it('gera ids distintos para cada conta', async () => {
    await bootstrapPlanoContas(tx as never, 'tenant-1');
    const linhas = tx.contaPGC.createMany.mock.calls.flatMap((c) => c[0].data);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(linhas.length);
  });
});

describe('diários e séries', () => {
  it('cria os 9 diários contabilísticos com tenantId', async () => {
    const n = await bootstrapDiarios(tx as never, 'tenant-1');
    expect(n).toBe(DIARIOS_INICIAIS.length);
    const data = tx.diario.createMany.mock.calls[0][0].data;
    expect(data.every((d) => d.tenantId === 'tenant-1')).toBe(true);
  });

  it('cria uma série por tipo de documento, para o ano indicado', async () => {
    const n = await bootstrapSeriesDocumento(tx as never, 'tenant-1', 2030);
    expect(n).toBe(SERIES_INICIAIS.length);
    const data = tx.serieDocumento.createMany.mock.calls[0][0].data;

    // Cada tipo que um serviço pede tem de estar aqui: sem série, a operação
    // inteira falha dentro da transacção. Foi o que aconteceu às encomendas,
    // às devoluções e às contagens de stock — o enum cresceu, a lista não.
    const tipos = new Set(data.map((s) => (s as { tipo: string }).tipo));
    for (const obrigatorio of [
      'FATURA',
      'VENDA',
      'SESSAO_CAIXA',
      'ENCOMENDA',
      'NOTA_DEVOLUCAO',
      'CONTAGEM_STOCK',
      'PAGAMENTO',
    ]) {
      expect(tipos).toContain(obrigatorio);
    }
    // Prefixos distintos, senão a chave @@unique([tenantId, tipo, ano, prefixo])
    // deixa passar mas o utilizador vê dois documentos com a mesma cara.
    const prefixos = data.map((s) => (s as { prefixo: string }).prefixo);
    expect(new Set(prefixos).size).toBe(prefixos.length);
    expect(data.every((s) => s.ano === 2030)).toBe(true);
    expect(data.every((s) => s.proximoNumero === 1)).toBe(true);
    expect(data.every((s) => s.tenantId === 'tenant-1')).toBe(true);
  });

  it('inclui a série de FATURA (sem ela não se emite nada)', async () => {
    await bootstrapSeriesDocumento(tx as never, 'tenant-1');
    const data = tx.serieDocumento.createMany.mock.calls[0][0].data;
    expect(data.map((s) => s.tipo)).toContain('FATURA');
  });

  it('bootstrapContabilidade encadeia os três passos', async () => {
    const r = await bootstrapContabilidade(tx as never, 'tenant-1');
    expect(r.contas).toBeGreaterThan(0);
    expect(r.diarios).toBe(DIARIOS_INICIAIS.length);
    expect(r.series).toBe(SERIES_INICIAIS.length);
    expect(tx.contaNaturezaNotaDebito.createMany).toHaveBeenCalledTimes(1);
  });
});

describe('conta de crédito por natureza de ND (ADR-0039 §1)', () => {
  it('semeia ACERTO_PRECO→711, JUROS_MORA→781, PENALIZACAO→769, pelo id da conta do tenant', async () => {
    const n = await bootstrapContasNaturezaNotaDebito(tx as never, 'tenant-1');
    const args = tx.contaNaturezaNotaDebito.createMany.mock.calls[0][0];
    expect(n).toBe(3);
    expect(args.skipDuplicates).toBe(true); // não substitui o que o tenant já escolheu
    expect(args.data).toEqual([
      { tenantId: 'tenant-1', natureza: 'ACERTO_PRECO', contaId: 'c711' },
      { tenantId: 'tenant-1', natureza: 'JUROS_MORA', contaId: 'c781' },
      { tenantId: 'tenant-1', natureza: 'PENALIZACAO', contaId: 'c769' },
    ]);
    const where = (tx.contaPGC.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ tenantId: 'tenant-1', aceitaLancamento: true, ativo: true });
  });

  it('DESPESAS_REPERCUTIDAS e OUTRO ficam sem omissão (escolhe-se no acto)', () => {
    expect(Object.keys(CONTA_PADRAO_NATUREZA_ND)).not.toContain('DESPESAS_REPERCUTIDAS');
    expect(Object.keys(CONTA_PADRAO_NATUREZA_ND)).not.toContain('OUTRO');
  });

  it('conta em falta no plano do tenant → a natureza fica sem linha, nunca com uma conta inventada', async () => {
    tx.contaPGC.findMany.mockResolvedValueOnce([{ id: 'c711', codigo: '711', classe: 'CLASSE_7' }]);
    await bootstrapContasNaturezaNotaDebito(tx as never, 'tenant-1');
    expect(tx.contaNaturezaNotaDebito.createMany.mock.calls[0][0].data).toEqual([
      { tenantId: 'tenant-1', natureza: 'ACERTO_PRECO', contaId: 'c711' },
    ]);
  });

  it('conta com o código certo mas classe errada (plano divergente) → também fica sem linha', async () => {
    tx.contaPGC.findMany.mockResolvedValueOnce([
      { id: 'c711', codigo: '711', classe: 'CLASSE_7' },
      { id: 'c781', codigo: '781', classe: 'CLASSE_6' },
    ]);
    await bootstrapContasNaturezaNotaDebito(tx as never, 'tenant-1');
    expect((tx.contaNaturezaNotaDebito.createMany.mock.calls[0][0].data as Array<{ natureza: string }>).map((l) => l.natureza))
      .toEqual(['ACERTO_PRECO']);
  });
});

describe('catálogo global de permissões', () => {
  it('garantirCatalogoPermissoes escreve o catálogo com skipDuplicates', async () => {
    await garantirCatalogoPermissoes(tx as never);
    const args = tx.permission.createMany.mock.calls[0][0] as unknown as {
      data: unknown[];
      skipDuplicates: boolean;
    };
    expect(args.skipDuplicates).toBe(true);
    expect(args.data.length).toBeGreaterThan(100);
  });
});

describe('bootstrapRbac', () => {
  it('NÃO escreve o catálogo global dentro da transacção do tenant', async () => {
    // MAJOR-8: Permission.code é único e global; dois provisionamentos
    // concorrentes a escrever as mesmas ~400 linhas dentro das suas transacções
    // bloqueiam-se no mesmo índice, com deadlock possível num endpoint público.
    await bootstrapRbac(tx as never, 'tenant-1');
    expect(tx.permission.createMany).not.toHaveBeenCalled();
    expect(tx.permission.findMany).toHaveBeenCalled();
  });

  it('cria os roles de sistema do tenant e devolve-os', async () => {
    const roles = await bootstrapRbac(tx as never, 'tenant-1');
    expect(roles.map((r) => r.nome)).toContain('ADMIN');
    for (const call of tx.role.upsert.mock.calls) {
      expect(call[0].create.tenantId).toBe('tenant-1');
      expect(call[0].where.tenantId_nome.tenantId).toBe('tenant-1');
    }
  });

  it('só liga permissões que existem no catálogo', async () => {
    await bootstrapRbac(tx as never, 'tenant-1');
    const ligacoes = tx.rolePermission.createMany.mock.calls.flatMap((c) => c[0].data);
    expect(ligacoes.every((l) => l.permissionId === 'p1')).toBe(true);
  });
});

describe('plano-contas-pgc.json — natureza das classes', () => {
  // O ficheiro tinha as classes 6 e 7 trocadas: 145 contas de gasto marcadas
  // `CREDORA` e 87 de rendimento `DEVEDORA`. O `montarLinhasBalancete` usa a
  // natureza para dar sinal ao saldo, por isso o balancete mostrava a receita
  // em negativo e a DRE herdava o erro. Isto tranca a correcção: o ficheiro é
  // gerado, e uma regeneração podia voltar a invertê-las em silêncio.
  const contas: Array<{ codigo: string; classe: number; natureza: string }> =
    require('../../../../prisma/seed/data/plano-contas-pgc.json');

  it('gasta-se a débito: toda a classe 6 é DEVEDORA', () => {
    const erradas = contas.filter((c) => c.classe === 6 && c.natureza !== 'DEVEDORA');
    expect(erradas.map((c) => c.codigo)).toEqual([]);
  });

  it('ganha-se a crédito: toda a classe 7 é CREDORA', () => {
    const erradas = contas.filter((c) => c.classe === 7 && c.natureza !== 'CREDORA');
    expect(erradas.map((c) => c.codigo)).toEqual([]);
  });

  it('a natureza não altera o tipo das classes 5–8 — só o sinal do saldo', () => {
    expect(derivarTipoConta(6, 'DEVEDORA')).toBe('GASTO');
    expect(derivarTipoConta(7, 'CREDORA')).toBe('RENDIMENTO');
  });
});
