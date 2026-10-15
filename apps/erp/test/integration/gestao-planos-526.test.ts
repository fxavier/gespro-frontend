/**
 * ORÁCULO — issue #526 (nó C:gestao-planos, ADR-0049 §1–§5): serviço de ESCRITA do catálogo de
 * planos, usado pelo administrador de plataforma em `/plataforma/planos`.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de implementação
 * que altere este ficheiro é BLOCKER.
 *
 * Contrato (decisão do orquestrador; onde o ADR e o código divergem vale o código já fundido —
 * o arquivo é `arquivadoEm DateTime?`):
 *
 *   S0 Módulo `@/server/services/plataforma/plano-admin.service` (server-only), com as funções
 *      soltas ou num objecto `planoAdminService`:
 *        criarPlano(input, ctx)          → Plano
 *        actualizarPlano(id, input, ctx) → Plano
 *        arquivarPlano(id, ctx)          → Plano
 *        desarquivarPlano(id, ctx)       → Plano
 *        apagarPlano(id, ctx)            → void
 *        listarPlanosAdmin()             → (Plano & { assinaturas: number })[]
 *      `id` é o `Plano.id`. `ctx` traz `keycloakSub` (o autor; o pipeline de plataforma passa-o) e
 *      pode trazer `requestId`; o serviço também pode ler o `requestId` do contexto de pedido
 *      (`runWithRequestContext`) — este teste dá os dois iguais. Corre em `prismaBase`, SEM contexto
 *      de tenant (o Plano é global).
 *      input = { codigo, nome, descricao, precoMensalUsd, precoAnualUsd, stripePriceIdMensal,
 *                stripePriceIdAnual, limiteUtilizadores, limiteArmazens, suporte, funcionalidades,
 *                ordem, destaque } (preços como string decimal).
 *   S1 `codigo` ^[A-Z][A-Z0-9_]{1,30}$ — fora disso BusinessRuleError('PLANO_CODIGO_INVALIDO');
 *      repetido → BusinessRuleError('PLANO_CODIGO_DUPLICADO').
 *   S2 `codigo` imutável: actualizar com outro código → BusinessRuleError('PLANO_CODIGO_IMUTAVEL'),
 *      nada muda; com o mesmo código (ou sem ele) passa.
 *   S3 Preços Decimal >= 0 (mensal e anual); limites inteiros >= -1 (-1 = ilimitado);
 *      funcionalidades: trim, nenhuma vazia, sem duplicados (após trim), máx. 30, cada <= 120
 *      caracteres, ordem preservada. Recusa = BusinessRuleError ou ValidationError (4xx), nada
 *      gravado.
 *   S4 Price IDs: @unique por coluna na base (migração nova; nulos não colidem); duplicado →
 *      BusinessRuleError('PRICE_ID_DUPLICADO'). Decisões conservadoras do VERIFICADOR (recusar >
 *      número errado — «um Price pertence a um plano e a um ciclo», ADR-0049 §4): também se recusa
 *      o mesmo Price nas duas colunas (do mesmo plano ou entre planos), e '' / só espaços grava-se
 *      como null.
 *   S5 Arquivar tira o plano de `listarPlanosPublicos`, de `exigirPlanoDisponivel` e do
 *      `iniciarCheckout` (PLANO_INDISPONIVEL); a Assinatura existente fica intacta e os limites
 *      continuam a valer. Desarquivar repõe tudo.
 *   S6 Não se arquiva nem apaga o último plano não arquivado → BusinessRuleError(
 *      'PLANO_ULTIMO_ACTIVO'); apagar um ARQUIVADO com um só activo passa.
 *   S7 Apagar sem assinaturas passa; com assinaturas → BusinessRuleError('PLANO_EM_USO'), mensagem
 *      com o número de assinaturas e a sugestão de arquivar, e nada apagado (a FK Restrict decide —
 *      P2003 traduzido).
 *   S8 Trilho global `AuditoriaPlataforma` (delegate `auditoriaPlataforma`, sem `tenantId`): cada
 *      criar/actualizar/arquivar/desarquivar/apagar grava UMA linha com keycloakSub, acao
 *      (CRIAR | ACTUALIZAR | ARQUIVAR | DESARQUIVAR | APAGAR — valores fixados pelo verificador),
 *      entidade 'Plano', codigo, antes/depois (Json, null quando não há), requestId, createdAt —
 *      na MESMA transacção: uma escrita recusada (inclusive pela base: FK, unique) não deixa linha.
 *      Não entra no AUDIT_MODELS.
 *   S9 listarPlanosAdmin devolve todos (arquivados incluídos) com o n.º de assinaturas (COUNT).
 *
 * Os planos de teste usam códigos `TGP_*` próprios — os três de origem nunca são alterados de
 * forma persistente (o S6 arquiva-os e repõe-nos num `finally`; a suite corre ficheiro a ficheiro).
 *
 * Requer: Docker em execução + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * ESTADO ESPERADO antes da implementação: RED.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({
    user: { id: 'caller', tenantId: 'x', permissions: [], emailVerificado: true },
  })),
}));

/** Stripe dublado — só para provar que o checkout de um plano arquivado nem lhe toca. */
const stripe = vi.hoisted(() => ({
  customersCreate: vi.fn(async () => ({ id: 'cus_dublado' })),
  checkoutCreate: vi.fn(async (_args: unknown) => ({ url: 'https://checkout.stripe.com/c/pay/tgp526' })),
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

const SUB = 'kc-sub-plataforma-526';

describe.skipIf(skip)('#526 — gestão de planos pelo administrador de plataforma — DB efémera', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let runReq: (ctx: { requestId: string; userId?: string }, fn: () => unknown) => Promise<any>;

  const sufixo = Date.now();
  const s6 = `${sufixo}`.slice(-6);
  let seq = 0;
  const tenantsFalsos: string[] = [];

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ runWithRequestContext: runReq } = (await import('@/server/observability/context')) as any);
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.assinatura.updateMany({
        where: { planoAssinatura: { startsWith: 'TGP_' } },
        data: { planoAssinatura: 'EMPRESARIAL' },
      });
      await db.assinatura.deleteMany({ where: { tenantId: { in: tenantsFalsos } } });
      await db.plano.deleteMany({ where: { codigo: { startsWith: 'TGP_' } } });
    } catch {
      // limpeza de melhor esforço
    }
    await db.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── utilitários ────────────────────────────────────────────────────────────

  type Svc = {
    criar: (input: any, ctx: any) => Promise<any>;
    actualizar: (id: string, input: any, ctx: any) => Promise<any>;
    arquivar: (id: string, ctx: any) => Promise<any>;
    desarquivar: (id: string, ctx: any) => Promise<any>;
    apagar: (id: string, ctx: any) => Promise<any>;
    listarAdmin: () => Promise<any[]>;
  };

  /** Import dinâmico com caminho em variável: na fase vermelha falha o caso, não o ficheiro. */
  async function svc(): Promise<Svc> {
    const caminho: string = '@/server/services/plataforma/plano-admin.service';
    const mod: any = await import(/* @vite-ignore */ caminho);
    const f = mod.planoAdminService ?? mod;
    const req = (nome: string) => {
      expect(typeof f[nome], `plano-admin.service tem de exportar ${nome}`).toBe('function');
      return f[nome];
    };
    return {
      criar: (i, c) => req('criarPlano')(i, c),
      actualizar: (id, i, c) => req('actualizarPlano')(id, i, c),
      arquivar: (id, c) => req('arquivarPlano')(id, c),
      desarquivar: (id, c) => req('desarquivarPlano')(id, c),
      apagar: (id, c) => req('apagarPlano')(id, c),
      listarAdmin: () => req('listarPlanosAdmin')(),
    };
  }

  async function leitura(): Promise<any> {
    const mod: any = await import('@/server/services/plataforma/plano.service');
    return mod.planoService ?? mod;
  }

  function codigo(rotulo: string): string {
    seq += 1;
    return `TGP_${rotulo}_${s6}${seq}`;
  }

  function novoCtx() {
    seq += 1;
    return { userId: SUB, keycloakSub: SUB, requestId: `req-526-${sufixo}-${seq}` };
  }

  /** Corre como o pipeline de plataforma: com contexto de pedido, SEM contexto de tenant. */
  async function comoPlataforma<R>(ctx: { requestId: string }, fn: () => Promise<R>): Promise<R> {
    return runReq({ requestId: ctx.requestId, userId: SUB }, fn);
  }

  function entrada(rotulo: string, over: Record<string, unknown> = {}) {
    return {
      codigo: codigo(rotulo),
      nome: `Plano ${rotulo} ${s6}`,
      descricao: `Plano de teste ${rotulo}`,
      precoMensalUsd: '12.50',
      precoAnualUsd: '125.00',
      stripePriceIdMensal: null,
      stripePriceIdAnual: null,
      limiteUtilizadores: 5,
      limiteArmazens: -1,
      suporte: 'Email (48h)',
      funcionalidades: ['Facturação', 'Stock'],
      ordem: 60,
      destaque: false,
      ...over,
    };
  }

  async function criarOk(rotulo: string, over: Record<string, unknown> = {}): Promise<any> {
    const s = await svc();
    const ctx = novoCtx();
    const input = entrada(rotulo, over);
    await comoPlataforma(ctx, () => s.criar(input, ctx));
    const p = await db.plano.findUnique({ where: { codigo: input.codigo } });
    expect(p, `o plano ${input.codigo} não foi criado`).not.toBeNull();
    return p;
  }

  async function erroDe(p: Promise<unknown> | (() => unknown)): Promise<any> {
    try {
      await (typeof p === 'function' ? p() : p);
    } catch (e) {
      return e;
    }
    return null;
  }

  async function trilho(c: string): Promise<any[]> {
    expect(db.auditoriaPlataforma, 'modelo AuditoriaPlataforma em falta no schema').toBeDefined();
    return db.auditoriaPlataforma.findMany({ where: { codigo: c }, orderBy: { createdAt: 'asc' } });
  }

  async function assinaturaFalsa(plano: string): Promise<string> {
    seq += 1;
    const tenantId = `tenant-tgp526-${sufixo}-${seq}`;
    tenantsFalsos.push(tenantId);
    await db.assinatura.create({
      data: {
        tenantId,
        planoAssinatura: plano,
        estado: 'ATIVA',
        trialFim: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    return tenantId;
  }

  /** Recusa de validação: 4xx estável, nunca erro interno. */
  function esperarRecusaValidacao(e: any, rotulo: string) {
    expect(e, `${rotulo}: passou e devia ter sido recusado`).not.toBeNull();
    expect(['BusinessRuleError', 'ValidationError'], `${rotulo}: ${e?.name} ${e?.message}`).toContain(e.name);
    expect(e.status).toBeGreaterThanOrEqual(400);
    expect(e.status).toBeLessThan(500);
  }

  // ─── S1 — criar ─────────────────────────────────────────────────────────────

  describe('S1 — criar', () => {
    it('cria um plano válido, global, com os valores pedidos e funcionalidades aparadas por ordem', async () => {
      const s = await svc();
      const ctx = novoCtx();
      const input = entrada('CRIA', {
        funcionalidades: ['  Facturação ', 'Stock', ' Contabilidade'],
        limiteUtilizadores: 7,
        destaque: true,
        ordem: 77,
      });

      await comoPlataforma(ctx, () => s.criar(input, ctx));

      const p = await db.plano.findUnique({ where: { codigo: input.codigo } });
      expect(p).not.toBeNull();
      expect(p.nome).toBe(input.nome);
      expect(p.descricao).toBe(input.descricao);
      expect(p.precoMensalUsd.toString()).toBe('12.5');
      expect(p.precoAnualUsd.toString()).toBe('125');
      expect(p.limiteUtilizadores).toBe(7);
      expect(p.limiteArmazens).toBe(-1);
      expect(p.suporte).toBe('Email (48h)');
      expect(p.funcionalidades).toEqual(['Facturação', 'Stock', 'Contabilidade']);
      expect(p.ordem).toBe(77);
      expect(p.destaque).toBe(true);
      expect(p.arquivadoEm).toBeNull();
      expect(p.stripePriceIdMensal).toBeNull();
      expect(p.stripePriceIdAnual).toBeNull();
    });

    it('um plano criado aparece no catálogo público com as funcionalidades', async () => {
      const p = await criarOk('PUB', { funcionalidades: ['Só deste plano'] });
      const publicos = await (await leitura()).listarPlanosPublicos();
      const visto = publicos.find((x: any) => x.id === p.codigo);
      expect(visto, 'o plano criado não aparece no catálogo público').toBeDefined();
      expect(visto.funcionalidades).toEqual(['Só deste plano']);
      expect(visto.limites.utilizadores).toBe(5);
    });

    it('limites -1 e 0, preços 0, 30 funcionalidades e 120 caracteres são aceites (fronteiras)', async () => {
      const trinta = Array.from({ length: 30 }, (_, i) => `Item ${i + 1}`);
      const p = await criarOk('FRONT', {
        precoMensalUsd: '0',
        precoAnualUsd: '0.00',
        limiteUtilizadores: 0,
        limiteArmazens: -1,
        funcionalidades: [...trinta.slice(0, 29), 'x'.repeat(120)],
      });
      expect(Number(p.precoMensalUsd)).toBe(0);
      expect(Number(p.precoAnualUsd)).toBe(0);
      expect(p.limiteUtilizadores).toBe(0);
      expect(p.funcionalidades).toHaveLength(30);
      expect(p.funcionalidades[29]).toHaveLength(120);
    });

    it('um código com 31 caracteres (o máximo) é aceite', async () => {
      seq += 1;
      const base = `TGP_MAX_${s6}${seq}_`;
      const c = base.padEnd(31, 'X');
      expect(c).toHaveLength(31);
      const p = await criarOk('MAX', { codigo: c });
      expect(p.codigo).toBe(c);
    });

    it.each([
      ['minúsculas', 'basico_tgp'],
      ['um só carácter', 'B'],
      ['começa por algarismo', '1TGP'],
      ['começa por _', '_TGP'],
      ['hífen', 'TGP-X'],
      ['espaço', 'TGP X'],
      ['acento', 'TGPÇ'],
      ['32 caracteres', 'T'.repeat(32)],
      ['vazio', ''],
    ])('código inválido (%s) → PLANO_CODIGO_INVALIDO, nada gravado', async (_r, c) => {
      const s = await svc();
      const ctx = novoCtx();
      const antes = await db.plano.count();

      const e = await erroDe(comoPlataforma(ctx, () => s.criar(entrada('INV', { codigo: c }), ctx)));

      expect(e, `aceitou o código «${c}»`).not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('PLANO_CODIGO_INVALIDO');
      expect(await db.plano.count()).toBe(antes);
      expect(await db.auditoriaPlataforma.count({ where: { codigo: c } })).toBe(0);
    });

    it('código repetido → PLANO_CODIGO_DUPLICADO; o existente fica intacto e sem linha de trilho', async () => {
      const s = await svc();
      const original = await db.plano.findUnique({ where: { codigo: 'BASICO' } });
      expect(original).not.toBeNull();
      const linhasAntes = await db.auditoriaPlataforma.count({ where: { codigo: 'BASICO' } });
      const ctx = novoCtx();

      const e = await erroDe(
        comoPlataforma(ctx, () => s.criar(entrada('DUP', { codigo: 'BASICO', nome: 'Intruso' }), ctx)),
      );

      expect(e, 'criou um segundo BASICO').not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('PLANO_CODIGO_DUPLICADO');
      const depois = await db.plano.findUnique({ where: { codigo: 'BASICO' } });
      expect(depois.nome).toBe(original.nome);
      expect(depois.updatedAt.getTime()).toBe(original.updatedAt.getTime());
      expect(await db.auditoriaPlataforma.count({ where: { codigo: 'BASICO' } })).toBe(linhasAntes);
    });
  });

  // ─── S3 — preços, limites, funcionalidades ──────────────────────────────────

  describe('S3 — valores inválidos são recusados e nada é gravado', () => {
    it.each([
      ['preço mensal negativo', { precoMensalUsd: '-1' }],
      ['preço anual negativo', { precoAnualUsd: '-0.01' }],
      ['preço mensal não numérico', { precoMensalUsd: 'abc' }],
      ['preço anual vazio', { precoAnualUsd: '' }],
      ['limite de utilizadores -2', { limiteUtilizadores: -2 }],
      ['limite de armazéns -5', { limiteArmazens: -5 }],
      ['limite de utilizadores fraccionário', { limiteUtilizadores: 1.5 }],
      ['limite de armazéns fraccionário', { limiteArmazens: 2.25 }],
      ['funcionalidade vazia', { funcionalidades: ['Facturação', '   '] }],
      ['funcionalidade duplicada', { funcionalidades: ['Stock', 'Stock'] }],
      ['funcionalidade duplicada após aparar', { funcionalidades: [' Stock', 'Stock '] }],
      ['31 funcionalidades', { funcionalidades: Array.from({ length: 31 }, (_, i) => `F${i}`) }],
      ['funcionalidade com 121 caracteres', { funcionalidades: ['y'.repeat(121)] }],
    ])('%s', async (rotulo, over) => {
      const s = await svc();
      const ctx = novoCtx();
      const input = entrada('VAL', over);

      const e = await erroDe(comoPlataforma(ctx, () => s.criar(input, ctx)));

      esperarRecusaValidacao(e, rotulo);
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
      expect(await db.auditoriaPlataforma.count({ where: { codigo: input.codigo } })).toBe(0);
    });

    it('a edição aplica as mesmas regras: limite -2 recusado e o plano fica como estava', async () => {
      const s = await svc();
      const p = await criarOk('EDVAL');
      const ctx = novoCtx();

      const e = await erroDe(
        comoPlataforma(ctx, () =>
          s.actualizar(p.id, entrada('EDVAL', { codigo: p.codigo, limiteUtilizadores: -2 }), ctx),
        ),
      );

      esperarRecusaValidacao(e, 'edição com limite -2');
      const depois = await db.plano.findUnique({ where: { id: p.id } });
      expect(depois.limiteUtilizadores).toBe(5);
      expect(await db.auditoriaPlataforma.count({ where: { codigo: p.codigo, acao: 'ACTUALIZAR' } })).toBe(0);
    });
  });

  // ─── S2 — editar ────────────────────────────────────────────────────────────

  describe('S2 — editar', () => {
    it('actualiza nome, preços, limite e funcionalidades (ordem preservada)', async () => {
      const s = await svc();
      const p = await criarOk('EDIT');
      const ctx = novoCtx();

      await comoPlataforma(ctx, () =>
        s.actualizar(
          p.id,
          entrada('EDIT', {
            codigo: p.codigo,
            nome: `Plano Editado ${s6}`,
            precoMensalUsd: '15.00',
            precoAnualUsd: '150.00',
            limiteUtilizadores: 9,
            funcionalidades: ['Stock', 'Facturação', 'Nova linha'],
          }),
          ctx,
        ),
      );

      const d = await db.plano.findUnique({ where: { id: p.id } });
      expect(d.codigo).toBe(p.codigo);
      expect(d.nome).toBe(`Plano Editado ${s6}`);
      expect(Number(d.precoMensalUsd)).toBe(15);
      expect(Number(d.precoAnualUsd)).toBe(150);
      expect(d.limiteUtilizadores).toBe(9);
      expect(d.funcionalidades).toEqual(['Stock', 'Facturação', 'Nova linha']);
    });

    it('editar sem mandar o código também passa e não o muda', async () => {
      const s = await svc();
      const p = await criarOk('EDSEM');
      const ctx = novoCtx();
      const { codigo: _c, ...semCodigo } = entrada('EDSEM', { nome: `Sem código ${s6}` });

      await comoPlataforma(ctx, () => s.actualizar(p.id, semCodigo, ctx));

      const d = await db.plano.findUnique({ where: { id: p.id } });
      expect(d.codigo).toBe(p.codigo);
      expect(d.nome).toBe(`Sem código ${s6}`);
    });

    it('mudar o código → PLANO_CODIGO_IMUTAVEL; nada muda e não há linha de ACTUALIZAR', async () => {
      const s = await svc();
      const p = await criarOk('IMUT');
      const outro = codigo('OUTRO');
      const ctx = novoCtx();

      const e = await erroDe(
        comoPlataforma(ctx, () =>
          s.actualizar(p.id, entrada('IMUT', { codigo: outro, nome: 'Mudado' }), ctx),
        ),
      );

      expect(e, 'mudou o código de um plano').not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('PLANO_CODIGO_IMUTAVEL');
      const d = await db.plano.findUnique({ where: { id: p.id } });
      expect(d.codigo).toBe(p.codigo);
      expect(d.nome).toBe(p.nome);
      expect(await db.plano.findUnique({ where: { codigo: outro } })).toBeNull();
      expect(await db.auditoriaPlataforma.count({ where: { codigo: p.codigo, acao: 'ACTUALIZAR' } })).toBe(0);
    });

    it('plano inexistente → NAO_ENCONTRADO (404)', async () => {
      const s = await svc();
      const ctx = novoCtx();
      const e = await erroDe(
        comoPlataforma(ctx, () => s.actualizar(`nao-existe-${sufixo}`, entrada('NX'), ctx)),
      );
      expect(e).not.toBeNull();
      expect(e.status).toBe(404);
    });
  });

  // ─── S4 — Price IDs ─────────────────────────────────────────────────────────

  describe('S4 — Price IDs únicos', () => {
    it('a base tem índice único em stripePriceIdMensal e em stripePriceIdAnual (migração)', async () => {
      const idx: Array<{ indexdef: string }> = await db.$queryRaw`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'Plano'`;
      const defs = idx.map((i) => i.indexdef);
      expect(defs.some((d) => /UNIQUE/i.test(d) && d.includes('"stripePriceIdMensal"'))).toBe(true);
      expect(defs.some((d) => /UNIQUE/i.test(d) && d.includes('"stripePriceIdAnual"'))).toBe(true);
    });

    it('vários planos sem Price ID (null) não colidem; "" e espaços gravam-se como null', async () => {
      const a = await criarOk('NULA', { stripePriceIdMensal: null, stripePriceIdAnual: null });
      const b = await criarOk('NULB', { stripePriceIdMensal: '', stripePriceIdAnual: '   ' });
      const c = await criarOk('NULC', { stripePriceIdMensal: '', stripePriceIdAnual: '' });
      for (const p of [a, b, c]) {
        const d = await db.plano.findUnique({ where: { id: p.id } });
        expect(d.stripePriceIdMensal).toBeNull();
        expect(d.stripePriceIdAnual).toBeNull();
      }
    });

    it('o mesmo Price mensal em dois planos → PRICE_ID_DUPLICADO; o segundo não é criado', async () => {
      const s = await svc();
      const price = `price_tgp_m_${s6}_${++seq}`;
      await criarOk('PRA', { stripePriceIdMensal: price });
      const ctx = novoCtx();
      const input = entrada('PRB', { stripePriceIdMensal: price });

      const e = await erroDe(comoPlataforma(ctx, () => s.criar(input, ctx)));

      expect(e, 'dois planos com o mesmo Price').not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('PRICE_ID_DUPLICADO');
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
      expect(await db.auditoriaPlataforma.count({ where: { codigo: input.codigo } })).toBe(0);
    });

    it('o Price anual de um plano não pode ser o mensal de outro → PRICE_ID_DUPLICADO', async () => {
      const s = await svc();
      const price = `price_tgp_x_${s6}_${++seq}`;
      await criarOk('PRX', { stripePriceIdAnual: price });
      const ctx = novoCtx();
      const input = entrada('PRY', { stripePriceIdMensal: price });

      const e = await erroDe(comoPlataforma(ctx, () => s.criar(input, ctx)));

      expect(e?.code).toBe('PRICE_ID_DUPLICADO');
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
    });

    it('o mesmo Price nos dois ciclos do mesmo plano → PRICE_ID_DUPLICADO', async () => {
      const s = await svc();
      const price = `price_tgp_mm_${s6}_${++seq}`;
      const ctx = novoCtx();
      const input = entrada('PRMM', { stripePriceIdMensal: price, stripePriceIdAnual: price });

      const e = await erroDe(comoPlataforma(ctx, () => s.criar(input, ctx)));

      expect(e?.code).toBe('PRICE_ID_DUPLICADO');
      expect(await db.plano.findUnique({ where: { codigo: input.codigo } })).toBeNull();
    });

    it('editar para um Price de outro plano → PRICE_ID_DUPLICADO; nada muda e sem linha de trilho', async () => {
      const s = await svc();
      const price = `price_tgp_ed_${s6}_${++seq}`;
      await criarOk('PRED1', { stripePriceIdAnual: price });
      const p = await criarOk('PRED2');
      const ctx = novoCtx();

      const e = await erroDe(
        comoPlataforma(ctx, () =>
          s.actualizar(p.id, entrada('PRED2', { codigo: p.codigo, stripePriceIdAnual: price }), ctx),
        ),
      );

      expect(e?.code).toBe('PRICE_ID_DUPLICADO');
      expect(e.name).toBe('BusinessRuleError');
      const d = await db.plano.findUnique({ where: { id: p.id } });
      expect(d.stripePriceIdAnual).toBeNull();
      expect(await db.auditoriaPlataforma.count({ where: { codigo: p.codigo, acao: 'ACTUALIZAR' } })).toBe(0);
    });
  });

  // ─── S5 — arquivar / desarquivar ────────────────────────────────────────────

  describe('S5 — arquivar e desarquivar', () => {
    it('arquivar tira do catálogo público, do exigirPlanoDisponivel e do checkout; a Assinatura existente fica', async () => {
      const s = await svc();
      const leit = await leitura();
      const p = await criarOk('ARQ', { limiteUtilizadores: 4, stripePriceIdMensal: `price_tgp_arq_${s6}` });

      // Tenant real já neste plano, com customer no Stripe (para o checkout).
      seq += 1;
      const tenantId = `tenant-tgp526-arq-${sufixo}-${seq}`;
      const userId = `user-tgp526-arq-${sufixo}-${seq}`;
      await db.tenant.create({
        data: { id: tenantId, nome: `TGP526 ${s6} ${seq}`, slug: `tgp526-${sufixo}-${seq}`, nuit: `${sufixo + seq * 17}`.slice(-9) },
      });
      await db.configuracaoFiscal.create({ data: { tenantId } });
      await db.assinatura.create({
        data: {
          tenantId,
          planoAssinatura: p.codigo,
          estado: 'ATIVA',
          trialFim: new Date(Date.now() + 14 * 86_400_000),
          stripeCustomerId: `cus_tgp526_${sufixo}_${seq}`,
          stripeSubscriptionId: `sub_tgp526_${sufixo}_${seq}`,
        },
      });
      const assinaturaAntes = await db.assinatura.findUnique({ where: { tenantId } });

      const ctx = novoCtx();
      await comoPlataforma(ctx, () => s.arquivar(p.id, ctx));

      const d = await db.plano.findUnique({ where: { id: p.id } });
      expect(d.arquivadoEm, 'arquivar não escreveu arquivadoEm').toBeInstanceOf(Date);

      const publicos = await leit.listarPlanosPublicos();
      expect(publicos.map((x: any) => x.id)).not.toContain(p.codigo);

      const e1 = await erroDe(leit.exigirPlanoDisponivel(p.codigo));
      expect(e1?.code).toBe('PLANO_INDISPONIVEL');

      const { iniciarCheckout } = (await import('@/server/services/plataforma/assinatura.service')) as any;
      const tctx = { tenantId, userId };
      const e2 = await erroDe(
        runCtx(tctx, () => iniciarCheckout({ planoId: p.codigo, ciclo: 'MENSAL' }, tctx)),
      );
      expect(e2?.code, 'checkout de plano arquivado passou').toBe('PLANO_INDISPONIVEL');
      expect(stripe.checkoutCreate).not.toHaveBeenCalled();

      // Quem já o tem mantém-no: a Assinatura não muda e os limites continuam a valer.
      const assinaturaDepois = await db.assinatura.findUnique({ where: { tenantId } });
      expect(assinaturaDepois.planoAssinatura).toBe(p.codigo);
      expect(assinaturaDepois.estado).toBe(assinaturaAntes.estado);
      expect(assinaturaDepois.stripeSubscriptionId).toBe(assinaturaAntes.stripeSubscriptionId);
      expect(assinaturaDepois.updatedAt.getTime()).toBe(assinaturaAntes.updatedAt.getTime());
      const { limiteDoPlano } = await import('@/server/billing/limites-plano');
      expect(await limiteDoPlano(db, tenantId, 'utilizadores')).toEqual({ limite: 4, planoNome: p.nome });
    });

    it('desarquivar repõe o plano no catálogo público e no exigirPlanoDisponivel', async () => {
      const s = await svc();
      const leit = await leitura();
      const p = await criarOk('DESARQ');
      const c1 = novoCtx();
      await comoPlataforma(c1, () => s.arquivar(p.id, c1));
      expect((await leit.listarPlanosPublicos()).map((x: any) => x.id)).not.toContain(p.codigo);

      const c2 = novoCtx();
      await comoPlataforma(c2, () => s.desarquivar(p.id, c2));

      const d = await db.plano.findUnique({ where: { id: p.id } });
      expect(d.arquivadoEm).toBeNull();
      expect((await leit.listarPlanosPublicos()).map((x: any) => x.id)).toContain(p.codigo);
      const disp = await leit.exigirPlanoDisponivel(p.codigo);
      expect(disp.codigo).toBe(p.codigo);
    });
  });

  // ─── S6 — o último activo ───────────────────────────────────────────────────

  describe('S6 — PLANO_ULTIMO_ACTIVO', () => {
    it('com um só plano não arquivado: arquivar e apagar esse recusam; apagar um arquivado passa', async () => {
      const s = await svc();
      const unico = await criarOk('ULT');
      const arquivado = await criarOk('ULTARQ');
      await db.plano.update({ where: { id: arquivado.id }, data: { arquivadoEm: new Date() } });

      const outros = await db.plano.findMany({
        where: { arquivadoEm: null, id: { not: unico.id } },
        select: { id: true },
      });
      const idsOutros = outros.map((o: any) => o.id);
      try {
        await db.plano.updateMany({ where: { id: { in: idsOutros } }, data: { arquivadoEm: new Date() } });
        expect(await db.plano.count({ where: { arquivadoEm: null } })).toBe(1);

        const c1 = novoCtx();
        const e1 = await erroDe(comoPlataforma(c1, () => s.arquivar(unico.id, c1)));
        expect(e1, 'arquivou o último plano activo').not.toBeNull();
        expect(e1.name).toBe('BusinessRuleError');
        expect(e1.code).toBe('PLANO_ULTIMO_ACTIVO');
        expect((await db.plano.findUnique({ where: { id: unico.id } })).arquivadoEm).toBeNull();

        const c2 = novoCtx();
        const e2 = await erroDe(comoPlataforma(c2, () => s.apagar(unico.id, c2)));
        expect(e2, 'apagou o último plano activo').not.toBeNull();
        expect(e2.code).toBe('PLANO_ULTIMO_ACTIVO');
        expect(await db.plano.findUnique({ where: { id: unico.id } })).not.toBeNull();

        expect(
          await db.auditoriaPlataforma.count({
            where: { codigo: unico.codigo, acao: { in: ['ARQUIVAR', 'APAGAR'] } },
          }),
        ).toBe(0);

        // Um plano já arquivado não é «o último activo»: apaga-se.
        const c3 = novoCtx();
        await comoPlataforma(c3, () => s.apagar(arquivado.id, c3));
        expect(await db.plano.findUnique({ where: { id: arquivado.id } })).toBeNull();
      } finally {
        await db.plano.updateMany({ where: { id: { in: idsOutros } }, data: { arquivadoEm: null } });
      }
      expect(await db.plano.count({ where: { codigo: { in: ['BASICO', 'PROFISSIONAL', 'EMPRESARIAL'] }, arquivadoEm: null } })).toBe(3);
    });
  });

  // ─── S7 — apagar ────────────────────────────────────────────────────────────

  describe('S7 — apagar', () => {
    it('plano sem assinaturas apaga-se', async () => {
      const s = await svc();
      const p = await criarOk('APG');
      const ctx = novoCtx();
      await comoPlataforma(ctx, () => s.apagar(p.id, ctx));
      expect(await db.plano.findUnique({ where: { id: p.id } })).toBeNull();
    });

    it('plano com 2 assinaturas → PLANO_EM_USO com a contagem e a sugestão de arquivar; nada apagado', async () => {
      const s = await svc();
      const p = await criarOk('USO');
      await assinaturaFalsa(p.codigo);
      await assinaturaFalsa(p.codigo);
      const ctx = novoCtx();

      const e = await erroDe(comoPlataforma(ctx, () => s.apagar(p.id, ctx)));

      expect(e, 'apagou um plano em uso').not.toBeNull();
      expect(e.name).toBe('BusinessRuleError');
      expect(e.code).toBe('PLANO_EM_USO');
      expect(e.message).toMatch(/\b2\b/);
      expect(e.message).toMatch(/arquiv/i);
      expect(await db.plano.findUnique({ where: { id: p.id } })).not.toBeNull();
      expect(await db.assinatura.count({ where: { planoAssinatura: p.codigo } })).toBe(2);
      expect(await db.auditoriaPlataforma.count({ where: { codigo: p.codigo, acao: 'APAGAR' } })).toBe(0);
    });

    it('plano ARQUIVADO com assinatura também não se apaga (PLANO_EM_USO)', async () => {
      const s = await svc();
      const p = await criarOk('USOARQ');
      await assinaturaFalsa(p.codigo);
      const c1 = novoCtx();
      await comoPlataforma(c1, () => s.arquivar(p.id, c1));
      const c2 = novoCtx();

      const e = await erroDe(comoPlataforma(c2, () => s.apagar(p.id, c2)));

      expect(e?.code).toBe('PLANO_EM_USO');
      expect(e.message).toMatch(/\b1\b/);
      expect(await db.plano.findUnique({ where: { id: p.id } })).not.toBeNull();
    });
  });

  // ─── S8 — trilho de auditoria global ────────────────────────────────────────

  describe('S8 — AuditoriaPlataforma', () => {
    it('a tabela é global (sem tenantId) e tem as colunas do trilho', async () => {
      const cols: Array<{ column_name: string }> = await db.$queryRaw`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'AuditoriaPlataforma'`;
      const nomes = cols.map((c) => c.column_name);
      for (const c of ['id', 'keycloakSub', 'acao', 'entidade', 'codigo', 'antes', 'depois', 'requestId', 'createdAt']) {
        expect(nomes, `coluna ${c} em falta em AuditoriaPlataforma`).toContain(c);
      }
      expect(nomes).not.toContain('tenantId');
    });

    it('não entra no AUDIT_MODELS (o trilho do tenant)', async () => {
      const { AUDIT_MODELS } = await import('@/server/db/audit-extension');
      expect(AUDIT_MODELS.has('AuditoriaPlataforma')).toBe(false);
      expect(AUDIT_MODELS.has('Plano')).toBe(false);
    });

    it('ciclo completo: uma linha por escrita, com autor, acção, código, antes/depois e requestId', async () => {
      const s = await svc();
      const ctxs = [novoCtx(), novoCtx(), novoCtx(), novoCtx(), novoCtx()];
      const input = entrada('TRILHO', { limiteUtilizadores: 3 });

      await comoPlataforma(ctxs[0], () => s.criar(input, ctxs[0]));
      const p = await db.plano.findUnique({ where: { codigo: input.codigo } });
      expect(p).not.toBeNull();
      let linhas = await trilho(p.codigo);
      expect(linhas).toHaveLength(1);

      await comoPlataforma(ctxs[1], () =>
        s.actualizar(p.id, entrada('TRILHO', { codigo: p.codigo, limiteUtilizadores: 8 }), ctxs[1]),
      );
      expect(await trilho(p.codigo)).toHaveLength(2);

      await comoPlataforma(ctxs[2], () => s.arquivar(p.id, ctxs[2]));
      expect(await trilho(p.codigo)).toHaveLength(3);

      await comoPlataforma(ctxs[3], () => s.desarquivar(p.id, ctxs[3]));
      expect(await trilho(p.codigo)).toHaveLength(4);

      await comoPlataforma(ctxs[4], () => s.apagar(p.id, ctxs[4]));
      linhas = await trilho(p.codigo);
      expect(linhas).toHaveLength(5);

      expect(linhas.map((l) => l.acao)).toEqual(['CRIAR', 'ACTUALIZAR', 'ARQUIVAR', 'DESARQUIVAR', 'APAGAR']);
      linhas.forEach((l, i) => {
        expect(l.keycloakSub).toBe(SUB);
        expect(l.entidade).toBe('Plano');
        expect(l.codigo).toBe(p.codigo);
        expect(l.requestId).toBe(ctxs[i].requestId);
        expect(l.createdAt).toBeInstanceOf(Date);
      });

      const [criar, actualizar, arquivar, desarquivar, apagar] = linhas;
      expect(criar.antes).toBeNull();
      expect(criar.depois).toMatchObject({ codigo: p.codigo, nome: input.nome, limiteUtilizadores: 3 });

      expect(actualizar.antes).toMatchObject({ limiteUtilizadores: 3 });
      expect(actualizar.depois).toMatchObject({ limiteUtilizadores: 8 });

      expect(arquivar.antes?.arquivadoEm ?? null).toBeNull();
      expect(arquivar.depois?.arquivadoEm).toBeTruthy();

      expect(desarquivar.antes?.arquivadoEm).toBeTruthy();
      expect(desarquivar.depois?.arquivadoEm ?? null).toBeNull();

      expect(apagar.antes).toMatchObject({ codigo: p.codigo });
      expect(apagar.depois).toBeNull();
    });

    it('uma escrita recusada pela BASE (FK do apagar) não deixa linha — o trilho vai na mesma transacção', async () => {
      const s = await svc();
      const p = await criarOk('TXFK');
      await assinaturaFalsa(p.codigo);
      const antes = await trilho(p.codigo);
      const ctx = novoCtx();

      const e = await erroDe(comoPlataforma(ctx, () => s.apagar(p.id, ctx)));

      expect(e?.code).toBe('PLANO_EM_USO');
      const depois = await trilho(p.codigo);
      expect(depois).toHaveLength(antes.length);
      expect(depois.some((l) => l.requestId === ctx.requestId)).toBe(false);
    });
  });

  // ─── S9 — listagem de administração ─────────────────────────────────────────

  describe('S9 — listarPlanosAdmin', () => {
    it('lista todos, arquivados incluídos, com o n.º de assinaturas de cada um', async () => {
      const s = await svc();
      const usado = await criarOk('LSTU');
      const livre = await criarOk('LSTL');
      await assinaturaFalsa(usado.codigo);
      await assinaturaFalsa(usado.codigo);
      await assinaturaFalsa(usado.codigo);
      const ctx = novoCtx();
      await comoPlataforma(ctx, () => s.arquivar(livre.id, ctx));

      const lista = await s.listarAdmin();

      const contagem = (x: any) => x?.assinaturas ?? x?.numeroAssinaturas ?? x?._count?.assinaturas;
      const u = lista.find((x: any) => x.codigo === usado.codigo);
      const l = lista.find((x: any) => x.codigo === livre.codigo);
      expect(u, 'plano em uso fora da listagem').toBeDefined();
      expect(l, 'plano arquivado fora da listagem').toBeDefined();
      expect(contagem(u)).toBe(3);
      expect(contagem(l)).toBe(0);
      expect(l.arquivadoEm).toBeTruthy();
      for (const c of ['BASICO', 'PROFISSIONAL', 'EMPRESARIAL']) {
        expect(lista.map((x: any) => x.codigo)).toContain(c);
      }
    });
  });
});
