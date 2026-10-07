/**
 * Oráculo do nó A:limites-plano-98 (issue #98) — os limites do plano são aplicados.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * O defeito: `src/lib/planos.ts` anuncia `utilizadores` e `armazens` por plano e o ADR-0027 §2
 * declara-os «Aplicado», mas nem `userAdminService.criarUtilizador` nem
 * `stockService.criarLocalizacao` contam coisa nenhuma — um Tenant Básico (3 utilizadores,
 * 1 armazém) cria o quarto utilizador e o segundo armazém sem atrito.
 *
 * Contrato (decisão do orquestrador, ADR-0027 §2–§4 e §6):
 *   P  O plano vem da `Assinatura.planoAssinatura` do tenant (nunca da
 *      `ConfiguracaoFiscal.planoAssinatura`, que o ADR-0027 §5 apaga). Limite -1 = ilimitado;
 *      tenant SEM Assinatura = ilimitado. Em TRIAL valem os limites do plano escolhido.
 *   U1 `criarUtilizador` conta os `User` activos do tenant ANTES de chamar o Keycloak; com a
 *      contagem já no limite recusa com `BusinessRuleError('LIMITE_PLANO_UTILIZADORES')`, cuja
 *      mensagem pt-PT nomeia o plano e o caminho para mudar de plano. Nada é escrito em lado
 *      nenhum (nem identidade no Keycloak, nem `User` local).
 *   U2 Reactivar em `actualizarUtilizador` (`ativo: false → true`) é criar: mesma recusa, antes
 *      do Keycloak, e o `User` continua inactivo.
 *   U3 Desactivar nunca é bloqueado, e liberta o lugar de imediato. Estar acima do limite é
 *      tolerado: quem já existe edita-se (nome) sem recusa.
 *   A1 `criarLocalizacao` de tipo ARMAZEM conta as `Localizacao` ARMAZEM activas (ativa = true,
 *      deletedAt = null) e recusa `LIMITE_PLANO_ARMAZENS` no limite. Outros tipos não contam
 *      nem são travados.
 *   A2 `actualizarLocalizacao` que faz uma localização passar a ARMAZEM activo (mudar o tipo
 *      para ARMAZEM, ou reactivar um ARMAZEM) recusa da mesma forma; editar um ARMAZEM que já
 *      está activo não é travado, nem acima do limite. Desactivar nunca é travado.
 *   T  A contagem é por tenant: os utilizadores/armazéns de outro tenant não contam.
 *
 * Keycloak e sessão dobrados como em `registo-publico.test.ts`; Postgres real e efémero.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// O `prismaBase` lê `DATABASE_URL` no import: fixa-se antes e importa-se no `beforeAll`.
if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

/** Keycloak em memória — conta cada escrita para provar «antes do Keycloak». */
const kc = vi.hoisted(() => {
  let n = 0;
  return {
    garantirUtilizador: vi.fn(async (input: { email: string }) => {
      n += 1;
      return { sub: `kc-lp98-${n}-${Date.now()}-${input.email}`, criado: true };
    }),
    dispararEmailAccoes: vi.fn(async () => true),
    definirActivo: vi.fn(async () => undefined),
    definirPalavraPasse: vi.fn(async () => undefined),
    procurarPorEmail: vi.fn(async () => null),
    eliminarUtilizador: vi.fn(async () => undefined),
  };
});

vi.mock('@/server/auth/keycloak', () => ({
  ErroKeycloak: class ErroKeycloak extends Error {},
  ...kc,
}));

// Travão do ADR-0031 (e-mail confirmado) — fora do âmbito: sessão sempre confirmada.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({
    user: { id: 'caller', tenantId: 'x', permissions: [], emailVerificado: true },
  })),
}));

type PlanoId = 'BASICO' | 'PROFISSIONAL' | 'EMPRESARIAL';
type T = { tenantId: string; userId: string; roleId: string; ctx: { tenantId: string; userId: string } };

