/**
 * Oráculo do nó A:catalogo-bd (issue #524, ADR-0049 §1–§4) — o catálogo de planos passa da
 * constante `PLANOS` + enum `PlanoAssinatura` para a tabela global `Plano`.
 *
 * Escrito pelo VERIFICADOR antes da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contrato (decisão do orquestrador; onde o contrato e o ADR divergem, vale o contrato):
 *   C1 A migração cria `Plano` (global, sem `tenantId`) e semeia BASICO/PROFISSIONAL/EMPRESARIAL
 *      com os valores de hoje de `lib/planos.ts`: nome, descrição, preços USD (Decimal), limites
 *      (-1 = ilimitado), suporte, destaque (só PROFISSIONAL), ordem crescente BASICO <
 *      PROFISSIONAL < EMPRESARIAL, Price IDs vazios, `arquivadoEm` nulo e `funcionalidades` com
 *      pelo menos uma linha de texto não vazia.
 *   C2 `Assinatura.planoAssinatura` é TEXT, sem omissão, com FK para `Plano.codigo` ON DELETE
 *      RESTRICT ON UPDATE RESTRICT; `ConfiguracaoFiscal.planoAssinatura` e o tipo
 *      `PlanoAssinatura` deixam de existir.
 *   C3 Apagar um Plano referido por uma Assinatura falha na base; apagar um não referido passa;
 *      mudar o `codigo` de um plano referido falha; uma Assinatura com código inexistente falha.
 *   C4 Serviço `@/server/services/plataforma/plano.service` (server-only), exportando
 *      `obterPlano(codigo)` e `listarPlanosPublicos()` (soltos ou em `planoService`):
 *      `obterPlano` devolve null para um código desconhecido (inclui minúsculas);
 *      `listarPlanosPublicos()` devolve o payload público (id=codigo, nome, descricao,
 *      limites{utilizadores,armazens,suporte}, precoMensal/precoAnual {valor:number,moeda:'USD'},
 *      destaque, funcionalidades) — só não arquivados, por `ordem` — sem contexto de tenant.
 *   C5 `GET /api/publico/planos` serve `{ data: { trialDias: 14, planos: <C4> } }` a partir da
 *      base: o mesmo formato de hoje + `funcionalidades`; nunca nomes de env vars nem Price IDs.
 *   C6 `limites-plano.ts` lê os limites da tabela a cada verificação: subir
 *      `limiteUtilizadores`/`limiteArmazens` na base deixa passar o que antes era recusado
 *      (LIMITE_PLANO_UTILIZADORES / LIMITE_PLANO_ARMAZENS), -1 é ilimitado, a mensagem nomeia o
 *      `nome` do plano da tabela, e um plano arquivado continua a valer para quem já o tem.
 *   C7 `resolverPriceId(codigo, ciclo)` (síncrono ou assíncrono): coluna da tabela preenchida
 *      ganha à env `STRIPE_PRICE_<CODIGO>_<CICLO>`; coluna vazia cai na env; nenhum dos dois →
 *      AppError `PRICE_NAO_CONFIGURADO` (503).
 *   C8 `iniciarCheckout` recusa plano inexistente ou arquivado com
 *      `BusinessRuleError('PLANO_INDISPONIVEL')` sem tocar no Stripe; num plano activo usa o
 *      Price ID da tabela.
 *   C9 Webhook `customer.subscription.updated`: o Price da subscrição mapeia para o plano pela
 *      tabela (qualquer ciclo) e, na falta, pela env `STRIPE_PRICE_<CODIGO>_<CICLO>`; a
 *      Assinatura passa a esse plano. Price desconhecido não muda o plano.
 *   C10 `tenantAdminService.listar({ planoAssinatura })` filtra pelo plano da Assinatura.
 *   C11 Provisionamento (decisão conservadora do verificador — recusar > número errado): plano
 *      inexistente ou arquivado → `BusinessRuleError('PLANO_INDISPONIVEL')`, antes do Keycloak e
 *      sem criar tenant; plano activo criado na tabela → a Assinatura nasce nele.
 *
 * Os planos de teste usam códigos `TCB_*` próprios — os três de origem nunca são alterados aqui,
 * para não contaminar os outros ficheiros da suite (que partilham o mesmo contentor).
 *
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

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
      return { sub: `kc-tcb524-${n}-${Date.now()}-${input.email}`, criado: true };
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

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({
    user: { id: 'caller', tenantId: 'x', permissions: [], emailVerificado: true },
  })),
}));

/** Stripe dublado; o `resolverPriceId` fica o REAL (lê a tabela e a env). */
const stripe = vi.hoisted(() => ({
  customersCreate: vi.fn(async () => ({ id: 'cus_dublado' })),
  checkoutCreate: vi.fn(async (_args: unknown) => ({ url: 'https://checkout.stripe.com/c/pay/tcb524' })),
}));

