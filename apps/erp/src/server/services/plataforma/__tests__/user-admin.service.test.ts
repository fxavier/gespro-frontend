import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockTx = {
    user: { create: vi.fn() },
    userRole: { createMany: vi.fn(), deleteMany: vi.fn() },
    role: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    rolePermission: { createMany: vi.fn(), deleteMany: vi.fn() },
  };
  return {
    mockTx,
    userFindFirst: vi.fn(),
    userFindMany: vi.fn(),
    userCount: vi.fn(), // Wave 3: contarAdminsAtivos
    userUpdate: vi.fn(),
    roleFindFirst: vi.fn(),
    roleFindMany: vi.fn(),
    roleDelete: vi.fn(),
    permFindMany: vi.fn(),
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  };
});

// Keycloak Admin API — dublada: os unitários não tocam em rede (ADR-0013 §6).
const kc = vi.hoisted(() => ({
  garantirUtilizador: vi.fn(async () => ({ sub: 'kc-sub-novo', criado: true })),
  dispararEmailAccoes: vi.fn(async () => true),
  definirActivo: vi.fn(async () => undefined),
  definirPalavraPasse: vi.fn(async () => undefined),
}));
vi.mock('@/server/auth/keycloak', () => kc);

// Sessão — o travão do ADR-0031 (criar/reactivar exige e-mail confirmado) lê
// `session.user.emailVerificado`. `@/lib/auth` não carrega fora do runtime do
// Next, portanto é dublada. Por omissão CONFIRMADO, para que os testes que já
// existiam continuem a exercitar o que exercitavam; o travão tem os seus.
const sessao = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/auth', () => sessao);

function comEmail(emailVerificado: boolean | undefined) {
  sessao.auth.mockResolvedValue({
    user: { id: 'caller-id', tenantId: 'tenant-1', permissions: [], emailVerificado },
  });
}

