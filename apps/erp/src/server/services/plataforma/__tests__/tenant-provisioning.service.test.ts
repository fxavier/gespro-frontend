import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    tenant: { create: vi.fn() },
    configuracaoFiscal: { create: vi.fn() },
    assinatura: { create: vi.fn() },
    user: { create: vi.fn() },
    userRole: { create: vi.fn() },
    notificacao: { create: vi.fn() },
  };
  return {
    tx,
    tenantFindFirst: vi.fn(),
    tenantFindMany: vi.fn(),
    userFindFirst: vi.fn(),
    $transaction: vi.fn(),
    bootstrapRbac: vi.fn(),
    bootstrapContabilidade: vi.fn(),
    garantirCatalogoPermissoes: vi.fn(),
    garantirUtilizador: vi.fn(),
    dispararEmailAccoes: vi.fn(),
  };
});

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    tenant: { findFirst: mocks.tenantFindFirst, findMany: mocks.tenantFindMany },
    user: { findFirst: mocks.userFindFirst },
    $transaction: mocks.$transaction,
  },
}));

vi.mock('@/server/provisioning/tenant-bootstrap', () => ({
  bootstrapRbac: mocks.bootstrapRbac,
  bootstrapContabilidade: mocks.bootstrapContabilidade,
  garantirCatalogoPermissoes: mocks.garantirCatalogoPermissoes,
}));

// Keycloak dublado — os unitários não tocam em rede (ADR-0013 §6); o caminho
// real contra um Keycloak vivo é da suite E2E.
vi.mock('@/server/auth/keycloak', () => ({
  garantirUtilizador: mocks.garantirUtilizador,
  dispararEmailAccoes: mocks.dispararEmailAccoes,
}));

import {
  provisionarTenant,
  slugificar,
  sugerirSlug,
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
  admin: { nome: 'Ana Sitoe', email: 'ana@padaria.mz' },
  planoId: 'PROFISSIONAL' as const,
  provincia: 'Maputo Cidade',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenantFindFirst.mockResolvedValue(null);
  mocks.tenantFindMany.mockResolvedValue([]);
  mocks.userFindFirst.mockResolvedValue(null);
  mocks.$transaction.mockImplementation(async (fn: (t: typeof mocks.tx) => unknown) => fn(mocks.tx));
  mocks.tx.tenant.create.mockResolvedValue({ id: 'tenant-1', slug: 'padaria-ana-lda' });
  mocks.tx.configuracaoFiscal.create.mockResolvedValue({});
  mocks.tx.assinatura.create.mockResolvedValue({});
  mocks.tx.user.create.mockResolvedValue({ id: 'user-1' });
  mocks.tx.userRole.create.mockResolvedValue({});
  mocks.tx.notificacao.create.mockResolvedValue({ id: 'notif-1' });
  mocks.bootstrapRbac.mockResolvedValue([
    { id: 'role-admin', nome: 'ADMIN' },
    { id: 'role-leitura', nome: 'LEITURA' },
  ]);
  mocks.bootstrapContabilidade.mockResolvedValue({ contas: 502, diarios: 9, series: 18 });
  mocks.garantirCatalogoPermissoes.mockResolvedValue(undefined);
  mocks.garantirUtilizador.mockResolvedValue({ sub: 'kc-sub-ana', criado: true });
  mocks.dispararEmailAccoes.mockResolvedValue(true);
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
    expect(r.keycloakSub).toBe('kc-sub-ana');

    // Toda a escrita dentro da tx leva tenantId (não há extensão de tenant aqui).
    expect(mocks.tx.configuracaoFiscal.create.mock.calls[0][0].data.tenantId).toBe('tenant-1');
    expect(mocks.tx.assinatura.create.mock.calls[0][0].data.tenantId).toBe('tenant-1');
    expect(mocks.tx.user.create.mock.calls[0][0].data.tenantId).toBe('tenant-1');
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

  it('ADR-0013 §2: Keycloak PRIMEIRO, Postgres depois — e o sub fica no User', async () => {
    await provisionarTenant(INPUT);
    // `accoes: []` — nunca `VERIFY_EMAIL` neste caminho (ADR-0031 §2).
    expect(mocks.garantirUtilizador).toHaveBeenCalledWith({
      email: 'ana@padaria.mz',
      nome: 'Ana Sitoe',
      accoes: [],
      emailVerificado: false,
    });
    // A ordem inversa deixaria «um cliente pago sem forma de entrar».
    expect(mocks.garantirUtilizador.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.$transaction.mock.invocationCallOrder[0],
    );
    const data = mocks.tx.user.create.mock.calls[0][0].data;
    expect(data.keycloakSub).toBe('kc-sub-ana');
    // O ERP nunca vê nem persiste credenciais.
    expect(JSON.stringify(data)).not.toMatch(/senha|password/i);
  });

  it('recusa e-mail já registado em qualquer tenant, com a mensagem das duas empresas', async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 'user-existente' });
    await expect(provisionarTenant(INPUT)).rejects.toMatchObject({
      code: 'EMAIL_JA_REGISTADO',
      message: expect.stringContaining('dois endereços de e-mail distintos'),
    });
    expect(mocks.garantirUtilizador).not.toHaveBeenCalled();
    expect(mocks.$transaction).not.toHaveBeenCalled();
  });

  it('atribui o role ADMIN ao utilizador criado', async () => {
    await provisionarTenant(INPUT);
    expect(mocks.tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', roleId: 'role-admin' },
    });
  });

  it('persiste a notificação de boas-vindas IN_APP (o único e-mail é o do Keycloak)', async () => {
    await provisionarTenant(INPUT);
    const data = mocks.tx.notificacao.create.mock.calls[0][0].data;
    expect(data.canal).toBe('IN_APP');
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

  it('recusa NUIT já registado antes de tocar no Keycloak', async () => {
    mocks.tenantFindFirst.mockResolvedValue({ id: 'outro' });
    await expect(provisionarTenant(INPUT)).rejects.toMatchObject({ code: 'NUIT_JA_REGISTADO' });
    expect(mocks.garantirUtilizador).not.toHaveBeenCalled();
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