vi.mock('@/server/billing/stripe-client', async () => {
  const real = await vi.importActual<any>('@/server/billing/stripe-client');
  return {
    ...real,
    stripeConfigurado: () => true,
    getWebhookSecret: () => 'whsec_teste',
    getStripe: () => ({
      customers: { create: stripe.customersCreate },
      checkout: { sessions: { create: stripe.checkoutCreate } },
      billingPortal: { sessions: { create: vi.fn() } },
      subscriptions: { update: vi.fn(), create: vi.fn() },
      webhooks: { constructEvent: vi.fn() },
    }),
  };
});

const ORIGEM = ['BASICO', 'PROFISSIONAL', 'EMPRESARIAL'] as const;

/** Valores actuais de `lib/planos.ts` (antes da migração) — a migração tem de os reproduzir. */
const VALORES_DE_ORIGEM = {
  BASICO: {
    nome: 'Básico',
    descricao: 'Para empresas em arranque que precisam de facturação e stock.',
    limiteUtilizadores: 3,
    limiteArmazens: 1,
    suporte: 'Email (48h)',
    precoMensalUsd: 29,
    precoAnualUsd: 290,
    destaque: false,
  },
  PROFISSIONAL: {
    nome: 'Profissional',
    descricao: 'Contabilidade PGC-NIRF completa, compras e recursos humanos.',
    limiteUtilizadores: 15,
    limiteArmazens: 5,
    suporte: 'Email + telefone (24h)',
    precoMensalUsd: 79,
    precoAnualUsd: 790,
    destaque: true,
  },
  EMPRESARIAL: {
    nome: 'Empresarial',
    descricao: 'Multi-armazém, produção, projectos e apoio dedicado.',
    limiteUtilizadores: -1,
    limiteArmazens: -1,
    suporte: 'Gestor de conta dedicado (4h)',
    precoMensalUsd: 199,
    precoAnualUsd: 1990,
    destaque: false,
  },
} as const;

type T = { tenantId: string; userId: string; roleId: string; ctx: { tenantId: string; userId: string } };