vi.mock('@/server/db/client', () => ({
  prismaBase: {
    user: {
      findFirst: mocks.userFindFirst,
      findMany: mocks.userFindMany,
      count: mocks.userCount,
      update: mocks.userUpdate,
    },
    role: {
      findFirst: mocks.roleFindFirst,
      findMany: mocks.roleFindMany,
      delete: mocks.roleDelete,
    },
    permission: { findMany: mocks.permFindMany },
    userRole: { upsert: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: mocks.$transaction,
  },
}));

import { userAdminService } from '../user-admin.service';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';

const CTX = { tenantId: 'tenant-1', userId: 'caller-id' };

const PERM_VER = { id: 'perm-1', code: 'vendas:ver', descricao: null };
const PERM_CRIAR = { id: 'perm-2', code: 'vendas:criar', descricao: null };

const DEMO_ROLE = {
  id: 'role-1',
  tenantId: 'tenant-1',
  nome: 'VENDEDOR',
  descricao: null,
  isSystem: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  permissions: [{ permission: PERM_VER }],
};

const SYSTEM_ROLE = { ...DEMO_ROLE, id: 'role-sys', nome: 'ADMIN', isSystem: true };

const DEMO_USER = {
  id: 'user-42',
  tenantId: 'tenant-1',
  keycloakSub: 'kc-sub-42',
  nome: 'Alice',
  email: 'alice@demo.mz',
  ativo: true,
  primeiroAcessoEm: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  roles: [{ role: DEMO_ROLE }],
};

beforeEach(() => {
  vi.clearAllMocks();
  comEmail(true);
  mocks.userFindFirst.mockResolvedValue(DEMO_USER);
  mocks.roleFindFirst.mockResolvedValue(DEMO_ROLE);
  mocks.permFindMany.mockResolvedValue([PERM_VER, PERM_CRIAR]);
  // Por defeito: há 2 admins activos → guard não dispara
  mocks.userCount.mockResolvedValue(2);
  mocks.$transaction.mockImplementation(async (fn: (tx: typeof mocks.mockTx) => unknown) => fn(mocks.mockTx));
});

describe('userAdminService.obterUtilizador', () => {
  it('mapeia roles e permissões correctamente', async () => {
    const row = await userAdminService.obterUtilizador('user-42', CTX);
    expect(row.roles).toHaveLength(1);
    expect(row.roles[0].nome).toBe('VENDEDOR');
    expect(row.permissoes).toContain('vendas:ver');
  });

  it('lança NotFoundError se utilizador não existe no tenant', async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    await expect(userAdminService.obterUtilizador('x', CTX)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('userAdminService.criarUtilizador', () => {
  it('convida: Keycloak PRIMEIRO, depois tx local, depois e-mail de acções (ADR-0013 §5-bis)', async () => {
    mocks.userFindFirst.mockResolvedValueOnce(null); // sem duplicado email (global)
    mocks.roleFindMany.mockResolvedValue([DEMO_ROLE]);
    mocks.mockTx.user.create.mockResolvedValue(DEMO_USER);
    mocks.mockTx.userRole.createMany.mockResolvedValue({ count: 1 });
    mocks.userFindFirst.mockResolvedValueOnce(DEMO_USER); // fetchUser após criar

    const { utilizador, palavraPasseInicial } = await userAdminService.criarUtilizador(
      { nome: 'Alice', email: 'alice@demo.mz', roleIds: ['role-1'], ativo: true, metodoAcesso: 'convite' },
      CTX,
    );
    // Convite por e-mail: as acções são escolha explícita (sem omissão), e
    // aqui a verificação PENDENTE é a certa — é o clique no e-mail que prova
    // o endereço de quem foi convidado.
    expect(kc.garantirUtilizador).toHaveBeenCalledWith({
      email: 'alice@demo.mz',
      nome: 'Alice',
      accoes: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
      emailVerificado: false,
    });
    expect(mocks.$transaction).toHaveBeenCalledOnce();
    // O user local nasce com o sub devolvido pelo Keycloak
    expect(mocks.mockTx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ keycloakSub: 'kc-sub-novo' }),
      }),
    );
    // Keycloak antes da transacção — a ordem inversa deixaria User sem identidade
    expect(kc.garantirUtilizador.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.$transaction.mock.invocationCallOrder[0],
    );
    expect(kc.dispararEmailAccoes).toHaveBeenCalledWith('kc-sub-novo');
    expect(utilizador.email).toBe('alice@demo.mz');
    // No modo convite não se gera palavra-passe nenhuma.
    expect(palavraPasseInicial).toBeNull();
    expect(kc.definirPalavraPasse).not.toHaveBeenCalled();
  });

  it('recusa e-mail já registado — unicidade GLOBAL, com a mensagem das duas empresas', async () => {
    mocks.userFindFirst.mockResolvedValue(DEMO_USER);
    await expect(
      userAdminService.criarUtilizador(
        { nome: 'X', email: 'alice@demo.mz', roleIds: ['role-1'], ativo: true, metodoAcesso: 'convite' },
        CTX,
      ),
    ).rejects.toMatchObject({
      code: 'EMAIL_JA_REGISTADO',
      message: expect.stringContaining('dois endereços de e-mail'),
    });
    expect(kc.garantirUtilizador).not.toHaveBeenCalled();
  });

  it('lança NotFoundError se roleId não existe no tenant (sem tocar no Keycloak)', async () => {
    mocks.userFindFirst.mockResolvedValueOnce(null); // sem duplicado email
    mocks.roleFindMany.mockResolvedValue([]);
    await expect(
      userAdminService.criarUtilizador(
        { nome: 'X', email: 'x@x.com', roleIds: ['role-nao-existe'], ativo: true, metodoAcesso: 'convite' },
        CTX,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(kc.garantirUtilizador).not.toHaveBeenCalled();
  });
});

describe('userAdminService.criarUtilizador — modo palavra-passe (ADR-0030)', () => {
  it('cria sem VERIFY_EMAIL, define temporária e não envia e-mail nenhum', async () => {
    mocks.userFindFirst.mockResolvedValueOnce(null);
    mocks.roleFindMany.mockResolvedValue([DEMO_ROLE]);
    mocks.mockTx.user.create.mockResolvedValue(DEMO_USER);
    mocks.mockTx.userRole.createMany.mockResolvedValue({ count: 1 });
    mocks.userFindFirst.mockResolvedValueOnce(DEMO_USER);

    const { palavraPasseInicial } = await userAdminService.criarUtilizador(
      {
        nome: 'Alice',
        email: 'alice@demo.mz',
        roleIds: ['role-1'],
        ativo: true,
        metodoAcesso: 'palavra-passe',
      },
      CTX,
    );

    // Com VERIFY_EMAIL pendente o direct grant recusaria à mesma: a conta
    // nasce com o e-mail dado por bom e só a mudança de palavra-passe pendente.
    expect(kc.garantirUtilizador).toHaveBeenCalledWith({
      email: 'alice@demo.mz',
      nome: 'Alice',
      accoes: ['UPDATE_PASSWORD'],
      emailVerificado: true,
    });
    expect(palavraPasseInicial).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(kc.definirPalavraPasse).toHaveBeenCalledWith('kc-sub-novo', palavraPasseInicial, {
      temporaria: true,
    });
    expect(kc.dispararEmailAccoes).not.toHaveBeenCalled();
  });
});

describe('userAdminService.reporPalavraPasse', () => {
  it('devolve uma temporária nova e deixa a mudança pendente', async () => {
    mocks.userFindFirst.mockResolvedValue(DEMO_USER);

    const nova = await userAdminService.reporPalavraPasse(DEMO_USER.id, CTX);

    expect(nova).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(kc.definirPalavraPasse).toHaveBeenCalledWith(DEMO_USER.keycloakSub, nova, {
      temporaria: true,
    });
  });

  it('não repõe a de um utilizador de outro tenant', async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    await expect(userAdminService.reporPalavraPasse('outro', CTX)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(kc.definirPalavraPasse).not.toHaveBeenCalled();
  });
});

describe('userAdminService.desactivarUtilizador', () => {
  it('lança BusinessRuleError ao auto-desactivar', async () => {
    mocks.userFindFirst.mockResolvedValue({ ...DEMO_USER, id: 'caller-id' });
    await expect(
      userAdminService.desactivarUtilizador('caller-id', CTX),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('desactiva NOS DOIS lados: Keycloak (com logout de sessões) e Postgres', async () => {
    const userSemAdmin = { ...DEMO_USER, roles: [] }; // sem role ADMIN
    mocks.userFindFirst.mockResolvedValue(userSemAdmin);
    mocks.userUpdate.mockResolvedValue(DEMO_USER);
    await expect(
      userAdminService.desactivarUtilizador('user-42', CTX),
    ).resolves.toBeUndefined();
    expect(kc.definirActivo).toHaveBeenCalledWith('kc-sub-42', false);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ativo: false }) }),
    );
  });

  it('Wave 3: lança ULTIMO_ADMIN ao desactivar o único admin activo', async () => {
    const adminUser = {
      ...DEMO_USER,
      id: 'user-42',
      roles: [{ role: { ...DEMO_ROLE, nome: 'ADMIN' } }],
    };
    mocks.userFindFirst.mockResolvedValue(adminUser);
    // Após excluir user-42, há 0 admins restantes
    mocks.userCount.mockResolvedValue(0);

    await expect(
      userAdminService.desactivarUtilizador('user-42', CTX),
    ).rejects.toMatchObject({ code: 'ULTIMO_ADMIN' });
  });

  it('Wave 3: desactiva admin quando há outro admin activo', async () => {
    const adminUser = {
      ...DEMO_USER,
      id: 'user-42',
      roles: [{ role: { ...DEMO_ROLE, nome: 'ADMIN' } }],
    };
    mocks.userFindFirst.mockResolvedValue(adminUser);
    // Há 1 outro admin activo (depois de excluir user-42)
    mocks.userCount.mockResolvedValue(1);
    mocks.userUpdate.mockResolvedValue(DEMO_USER);

    await expect(
      userAdminService.desactivarUtilizador('user-42', CTX),
    ).resolves.toBeUndefined();
  });
});

describe('userAdminService.atribuirRoles', () => {
  it('substitui roles em transacção (delete + createMany)', async () => {
    mocks.roleFindMany.mockResolvedValue([DEMO_ROLE]);
    mocks.mockTx.userRole.deleteMany.mockResolvedValue({ count: 1 });
    mocks.mockTx.userRole.createMany.mockResolvedValue({ count: 1 });
    mocks.userFindFirst.mockResolvedValue(DEMO_USER); // findUser + fetchUser após atribuir

    const row = await userAdminService.atribuirRoles(
      { userId: 'user-42', roleIds: ['role-1'] },
      CTX,
    );
    expect(mocks.$transaction).toHaveBeenCalledOnce();
    expect(row.roles[0].id).toBe('role-1');
  });
});

describe('userAdminService.criarRole', () => {
  it('cria role com permissões em transacção', async () => {
    mocks.roleFindFirst.mockResolvedValueOnce(null); // sem duplicado
    mocks.mockTx.role.create.mockResolvedValue(DEMO_ROLE);
    mocks.mockTx.rolePermission.createMany.mockResolvedValue({ count: 2 });
    mocks.roleFindFirst.mockResolvedValueOnce(DEMO_ROLE); // findRole após criar

    const row = await userAdminService.criarRole(
      { nome: 'VENDEDOR', permissionCodes: ['vendas:ver', 'vendas:criar'] },
      CTX,
    );
    expect(row.nome).toBe('VENDEDOR');
  });

  it('lança BusinessRuleError em nome duplicado', async () => {
    mocks.roleFindFirst.mockResolvedValue(DEMO_ROLE);
    await expect(
      userAdminService.criarRole({ nome: 'VENDEDOR', permissionCodes: [] }, CTX),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('userAdminService.removerRole', () => {
  it('lança BusinessRuleError para roles de sistema', async () => {
    mocks.roleFindFirst.mockResolvedValue(SYSTEM_ROLE);
    await expect(userAdminService.removerRole('role-sys', CTX)).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('elimina role personalizado quando há admins noutros papéis', async () => {
    // userCount: adminsRestantes (excludeRoleId) = 2, totalAdmins = 2 → OK
    mocks.userCount.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    mocks.roleDelete.mockResolvedValue(DEMO_ROLE);
    await expect(userAdminService.removerRole('role-1', CTX)).resolves.toBeUndefined();
  });

  it('Wave 3: lança ULTIMO_ADMIN ao remover o único papel que confere acesso admin', async () => {
    // totalAdmins = 1, adminsRestantes (após excluir roleId) = 0
    mocks.userCount
      .mockResolvedValueOnce(0) // adminsRestantes com excludeRoleId
      .mockResolvedValueOnce(1); // totalAdmins

    await expect(
      userAdminService.removerRole('role-1', CTX),
    ).rejects.toMatchObject({ code: 'ULTIMO_ADMIN' });
  });

  it('Wave 3: não lança ULTIMO_ADMIN quando não há admins (totalAdmins = 0)', async () => {
    // Se já não há admins, a condição "totalAdmins > 0 && adminsRestantes === 0" é falsa
    mocks.userCount
      .mockResolvedValueOnce(0) // adminsRestantes
      .mockResolvedValueOnce(0); // totalAdmins
    mocks.roleDelete.mockResolvedValue(DEMO_ROLE);

    await expect(userAdminService.removerRole('role-1', CTX)).resolves.toBeUndefined();
  });
});

describe('userAdminService.listarPermissoes', () => {
  it('retorna lista de permissões sem filtro de tenant', async () => {
    mocks.permFindMany.mockResolvedValue([PERM_VER]);
    const perms = await userAdminService.listarPermissoes();
    expect(perms[0].code).toBe('vendas:ver');
  });
});

// ---------------------------------------------------------------------------
// Travão do ADR-0031 — criar ou reactivar `User` exige e-mail confirmado
// (spec 21, tarefas 5.2 e 5.4). Transição nos DOIS sentidos.
// ---------------------------------------------------------------------------

const CODIGO_TRAVAO = 'EMAIL_POR_CONFIRMAR_UTILIZADORES';

const NOVO_UTILIZADOR = {
  nome: 'Bruno',
  email: 'bruno@demo.mz',
  roleIds: ['role-1'],
  ativo: true,
  metodoAcesso: 'convite' as const,
};

/**
 * Estado de partida para criar: sem duplicado, papel válido, tx a responder.
 *
 * Sem `mockResolvedValueOnce`: quando o travão recusa, as respostas enfileiradas
 * não chegam a ser consumidas e `vi.clearAllMocks()` não esvazia a fila — o
 * resto do ficheiro herdaria-as. Um contador local não deixa resíduo.
 */
function prepararCriacao() {
  let leitura = 0;
  // 1.ª leitura: verificação de e-mail duplicado (tem de ser nula).
  // 2.ª leitura: releitura do utilizador acabado de criar.
  mocks.userFindFirst.mockImplementation(async () => (leitura++ === 0 ? null : DEMO_USER));
  mocks.roleFindMany.mockResolvedValue([DEMO_ROLE]);
  mocks.mockTx.user.create.mockResolvedValue(DEMO_USER);
  mocks.mockTx.userRole.createMany.mockResolvedValue({ count: 1 });
}

describe('travão ADR-0031 — criar utilizador com o endereço POR CONFIRMAR', () => {
  it('é recusado com o código estável, e antes de tocar no Keycloak ou em Postgres', async () => {
    comEmail(false);
    prepararCriacao();

    await expect(userAdminService.criarUtilizador(NOVO_UTILIZADOR, CTX)).rejects.toMatchObject({
      code: CODIGO_TRAVAO,
      status: 409,
    });
    // Nada avançou: nem identidade no realm, nem transacção local, nem e-mail.
    expect(kc.garantirUtilizador).not.toHaveBeenCalled();
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(kc.dispararEmailAccoes).not.toHaveBeenCalled();
  });

  it('recusa também no modo palavra-passe — o vector é o convite, não o transporte', async () => {
    comEmail(false);
    prepararCriacao();
    await expect(
      userAdminService.criarUtilizador(
        { ...NOVO_UTILIZADOR, metodoAcesso: 'palavra-passe' },
        CTX,
      ),
    ).rejects.toMatchObject({ code: CODIGO_TRAVAO });
    expect(kc.definirPalavraPasse).not.toHaveBeenCalled();
  });

  it('sessão inexistente conta como por confirmar (fail-closed)', async () => {
    sessao.auth.mockResolvedValue(null);
    prepararCriacao();
    await expect(userAdminService.criarUtilizador(NOVO_UTILIZADOR, CTX)).rejects.toMatchObject({
      code: CODIGO_TRAVAO,
    });
  });

  it('claim ausente conta como por confirmar (fail-closed) — JWT anterior ao ADR-0031', async () => {
    comEmail(undefined);
    prepararCriacao();
    await expect(userAdminService.criarUtilizador(NOVO_UTILIZADOR, CTX)).rejects.toMatchObject({
      code: CODIGO_TRAVAO,
    });
  });

  it('a mensagem nomeia a causa, o caminho, e a janela de 15 minutos do ADR-0011', async () => {
    comEmail(false);
    prepararCriacao();
    const erro = (await userAdminService
      .criarUtilizador(NOVO_UTILIZADOR, CTX)
      .catch((e: Error) => e)) as Error;
    expect(erro.message).toMatch(/criar utilizadores/i);
    expect(erro.message).toMatch(/confirmar o endereço de e-mail/i);
    expect(erro.message).toMatch(/liga(ção|cao) de confirma/i);
    expect(erro.message).toMatch(/reenvia/i);
    // Quem confirmou há pouco continua a bater no travão até à re-resolução:
    // a mensagem tem de o dizer, senão está a afirmar-lhe uma coisa falsa.
    expect(erro.message).toMatch(/15/);
    expect(erro.message).toMatch(/iniciar sess(ã|a)o outra vez/i);
  });
});

describe('travão ADR-0031 — criar utilizador com o endereço CONFIRMADO', () => {
  it('passa: identidade criada e transacção local aberta', async () => {
    comEmail(true);
    prepararCriacao();
    const { utilizador } = await userAdminService.criarUtilizador(NOVO_UTILIZADOR, CTX);
    expect(utilizador.email).toBe('alice@demo.mz');
    expect(kc.garantirUtilizador).toHaveBeenCalledOnce();
    expect(mocks.$transaction).toHaveBeenCalledOnce();
  });
});

describe('travão ADR-0031 — reactivar utilizador', () => {
  const INACTIVO = { ...DEMO_USER, ativo: false };

  it('reactivar é recusado com o endereço por confirmar — reactivar conta como criar', async () => {
    comEmail(false);
    mocks.userFindFirst.mockResolvedValue(INACTIVO);
    await expect(
      userAdminService.actualizarUtilizador('user-42', { ativo: true }, CTX),
    ).rejects.toMatchObject({ code: CODIGO_TRAVAO, status: 409 });
    // Nem no realm nem em Postgres: o caminho desactivar→reactivar não pode ser
    // a porta das traseiras do travão da criação.
    expect(kc.definirActivo).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('a mensagem fala de REACTIVAR, não de criar', async () => {
    comEmail(false);
    mocks.userFindFirst.mockResolvedValue(INACTIVO);
    const erro = (await userAdminService
      .actualizarUtilizador('user-42', { ativo: true }, CTX)
      .catch((e: Error) => e)) as Error;
    expect(erro.message).toMatch(/reactivar utilizadores/i);
  });

  it('reactivar passa com o endereço confirmado', async () => {
    comEmail(true);
    mocks.userFindFirst.mockResolvedValue(INACTIVO);
    mocks.userUpdate.mockResolvedValue(DEMO_USER);
    await expect(
      userAdminService.actualizarUtilizador('user-42', { ativo: true }, CTX),
    ).resolves.toBeTruthy();
    expect(kc.definirActivo).toHaveBeenCalledWith('kc-sub-42', true);
  });
});

describe('travão ADR-0031 — o que NÃO é criar nem reactivar continua a passar', () => {
  it('DESACTIVAR passa com o endereço por confirmar — um estado sem saída é uma armadilha', async () => {
    comEmail(false);
    mocks.userFindFirst.mockResolvedValue(DEMO_USER);
    mocks.userUpdate.mockResolvedValue({ ...DEMO_USER, ativo: false });
    await expect(
      userAdminService.actualizarUtilizador('user-42', { ativo: false }, CTX),
    ).resolves.toBeTruthy();
    expect(kc.definirActivo).toHaveBeenCalledWith('kc-sub-42', false);
  });

  it('desactivar pela via dedicada passa com o endereço por confirmar', async () => {
    comEmail(false);
    mocks.userFindFirst.mockResolvedValue({ ...DEMO_USER, roles: [] });
    mocks.userUpdate.mockResolvedValue(DEMO_USER);
    await expect(userAdminService.desactivarUtilizador('user-42', CTX)).resolves.toBeUndefined();
  });

  it('mudar o nome passa com o endereço por confirmar', async () => {
    comEmail(false);
    mocks.userFindFirst.mockResolvedValue(DEMO_USER);
    mocks.userUpdate.mockResolvedValue(DEMO_USER);
    await expect(
      userAdminService.actualizarUtilizador('user-42', { nome: 'Alice Silva' }, CTX),
    ).resolves.toBeTruthy();
  });

  it('atribuir papéis a quem já existe passa com o endereço por confirmar', async () => {
    comEmail(false);
    mocks.userFindFirst.mockResolvedValue(DEMO_USER);
    mocks.roleFindMany.mockResolvedValue([DEMO_ROLE]);
    await expect(
      userAdminService.atribuirRoles({ userId: 'user-42', roleIds: ['role-1'] }, CTX),
    ).resolves.toBeTruthy();
  });

  it('repor a palavra-passe de quem já existe passa com o endereço por confirmar', async () => {
    comEmail(false);
    mocks.userFindFirst.mockResolvedValue(DEMO_USER);
    await expect(userAdminService.reporPalavraPasse('user-42', CTX)).resolves.toBeTruthy();
  });
});
