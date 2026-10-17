/**
 * `servicoService.listarAgendamentos` aplica a pesquisa (`termo`: serviço, cliente ou código) da
 * lista de agendamentos — antes era ignorada e a lista não mudava.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));

describe.skipIf(skip)('Lista de agendamentos — pesquisa (DB efémera)', () => {
  let servicos: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];

  const sufixo = Date.now();
  const TENANT = `tenant-ag-pesquisa-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: `user-ag-pesquisa-${sufixo}` };

  const listar = (filtros: Record<string, unknown>) =>
    runCtx(ctx, () => servicos.listarAgendamentos({ take: 25, ...filtros }, ctx))
      .then((r: any) => r.items.map((a: any) => a.codigo).sort());

  beforeAll(async () => {
    const { prismaBase: db } = (await import('@/server/db/client')) as any;
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ servicoService: servicos } = await import('@/server/services/compras/servico.service'));

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant pesquisa', slug: `ag-pesquisa-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    const srv = (codigo: string, nome: string) =>
      db.servico.create({ data: { tenantId: TENANT, codigo, nome, preco: '1000', duracaoEstimada: 60 } });
    const limpeza = await srv('SRV-L', 'Limpeza de escritório');
    const reparacao = await srv('SRV-R', 'Reparação de bomba');

    const base = {
      tenantId: TENANT, clienteId: 'cli', clienteEmail: 'c@test.mz', clienteTelefone: '840000000',
      dataAgendamento: new Date('2026-12-01T10:00:00Z'), horaInicio: '09:00', horaFim: '10:00',
      duracaoEstimada: 60, local: 'Escritório', endereco: 'Av. 24 de Julho', cidade: 'Maputo',
      provincia: 'Maputo', precoServico: '1000', total: '1160',
    };
    await db.agendamentoServico.createMany({
      data: [
        { ...base, codigo: 'AG-001', servicoId: limpeza.id, clienteNome: 'Padaria Central' },
        { ...base, codigo: 'AG-002', servicoId: reparacao.id, clienteNome: 'Hotel Polana' },
        { ...base, codigo: 'XPTO-9', servicoId: reparacao.id, clienteNome: 'Farmácia Sol' },
      ],
    });
  }, 180_000);

  it('sem termo devolve todos', async () => {
    expect(await listar({})).toEqual(['AG-001', 'AG-002', 'XPTO-9']);
  });

  it('pesquisa por serviço, cliente e código, sem distinguir maiúsculas', async () => {
    expect(await listar({ termo: 'LIMPEZA' })).toEqual(['AG-001']);
    expect(await listar({ termo: 'polana' })).toEqual(['AG-002']);
    expect(await listar({ termo: 'xpto' })).toEqual(['XPTO-9']);
    expect(await listar({ termo: 'reparação' })).toEqual(['AG-002', 'XPTO-9']);
    expect(await listar({ termo: 'nada-disto' })).toEqual([]);
  });

  it('combina com o filtro de estado', async () => {
    expect(await listar({ termo: 'reparação', status: 'CONCLUIDO' })).toEqual([]);
  });
});
