import 'server-only';
import { prismaBase } from '@/server/db/client';
import {
  garantirUtilizador,
  dispararEmailAccoes,
  definirActivo,
  definirPalavraPasse,
} from '@/server/auth/keycloak';
import { gerarPalavraPasseInicial } from '@/server/auth/palavra-passe';
import { NotFoundError, BusinessRuleError } from '@/lib/errors';
import { inviteLimiter } from '@/server/security/rate-limiter';
import { paginate } from '@/server/db/paginate';
import type { Ctx } from '@/server/services/types';
import type {
  CreateUserInput,
  UpdateUserInput,
  FilterUserInput,
  AssignRoleInput,
  CreateRoleInput,
  UpdateRoleInput,
} from '@/lib/validations/plataforma';
import type { IUserAdminService, UserRow, RoleRow, PermissionRow } from './user-admin.interface';

// ---------------------------------------------------------------------------
// Tipos auxiliares (evitar importar tipos gerados complexos)
// ---------------------------------------------------------------------------

type PrismaPermission = { id: string; code: string; descricao: string | null };

type PrismaRoleWithPerms = {
  id: string;
  tenantId: string;
  nome: string;
  descricao: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: Array<{ permission: PrismaPermission }>;
};

type PrismaUserWithRoles = {
  id: string;
  tenantId: string;
  keycloakSub: string;
  nome: string;
  email: string;
  ativo: boolean;
  primeiroAcessoEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  roles: Array<{ role: PrismaRoleWithPerms }>;
};

// ---------------------------------------------------------------------------
// Mapeamento
// ---------------------------------------------------------------------------

function mapPerm(p: PrismaPermission): PermissionRow {
  return { id: p.id, code: p.code, descricao: p.descricao };
}

function mapRole(r: PrismaRoleWithPerms): RoleRow {
  return {
    id: r.id,
    tenantId: r.tenantId,
    nome: r.nome,
    descricao: r.descricao,
    isSystem: r.isSystem,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    permissions: r.permissions.map((rp) => mapPerm(rp.permission)),
  };
}

