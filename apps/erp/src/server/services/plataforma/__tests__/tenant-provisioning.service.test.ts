import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    tenant: { create: vi.fn() },
    configuracaoFiscal: { create: vi.fn() },
    assinatura: { create: vi.fn() },
    user: { create: vi.fn() },
    userRole: { create: vi.fn() },
    tokenVerificacaoEmail: { create: vi.fn() },
    notificacao: { create: vi.fn() },
  };
  return {
    tx,
    tenantFindFirst: vi.fn(),
    tenantFindMany: vi.fn(),
    tokenFindUnique: vi.fn(),
    tokenUpdateMany: vi.fn(),
    userUpdateMany: vi.fn(),
    $transaction: vi.fn(),
    bootstrapRbac: vi.fn(),
    bootstrapContabilidade: vi.fn(),
    garantirCatalogoPermissoes: vi.fn(),
    emitirToken: vi.fn(),
  };
});

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    tenant: { findFirst: mocks.tenantFindFirst, findMany: mocks.tenantFindMany },
    tokenVerificacaoEmail: {
      findUnique: mocks.tokenFindUnique,
      updateMany: mocks.tokenUpdateMany,
    },
    user: { updateMany: mocks.userUpdateMany },
    $transaction: mocks.$transaction,
  },
}));

vi.mock('@/server/provisioning/tenant-bootstrap', () => ({
  bootstrapRbac: mocks.bootstrapRbac,
  bootstrapContabilidade: mocks.bootstrapContabilidade,
  garantirCatalogoPermissoes: mocks.garantirCatalogoPermissoes,
}));

vi.mock('../handoff.service', () => ({ emitirToken: mocks.emitirToken }));

vi.mock('@node-rs/argon2', () => ({ hash: vi.fn(async () => 'hash-argon2') }));

import {
  provisionarTenant,
  slugificar,
  sugerirSlug,
  verificarEmail,
} from '../tenant-provisioning.service';
import { prismaBase } from '@/server/db/client';
import { Prisma } from '@prisma/client';

/** Erro P2002 verdadeiro: `isUniqueViolation` usa `instanceof`, não o `.code`. */
function violacaoUnica(campo: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'teste',
    meta: { target: [campo] },
  });
}

const INPUT = {
  empresa: { nome: 'Padaria Ana, Lda', nuit: '400123456' },
  admin: { nome: 'Ana Sitoe', email: 'ana@padaria.mz', senha: 'segredo123' },
  planoId: 'PROFISSIONAL' as const,
  provincia: 'Maputo Cidade',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindFirst.mockResolvedValue(null);
  mocks.tenantFindMany.mockResolvedValue([]);
  mocks.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.tx.tenant.create.mockResolvedValue({ id: 'tenant-1', slug: 'padaria-ana-lda' });
  mocks.tx.configuracaoFiscal.create.mockResolvedValue({});
  mocks.tx.assinatura.create.mockResolvedValue({});
  mocks.tx.user.create.mockResolvedValue({ id: 'user-1' });
  mocks.tx.userRole.create.mockResolvedValue({});
  mocks.tx.tokenVerificacaoEmail.create.mockResolvedValue({});
  mocks.tx.notificacao.create.mockResolvedValue({ id: 'notif-1' });
  mocks.bootstrapRbac.mockResolvedValue([
    { id: 'role-admin', nome: 'ADMIN' },
    { id: 'role-leitura', nome: 'LEITURA' },
  ]);
  mocks.bootstrapContabilidade.mockResolvedValue({ contas: 502, diarios: 9, series: 18 });
  mocks.garantirCatalogoPermissoes.mockResolvedValue(undefined);
  mocks.emitirToken.mockResolvedValue('token-handoff');
});

