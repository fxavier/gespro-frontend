/**
 * `servicoService.listarServicos` aplica a pesquisa (`termo`: nome, código ou descrição) e o
 * filtro `tipoServico` da lista de serviços — antes eram ignorados e a lista não mudava.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

describe.skipIf(skip)('Lista de serviços — pesquisa e filtro por tipo (DB efémera)', () => {
  let servicos: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];

  const sufixo = Date.now();
  const TENANT = `tenant-srv-filtros-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: `user-srv-filtros-${sufixo}` };

  const listar = (filtros: Record<string, unknown>) =>
    runCtx(ctx, () => servicos.listarServicos({ take: 25, orderBy: 'nome', orderDir: 'asc', ...filtros }, ctx))
      .then((r: any) => r.items.map((s: any) => s.codigo).sort());

  beforeAll(async () => {
    const { prismaBase: db } = (await import('@/server/db/client')) as any;
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ servicoService: servicos } = await import('@/server/services/compras/servico.service'));

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant filtros', slug: `srv-filtros-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    const base = { tenantId: TENANT, preco: '1000', taxaIva: '0.16', duracaoEstimada: 60 };
    await db.servico.createMany({
      data: [
        { ...base, codigo: 'SRV-A', nome: 'Instalação de ar condicionado', tipoServico: 'INSTALACAO' },
        { ...base, codigo: 'SRV-B', nome: 'Limpeza de escritório', tipoServico: 'LIMPEZA', descricao: 'Inclui janelas' },
        { ...base, codigo: 'XPTO-9', nome: 'Reparação de bomba', tipoServico: 'REPARACAO' },
      ],
    });
  }, 180_000);

  it('sem filtros devolve todos', async () => {
    expect(await listar({})).toEqual(['SRV-A', 'SRV-B', 'XPTO-9']);
  });

  it('pesquisa por nome, código e descrição, sem distinguir maiúsculas', async () => {
    expect(await listar({ termo: 'LIMPEZA' })).toEqual(['SRV-B']);
    expect(await listar({ termo: 'xpto' })).toEqual(['XPTO-9']);
    expect(await listar({ termo: 'janelas' })).toEqual(['SRV-B']);
    expect(await listar({ termo: 'nada-disto' })).toEqual([]);
  });

  it('filtra por tipo e combina com a pesquisa', async () => {
    expect(await listar({ tipoServico: 'INSTALACAO' })).toEqual(['SRV-A']);
    expect(await listar({ tipoServico: 'LIMPEZA', termo: 'srv' })).toEqual(['SRV-B']);
    expect(await listar({ tipoServico: 'INSTALACAO', termo: 'xpto' })).toEqual([]);
  });
});