describe.skipIf(skip)('#524 — catálogo de planos na base (ADR-0049) — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];

  const sufixo = Date.now();
  const s6 = `${sufixo}`.slice(-6);
  let seq = 0;
  const criados: string[] = [];
  const ENV_ORIGINAL = { ...process.env };

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
  });

  afterAll(async () => {
    if (!db) return;
    // Os planos TCB_* não podem ficar referidos por ninguém: os tenants deste ficheiro ficam,
    // mas as suas Assinaturas voltam ao EMPRESARIAL antes de apagar os planos de teste.
    try {
      await db.assinatura.updateMany({
        where: { planoAssinatura: { in: criados } },
        data: { planoAssinatura: 'EMPRESARIAL' },
      });
      await db.plano.deleteMany({ where: { codigo: { in: criados } } });
    } catch {
      // fase vermelha: a tabela ainda não existe.
    }
    await db.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
  });

  // ─── utilitários ────────────────────────────────────────────────────────────

  /** O serviço do catálogo. Import dinâmico: na fase vermelha falha o caso, não o ficheiro. */
  async function svc(): Promise<{
    obterPlano: (codigo: string) => Promise<any>;
    listarPlanosPublicos: () => Promise<any[]>;
  }> {
    // Nome em variável: o módulo ainda não existe na fase vermelha e o `tsc` não o pode exigir.
    const caminho = '@/server/services/plataforma/plano.service';
    const mod: any = await import(/* @vite-ignore */ caminho);
    const fonte = mod.planoService ?? mod;
    return {
      obterPlano: (c: string) => fonte.obterPlano(c),
      listarPlanosPublicos: () => fonte.listarPlanosPublicos(),
    };
  }

  function codigo(rotulo: string): string {
    seq += 1;
    return `TCB_${rotulo}_${s6}${seq}`;
  }

  async function novoPlano(rotulo: string, over: Record<string, unknown> = {}): Promise<string> {
    const c = (over.codigo as string) ?? codigo(rotulo);
    await db.plano.create({
      data: {
        nome: `Plano ${rotulo} ${s6}`,
        descricao: `Plano de teste ${rotulo}`,
        precoMensalUsd: '10.00',
        precoAnualUsd: '100.00',
        limiteUtilizadores: -1,
        limiteArmazens: -1,
        suporte: 'Email',
        funcionalidades: [],
        ordem: 50,
        ...over,
        codigo: c,
      },
    });
    criados.push(c);
    return c;
  }

  async function novoTenant(
    rotulo: string,
    plano: string | null,
    estado: 'TRIAL' | 'ATIVA' = 'ATIVA',
    extra: Record<string, unknown> = {},
  ): Promise<T> {
    seq += 1;
    const tenantId = `tenant-tcb524-${rotulo}-${sufixo}-${seq}`;
    const userId = `user-tcb524-${rotulo}-${sufixo}-${seq}`;
    const slug = `tcb524-${rotulo}-${sufixo}-${seq}`;
    await db.tenant.create({
      data: {
        id: tenantId,
        nome: `TCB524 ${s6} ${rotulo} ${seq}`,
        slug,
        nuit: `${sufixo + seq * 13}`.slice(-9),
      },
    });
    await db.configuracaoFiscal.create({ data: { tenantId } });
    if (plano) {
      await db.assinatura.create({
        data: {
          tenantId,
          planoAssinatura: plano,
          estado,
          trialFim: new Date(Date.now() + 14 * 86_400_000),
          ...extra,
        },
      });
    }
    const role = await db.role.create({ data: { tenantId, nome: 'ADMIN', isSystem: true } });
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `${userId}@tcb524.mz`,
        nome: 'Administrador',
        keycloakSub: `kc-${userId}`,
        roles: { create: [{ roleId: role.id }] },
      },
    });
    return { tenantId, userId, roleId: role.id, ctx: { tenantId, userId } };
  }

  async function maisUtilizadores(t: T, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      seq += 1;
      const id = `u-tcb524-${sufixo}-${seq}`;
      await db.user.create({
        data: {
          id,
          tenantId: t.tenantId,
          email: `${id}@tcb524.mz`,
          nome: `Colaborador ${seq}`,
          keycloakSub: `kc-${id}`,
          roles: { create: [{ roleId: t.roleId }] },
        },
      });
    }
  }

  function convite(t: T, rotulo: string) {
    seq += 1;
    return {
      nome: `Novo ${rotulo}`,
      email: `novo-${rotulo}-${sufixo}-${seq}@tcb524.mz`,
      roleIds: [t.roleId],
      metodoAcesso: 'convite',
      ativo: true,
    };
  }

  function novaLoc() {
    seq += 1;
    return { codigo: `TCB${seq}`, nome: `Armazém ${seq}`, tipo: 'ARMAZEM', ativa: true };
  }

  async function erroDe(p: Promise<unknown> | (() => unknown)): Promise<any> {
    try {
      await (typeof p === 'function' ? p() : p);
    } catch (e) {
      return e;
    }
    return null;
  }

  // ─── C1 — catálogo semeado pela migração ─────────────────────────────────────

  describe('C1 — a migração semeia os três planos de origem com os valores de hoje', () => {
    it.each(ORIGEM)('%s tem os valores actuais de lib/planos.ts', async (c) => {
      const p = await db.plano.findUnique({ where: { codigo: c } });
      expect(p, `o plano ${c} não foi semeado`).not.toBeNull();
      const v = VALORES_DE_ORIGEM[c];
      expect(p.nome).toBe(v.nome);
      expect(p.descricao).toBe(v.descricao);
      expect(p.limiteUtilizadores).toBe(v.limiteUtilizadores);
      expect(p.limiteArmazens).toBe(v.limiteArmazens);
      expect(p.suporte).toBe(v.suporte);
      expect(Number(p.precoMensalUsd)).toBe(v.precoMensalUsd);
      expect(Number(p.precoAnualUsd)).toBe(v.precoAnualUsd);
      expect(p.destaque).toBe(v.destaque);
      expect(p.arquivadoEm).toBeNull();
      // Os Price IDs dos planos de origem resolvem pela env (ADR-0049 §4).
      expect(p.stripePriceIdMensal ?? null).toBeNull();
      expect(p.stripePriceIdAnual ?? null).toBeNull();
      expect(Array.isArray(p.funcionalidades)).toBe(true);
      expect(p.funcionalidades.length, `${c} sem funcionalidades`).toBeGreaterThan(0);
      for (const f of p.funcionalidades) {
        expect(typeof f).toBe('string');
        expect(f.trim().length).toBeGreaterThan(0);
      }
      // O anual nunca é mais caro do que doze mensalidades.
      expect(Number(p.precoAnualUsd)).toBeLessThanOrEqual(Number(p.precoMensalUsd) * 12);
      expect(p.createdAt).toBeInstanceOf(Date);
      expect(p.updatedAt).toBeInstanceOf(Date);
    });

    it('a ordem dos três é BASICO < PROFISSIONAL < EMPRESARIAL', async () => {
      const ps = await db.plano.findMany({ where: { codigo: { in: [...ORIGEM] } } });
      expect(ps).toHaveLength(3);
      const ordem = Object.fromEntries(ps.map((p: any) => [p.codigo, p.ordem]));
      expect(ordem.BASICO).toBeLessThan(ordem.PROFISSIONAL);
      expect(ordem.PROFISSIONAL).toBeLessThan(ordem.EMPRESARIAL);
    });

    it('o Plano é global: a tabela não tem tenantId', async () => {
      const cols: Array<{ column_name: string }> = await db.$queryRaw`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Plano'`;
      const nomes = cols.map((c) => c.column_name);
      expect(nomes, 'a tabela Plano não existe').toContain('codigo');
      expect(nomes).not.toContain('tenantId');
    });
  });

  // ─── C2 — forma das colunas ──────────────────────────────────────────────────

  describe('C2 — Assinatura.planoAssinatura é texto com FK Restrict; o resto do enum sai', () => {
    it('Assinatura.planoAssinatura é TEXT e sem omissão', async () => {
      const [col]: Array<{ data_type: string; column_default: string | null }> = await db.$queryRaw`
        SELECT data_type, column_default FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'Assinatura'
          AND column_name = 'planoAssinatura'`;
      expect(col, 'a coluna planoAssinatura desapareceu').toBeDefined();
      expect(col.data_type).toBe('text');
      expect(col.column_default).toBeNull();
    });

    it('a FK Assinatura → Plano é ON DELETE RESTRICT e ON UPDATE RESTRICT', async () => {
      const fks: Array<{ confdeltype: string; confupdtype: string }> = await db.$queryRaw`
        SELECT c.confdeltype::text AS confdeltype, c.confupdtype::text AS confupdtype
        FROM pg_constraint c
        JOIN pg_class r ON r.oid = c.conrelid
        JOIN pg_class f ON f.oid = c.confrelid
        WHERE c.contype = 'f' AND r.relname = 'Assinatura' AND f.relname = 'Plano'`;
      expect(fks, 'não há FK da Assinatura para o Plano').toHaveLength(1);
      expect(fks[0].confdeltype).toBe('r');
      expect(fks[0].confupdtype).toBe('r');
    });

    it('ConfiguracaoFiscal já não tem planoAssinatura', async () => {
      const cols: Array<{ column_name: string }> = await db.$queryRaw`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'ConfiguracaoFiscal'`;
      expect(cols.map((c) => c.column_name)).toContain('tenantId');
      expect(cols.map((c) => c.column_name)).not.toContain('planoAssinatura');
    });

    it('o tipo PlanoAssinatura deixou de existir', async () => {
      const tipos: Array<{ typname: string }> = await db.$queryRaw`
        SELECT typname FROM pg_type WHERE typname = 'PlanoAssinatura'`;
      expect(tipos).toHaveLength(0);
    });
  });

  // ─── C3 — integridade referencial ────────────────────────────────────────────

  describe('C3 — a FK protege os planos em uso', () => {
    it('apagar um Plano referido por uma Assinatura falha na base, e o plano fica', async () => {
      const c = await novoPlano('FKUSO');
      await novoTenant('fk-uso', c);

      const e = await erroDe(db.plano.delete({ where: { codigo: c } }));

      expect(e, 'apagou um plano em uso').not.toBeNull();
      expect(await db.plano.findUnique({ where: { codigo: c } })).not.toBeNull();
    });

    it('apagar um Plano sem Assinaturas passa', async () => {
      const c = await novoPlano('FKLIVRE');
      await db.plano.delete({ where: { codigo: c } });
      expect(await db.plano.findUnique({ where: { codigo: c } })).toBeNull();
    });

    it('mudar o codigo de um plano referido falha (ON UPDATE RESTRICT)', async () => {
      const c = await novoPlano('FKUPD');
      await novoTenant('fk-upd', c);

      const e = await erroDe(
        db.plano.update({ where: { codigo: c }, data: { codigo: `${c}_X` } }),
      );

      expect(e, 'mudou o código de um plano em uso').not.toBeNull();
      expect(await db.plano.findUnique({ where: { codigo: c } })).not.toBeNull();
    });

    it('uma Assinatura não pode apontar para um código inexistente', async () => {
      const e = await erroDe(novoTenant('fk-inexistente', `TCB_NAO_EXISTE_${s6}`));
      expect(e, 'gravou uma Assinatura com plano inexistente').not.toBeNull();
    });

    it('o codigo é único', async () => {
      const c = await novoPlano('UNICO');
      const e = await erroDe(novoPlano('UNICO', { codigo: c }));
      expect(e, 'dois planos com o mesmo código').not.toBeNull();
    });
  });

  // ─── C4/C5 — leitura pública ─────────────────────────────────────────────────

  describe('C4 — plano.service', () => {
    it('obterPlano devolve o plano pelo código e null para um desconhecido (sem contexto de tenant)', async () => {
      const { obterPlano } = await svc();
      const b = await obterPlano('BASICO');
      expect(b).not.toBeNull();
      expect(b.codigo ?? b.id).toBe('BASICO');
      expect(await obterPlano('GRATIS')).toBeNull();
      expect(await obterPlano('basico')).toBeNull();
    });

    it('listarPlanosPublicos: só não arquivados, por ordem, no formato público com funcionalidades', async () => {
      const primeiro = await novoPlano('PRIMEIRO', {
        ordem: -1000,
        funcionalidades: ['Linha um', 'Linha dois'],
        precoMensalUsd: '12.50',
        precoAnualUsd: '125.00',
        limiteUtilizadores: 7,
        limiteArmazens: 2,
        suporte: 'Chat',
        destaque: true,
        stripePriceIdMensal: `price_tcb_pub_m_${s6}`,
        stripePriceIdAnual: `price_tcb_pub_a_${s6}`,
      });
      const ultimo = await novoPlano('ULTIMO', { ordem: 100000 });
      const arquivado = await novoPlano('ARQPUB', { ordem: 0, arquivadoEm: new Date() });

      const { listarPlanosPublicos } = await svc();
      const planos = await listarPlanosPublicos();
      const ids = planos.map((p: any) => p.id);

      expect(ids).not.toContain(arquivado);
      expect(ids[0]).toBe(primeiro);
      expect(ids[ids.length - 1]).toBe(ultimo);
      const origem = ids.filter((id: string) => (ORIGEM as readonly string[]).includes(id));
      expect(origem).toEqual([...ORIGEM]);

      const p = planos.find((x: any) => x.id === primeiro);
      expect(p).toEqual({
        id: primeiro,
        nome: `Plano PRIMEIRO ${s6}`,
        descricao: 'Plano de teste PRIMEIRO',
        limites: { utilizadores: 7, armazens: 2, suporte: 'Chat' },
        precoMensal: { valor: 12.5, moeda: 'USD' },
        precoAnual: { valor: 125, moeda: 'USD' },
        destaque: true,
        funcionalidades: ['Linha um', 'Linha dois'],
      });
      expect(JSON.stringify(planos)).not.toContain('price_tcb_pub');
      expect(JSON.stringify(planos)).not.toContain('STRIPE_');
    });

    it('desarquivar devolve o plano ao catálogo público', async () => {
      const c = await novoPlano('DESARQ', { arquivadoEm: new Date() });
      const { listarPlanosPublicos } = await svc();
      expect((await listarPlanosPublicos()).map((p: any) => p.id)).not.toContain(c);

      await db.plano.update({ where: { codigo: c }, data: { arquivadoEm: null } });
      expect((await listarPlanosPublicos()).map((p: any) => p.id)).toContain(c);
    });
  });

  describe('C5 — GET /api/publico/planos lê a base', () => {
    async function getPlanos(): Promise<{ status: number; corpo: any; texto: string }> {
      const { NextRequest } = await import('next/server');
      const { GET } = await import('@/app/api/publico/planos/route');
      const res = await (GET as any)(
        new NextRequest('http://localhost:3000/api/publico/planos', {
          headers: { origin: 'https://www.gespro.mz' },
        }),
      );
      const texto = await res.text();
      return { status: res.status, corpo: JSON.parse(texto), texto };
    }

    it('serve os planos de origem com os valores de hoje + funcionalidades, e trialDias 14', async () => {
      const { status, corpo } = await getPlanos();
      expect(status).toBe(200);
      expect(corpo.data.trialDias).toBe(14);

      for (const c of ORIGEM) {
        const p = corpo.data.planos.find((x: any) => x.id === c);
        expect(p, `${c} não está no catálogo público`).toBeDefined();
        const v = VALORES_DE_ORIGEM[c];
        expect(p).toMatchObject({
          id: c,
          nome: v.nome,
          descricao: v.descricao,
          limites: {
            utilizadores: v.limiteUtilizadores,
            armazens: v.limiteArmazens,
            suporte: v.suporte,
          },
          precoMensal: { valor: v.precoMensalUsd, moeda: 'USD' },
          precoAnual: { valor: v.precoAnualUsd, moeda: 'USD' },
          destaque: v.destaque,
        });
        expect(Array.isArray(p.funcionalidades)).toBe(true);
        expect(p.funcionalidades.length).toBeGreaterThan(0);
        expect(Object.keys(p.limites).sort()).toEqual(['armazens', 'suporte', 'utilizadores']);
      }
    });

    it('um plano criado na tabela aparece sem deploy; um arquivado não aparece; Price IDs nunca saem', async () => {
      const novo = await novoPlano('ROTA', {
        stripePriceIdMensal: `price_tcb_rota_m_${s6}`,
        funcionalidades: ['Só na base'],
      });
      const arq = await novoPlano('ROTAARQ', { arquivadoEm: new Date() });

      const { corpo, texto } = await getPlanos();
      const ids = corpo.data.planos.map((p: any) => p.id);

      expect(ids).toContain(novo);
      expect(ids).not.toContain(arq);
      expect(corpo.data.planos.find((p: any) => p.id === novo).funcionalidades).toEqual(['Só na base']);
      expect(texto).not.toContain('price_tcb_rota');
      expect(texto).not.toContain('stripePriceId');
      expect(texto).not.toContain('STRIPE_');
    });
  });

  // ─── C6 — limites lidos da tabela ────────────────────────────────────────────

  describe('C6 — os limites vêm da tabela, a cada verificação', () => {
    let users: any;
    let stock: any;

    beforeAll(async () => {
      ({ userAdminService: users } = await import('@/server/services/plataforma/user-admin.service'));
      ({ stockService: stock } = await import('@/server/services/inventario/stock.service'));
    });

    it('subir limiteUtilizadores na base deixa criar o utilizador que antes era recusado', async () => {
      const c = await novoPlano('LIMU', { limiteUtilizadores: 2, nome: `Plano Limite ${s6}` });
      const t = await novoTenant('limu', c);
      await maisUtilizadores(t, 1); // 2 activos = limite

      const e = await erroDe(users.criarUtilizador(convite(t, 'recusado'), t.ctx));
      expect(e, 'o 3.º utilizador passou com limite 2 na tabela').not.toBeNull();
      expect(e.code).toBe('LIMITE_PLANO_UTILIZADORES');
      expect(e.message).toContain(`Plano Limite ${s6}`);
      expect(kc.garantirUtilizador).not.toHaveBeenCalled();

      await db.plano.update({ where: { codigo: c }, data: { limiteUtilizadores: 3 } });

      const r = await users.criarUtilizador(convite(t, 'aceite'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
      expect(await db.user.count({ where: { tenantId: t.tenantId, ativo: true } })).toBe(3);
    });

    it('baixar o limite na base recusa de imediato; -1 volta a ser ilimitado', async () => {
      const c = await novoPlano('LIMB', { limiteUtilizadores: -1, nome: `Plano Baixa ${s6}` });
      const t = await novoTenant('limb', c);
      await maisUtilizadores(t, 3); // 4 activos

      await db.plano.update({ where: { codigo: c }, data: { limiteUtilizadores: 4 } });
      const e = await erroDe(users.criarUtilizador(convite(t, 'baixa'), t.ctx));
      expect(e?.code).toBe('LIMITE_PLANO_UTILIZADORES');

      await db.plano.update({ where: { codigo: c }, data: { limiteUtilizadores: -1 } });
      const r = await users.criarUtilizador(convite(t, 'ilimitado'), t.ctx);
      expect(r.utilizador.ativo).toBe(true);
    });

    it('subir limiteArmazens na base deixa criar o armazém que antes era recusado', async () => {
      const c = await novoPlano('LIMA', { limiteArmazens: 1, nome: `Plano Armazém ${s6}` });
      const t = await novoTenant('lima', c);
      await runCtx(t.ctx, () => stock.criarLocalizacao(novaLoc(), t.ctx));

      const e = await erroDe(runCtx(t.ctx, () => stock.criarLocalizacao(novaLoc(), t.ctx)));
      expect(e, 'o 2.º armazém passou com limite 1 na tabela').not.toBeNull();
      expect(e.code).toBe('LIMITE_PLANO_ARMAZENS');
      expect(e.message).toContain(`Plano Armazém ${s6}`);

      await db.plano.update({ where: { codigo: c }, data: { limiteArmazens: 2 } });
      const l = await runCtx(t.ctx, () => stock.criarLocalizacao(novaLoc(), t.ctx));
      expect(l.tipo).toBe('ARMAZEM');
    });

    it('um plano arquivado continua a valer para quem já o tem (limites aplicados)', async () => {
      const c = await novoPlano('LIMARQ', { limiteUtilizadores: 1, nome: `Plano Antigo ${s6}` });
      const t = await novoTenant('limarq', c);
      await db.plano.update({ where: { codigo: c }, data: { arquivadoEm: new Date() } });

      const e = await erroDe(users.criarUtilizador(convite(t, 'arq'), t.ctx));
      expect(e?.code).toBe('LIMITE_PLANO_UTILIZADORES');
      expect(e.message).toContain(`Plano Antigo ${s6}`);
    });
  });

  // ─── C7 — Price ID ───────────────────────────────────────────────────────────

  describe('C7 — resolverPriceId: tabela ?? env STRIPE_PRICE_<CODIGO>_<CICLO>', () => {
    async function resolver(codigoPlano: string, ciclo: 'MENSAL' | 'ANUAL'): Promise<string> {
      const { resolverPriceId } = await import('@/server/billing/stripe-client');
      return await (resolverPriceId as any)(codigoPlano, ciclo);
    }

    it('coluna preenchida ganha à env; coluna vazia cai na env', async () => {
      const c = await novoPlano('PRICE', { stripePriceIdMensal: `price_tab_m_${s6}` });
      process.env[`STRIPE_PRICE_${c}_MENSAL`] = `price_env_m_${s6}`;
      process.env[`STRIPE_PRICE_${c}_ANUAL`] = `price_env_a_${s6}`;

      expect(await resolver(c, 'MENSAL')).toBe(`price_tab_m_${s6}`);
      expect(await resolver(c, 'ANUAL')).toBe(`price_env_a_${s6}`);
    });

    it('os seis pares dos planos de origem resolvem pela env (coluna vazia), cada um o seu', async () => {
      const vistos = new Set<string>();
      for (const c of ORIGEM) {
        for (const ciclo of ['MENSAL', 'ANUAL'] as const) {
          process.env[`STRIPE_PRICE_${c}_${ciclo}`] = `price_${c.toLowerCase()}_${ciclo.toLowerCase()}_${s6}`;
        }
      }
      for (const c of ORIGEM) {
        for (const ciclo of ['MENSAL', 'ANUAL'] as const) {
          const v = await resolver(c, ciclo);
          expect(v).toBe(`price_${c.toLowerCase()}_${ciclo.toLowerCase()}_${s6}`);
          vistos.add(v);
        }
      }
      expect(vistos.size).toBe(6);
    });

    it('sem coluna nem env: PRICE_NAO_CONFIGURADO (503), nunca inventa', async () => {
      const c = await novoPlano('SEMPRICE');
      delete process.env[`STRIPE_PRICE_${c}_MENSAL`];
      const e = await erroDe(() => resolver(c, 'MENSAL'));
      expect(e).not.toBeNull();
      expect(e.code).toBe('PRICE_NAO_CONFIGURADO');
      expect(e.status).toBe(503);
    });
  });

  // ─── C8 — checkout ───────────────────────────────────────────────────────────

  describe('C8 — iniciarCheckout', () => {
    let iniciarCheckout: (input: any, ctx: any) => Promise<{ url: string }>;

    beforeAll(async () => {
      ({ iniciarCheckout } = (await import('@/server/services/plataforma/assinatura.service')) as any);
    });

    async function tenantComCustomer(rotulo: string): Promise<T> {
      seq += 1;
      return novoTenant(rotulo, 'BASICO', 'TRIAL', { stripeCustomerId: `cus_tcb524_${sufixo}_${seq}` });
    }

    it('plano arquivado → PLANO_INDISPONIVEL, sem tocar no Stripe', async () => {
      const c = await novoPlano('CKARQ', {
        arquivadoEm: new Date(),
        stripePriceIdMensal: `price_ck_arq_${s6}`,
      });
      const t = await tenantComCustomer('ck-arq');

      const e = await erroDe(
        runCtx(t.ctx, () => iniciarCheckout({ planoId: c, ciclo: 'MENSAL' }, t.ctx)),
      );

      expect(e, 'checkout de plano arquivado passou').not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('PLANO_INDISPONIVEL');
      expect(stripe.checkoutCreate).not.toHaveBeenCalled();
      expect(stripe.customersCreate).not.toHaveBeenCalled();
    });

    it('plano inexistente → PLANO_INDISPONIVEL, sem tocar no Stripe', async () => {
      const t = await tenantComCustomer('ck-inex');

      const e = await erroDe(
        runCtx(t.ctx, () => iniciarCheckout({ planoId: `TCB_NADA_${s6}`, ciclo: 'ANUAL' }, t.ctx)),
      );

      expect(e?.code).toBe('PLANO_INDISPONIVEL');
      expect(stripe.checkoutCreate).not.toHaveBeenCalled();
    });

    it('plano activo criado na tabela: o checkout usa o Price ID da tabela (ganha à env)', async () => {
      const c = await novoPlano('CKOK', { stripePriceIdAnual: `price_ck_ok_a_${s6}` });
      process.env[`STRIPE_PRICE_${c}_ANUAL`] = `price_ck_env_a_${s6}`;
      const t = await tenantComCustomer('ck-ok');

      const r = await runCtx(t.ctx, () => iniciarCheckout({ planoId: c, ciclo: 'ANUAL' }, t.ctx));

      expect(r.url).toContain('checkout.stripe.com');
      const args: any = (stripe.checkoutCreate.mock.calls as any[][])[0]?.[0];
      expect(args.line_items[0].price).toBe(`price_ck_ok_a_${s6}`);
      expect(args.metadata.planoId).toBe(c);
    });
  });

  // ─── C9 — webhook mapeia Price → plano ───────────────────────────────────────

  describe('C9 — webhook customer.subscription.updated muda o plano pelo Price', () => {
    let processarEventoWebhook: (e: any) => Promise<any>;

    beforeAll(async () => {
      ({ processarEventoWebhook } = (await import(
        '@/server/services/plataforma/assinatura.service'
      )) as any);
    });

    async function tenantSubscrito(rotulo: string): Promise<{ t: T; sub: string; cus: string }> {
      seq += 1;
      const sub = `sub_tcb524_${sufixo}_${seq}`;
      const cus = `cus_tcb524_wh_${sufixo}_${seq}`;
      const t = await novoTenant(rotulo, 'BASICO', 'ATIVA', {
        stripeSubscriptionId: sub,
        stripeCustomerId: cus,
      });
      return { t, sub, cus };
    }

    function actualizada(sub: string, cus: string, priceId: string) {
      seq += 1;
      return {
        id: `evt_tcb524_${sufixo}_${seq}`,
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: sub,
            customer: cus,
            status: 'active',
            items: { data: [{ price: { id: priceId } }] },
          },
        },
      };
    }

    const planoDe = async (tenantId: string) =>
      (await db.assinatura.findUnique({ where: { tenantId } }))?.planoAssinatura;

    it('Price da tabela (anual) → a Assinatura passa a esse plano', async () => {
      const c = await novoPlano('WHTAB', { stripePriceIdAnual: `price_wh_tab_a_${s6}` });
      const { t, sub, cus } = await tenantSubscrito('wh-tab');

      await processarEventoWebhook(actualizada(sub, cus, `price_wh_tab_a_${s6}`));

      expect(await planoDe(t.tenantId)).toBe(c);
    });

    it('Price só na env (coluna vazia) → mapeia pelo fallback STRIPE_PRICE_<CODIGO>_<CICLO>', async () => {
      process.env.STRIPE_PRICE_EMPRESARIAL_MENSAL = `price_wh_env_emp_m_${s6}`;
      const { t, sub, cus } = await tenantSubscrito('wh-env');

      await processarEventoWebhook(actualizada(sub, cus, `price_wh_env_emp_m_${s6}`));

      expect(await planoDe(t.tenantId)).toBe('EMPRESARIAL');
    });

    it('Price desconhecido não muda o plano (mas o Price fica registado)', async () => {
      const { t, sub, cus } = await tenantSubscrito('wh-desc');

      await processarEventoWebhook(actualizada(sub, cus, `price_wh_desconhecido_${s6}`));

      const a = await db.assinatura.findUnique({ where: { tenantId: t.tenantId } });
      expect(a.planoAssinatura).toBe('BASICO');
      expect(a.stripePriceId).toBe(`price_wh_desconhecido_${s6}`);
    });
  });

  // ─── C10 — administração de tenants filtra pela Assinatura ───────────────────

  describe('C10 — tenantAdminService.listar filtra pelo plano da Assinatura', () => {
    it('planoAssinatura: PROFISSIONAL devolve só o tenant cuja Assinatura é PROFISSIONAL', async () => {
      const { tenantAdminService } = (await import(
        '@/server/services/plataforma/tenant-admin.service'
      )) as any;
      const prof = await novoTenant('adm-prof', 'PROFISSIONAL');
      const bas = await novoTenant('adm-bas', 'BASICO');
      const sem = await novoTenant('adm-sem', null);
      const search = `TCB524 ${s6} adm-`;

      const pProf = await tenantAdminService.listar({ search, planoAssinatura: 'PROFISSIONAL', take: 100 });
      const pBas = await tenantAdminService.listar({ search, planoAssinatura: 'BASICO', take: 100 });
      const todos = await tenantAdminService.listar({ search, take: 100 });

      expect(pProf.items.map((x: any) => x.id)).toEqual([prof.tenantId]);
      expect(pBas.items.map((x: any) => x.id)).toEqual([bas.tenantId]);
      expect(todos.items.map((x: any) => x.id).sort()).toEqual(
        [prof.tenantId, bas.tenantId, sem.tenantId].sort(),
      );
    });

    it('filtra por um plano criado na tabela', async () => {
      const { tenantAdminService } = (await import(
        '@/server/services/plataforma/tenant-admin.service'
      )) as any;
      const c = await novoPlano('ADMNOVO');
      const t = await novoTenant('adm-novo', c);

      const p = await tenantAdminService.listar({
        search: `TCB524 ${s6} adm-novo`,
        planoAssinatura: c,
        take: 100,
      });
      expect(p.items.map((x: any) => x.id)).toEqual([t.tenantId]);
    });
  });

  // ─── C11 — provisionamento ───────────────────────────────────────────────────

  describe('C11 — provisionamento valida o plano contra a tabela', () => {
    let provisionarTenant: (input: any) => Promise<any>;

    beforeAll(async () => {
      ({ provisionarTenant } = (await import(
        '@/server/services/plataforma/tenant-provisioning.service'
      )) as any);
    });

    function entrada(rotulo: string, planoId: string) {
      seq += 1;
      return {
        empresa: { nome: `TCB524 Prov ${rotulo} ${s6} ${seq}`, nuit: `9${`${sufixo + seq}`.slice(-8)}` },
        admin: { nome: 'Ana Prov', email: `prov-${rotulo}-${sufixo}-${seq}@tcb524.mz` },
        keycloakSub: `kc-prov-${rotulo}-${sufixo}-${seq}`,
        planoId,
        provincia: 'Maputo Cidade',
      };
    }

    it.each([
      ['inexistente', () => Promise.resolve(`TCB_NAO_HA_${s6}`)],
      ['arquivado', () => novoPlano('PROVARQ', { arquivadoEm: new Date() })],
    ])('plano %s → PLANO_INDISPONIVEL, sem tenant', async (_r, fazPlano) => {
      const planoId = await fazPlano();
      const input = entrada(`rec-${_r}`, planoId);

      const e = await erroDe(provisionarTenant(input));

      expect(e, `registo num plano ${_r} passou`).not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('PLANO_INDISPONIVEL');
      expect(await db.tenant.count({ where: { nuit: input.empresa.nuit } })).toBe(0);
    });

    it('plano activo criado na tabela → a Assinatura nasce em TRIAL nesse plano', async () => {
      const c = await novoPlano('PROVOK');
      const input = entrada('ok', c);

      const r = await provisionarTenant(input);

      const a = await db.assinatura.findUnique({ where: { tenantId: r.tenantId } });
      expect(a.planoAssinatura).toBe(c);
      expect(a.estado).toBe('TRIAL');
      const cfg = await db.configuracaoFiscal.findUnique({ where: { tenantId: r.tenantId } });
      expect(cfg).not.toBeNull();
      expect(cfg).not.toHaveProperty('planoAssinatura');
    });
  });
});