describe('slug derivado do nome (nunca vem do cliente)', () => {
  it('normaliza acentos, maiúsculas e pontuação', () => {
    expect(slugificar('Padaria Ana, Lda')).toBe('padaria-ana-lda');
    expect(slugificar('Construções Água Fria')).toBe('construcoes-agua-fria');
    expect(slugificar('  MULTI   ESPAÇOS  ')).toBe('multi-espacos');
  });

  it('nunca devolve slug vazio nem com hífens nas pontas', () => {
    expect(slugificar('«»')).toMatch(/^empresa-[a-z0-9]+$/);
    expect(slugificar('---A---')).not.toMatch(/^-|-$/);
  });

  it('acrescenta sufixo numérico em colisão', async () => {
    mocks.tenantFindMany.mockResolvedValue([{ slug: 'padaria-ana-lda' }, { slug: 'padaria-ana-lda-2' }]);
    expect(await sugerirSlug('Padaria Ana, Lda')).toBe('padaria-ana-lda-3');
  });
});

describe('provisionamento atómico', () => {
  it('cria tudo dentro de uma única transacção, com tenantId explícito', async () => {
    const r = await provisionarTenant(INPUT);

    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(r.tenantId).toBe('tenant-1');
    expect(r.tenantSlug).toBe('padaria-ana-lda');
    expect(r.handoffToken).toBe('token-handoff');

    // Toda a escrita dentro da tx leva tenantId (não há extensão de tenant aqui).
    expect(mocks.tx.configuracaoFiscal.create.mock.calls[0][0].data.tenantId).toBe('tenant-1');
    expect(mocks.tx.assinatura.create.mock.calls[0][0].data.tenantId).toBe('tenant-1');
    expect(mocks.tx.user.create.mock.calls[0][0].data.tenantId).toBe('tenant-1');
    expect(mocks.tx.tokenVerificacaoEmail.create.mock.calls[0][0].data.tenantId).toBe('tenant-1');
    expect(mocks.tx.notificacao.create.mock.calls[0][0].data.tenantId).toBe('tenant-1');
    expect(mocks.bootstrapRbac).toHaveBeenCalledWith(mocks.tx, 'tenant-1');
    expect(mocks.bootstrapContabilidade).toHaveBeenCalledWith(mocks.tx, 'tenant-1');
  });

  it('MAJOR-8: garante o catálogo global de permissões FORA da transacção', async () => {
    await provisionarTenant(INPUT);
    expect(mocks.garantirCatalogoPermissoes).toHaveBeenCalledTimes(1);
    expect(mocks.garantirCatalogoPermissoes.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.$transaction.mock.invocationCallOrder[0],
    );
  });

  it('usa prismaBase (nunca o cliente tenant-scoped)', async () => {
    await provisionarTenant(INPUT);
    expect(prismaBase.$transaction).toHaveBeenCalled();
  });

  it('cria a assinatura em TRIAL com fim a 14 dias e sem cartão', async () => {
    await provisionarTenant(INPUT);
    const data = mocks.tx.assinatura.create.mock.calls[0][0].data;
    expect(data.estado).toBe('TRIAL');
    expect(data.planoAssinatura).toBe('PROFISSIONAL');
    expect(data.stripeCustomerId).toBeUndefined();
    const dias = (data.trialFim.getTime() - data.trialInicio.getTime()) / 86_400_000;
    expect(Math.round(dias)).toBe(14);
  });

  it('fixa moeda MZN e fuso Africa/Maputo na configuração fiscal', async () => {
    await provisionarTenant(INPUT);
    const data = mocks.tx.configuracaoFiscal.create.mock.calls[0][0].data;
    expect(data.moedaBase).toBe('MZN');
    expect(data.timezone).toBe('Africa/Maputo');
    expect(data.statusAtivo).toBe(true);
    expect(data.provincia).toBe('Maputo Cidade');
  });

  it('cria o admin com emailVerificado=false (login bloqueado até confirmar)', async () => {
    await provisionarTenant(INPUT);
    const data = mocks.tx.user.create.mock.calls[0][0].data;
    expect(data.emailVerificado).toBe(false);
    expect(data.passwordHash).toBe('hash-argon2');
    // A senha em claro nunca é persistida.
    expect(JSON.stringify(data)).not.toContain('segredo123');
  });

  it('atribui o role ADMIN ao utilizador criado', async () => {
    await provisionarTenant(INPUT);
    expect(mocks.tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', roleId: 'role-admin' },
    });
  });

  it('persiste a notificação de boas-vindas PENDENTE (envio fora da tx)', async () => {
    await provisionarTenant(INPUT);
    const data = mocks.tx.notificacao.create.mock.calls[0][0].data;
    expect(data.estadoEnvio).toBe('PENDENTE');
    expect(data.canal).toBe('EMAIL');
  });

  it('emite o token de handoff DENTRO da transacção', async () => {
    await provisionarTenant(INPUT);
    expect(mocks.emitirToken).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'user-1' },
      mocks.tx,
    );
  });

  it('falha em qualquer passo propaga o erro (rollback total pela tx)', async () => {
    mocks.bootstrapContabilidade.mockRejectedValue(new Error('PGC falhou'));
    await expect(provisionarTenant(INPUT)).rejects.toThrow('PGC falhou');
    // Nada é confirmado: a transacção envolve todos os passos anteriores.
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
  });

  it('falha se o RBAC não produzir o role ADMIN', async () => {
    mocks.bootstrapRbac.mockResolvedValue([{ id: 'r', nome: 'LEITURA' }]);
    await expect(provisionarTenant(INPUT)).rejects.toMatchObject({ code: 'RBAC_INCOMPLETO' });
  });

  it('recusa NUIT já registado antes de gastar CPU no hash', async () => {
    mocks.tenantFindFirst.mockResolvedValue({ id: 'outro' });
    await expect(provisionarTenant(INPUT)).rejects.toMatchObject({ code: 'NUIT_JA_REGISTADO' });
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it('repete com outro slug quando há corrida no índice único', async () => {
    let chamada = 0;
    mocks.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => {
      chamada++;
      if (chamada === 1) throw violacaoUnica('slug');
      return fn(mocks.tx);
    });

    // O slug sugerido pode ser roubado entre a leitura e o commit: a corrida
    // resolve-se com nova tentativa, não com um erro ao utilizador.
    const r = await provisionarTenant(INPUT);
    expect(r.tenantId).toBe('tenant-1');
    expect(chamada).toBe(2);
  });

  it('desiste com erro estável se o slug continuar a colidir', async () => {
    mocks.$transaction.mockImplementation(async () => {
      throw violacaoUnica('slug');
    });
    await expect(provisionarTenant(INPUT)).rejects.toMatchObject({
      code: 'SLUG_INDISPONIVEL',
    });
  });

  it('traduz a colisão de NUIT no índice único para erro de negócio', async () => {
    mocks.$transaction.mockImplementation(async () => {
      throw violacaoUnica('nuit');
    });
    await expect(provisionarTenant(INPUT)).rejects.toMatchObject({
      code: 'NUIT_JA_REGISTADO',
    });
  });

  it('propaga erros que não sejam violação de unicidade', async () => {
    mocks.$transaction.mockImplementation(async () => {
      throw new Error('ligação perdida');
    });
    await expect(provisionarTenant(INPUT)).rejects.toThrow('ligação perdida');
  });
});

