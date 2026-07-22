import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DIARIOS_INICIAIS,
  SERIES_INICIAIS,
  bootstrapContabilidade,
  bootstrapDiarios,
  bootstrapPlanoContas,
  bootstrapRbac,
  bootstrapSeriesDocumento,
  classeEnum,
  derivarTipoConta,
  garantirCatalogoPermissoes,
} from '../tenant-bootstrap';

interface Linha {
  id: string;
  tenantId: string;
  nivel: number;
  contaPaiId: string | null;
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
    contaPGC: { createMany: createMany() },
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

  it('insere por nível ascendente — o pai existe antes do filho (FK auto-referencial)', async () => {
    await bootstrapPlanoContas(tx as never, 'tenant-1');
    const niveis = tx.contaPGC.createMany.mock.calls.map((c) => c[0].data[0].nivel as number);
    expect(niveis).toEqual([...niveis].sort((a, b) => a - b));
  });

  it('resolve contaPaiId para ids já emitidos, nunca para códigos', async () => {
    await bootstrapPlanoContas(tx as never, 'tenant-1');
    const linhas = tx.contaPGC.createMany.mock.calls.flatMap((c) => c[0].data);
    const ids = new Set(linhas.map((l) => l.id));
    for (const l of linhas) {
      if (l.contaPaiId) expect(ids.has(l.contaPaiId)).toBe(true);
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