describe.skipIf(skip)('#98 — limites do plano aplicados — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let users: any; // userAdminService
  let stock: any; // stockService

  const sufixo = Date.now();
  let seq = 0;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ userAdminService: users } = await import('@/server/services/plataforma/user-admin.service'));
    ({ stockService: stock } = await import('@/server/services/inventario/stock.service'));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Tenant com um ADMIN activo (o chamador) e um papel. `plano: null` = sem Assinatura.
   * A `ConfiguracaoFiscal` fica de propósito em BÁSICO: o plano que conta é o da Assinatura.
   */
  async function novoTenant(
    rotulo: string,
    plano: PlanoId | null,
    estado: 'TRIAL' | 'ATIVA' = 'ATIVA',
  ): Promise<T> {
    seq += 1;
    const tenantId = `tenant-lp98-${rotulo}-${sufixo}-${seq}`;
    const userId = `user-lp98-${rotulo}-${sufixo}-${seq}`;
    const slug = `lp98-${rotulo}-${sufixo}-${seq}`;
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${sufixo + seq * 7}`.slice(-9) },
    });
    await db.configuracaoFiscal.create({ data: { tenantId, planoAssinatura: 'BASICO' } });
    if (plano) {
      await db.assinatura.create({
        data: {
          tenantId,
          planoAssinatura: plano,
          estado,
          trialFim: new Date(Date.now() + 14 * 86_400_000),
        },
      });
    }
    const role = await db.role.create({ data: { tenantId, nome: 'ADMIN', isSystem: true } });
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `${userId}@lp98.mz`,
        nome: 'Administrador',
        keycloakSub: `kc-${userId}`,
        roles: { create: [{ roleId: role.id }] },
      },
    });
    return { tenantId, userId, roleId: role.id, ctx: { tenantId, userId } };
  }

  /** Acrescenta `n` utilizadores directamente na base (sem passar pelo serviço). */
  async function maisUtilizadores(t: T, n: number, ativo = true): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      seq += 1;
      const id = `u-lp98-${sufixo}-${seq}`;
      await db.user.create({
        data: {
          id,
          tenantId: t.tenantId,
          email: `${id}@lp98.mz`,
          nome: `Colaborador ${seq}`,
          keycloakSub: `kc-${id}`,
          ativo,
          roles: { create: [{ roleId: t.roleId }] },
        },
      });
      ids.push(id);
    }
    return ids;
  }

  function convite(t: T, rotulo: string) {
    seq += 1;
    return {
      nome: `Novo ${rotulo}`,
      email: `novo-${rotulo}-${sufixo}-${seq}@lp98.mz`,
      roleIds: [t.roleId],
      metodoAcesso: 'convite',
      ativo: true,
    };
  }

  async function ativos(t: T): Promise<number> {
    return db.user.count({ where: { tenantId: t.tenantId, ativo: true } });
  }

  async function armazem(t: T, opts: { tipo?: string; ativa?: boolean; deletedAt?: Date } = {}) {
    seq += 1;
    return db.localizacao.create({
      data: {
        tenantId: t.tenantId,
        codigo: `L${seq}`,
        nome: `Local ${seq}`,
        tipo: opts.tipo ?? 'ARMAZEM',
        ativa: opts.ativa ?? true,
        ...(opts.deletedAt ? { deletedAt: opts.deletedAt } : {}),
      },
    });
  }

  function novaLoc(tipo: string) {
    seq += 1;
    return { codigo: `N${seq}`, nome: `Nova ${seq}`, tipo, ativa: true };
  }

  async function armazensActivos(t: T): Promise<number> {
    return db.localizacao.count({
      where: { tenantId: t.tenantId, tipo: 'ARMAZEM', ativa: true, deletedAt: null },
    });
  }

  async function erroDe(p: Promise<unknown>): Promise<any> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    return null;
  }

  const comCtx = (t: T, fn: () => Promise<any>): Promise<any> => runCtx(t.ctx, fn);

  // ─── Utilizadores ──────────────────────────────────────────────────────────

  describe('U1 — criar utilizador', () => {
    it('Básico com 3 activos: recusa LIMITE_PLANO_UTILIZADORES antes do Keycloak, e nada é escrito', async () => {
      const t = await novoTenant('u1-cheio', 'BASICO');
      await maisUtilizadores(t, 2); // 3 activos = limite do Básico
      const antes = await ativos(t);
      const totalAntes = await db.user.count({ where: { tenantId: t.tenantId } });

      const e = await erroDe(users.criarUtilizador(convite(t, 'u1'), t.ctx));

      expect(e, 'o 4.º utilizador do Básico passou').not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('LIMITE_PLANO_UTILIZADORES');
      expect(kc.garantirUtilizador).not.toHaveBeenCalled();
      expect(kc.definirPalavraPasse).not.toHaveBeenCalled();
      expect(kc.dispararEmailAccoes).not.toHaveBeenCalled();
      expect(await ativos(t)).toBe(antes);
      expect(await db.user.count({ where: { tenantId: t.tenantId } })).toBe(totalAntes);
    });

    it('a mensagem é pt-PT, nomeia o plano e o caminho para mudar de plano', async () => {
      const t = await novoTenant('u1-msg', 'BASICO');
      await maisUtilizadores(t, 2);

      const e = await erroDe(users.criarUtilizador(convite(t, 'msg'), t.ctx));

      expect(e?.code).toBe('LIMITE_PLANO_UTILIZADORES');
      expect(e.message).toMatch(/Básico/);
      expect(e.message).toMatch(/\/definicoes\/faturacao|Subscrição/);
      expect(e.message).toMatch(/plano/i);
    });

    it('a mensagem nomeia o plano DO TENANT (Profissional), não um texto fixo', async () => {
      const t = await novoTenant('u1-prof', 'PROFISSIONAL');
      await maisUtilizadores(t, 14); // 15 activos = limite do Profissional

      const e = await erroDe(users.criarUtilizador(convite(t, 'prof'), t.ctx));

      expect(e?.code).toBe('LIMITE_PLANO_UTILIZADORES');
      expect(e.message).toMatch(/Profissional/);
      expect(e.message).not.toMatch(/Básico/);
    });

    it('Básico com 2 activos: o 3.º passa (o limite é inclusivo)', async () => {
      const t = await novoTenant('u1-fronteira', 'BASICO');
      await maisUtilizadores(t, 1); // 2 activos

      const r = await users.criarUtilizador(convite(t, 'terceiro'), t.ctx);

      expect(r.utilizador.ativo).toBe(true);
      expect(await ativos(t)).toBe(3);
    });

    it('os inactivos não contam: Básico com 2 activos e 5 inactivos cria o 3.º', async () => {
      const t = await novoTenant('u1-inactivos', 'BASICO');
      await maisUtilizadores(t, 1);
      await maisUtilizadores(t, 5, false);

      const r = await users.criarUtilizador(convite(t, 'inact'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
    });

    it('Profissional com 3 activos cria o 4.º — o plano vem da Assinatura, não da ConfiguracaoFiscal (BÁSICO)', async () => {
      const t = await novoTenant('u1-assin', 'PROFISSIONAL');
      await maisUtilizadores(t, 2);

      const r = await users.criarUtilizador(convite(t, 'quarto'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
      expect(await ativos(t)).toBe(4);
    });

    it('em TRIAL valem os limites do plano escolhido (Profissional), não os do Básico', async () => {
      const t = await novoTenant('u1-trial', 'PROFISSIONAL', 'TRIAL');
      await maisUtilizadores(t, 3); // 4 activos

      const r = await users.criarUtilizador(convite(t, 'trial'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
    });

    it('Empresarial (-1) é ilimitado', async () => {
      const t = await novoTenant('u1-emp', 'EMPRESARIAL');
      await maisUtilizadores(t, 20);

      const r = await users.criarUtilizador(convite(t, 'emp'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
    });

    it('tenant sem Assinatura é ilimitado', async () => {
      const t = await novoTenant('u1-sem', null);
      await maisUtilizadores(t, 5);

      const r = await users.criarUtilizador(convite(t, 'sem'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
    });

    it('T — os utilizadores de outro tenant não contam', async () => {
      const outro = await novoTenant('u1-outro', 'BASICO');
      await maisUtilizadores(outro, 6, true);
      const t = await novoTenant('u1-meu', 'BASICO'); // 1 activo

      const r = await users.criarUtilizador(convite(t, 'meu'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
    });
  });

  describe('U2 — reactivar utilizador é criar', () => {
    it('Básico com 3 activos: reactivar o 4.º recusa LIMITE_PLANO_UTILIZADORES antes do Keycloak', async () => {
      const t = await novoTenant('u2-cheio', 'BASICO');
      await maisUtilizadores(t, 2);
      const [inactivo] = await maisUtilizadores(t, 1, false);

      const e = await erroDe(users.actualizarUtilizador(inactivo, { ativo: true }, t.ctx));

      expect(e, 'reactivar acima do limite passou').not.toBeNull();
      expect(e.code).toBe('LIMITE_PLANO_UTILIZADORES');
      expect(e.message).toMatch(/Básico/);
      expect(kc.definirActivo).not.toHaveBeenCalled();
      const u = await db.user.findUnique({ where: { id: inactivo } });
      expect(u.ativo).toBe(false);
      expect(await ativos(t)).toBe(3);
    });

    it('Básico com 2 activos: reactivar passa', async () => {
      const t = await novoTenant('u2-livre', 'BASICO');
      await maisUtilizadores(t, 1);
      const [inactivo] = await maisUtilizadores(t, 1, false);

      const r = await users.actualizarUtilizador(inactivo, { ativo: true }, t.ctx);

      expect(r.ativo).toBe(true);
      expect(kc.definirActivo).toHaveBeenCalledWith(`kc-${inactivo}`, true);
    });
  });

  describe('U3 — desactivar nunca é travado; acima do limite é tolerado', () => {
    it('Básico com 4 activos (desceu de plano): mudar o nome de quem existe passa', async () => {
      const t = await novoTenant('u3-nome', 'BASICO');
      const [a] = await maisUtilizadores(t, 3); // 4 activos — excedido

      const r = await users.actualizarUtilizador(a, { nome: 'Nome Novo' }, t.ctx);
      expect(r.nome).toBe('Nome Novo');
    });

    it('Básico com 4 activos: actualizar com ativo: true a quem JÁ está activo não é reactivar e passa', async () => {
      const t = await novoTenant('u3-ja-activo', 'BASICO');
      const [a] = await maisUtilizadores(t, 3);

      const r = await users.actualizarUtilizador(a, { nome: 'Outro', ativo: true }, t.ctx);
      expect(r.nome).toBe('Outro');
      expect(r.ativo).toBe(true);
    });

    it('Básico com 4 activos: desactivar (pelas duas vias) passa', async () => {
      const t = await novoTenant('u3-desact', 'BASICO');
      const [a, b] = await maisUtilizadores(t, 3);

      await users.desactivarUtilizador(a, t.ctx);
      const r = await users.actualizarUtilizador(b, { ativo: false }, t.ctx);

      expect(r.ativo).toBe(false);
      expect(await ativos(t)).toBe(2);
    });

    it('desactivar liberta o lugar de imediato: Básico cheio, desactiva um, o convite seguinte passa', async () => {
      const t = await novoTenant('u3-liberta', 'BASICO');
      const [a] = await maisUtilizadores(t, 2); // 3 activos

      expect((await erroDe(users.criarUtilizador(convite(t, 'antes'), t.ctx)))?.code).toBe(
        'LIMITE_PLANO_UTILIZADORES',
      );
      await users.desactivarUtilizador(a, t.ctx);

      const r = await users.criarUtilizador(convite(t, 'depois'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
    });
  });

  // ─── Armazéns ──────────────────────────────────────────────────────────────

  describe('A1 — criar localização', () => {
    it('Básico com 1 armazém activo: criar o 2.º ARMAZEM recusa LIMITE_PLANO_ARMAZENS', async () => {
      const t = await novoTenant('a1-cheio', 'BASICO');
      await armazem(t);

      const e = await erroDe(comCtx(t, () => stock.criarLocalizacao(novaLoc('ARMAZEM'), t.ctx)));

      expect(e, 'o 2.º armazém do Básico passou').not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('LIMITE_PLANO_ARMAZENS');
      expect(e.message).toMatch(/Básico/);
      expect(e.message).toMatch(/\/definicoes\/faturacao|Subscrição/);
      expect(await armazensActivos(t)).toBe(1);
    });

    it('Básico sem armazéns: o 1.º passa (o limite é inclusivo)', async () => {
      const t = await novoTenant('a1-primeiro', 'BASICO');

      const l = await comCtx(t, () => stock.criarLocalizacao(novaLoc('ARMAZEM'), t.ctx));
      expect(l.tipo).toBe('ARMAZEM');
      expect(await armazensActivos(t)).toBe(1);
    });

    it('outros tipos não contam nem são travados: Básico com 1 armazém cria FILIAL e PRATELEIRA', async () => {
      const t = await novoTenant('a1-outros', 'BASICO');
      await armazem(t);

      const f = await comCtx(t, () => stock.criarLocalizacao(novaLoc('FILIAL'), t.ctx));
      const p = await comCtx(t, () => stock.criarLocalizacao(novaLoc('PRATELEIRA'), t.ctx));
      expect(f.tipo).toBe('FILIAL');
      expect(p.tipo).toBe('PRATELEIRA');
    });

    it('armazéns inactivos ou apagados não contam: Básico com um de cada cria o 1.º activo', async () => {
      const t = await novoTenant('a1-inactivos', 'BASICO');
      await armazem(t, { ativa: false });
      await armazem(t, { deletedAt: new Date() });
      await armazem(t, { tipo: 'FILIAL' });

      const l = await comCtx(t, () => stock.criarLocalizacao(novaLoc('ARMAZEM'), t.ctx));
      expect(l.tipo).toBe('ARMAZEM');
    });

    it('Profissional (5): com 4 cria o 5.º, com 5 recusa e nomeia o Profissional', async () => {
      const t = await novoTenant('a1-prof', 'PROFISSIONAL');
      for (let i = 0; i < 4; i++) await armazem(t);

      await comCtx(t, () => stock.criarLocalizacao(novaLoc('ARMAZEM'), t.ctx));
      expect(await armazensActivos(t)).toBe(5);

      const e = await erroDe(comCtx(t, () => stock.criarLocalizacao(novaLoc('ARMAZEM'), t.ctx)));
      expect(e?.code).toBe('LIMITE_PLANO_ARMAZENS');
      expect(e.message).toMatch(/Profissional/);
    });

    it('Empresarial (-1) e tenant sem Assinatura são ilimitados', async () => {
      const emp = await novoTenant('a1-emp', 'EMPRESARIAL');
      const sem = await novoTenant('a1-sem', null);
      for (let i = 0; i < 6; i++) {
        await armazem(emp);
        await armazem(sem);
      }

      const a = await comCtx(emp, () => stock.criarLocalizacao(novaLoc('ARMAZEM'), emp.ctx));
      const b = await comCtx(sem, () => stock.criarLocalizacao(novaLoc('ARMAZEM'), sem.ctx));
      expect(a.tipo).toBe('ARMAZEM');
      expect(b.tipo).toBe('ARMAZEM');
    });

    it('T — os armazéns de outro tenant não contam', async () => {
      const outro = await novoTenant('a1-outro', 'BASICO');
      await armazem(outro);
      await armazem(outro);
      const t = await novoTenant('a1-meu', 'BASICO');

      const l = await comCtx(t, () => stock.criarLocalizacao(novaLoc('ARMAZEM'), t.ctx));
      expect(l.tipo).toBe('ARMAZEM');
    });
  });

  describe('A2 — actualizar localização', () => {
    it('Básico com 1 armazém: mudar uma FILIAL activa para ARMAZEM recusa LIMITE_PLANO_ARMAZENS', async () => {
      const t = await novoTenant('a2-tipo', 'BASICO');
      await armazem(t);
      const filial = await armazem(t, { tipo: 'FILIAL' });

      const e = await erroDe(
        comCtx(t, () => stock.actualizarLocalizacao(filial.id, { tipo: 'ARMAZEM' }, t.ctx)),
      );

      expect(e, 'mudar para ARMAZEM acima do limite passou').not.toBeNull();
      expect(e.code).toBe('LIMITE_PLANO_ARMAZENS');
      const l = await db.localizacao.findUnique({ where: { id: filial.id } });
      expect(l.tipo).toBe('FILIAL');
    });

    it('Básico com 1 armazém: reactivar um ARMAZEM inactivo recusa LIMITE_PLANO_ARMAZENS', async () => {
      const t = await novoTenant('a2-reactivar', 'BASICO');
      await armazem(t);
      const inactivo = await armazem(t, { ativa: false });

      const e = await erroDe(
        comCtx(t, () => stock.actualizarLocalizacao(inactivo.id, { ativa: true }, t.ctx)),
      );

      expect(e?.code).toBe('LIMITE_PLANO_ARMAZENS');
      const l = await db.localizacao.findUnique({ where: { id: inactivo.id } });
      expect(l.ativa).toBe(false);
      expect(await armazensActivos(t)).toBe(1);
    });

    it('Básico sem armazém activo: mudar a FILIAL para ARMAZEM passa', async () => {
      const t = await novoTenant('a2-livre', 'BASICO');
      const filial = await armazem(t, { tipo: 'FILIAL' });

      const l = await comCtx(t, () => stock.actualizarLocalizacao(filial.id, { tipo: 'ARMAZEM' }, t.ctx));
      expect(l.tipo).toBe('ARMAZEM');
    });

    it('Básico com 2 armazéns activos (excedido): editar o nome de um deles passa', async () => {
      const t = await novoTenant('a2-excedido', 'BASICO');
      const a = await armazem(t);
      await armazem(t);

      const l = await comCtx(t, () =>
        stock.actualizarLocalizacao(a.id, { nome: 'Armazém Central', tipo: 'ARMAZEM', ativa: true }, t.ctx),
      );
      expect(l.nome).toBe('Armazém Central');
    });

    it('Básico com 2 armazéns activos: desactivar (pelas duas vias) e mudar um ARMAZEM para FILIAL passam', async () => {
      const t = await novoTenant('a2-desact', 'BASICO');
      const a = await armazem(t);
      const b = await armazem(t);
      const c = await armazem(t);

      await comCtx(t, () => stock.desactivarLocalizacao(a.id, t.ctx));
      const lb = await comCtx(t, () => stock.actualizarLocalizacao(b.id, { ativa: false }, t.ctx));
      const lc = await comCtx(t, () => stock.actualizarLocalizacao(c.id, { tipo: 'FILIAL' }, t.ctx));

      expect(lb.ativa).toBe(false);
      expect(lc.tipo).toBe('FILIAL');
      expect(await armazensActivos(t)).toBe(0);
    });
  });
});
