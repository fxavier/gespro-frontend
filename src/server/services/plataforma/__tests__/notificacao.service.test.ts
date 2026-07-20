/**
 * Testes unitários — NotificacaoService (WS 13)
 *
 * Cobre:
 *  - idempotência de emitir (mesmo tipo+entidade+userId no mesmo dia)
 *  - multi-tenant (cross-tenant devolve NotFoundError)
 *  - provider fake (email não tem I/O real)
 *  - marcarLida / marcarTodasLidas / naoLidasCount
 *  - actualizarPreferencia (upsert)
 *
 * Estratégia: prismaBase mockado via vi.mock; emailProvider mockado.
 * NÃO toca na DB partilhada.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks hoisted (antes dos imports)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  // Registar chamadas de email para assert
  const emailCalls: Array<{ para: string; assunto: string }> = [];

  const notificacaoCreate = vi.fn();
  const notificacaoFindFirst = vi.fn();
  const notificacaoFindUnique = vi.fn();
  const notificacaoFindMany = vi.fn();
  const notificacaoUpdate = vi.fn();
  const notificacaoUpdateMany = vi.fn();
  const notificacaoCount = vi.fn();
  const preferenciafindUnique = vi.fn();
  const preferenciaUpsert = vi.fn();
  const preferenciaFindMany = vi.fn();
  const userFindUnique = vi.fn();

  return {
    emailCalls,
    notificacaoCreate,
    notificacaoFindFirst,
    notificacaoFindUnique,
    notificacaoFindMany,
    notificacaoUpdate,
    notificacaoUpdateMany,
    notificacaoCount,
    preferenciafindUnique,
    preferenciaUpsert,
    preferenciaFindMany,
    userFindUnique,
  };
});

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    notificacao: {
      create: mocks.notificacaoCreate,
      findFirst: mocks.notificacaoFindFirst,
      findUnique: mocks.notificacaoFindUnique,
      findMany: mocks.notificacaoFindMany,
      update: mocks.notificacaoUpdate,
      updateMany: mocks.notificacaoUpdateMany,
      count: mocks.notificacaoCount,
    },
    preferenciaNotificacao: {
      findUnique: mocks.preferenciafindUnique,
      upsert: mocks.preferenciaUpsert,
      findMany: mocks.preferenciaFindMany,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock('@/server/email', () => ({
  emailProvider: {
    enviar: vi.fn(async (dto: { para: string; assunto: string }) => {
      mocks.emailCalls.push({ para: dto.para, assunto: dto.assunto });
    }),
  },
}));

vi.mock('@/server/email/templates/alerta', () => ({
  alertaTemplate: vi.fn(() => ({ html: '<p>teste</p>', texto: 'teste' })),
}));

import { notificacaoService } from '../notificacao.service';
import { NotFoundError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CTX_T1_U1 = { tenantId: 'tenant-1', userId: 'user-1' };
const CTX_T2_U2 = { tenantId: 'tenant-2', userId: 'user-2' };

const NOTIF_BASE = {
  id: 'notif-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  tipo: 'ALERTA_SISTEMA' as const,
  titulo: 'Teste',
  mensagem: 'Mensagem de teste',
  canal: 'IN_APP' as const,
  entidadeTipo: null,
  entidadeId: null,
  lida: false,
  lidaEm: null,
  estadoEnvio: 'PENDENTE' as const,
  enviadoEm: null,
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Antes de cada teste
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emailCalls.length = 0;

  // Defaults: preferência nula (usa defaults), sem duplicado
  mocks.preferenciafindUnique.mockResolvedValue(null);
  mocks.notificacaoFindFirst.mockResolvedValue(null);
  mocks.notificacaoCreate.mockResolvedValue({ id: 'notif-1' });
  mocks.notificacaoFindUnique.mockResolvedValue(NOTIF_BASE);
  mocks.notificacaoFindMany.mockResolvedValue([NOTIF_BASE]);
  mocks.notificacaoUpdate.mockResolvedValue(NOTIF_BASE);
  mocks.notificacaoUpdateMany.mockResolvedValue({ count: 1 });
  mocks.notificacaoCount.mockResolvedValue(3);
  mocks.preferenciaFindMany.mockResolvedValue([]);
  mocks.preferenciaUpsert.mockResolvedValue({});
  mocks.userFindUnique.mockResolvedValue({ email: 'user@test.mz' });
});

// ---------------------------------------------------------------------------
// emitir
// ---------------------------------------------------------------------------

describe('notificacaoService.emitir', () => {
  it('persiste a notificação e devolve o id', async () => {
    const result = await notificacaoService.emitir(
      {
        userId: 'user-1',
        tipo: 'ALERTA_SISTEMA',
        titulo: 'Alerta',
        mensagem: 'Detalhe do alerta',
      },
      CTX_T1_U1,
    );

    expect(result).toEqual({ id: 'notif-1' });
    expect(mocks.notificacaoCreate).toHaveBeenCalledOnce();
  });

  it('é idempotente: não cria duplicado se já existe hoje com mesmo tipo+entidade+userId', async () => {
    // Simular existente
    mocks.notificacaoFindFirst.mockResolvedValue({ id: 'notif-existente' });

    const result = await notificacaoService.emitir(
      {
        userId: 'user-1',
        tipo: 'DOCUMENTO_EXPIRADO',
        titulo: 'Doc expirado',
        mensagem: 'Doc X expirou',
        entidadeId: 'doc-abc',
      },
      CTX_T1_U1,
    );

    // Devolve o id existente sem criar novo
    expect(result).toEqual({ id: 'notif-existente' });
    expect(mocks.notificacaoCreate).not.toHaveBeenCalled();
  });

  it('cria notificação quando não há duplicado (mesmo tipo mas entidadeId diferente)', async () => {
    mocks.notificacaoFindFirst.mockResolvedValue(null);

    await notificacaoService.emitir(
      {
        userId: 'user-1',
        tipo: 'DOCUMENTO_EXPIRADO',
        titulo: 'Outro doc',
        mensagem: 'Doc Y expirou',
        entidadeId: 'doc-xyz',
      },
      CTX_T1_U1,
    );

    expect(mocks.notificacaoCreate).toHaveBeenCalledOnce();
  });

  it('usa os canais da preferência do utilizador quando existem', async () => {
    mocks.preferenciafindUnique.mockResolvedValue({
      canais: ['EMAIL'],
    });

    await notificacaoService.emitir(
      {
        userId: 'user-1',
        tipo: 'ALERTA_SISTEMA',
        titulo: 'T',
        mensagem: 'M',
      },
      CTX_T1_U1,
    );

    const call = mocks.notificacaoCreate.mock.calls[0]?.[0];
    expect(call.data.canal).toBe('EMAIL');
  });
});

// ---------------------------------------------------------------------------
// listar
// ---------------------------------------------------------------------------

describe('notificacaoService.listar', () => {
  it('filtra sempre por tenantId + userId (isolamento multi-tenant)', async () => {
    await notificacaoService.listar({}, CTX_T1_U1);

    const call = mocks.notificacaoFindMany.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('tenant-1');
    expect(call.where.userId).toBe('user-1');
  });

  it('aplica filtro apenasNaoLidas quando pedido', async () => {
    await notificacaoService.listar({ apenasNaoLidas: true }, CTX_T1_U1);

    const call = mocks.notificacaoFindMany.mock.calls[0]?.[0];
    expect(call.where.lida).toBe(false);
  });

  it('utilizador de tenant diferente não vê as notificações de T1', async () => {
    // T2 chama listar — query filtra por tenant-2, retorno vazio
    mocks.notificacaoFindMany.mockResolvedValue([]);

    const result = await notificacaoService.listar({}, CTX_T2_U2);

    expect(result.items).toHaveLength(0);
    const call = mocks.notificacaoFindMany.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('tenant-2');
  });
});

// ---------------------------------------------------------------------------
// marcarLida
// ---------------------------------------------------------------------------

describe('notificacaoService.marcarLida', () => {
  it('marca a notificação como lida quando pertence ao utilizador', async () => {
    await notificacaoService.marcarLida('notif-1', CTX_T1_U1);
    expect(mocks.notificacaoUpdate).toHaveBeenCalledOnce();
    const call = mocks.notificacaoUpdate.mock.calls[0]?.[0];
    expect(call.data.lida).toBe(true);
  });

  it('lança NotFoundError se a notificação pertence a outro tenant (cross-tenant 404)', async () => {
    // Simulação: notificação existe mas é de outro tenant
    mocks.notificacaoFindUnique.mockResolvedValue({
      ...NOTIF_BASE,
      tenantId: 'tenant-outro',
      userId: 'user-outro',
    });

    await expect(
      notificacaoService.marcarLida('notif-1', CTX_T1_U1),
    ).rejects.toThrow(NotFoundError);

    expect(mocks.notificacaoUpdate).not.toHaveBeenCalled();
  });

  it('lança NotFoundError se a notificação não existe', async () => {
    mocks.notificacaoFindUnique.mockResolvedValue(null);

    await expect(
      notificacaoService.marcarLida('notif-inexistente', CTX_T1_U1),
    ).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// marcarTodasLidas
// ---------------------------------------------------------------------------

describe('notificacaoService.marcarTodasLidas', () => {
  it('actualiza apenas as notificações do tenant+utilizador', async () => {
    mocks.notificacaoUpdateMany.mockResolvedValue({ count: 5 });

    const result = await notificacaoService.marcarTodasLidas(CTX_T1_U1);

    expect(result.count).toBe(5);
    const call = mocks.notificacaoUpdateMany.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('tenant-1');
    expect(call.where.userId).toBe('user-1');
    expect(call.where.lida).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// naoLidasCount
// ---------------------------------------------------------------------------

describe('notificacaoService.naoLidasCount', () => {
  it('conta apenas as notificações não lidas do utilizador no seu tenant', async () => {
    mocks.notificacaoCount.mockResolvedValue(7);

    const count = await notificacaoService.naoLidasCount(CTX_T1_U1);

    expect(count).toBe(7);
    const call = mocks.notificacaoCount.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('tenant-1');
    expect(call.where.userId).toBe('user-1');
    expect(call.where.lida).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------

describe('notificacaoService.actualizarPreferencia', () => {
  it('faz upsert da preferência por userId+tipo', async () => {
    await notificacaoService.actualizarPreferencia(
      'DOCUMENTO_EXPIRADO',
      ['IN_APP'],
      CTX_T1_U1,
    );

    expect(mocks.preferenciaUpsert).toHaveBeenCalledOnce();
    const call = mocks.preferenciaUpsert.mock.calls[0]?.[0];
    expect(call.where.userId_tipo.userId).toBe('user-1');
    expect(call.where.userId_tipo.tipo).toBe('DOCUMENTO_EXPIRADO');
    expect(call.update.canais).toEqual(['IN_APP']);
  });

  it('inclui tenantId no create (isolamento multi-tenant)', async () => {
    await notificacaoService.actualizarPreferencia(
      'ALERTA_SISTEMA',
      ['EMAIL', 'IN_APP'],
      CTX_T1_U1,
    );

    const call = mocks.preferenciaUpsert.mock.calls[0]?.[0];
    expect(call.create.tenantId).toBe('tenant-1');
  });
});

describe('notificacaoService.obterPreferencias', () => {
  it('filtra por tenantId + userId', async () => {
    await notificacaoService.obterPreferencias(CTX_T1_U1);

    const call = mocks.preferenciaFindMany.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('tenant-1');
    expect(call.where.userId).toBe('user-1');
  });
});