describe('verificação de email — consumo atómico', () => {
  it('marca o email verificado quando o token é válido', async () => {
    mocks.tokenFindUnique.mockResolvedValue({ tenantId: 'tenant-1', userId: 'user-1' });
    mocks.tokenUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    mocks.tenantFindFirst.mockResolvedValue({ slug: 'padaria' });

    const r = await verificarEmail('tok-1');
    expect(r).toEqual({ tenantId: 'tenant-1', userId: 'user-1', tenantSlug: 'padaria' });

    const where = mocks.tokenUpdateMany.mock.calls[0][0].where;
    expect(where.usadoEm).toBeNull();
    expect(where.expiraEm.gt).toBeInstanceOf(Date);
    expect(mocks.userUpdateMany.mock.calls[0][0].where).toEqual({
      id: 'user-1',
      tenantId: 'tenant-1',
    });
  });

  it('devolve null para token inexistente', async () => {
    mocks.tokenFindUnique.mockResolvedValue(null);
    expect(await verificarEmail('tok-x')).toBeNull();
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });

  it('devolve null para token já usado ou expirado (0 linhas afectadas)', async () => {
    mocks.tokenFindUnique.mockResolvedValue({ tenantId: 't', userId: 'u' });
    mocks.tokenUpdateMany.mockResolvedValue({ count: 0 });
    expect(await verificarEmail('tok-1')).toBeNull();
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
  });
});
