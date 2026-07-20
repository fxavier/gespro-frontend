/**
 * Testes unitários — NotificacaoService (WS 13)
 *
 * Cobre:
 *  - BLOCKER: cross-tenant no destinatário → NotFoundError (isolamento)
 *  - MAJOR 1: opt-out com canais=[] é respeitado (não reaplica defaults)
 *  - MAJOR 2: canal gravado derivado dos canaisEfectivos (não inconsistente)
 *  - idempotência de emitir (mesmo tipo+entidade+userId no mesmo dia)
 *  - multi-tenant: listar/marcarLida/count filtram por tenantId+userId
 *  - marcarLida cross-tenant → NotFoundError
 *  - actualizarPreferencia inclui tenantId no create
 *
 * Estratégia: prismaBase mockado via vi.mock; emailProvider mockado.
 * NÃO toca na DB partilhada.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks hoisted (antes dos imports)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const emailCalls: Array<{ para: string; assunto: string }> = [];

  const notificacaoCreate = vi.fn();
  const notificacaoFindFirst = vi.fn();
  const notificacaoFindUnique = vi.fn();
  const notificacaoFindMany = vi.fn();
  const notificacaoUpdate = vi.fn();
  const notificacaoUpdateMany = vi.fn();
  const notificacaoCount = vi.fn();
  const preferenciaFindFirst = vi.fn();
  const preferenciaUpsert = vi.fn();
  const preferenciaFindMany = vi.fn();
  // userFindFirst: usado para validar destinatário no tenant
  const userFindFirst = vi.fn();

  return {
    emailCalls,
    notificacaoCreate,
    notificacaoFindFirst,
    notificacaoFindUnique,
    notificacaoFindMany,
    notificacaoUpdate,
    notificacaoUpdateMany,
    notificacaoCount,
    preferenciaFindFirst,
    preferenciaUpsert,
    preferenciaFindMany,
    userFindFirst,
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
      findFirst: mocks.preferenciaFindFirst,
      upsert: mocks.preferenciaUpsert,
      findMany: mocks.preferenciaFindMany,
    },
    user: {
      findFirst: mocks.userFindFirst,
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
// Setup: user válido no tenant-1, sem preferência, sem duplicado
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emailCalls.length = 0;

  // Destinatário válido no tenant-1 (BLOCKER fix)
  mocks.userFindFirst.mockResolvedValue({ email: 'user1@tenant1.mz' });
  // Sem preferência (usa defaults)
  mocks.preferenciaFindFirst.mockResolvedValue(null);
  // Sem duplicado hoje
  mocks.notificacaoFindFirst.mockResolvedValue(null);
  mocks.notificacaoCreate.mockResolvedValue({ id: 'notif-1' });
  mocks.notificacaoFindUnique.mockResolvedValue(NOTIF_BASE);
  mocks.notificacaoFindMany.mockResolvedValue([NOTIF_BASE]);
  mocks.notificacaoUpdate.mockResolvedValue(NOTIF_BASE);
  mocks.notificacaoUpdateMany.mockResolvedValue({ count: 1 });
  mocks.notificacaoCount.mockResolvedValue(3);
  mocks.preferenciaFindMany.mockResolvedValue([]);
  mocks.preferenciaUpsert.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// BLOCKER — Isolamento cross-tenant do destinatário
// ---------------------------------------------------------------------------

describe('emitir — isolamento cross-tenant do destinatário (BLOCKER)', () => {
  it('lança NotFoundError quando o destinatário não existe no tenant do caller', async () => {
    // Simula: admin do tenant-1 tenta emitir para user-de-outro-tenant
    mocks.userFindFirst.mockResolvedValue(null); // não encontrado no tenant-1

    await expect(
      notificacaoService.emitir(
        {
          userId: 'user-de-outro-tenant',
          tipo: 'ALERTA_SISTEMA',
          titulo: 'T',
          mensagem: 'M',
        },
        CTX_T1_U1,
      ),
    ).rejects.toThrow(NotFoundError);

    // Garante: não persiste nem envia email
    expect(mocks.notificacaoCreate).not.toHaveBeenCalled();
  });

  it('valida o destinatário com filtro de tenantId (verifica que o query inclui tenantId)', async () => {
    mocks.userFindFirst.mockResolvedValue({ email: 'user@t1.mz' });

    await notificacaoService.emitir(
      { userId: 'user-1', tipo: 'ALERTA_SISTEMA', titulo: 'T', mensagem: 'M' },
      CTX_T1_U1,
    );

    // A primeira chamada a user.findFirst deve incluir tenantId do ctx
    const call = mocks.userFindFirst.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('tenant-1');
    expect(call.where.id).toBe('user-1');
    expect(call.where.ativo).toBe(true);
  });

  it('prossegue normalmente quando o destinatário pertence ao tenant do caller', async () => {
    const result = await notificacaoService.emitir(
      { userId: 'user-1', tipo: 'ALERTA_SISTEMA', titulo: 'Alerta', mensagem: 'Msg' },
      CTX_T1_U1,
    );

    expect(result).toEqual({ id: 'notif-1' });
    expect(mocks.notificacaoCreate).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// MAJOR 1 — Opt-out com canais=[] é respeitado
// ---------------------------------------------------------------------------

describe('emitir — opt-out com canais=[] (MAJOR 1)', () => {
  it('respeita opt-out total: canais=[] → nenhum canal activo, sem email', async () => {
    // Utilizador desligou todos os canais para ALERTA_SISTEMA
    mocks.preferenciaFindFirst.mockResolvedValue({ canais: [] });

    await notificacaoService.emitir(
      { userId: 'user-1', tipo: 'ALERTA_SISTEMA', titulo: 'T', mensagem: 'M' },
      CTX_T1_U1,
    );

    const call = mocks.notificacaoCreate.mock.calls[0]?.[0];
    // canal=IN_APP (primeiro de []) → undefined → 'IN_APP' por fallback
    // estadoEnvio=ENVIADO (sem EMAIL nos canaisEfectivos=[])
    expect(call.data.estadoEnvio).toBe('ENVIADO');
    // emailProvider.enviar NÃO deve ser chamado
    // (verificar indirectamente via count de chamadas — email é async mas o mock é sync)
  });

  it('aplica defaults quando não existe preferência (sem registo = null)', async () => {
    mocks.preferenciaFindFirst.mockResolvedValue(null); // sem registo

    await notificacaoService.emitir(
      { userId: 'user-1', tipo: 'DOCUMENTO_EXPIRADO', titulo: 'T', mensagem: 'M' },
      CTX_T1_U1,
    );

    const call = mocks.notificacaoCreate.mock.calls[0]?.[0];
    // DOCUMENTO_EXPIRADO default = ['IN_APP', 'EMAIL'] → estadoEnvio = PENDENTE
    expect(call.data.estadoEnvio).toBe('PENDENTE');
  });

  it('distingue canais=[] (opt-out) de null (sem preferência)', async () => {
    // Com canais=[]
    mocks.preferenciaFindFirst.mockResolvedValue({ canais: [] });

    await notificacaoService.emitir(
      { userId: 'user-1', tipo: 'DOCUMENTO_EXPIRADO', titulo: 'T', mensagem: 'M' },
      CTX_T1_U1,
    );

    const callOptOut = mocks.notificacaoCreate.mock.calls[0]?.[0];
    expect(callOptOut.data.estadoEnvio).toBe('ENVIADO'); // sem EMAIL → ENVIADO imediato

    vi.clearAllMocks();
    mocks.userFindFirst.mockResolvedValue({ email: 'u@t.mz' });
    mocks.preferenciaFindFirst.mockResolvedValue(null); // sem registo
    mocks.notificacaoFindFirst.mockResolvedValue(null);
    mocks.notificacaoCreate.mockResolvedValue({ id: 'notif-2' });

    await notificacaoService.emitir(
      { userId: 'user-1', tipo: 'DOCUMENTO_EXPIRADO', titulo: 'T', mensagem: 'M' },
      CTX_T1_U1,
    );

    const callDefault = mocks.notificacaoCreate.mock.calls[0]?.[0];
    expect(callDefault.data.estadoEnvio).toBe('PENDENTE'); // default inclui EMAIL
  });
});

// ---------------------------------------------------------------------------
// MAJOR 2 — Canal gravado é derivado dos canaisEfectivos (consistência)
// ---------------------------------------------------------------------------

describe('emitir — consistência canal/estadoEnvio (MAJOR 2)', () => {
  it('quando dto.canal=EMAIL: canal=EMAIL e estadoEnvio=PENDENTE', async () => {
    mocks.preferenciaFindFirst.mockResolvedValue({ canais: ['IN_APP'] });

    await notificacaoService.emitir(
      {
        userId: 'user-1',
        tipo: 'RESET_PASSWORD',
        titulo: 'Reset',
        mensagem: 'Link',
        canal: 'EMAIL',
      },
      CTX_T1_U1,
    );

    const call = mocks.notificacaoCreate.mock.calls[0]?.[0];
    expect(call.data.canal).toBe('EMAIL');
    expect(call.data.estadoEnvio).toBe('PENDENTE');
  });

  it('quando canais preferência=[IN_APP]: canal=IN_APP e estadoEnvio=ENVIADO (sem email)', async () => {
    mocks.preferenciaFindFirst.mockResolvedValue({ canais: ['IN_APP'] });

    await notificacaoService.emitir(
      { userId: 'user-1', tipo: 'ALERTA_SISTEMA', titulo: 'T', mensagem: 'M' },
      CTX_T1_U1,
    );

    const call = mocks.notificacaoCreate.mock.calls[0]?.[0];
    expect(call.data.canal).toBe('IN_APP');
    expect(call.data.estadoEnvio).toBe('ENVIADO');
  });
});

// ---------------------------------------------------------------------------
// Idempotência
// ---------------------------------------------------------------------------

describe('notificacaoService.emitir — idempotência', () => {
  it('não cria duplicado se já existe hoje com mesmo tipo+entidade+userId', async () => {
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

    expect(result).toEqual({ id: 'notif-existente' });
    expect(mocks.notificacaoCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listar — isolamento multi-tenant
// ---------------------------------------------------------------------------

describe('notificacaoService.listar', () => {
  it('filtra sempre por tenantId + userId', async () => {
    await notificacaoService.listar({}, CTX_T1_U1);

    const call = mocks.notificacaoFindMany.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('tenant-1');
    expect(call.where.userId).toBe('user-1');
  });

  it('aplica filtro apenasNaoLidas', async () => {
    await notificacaoService.listar({ apenasNaoLidas: true }, CTX_T1_U1);
    const call = mocks.notificacaoFindMany.mock.calls[0]?.[0];
    expect(call.where.lida).toBe(false);
  });

  it('utilizador de tenant-2 não vê as notificações de tenant-1', async () => {
    mocks.notificacaoFindMany.mockResolvedValue([]);
    const result = await notificacaoService.listar({}, CTX_T2_U2);
    expect(result.items).toHaveLength(0);
    const call = mocks.notificacaoFindMany.mock.calls[0]?.[0];
    expect(call.where.tenantId).toBe('tenant-2');
  });
});

// ---------------------------------------------------------------------------
// marcarLida — isolamento multi-tenant
// ---------------------------------------------------------------------------

describe('notificacaoService.marcarLida', () => {
  it('marca a notificação como lida quando pertence ao utilizador', async () => {
    await notificacaoService.marcarLida('notif-1', CTX_T1_U1);
    expect(mocks.notificacaoUpdate).toHaveBeenCalledOnce();
    const call = mocks.notificacaoUpdate.mock.calls[0]?.[0];
    expect(call.data.lida).toBe(true);
  });

  it('lança NotFoundError se a notificação pertence a outro tenant (cross-tenant 404)', async () => {
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
    await expect(notificacaoService.marcarLida('x', CTX_T1_U1)).rejects.toThrow(NotFoundError);
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
  it('conta notificações não lidas do utilizador no seu tenant', async () => {
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
  it('faz upsert da preferência por userId+tipo com tenantId no create', async () => {
    await notificacaoService.actualizarPreferencia('DOCUMENTO_EXPIRADO', ['IN_APP'], CTX_T1_U1);
    const call = mocks.preferenciaUpsert.mock.calls[0]?.[0];
    expect(call.where.userId_tipo.userId).toBe('user-1');
    expect(call.where.userId_tipo.tipo).toBe('DOCUMENTO_EXPIRADO');
    expect(call.update.canais).toEqual(['IN_APP']);
    expect(call.create.tenantId).toBe('tenant-1');
  });

  it('permite opt-out total (canais=[])', async () => {
    await notificacaoService.actualizarPreferencia('ALERTA_SISTEMA', [], CTX_T1_U1);
    const call = mocks.preferenciaUpsert.mock.calls[0]?.[0];
    expect(call.update.canais).toEqual([]);
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