function mapUser(u: PrismaUserWithRoles): UserRow {
  return {
    id: u.id,
    tenantId: u.tenantId,
    nome: u.nome,
    email: u.email,
    ativo: u.ativo,
    primeiroAcessoEm: u.primeiroAcessoEm,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    deletedAt: u.deletedAt,
    roles: u.roles.map((ur) => mapRole(ur.role)),
    permissoes: [
      ...new Set(u.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
    ],
  };
}

// Inclusão de roles+permissões padrão para queries de utilizadores
const USER_INCLUDE = {
  roles: {
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  },
} as const;

// Inclusão de permissões para queries de roles
const ROLE_INCLUDE = {
  permissions: { include: { permission: true } },
} as const;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Conta utilizadores activos com o papel ADMIN no tenant.
 * excludeUserId: excluir um utilizador da contagem (para o guard de desactivação).
 */
async function contarAdminsAtivos(
  tenantId: string,
  opts?: { excludeUserId?: string; excludeRoleId?: string },
): Promise<number> {
  return prismaBase.user.count({
    where: {
      tenantId,
      ativo: true,
      deletedAt: null,
      ...(opts?.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
      roles: {
        some: {
          role: {
            nome: 'ADMIN',
            tenantId,
            ...(opts?.excludeRoleId ? { id: { not: opts.excludeRoleId } } : {}),
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Travão de gestão de utilizadores sem e-mail confirmado (ADR-0031, «O que a
// verificação pendente trava»)
// ---------------------------------------------------------------------------

/**
 * Recusa criar ou reactivar um `User` enquanto o endereço de e-mail da conta
 * não estiver confirmado.
 *
 * Convidar terceiros a partir de uma conta por confirmar é o vector de abuso
 * que a verificação existe para fechar: quem se registou com o e-mail de outra
 * pessoa passaria a mandar convites em nome dela, com o cabeçalho e o domínio
 * do GestPro por trás. **Reactivar conta tanto como criar** — uma identidade
 * desligada que volta a ligar-se é uma entrada nova no produto, e o caminho
 * `desactivar → reactivar` seria a maneira óbvia de contornar um travão que só
 * olhasse para a criação.
 *
 * Vive neste serviço, com a sua própria leitura, e não numa abstracção
 * partilhada com o travão da emissão fiscal: são dois sítios, e dois sítios não
 * justificam um mecanismo (ADR-0027 §3, ADR-0031 §Decisão). Vive no serviço, e
 * não no formulário, porque a Server Action aceita o que lhe mandarem — um
 * botão desactivado não é defesa.
 *
 * Esta função vai conviver, mais tarde, com um segundo travão independente na
 * mesma operação (o limite de Utilizadores do plano, #37 do ADR-0027). Os dois
 * ficam lado a lado, sem abstracção comum — é decisão tomada.
 *
 * A leitura é a sessão (ADR-0031 §6): o claim `email_verified` do *access
 * token* já viaja para o JWT e para a sessão na emissão e na re-resolução de 15
 * minutos do ADR-0011. Sem coluna local e sem chamada ao Keycloak por operação.
 * **Fail-closed**: sessão, utilizador ou campo ausentes contam como não
 * confirmado.
 *
 * A mensagem trata a janela dos 15 minutos sem chamar o Keycloak — ver o
 * comentário gémeo em `financas/faturacao.service.ts`.
 *
 * `acto` entra na mensagem para que quem leva com a recusa ao reactivar não
 * receba um texto que só fala de criar.
 */
async function exigirEmailConfirmadoParaGerirUtilizadores(
  acto: 'criar' | 'reactivar',
): Promise<void> {
  // `await import` e não import estático — ver o comentário gémeo em
  // `financas/faturacao.service.ts`: `@/lib/auth` arrasta o next-auth inteiro e
  // este serviço é importado por todas as páginas de core-tenancy, incluindo as
  // de leitura.
  const { auth } = await import('@/lib/auth');
  const sessao = await auth();
  if (sessao?.user?.emailVerificado === true) return;

  const verbo = acto === 'criar' ? 'criar utilizadores' : 'reactivar utilizadores';
  throw new BusinessRuleError(
    'EMAIL_POR_CONFIRMAR_UTILIZADORES',
    `Para ${verbo} é preciso confirmar o endereço de e-mail da conta — é o que impede ` +
      'que se convidem terceiros a partir de uma conta por confirmar. Abra a ligação de ' +
      'confirmação que lhe enviámos; o aviso no painel reenvia-a se precisar de outra. ' +
      'Se já confirmou há pouco, a sessão só o reflecte na actualização seguinte (até 15 ' +
      'minutos) — terminar e iniciar sessão outra vez aplica a confirmação de imediato.',
  );
}

async function findUser(userId: string, ctx: Ctx): Promise<PrismaUserWithRoles> {
  const user = await prismaBase.user.findFirst({
    where: { id: userId, tenantId: ctx.tenantId, deletedAt: null },
    include: USER_INCLUDE,
  });
  if (!user) throw new NotFoundError('Utilizador não encontrado');
  return user as unknown as PrismaUserWithRoles;
}

async function findRole(roleId: string, ctx: Ctx): Promise<PrismaRoleWithPerms> {
  const role = await prismaBase.role.findFirst({
    where: { id: roleId, tenantId: ctx.tenantId },
    include: ROLE_INCLUDE,
  });
  if (!role) throw new NotFoundError('Papel não encontrado');
  return role as unknown as PrismaRoleWithPerms;
}

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

export const userAdminService: IUserAdminService = {
  // ---- Utilizadores ----

  async listarUtilizadores(filter: FilterUserInput, ctx: Ctx) {
    return paginate(
      async ({ take, cursor, skip }) => {
        const users = await prismaBase.user.findMany({
          take,
          ...(cursor ? { cursor, skip } : {}),
          where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            ...(filter.ativo !== undefined ? { ativo: filter.ativo } : {}),
            ...(filter.roleId ? { roles: { some: { roleId: filter.roleId } } } : {}),
            ...(filter.search
              ? {
                  OR: [
                    { nome: { contains: filter.search, mode: 'insensitive' } },
                    { email: { contains: filter.search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          include: USER_INCLUDE,
          orderBy: { createdAt: 'desc' },
        });
        return users.map((u) => mapUser(u as unknown as PrismaUserWithRoles));
      },
      { cursor: filter.cursor, take: filter.take },
    );
  },

  async obterUtilizador(userId: string, ctx: Ctx) {
    return mapUser(await findUser(userId, ctx));
  },

  /**
   * Convidar um colaborador — o mesmo mecanismo do registo público (ADR-0013
   * §5-bis): Keycloak PRIMEIRO (identidade sem palavra-passe, com
   * VERIFY_EMAIL + UPDATE_PASSWORD pendentes), Postgres depois, e por fim o
   * e-mail de acções. A idempotência é por e-mail: `garantirUtilizador`
   * procura no realm antes de criar, portanto o segundo clique depois de uma
   * falha a meio reutiliza o `sub` em vez de criar uma segunda identidade.
   * O papel é atribuído à partida — nada viaja dentro de um convite.
   */
  async criarUtilizador(input: CreateUserInput, ctx: Ctx) {
    // ADR-0031: antes de tudo o resto — não se gasta quota do limitador de
    // convites num pedido que nunca vai passar.
    await exigirEmailConfirmadoParaGerirUtilizadores('criar');

    // Limitação de tráfego por tenant (ADR-0014). Vive aqui, e não na action,
    // por duas razões: o `createSafeAction` não tem gancho de limitação, e é
    // este o caminho que dispara efectivamente o e-mail de acções do Keycloak.
    //
    // Ficou órfã no merge da Fase 2: o `w8-cache` pôs o limitador na rota
    // `/api/auth/invite`, que o `w8-identidade` apagou ao mover os convites
    // para o Keycloak. Nenhum dos dois agentes podia ter visto — o cache não
    // sabia que a rota ia morrer, o identidade não sabia do limitador — e a
    // superfície de convites, que é uma das três que o ADR-0014 cobre, ficou
    // sem protecção nenhuma.
    const rl = await inviteLimiter.consume(`${ctx.tenantId}::convite`);
    if (rl.limited) {
      throw new BusinessRuleError(
        'DEMASIADOS_CONVITES',
        `Demasiados convites enviados. Tente novamente dentro de ${Math.ceil(rl.retryAfterSec / 60)} minutos.`,
      );
    }

    const email = input.email.toLowerCase().trim();

    // O e-mail é único em TODO o sistema (CONTEXT.md): uma Identidade pertence
    // a exactamente um Tenant. A verificação é global de propósito — e a
    // mensagem diz porquê, com as palavras certas.
    const existing = await prismaBase.user.findFirst({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new BusinessRuleError(
        'EMAIL_JA_REGISTADO',
        'Este endereço de e-mail já está associado a uma conta GestPro. Cada pessoa tem uma única identidade, numa única empresa — quem trabalha com duas empresas precisa de dois endereços de e-mail distintos.',
      );
    }

    // Verificar que os roles existem e pertencem ao tenant
    const roles = await prismaBase.role.findMany({
      where: { id: { in: input.roleIds }, tenantId: ctx.tenantId },
    });
    if (roles.length !== input.roleIds.length) {
      throw new NotFoundError('Um ou mais papéis não existem neste tenant');
    }

    // Dois modos de entrada (ADR-0030 §1). Por palavra-passe, a conta nasce com
    // o e-mail já dado por bom e só `UPDATE_PASSWORD` pendente: com
    // `VERIFY_EMAIL` também pendente o direct grant recusaria à mesma e a
    // pessoa ficava trancada do lado de fora.
    const porPalavraPasse = input.metodoAcesso === 'palavra-passe';

    // 1. Keycloak primeiro — o lado sem transacção (ADR-0013 §2). Se falhar,
    //    nada foi escrito em Postgres e o pedido é simplesmente repetível.
    // As acções são escolha explícita de quem chama (sem omissão em
    // `garantirUtilizador`), e aqui os dois modos querem coisas diferentes:
    // o convite por e-mail quer a verificação pendente, porque é o clique no
    // e-mail que prova o endereço; a palavra-passe atribuída não a pode
    // querer, porque com `VERIFY_EMAIL` pendente o direct grant recusa e quem
    // recebeu a palavra-passe não entrava com ela.
    const { sub: keycloakSub } = await garantirUtilizador({
      email,
      nome: input.nome,
      accoes: porPalavraPasse ? ['UPDATE_PASSWORD'] : ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
      // Quem atribui a palavra-passe responde pelo endereço (ADR-0030 §3); no
      // convite é o clique no e-mail que o prova.
      emailVerificado: porPalavraPasse,
    });

    // Temporária: o Keycloak acrescenta `UPDATE_PASSWORD` e obriga a mudar ao
    // primeiro acesso. Fica em memória até ser mostrada — nunca em Postgres,
    // nunca num log.
    const palavraPasseInicial = porPalavraPasse ? gerarPalavraPasseInicial() : null;
    if (palavraPasseInicial) {
      await definirPalavraPasse(keycloakSub, palavraPasseInicial, { temporaria: true });
    }

    // 2. Postgres numa transacção.
    const user = await prismaBase.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId: ctx.tenantId,
          keycloakSub,
          nome: input.nome,
          email,
          ativo: input.ativo ?? true,
        },
      });
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: u.id, roleId })),
      });
      return u;
    });

    // 3. No modo convite, o e-mail de acções é o que dá entrada no produto.
    //    Falha não é fatal: reenvia-se voltando a submeter (idempotente por
    //    e-mail). No modo palavra-passe não há e-mail nenhum a depender.
    if (!porPalavraPasse) await dispararEmailAccoes(keycloakSub);

    // A palavra-passe sai daqui UMA vez, ao lado do utilizador e fora dele:
    // não faz parte do modelo, não volta em nenhuma leitura (ADR-0030 §2).
    return {
      utilizador: mapUser(await findUser(user.id, ctx)),
      palavraPasseInicial,
    };
  },

  /**
   * Repõe a palavra-passe de um utilizador (ADR-0030 §6).
   *
   * Gera uma temporária, devolve-a UMA vez ao administrador e deixa o Keycloak
   * a exigir a mudança no acesso seguinte — o mesmo caminho do primeiro acesso.
   * É o caso real de quem se esquece, e não depende de e-mail nenhum.
   */
  async reporPalavraPasse(userId: string, ctx: Ctx): Promise<string> {
    const user = await findUser(userId, ctx); // garante que existe e é do tenant

    const rl = await inviteLimiter.consume(`${ctx.tenantId}::reposicao`);
    if (rl.limited) {
      throw new BusinessRuleError(
        'DEMASIADAS_REPOSICOES',
        `Demasiadas reposições seguidas. Tente novamente dentro de ${Math.ceil(rl.retryAfterSec / 60)} minutos.`,
      );
    }

    const nova = gerarPalavraPasseInicial();
    await definirPalavraPasse(user.keycloakSub, nova, { temporaria: true });
    return nova;
  },

  async actualizarUtilizador(userId: string, input: UpdateUserInput, ctx: Ctx) {
    const actual = await findUser(userId, ctx); // garante que existe e pertence ao tenant

    // Reactivação/desactivação escreve NOS DOIS lados (ADR-0013): Keycloak
    // primeiro. Na desactivação qualquer ordem é segura (falhe o lado que
    // falhar, o acesso fica fechado); na reactivação a ordem Keycloak-primeiro
    // evita um User local activo cuja identidade continua desligada.
    if (input.ativo !== undefined && input.ativo !== actual.ativo) {
      // Reactivar é dar entrada nova no produto e conta como criar (ADR-0031).
      // Desactivar NÃO é travado: um estado de onde o cliente não pode sair é
      // uma armadilha, e fechar uma conta nunca pode depender de um e-mail.
      if (input.ativo) await exigirEmailConfirmadoParaGerirUtilizadores('reactivar');
      await definirActivo(actual.keycloakSub, input.ativo);
    }

    const data: Record<string, unknown> = {};
    if (input.nome !== undefined) data.nome = input.nome;
    if (input.ativo !== undefined) data.ativo = input.ativo;

    if (Object.keys(data).length > 0) {
      // update por id: o findUser acima já validou o tenant (regra CLAUDE.md).
      await prismaBase.user.update({ where: { id: userId }, data });
    }
    return mapUser(await findUser(userId, ctx));
  },

  async desactivarUtilizador(userId: string, ctx: Ctx) {
    const user = await findUser(userId, ctx);

    // Não permitir desactivar o próprio utilizador
    if (userId === ctx.userId) {
      throw new BusinessRuleError('AUTO_DESACTIVACAO', 'Não pode desactivar o próprio utilizador');
    }

    // Guarda ULTIMO_ADMIN (Wave 3): impede desactivar o último admin activo do tenant
    const temRoleAdmin = user.roles.some((ur) => ur.role.nome === 'ADMIN');
    if (temRoleAdmin) {
      const adminsRestantes = await contarAdminsAtivos(ctx.tenantId, { excludeUserId: userId });
      if (adminsRestantes === 0) {
        throw new BusinessRuleError(
          'ULTIMO_ADMIN',
          'Não é possível desactivar o último administrador do tenant',
        );
      }
    }

    // Desactiva nos DOIS lados (ADR-0013): no Keycloak desliga a identidade e
    // encerra as sessões SSO; localmente fecha a autorização. A re-resolução
    // dos 15 minutos (ADR-0011) apanha quem tinha sessão aberta.
    await definirActivo(user.keycloakSub, false);
    await prismaBase.user.update({
      where: { id: userId },
      data: { ativo: false, deletedAt: new Date() },
    });
  },

  async atribuirRoles(input: AssignRoleInput, ctx: Ctx) {
    await findUser(input.userId, ctx);

    const roles = await prismaBase.role.findMany({
      where: { id: { in: input.roleIds }, tenantId: ctx.tenantId },
    });
    if (roles.length !== input.roleIds.length) {
      throw new NotFoundError('Um ou mais papéis não existem neste tenant');
    }

    await prismaBase.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: input.userId } });
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: input.userId, roleId })),
      });
    });

    return mapUser(await findUser(input.userId, ctx));
  },

  // ---- Roles ----

  async listarRoles(ctx: Ctx) {
    const roles = await prismaBase.role.findMany({
      where: { tenantId: ctx.tenantId },
      include: ROLE_INCLUDE,
      orderBy: { nome: 'asc' },
    });
    return roles.map((r) => mapRole(r as unknown as PrismaRoleWithPerms));
  },

  async obterRole(roleId: string, ctx: Ctx) {
    return mapRole(await findRole(roleId, ctx));
  },

  async criarRole(input: CreateRoleInput, ctx: Ctx) {
    const existing = await prismaBase.role.findFirst({
      where: { tenantId: ctx.tenantId, nome: input.nome },
    });
    if (existing) throw new BusinessRuleError('ROLE_DUPLICADO', 'Papel com este nome já existe');

    const allPerms = input.permissionCodes.length > 0
      ? await prismaBase.permission.findMany({ where: { code: { in: input.permissionCodes } } })
      : [];
    const permByCode = Object.fromEntries(allPerms.map((p) => [p.code, p]));

    const role = await prismaBase.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: { tenantId: ctx.tenantId, nome: input.nome, descricao: input.descricao },
      });
      if (allPerms.length > 0) {
        await tx.rolePermission.createMany({
          data: input.permissionCodes
            .filter((code) => permByCode[code])
            .map((code) => ({ roleId: r.id, permissionId: permByCode[code].id })),
          skipDuplicates: true,
        });
      }
      return r;
    });

    return mapRole(await findRole(role.id, ctx));
  },

  async actualizarRole(roleId: string, input: UpdateRoleInput, ctx: Ctx) {
    await findRole(roleId, ctx);

    await prismaBase.$transaction(async (tx) => {
      const data: Record<string, unknown> = {};
      if (input.nome !== undefined) data.nome = input.nome;
      if (input.descricao !== undefined) data.descricao = input.descricao;
      if (Object.keys(data).length > 0) {
        await tx.role.update({ where: { id: roleId }, data });
      }

      if (input.permissionCodes !== undefined) {
        const allPerms = input.permissionCodes.length > 0
          ? await prismaBase.permission.findMany({ where: { code: { in: input.permissionCodes } } })
          : [];
        const permByCode = Object.fromEntries(allPerms.map((p) => [p.code, p]));

        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (allPerms.length > 0) {
          await tx.rolePermission.createMany({
            data: input.permissionCodes
              .filter((code) => permByCode[code])
              .map((code) => ({ roleId, permissionId: permByCode[code].id })),
            skipDuplicates: true,
          });
        }
      }
    });

    return mapRole(await findRole(roleId, ctx));
  },

  async removerRole(roleId: string, ctx: Ctx) {
    const role = await findRole(roleId, ctx);
    if (role.isSystem) {
      throw new BusinessRuleError('ROLE_SISTEMA', 'Papéis de sistema não podem ser removidos');
    }

    // Guarda ULTIMO_ADMIN (Wave 3): se este role for o único a conferir estado ADMIN no tenant,
    // e a sua remoção deixaria o tenant sem admins activos, bloqueia.
    // Verifica: há admins activos cuja única relação com ADMIN seria via este roleId?
    // Implementação: após excluir este role da contagem, quantos admins ficam?
    const adminsRestantes = await contarAdminsAtivos(ctx.tenantId, { excludeRoleId: roleId });
    const totalAdmins = await contarAdminsAtivos(ctx.tenantId);
    if (totalAdmins > 0 && adminsRestantes === 0) {
      throw new BusinessRuleError(
        'ULTIMO_ADMIN',
        'Não é possível remover o papel que confere acesso de administrador ao último administrador',
      );
    }

    // Cascade: RolePermission + UserRole eliminados pelo onDelete: Cascade do schema
    await prismaBase.role.delete({ where: { id: roleId } });
  },

  // ---- Catálogo de Permissões ----

  async listarPermissoes() {
    const perms = await prismaBase.permission.findMany({ orderBy: { code: 'asc' } });
    return perms.map(mapPerm);
  },
};
