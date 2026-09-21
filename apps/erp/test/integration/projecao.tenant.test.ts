/**
 * Invariante I4 — isolamento multi-tenant do CRUD de compromissos (spec 22,
 * task 5.2). Teste de INTEGRAÇÃO (Postgres efémero por Testcontainers, via
 * `pnpm test:integration`): o I4 é uma propriedade do par serviço+base — um
 * mock de Prisma provaria apenas que o mock filtra.
 *
 * NOTA DE AUTORIA (doutrina 00 §2): este ficheiro é do agente `feat-tesouraria`
 * por AUTORIZAÇÃO EXPLÍCITA do P5 («se o verificador ainda não o escreveu,
 * escreve-o tu») — o `verificador-fluxo-caixa` não o tinha escrito à data do
 * nó L5. É a única excepção; os restantes oráculos ficam intocados.
 *
 * DOIS tenants, ambos registados pelo caminho de produção (`registarTenant`,
 * com bootstrap real de PGC/diários/séries) — nunca por INSERT directo. O que
 * se prova, verbo a verbo:
 *   - obter / actualizar / eliminar um compromisso do tenant A com o Ctx do
 *     tenant B ⇒ `NotFoundError` (404) nos TRÊS casos — nunca 403, que
 *     confirmaria a existência do registo a quem não devia saber dela;
 *   - o cross-tenant falhado NÃO altera nem elimina o registo de A
 *     (anti-vacuidade: o 404 podia vir DEPOIS de um update sem filtro);
 *   - `listarCompromissos` de B nunca devolve o registo de A;
 *   - eliminar é SOFT delete: `deletedAt` marcado, linha ainda na base.
 *
 * E as regras de coerência do serviço (tasks 5.1-bis e P5) contra o registo
 * EXISTENTE — o `superRefine` do Zod não as apanha porque só vê o input.
 *
 * Keycloak/Stripe são dublados (fronteira, não domínio) — mesmo padrão de
 * `test/integration/registo-publico.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  AtualizarCompromissoSchema,
  CriarCompromissoSchema,
  FiltroCompromissoSchema,
  type CriarCompromissoInput,
} from '@/lib/validations/tesouraria';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// O `prismaBase` lê DATABASE_URL no import; o container só existe depois do
// globalSetup — a URL fixa-se aqui e os módulos com estado importam-se
// DINAMICAMENTE no beforeAll (padrão de registo-publico.test.ts).
if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

// ---------------------------------------------------------------------------
// Dublês de fronteira: Keycloak e Stripe. O Postgres é real.
// ---------------------------------------------------------------------------

const ErroKeycloakReal = vi.hoisted(
  () =>
    class ErroKeycloak extends Error {
      constructor(
        readonly status: number,
        mensagem: string,
      ) {
        super(mensagem);
        this.name = 'ErroKeycloak';
      }
    },
);

const kc = vi.hoisted(() => {
  let n = 0;
  return {
    procurarPorEmail: vi.fn(async () => null),
    garantirUtilizador: vi.fn(async () => ({
      sub: `kc-i4-${(n += 1)}-${Date.now()}`,
      criado: true,
    })),
    definirPalavraPasse: vi.fn(async () => {}),
    eliminarUtilizador: vi.fn(async () => {}),
  };
});

vi.mock('@/server/auth/keycloak', () => ({
  ErroKeycloak: ErroKeycloakReal,
  procurarPorEmail: kc.procurarPorEmail,
  garantirUtilizador: kc.garantirUtilizador,
  definirPalavraPasse: kc.definirPalavraPasse,
  eliminarUtilizador: kc.eliminarUtilizador,
}));

vi.mock('@/server/services/plataforma/assinatura.service', () => ({
  criarSubscricaoTrial: vi.fn(async () => ({ criada: false })),
}));

// ---------------------------------------------------------------------------
// Datas — convenção da casa: nunca `new Date('aaaa-mm-dd')`.
// ---------------------------------------------------------------------------

/** Dia civil de hoje + `dias`, materializado a meio-dia local. */
function diasDepois(dias: number): Date {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias, 12);
}

type Ctx = { tenantId: string; userId: string };

describe.skipIf(skip)('spec 22 · I4 — CRUD de compromissos é isolado por tenant', () => {
  let db: (typeof import('@/server/db/client'))['prismaBase'];
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let proj: typeof import('@/server/services/financas/projecao.service');

  let ctxA: Ctx;
  let ctxB: Ctx;

  /** Regista um tenant pelo caminho de produção e devolve o seu Ctx. */
  async function registarTenantDeTeste(
    registar: (typeof import('@/server/provisioning/registo-publico'))['registarTenant'],
    rotulo: string,
    ordinal: number,
  ): Promise<Ctx> {
    const marca = Date.now();
    const email = `i4-${rotulo}+${marca}@tesouraria.mz`;
    const resultado = await registar(
      {
        empresa: {
          nome: `Tenant ${rotulo.toUpperCase()} do I4, Lda`,
          nuit: String(410_000_000 + ordinal * 1_000_000 + (marca % 999_983)),
        },
        admin: { nome: `Admin ${rotulo.toUpperCase()}`, email },
        senha: 'isolamento-i4-verde',
        confirmacao: 'isolamento-i4-verde',
        planoId: 'PROFISSIONAL',
        provincia: 'Maputo Cidade',
        captchaToken: 'dev',
      },
      { ip: `41.222.44.${10 + ordinal}`, idempotencyKey: `i4-${rotulo}-${marca}` },
    );
    if (!resultado.ok) {
      throw new Error(`registarTenant recusou o tenant ${rotulo}: ${JSON.stringify(resultado)}`);
    }
    const tenant = await db.tenant.findFirst({ where: { slug: resultado.tenantSlug } });
    const admin = await db.user.findFirst({ where: { tenantId: tenant!.id, email } });
    if (!tenant || !admin) throw new Error(`Tenant ${rotulo} ou admin ausentes após o registo.`);
    return { tenantId: tenant.id, userId: admin.id };
  }

  beforeAll(async () => {
    process.env.CAPTCHA_PROVIDER = 'none';

    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    proj = await import('@/server/services/financas/projecao.service');
    const { registarTenant } = await import('@/server/provisioning/registo-publico');

    ctxA = await registarTenantDeTeste(registarTenant, 'alfa', 1);
    ctxB = await registarTenantDeTeste(registarTenant, 'beta', 2);
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  /** Cria um compromisso no tenant A pelo serviço (nunca INSERT directo). */
  async function criarNoTenantA(
    extras: Partial<CriarCompromissoInput> = {},
  ): Promise<{ id: string }> {
    return runCtx(ctxA, () =>
      proj.criarCompromisso(
        CriarCompromissoSchema.parse({
          descricao: 'Renda do escritório do tenant A',
          tipo: 'SAIDA',
          valor: 1500.5,
          dataPrevista: diasDepois(7),
          recorrencia: 'UNICA',
          ...extras,
        }),
        ctxA,
      ),
    );
  }

  // -------------------------------------------------------------------------
  // I4 — os três verbos, cross-tenant ⇒ NotFoundError (404, nunca 403)
  // -------------------------------------------------------------------------

  it('obterCompromisso do tenant A com Ctx do tenant B lança NotFoundError; com o Ctx certo devolve', async () => {
    const criado = await criarNoTenantA();

    await expect(
      runCtx(ctxB, () => proj.obterCompromisso(criado.id, ctxB)),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Anti-vacuidade: o mesmo id, com o Ctx do dono, existe e devolve-se.
    const doDono = await runCtx(ctxA, () => proj.obterCompromisso(criado.id, ctxA));
    expect(doDono.id).toBe(criado.id);
    expect(doDono.tenantId).toBe(ctxA.tenantId);
  });

  it('atualizarCompromisso cross-tenant lança NotFoundError e NÃO altera o registo', async () => {
    const criado = await criarNoTenantA();

    await expect(
      runCtx(ctxB, () =>
        proj.atualizarCompromisso(
          AtualizarCompromissoSchema.parse({ id: criado.id, descricao: 'apropriado por B' }),
          ctxB,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    // O 404 tem de vir ANTES de qualquer escrita — o registo de A fica intacto.
    const intacto = await db.compromissoTesouraria.findUnique({ where: { id: criado.id } });
    expect(intacto?.descricao).toBe('Renda do escritório do tenant A');
    expect(intacto?.tenantId).toBe(ctxA.tenantId);
  });

  it('eliminarCompromisso cross-tenant lança NotFoundError e NÃO marca deletedAt', async () => {
    const criado = await criarNoTenantA();

    await expect(
      runCtx(ctxB, () => proj.eliminarCompromisso(criado.id, ctxB)),
    ).rejects.toBeInstanceOf(NotFoundError);

    const intacto = await db.compromissoTesouraria.findUnique({ where: { id: criado.id } });
    expect(intacto?.deletedAt).toBeNull();
  });

  it('listarCompromissos do tenant B nunca devolve registos do tenant A', async () => {
    const criado = await criarNoTenantA();

    const listaB = await runCtx(ctxB, () =>
      proj.listarCompromissos(FiltroCompromissoSchema.parse({}), ctxB),
    );
    expect(listaB.items.some((c) => c.id === criado.id)).toBe(false);
    expect(listaB.items.every((c) => c.tenantId === ctxB.tenantId)).toBe(true);

    // Anti-vacuidade: o dono vê-o.
    const listaA = await runCtx(ctxA, () =>
      proj.listarCompromissos(FiltroCompromissoSchema.parse({}), ctxA),
    );
    expect(listaA.items.some((c) => c.id === criado.id)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Soft delete (task 5.1) — deletedAt marcado, linha nunca apagada
  // -------------------------------------------------------------------------

  it('eliminar é SOFT delete: deletedAt marcado, linha na base, invisível a obter/listar', async () => {
    const criado = await criarNoTenantA();

    const marcado = await runCtx(ctxA, () => proj.eliminarCompromisso(criado.id, ctxA));
    expect(marcado.deletedAt).not.toBeNull();

    // A linha AINDA existe fisicamente (nunca DELETE) …
    const linha = await db.compromissoTesouraria.findUnique({ where: { id: criado.id } });
    expect(linha).not.toBeNull();
    expect(linha!.deletedAt).not.toBeNull();

    // … mas desapareceu da superfície do serviço, para o PRÓPRIO dono.
    await expect(
      runCtx(ctxA, () => proj.obterCompromisso(criado.id, ctxA)),
    ).rejects.toBeInstanceOf(NotFoundError);
    const lista = await runCtx(ctxA, () =>
      proj.listarCompromissos(FiltroCompromissoSchema.parse({}), ctxA),
    );
    expect(lista.items.some((c) => c.id === criado.id)).toBe(false);

    // Eliminar segunda vez ⇒ o mesmo NotFoundError (não um erro interno).
    await expect(
      runCtx(ctxA, () => proj.eliminarCompromisso(criado.id, ctxA)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  // -------------------------------------------------------------------------
  // Task 5.1-bis — R3.4 reimposta contra o registo EXISTENTE no atualizar
  // parcial (o superRefine do Zod só vê o input, não o registo)
  // -------------------------------------------------------------------------

  it('mover só a dataPrevista para DEPOIS do dataFimRecorrencia gravado é ValidationError', async () => {
    const criado = await criarNoTenantA({
      descricao: 'Mensalidade com fim gravado',
      recorrencia: 'MENSAL',
      dataPrevista: diasDepois(10),
      dataFimRecorrencia: diasDepois(90),
    });

    await expect(
      runCtx(ctxA, () =>
        proj.atualizarCompromisso(
          AtualizarCompromissoSchema.parse({ id: criado.id, dataPrevista: diasDepois(120) }),
          ctxA,
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('mover só o dataFimRecorrencia para ANTES da dataPrevista gravada é ValidationError', async () => {
    const criado = await criarNoTenantA({
      descricao: 'Trimestralidade com início gravado',
      recorrencia: 'TRIMESTRAL',
      dataPrevista: diasDepois(30),
      dataFimRecorrencia: diasDepois(365),
    });

    await expect(
      runCtx(ctxA, () =>
        proj.atualizarCompromisso(
          AtualizarCompromissoSchema.parse({ id: criado.id, dataFimRecorrencia: diasDepois(5) }),
          ctxA,
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('passar a UNICA sem limpar o dataFimRecorrencia gravado é ValidationError; com null limpa e passa', async () => {
    const criado = await criarNoTenantA({
      descricao: 'Mensalidade a converter em única',
      recorrencia: 'MENSAL',
      dataPrevista: diasDepois(10),
      dataFimRecorrencia: diasDepois(90),
    });

    // Só `recorrencia` no input: o Zod não vê o fim gravado — o serviço vê.
    await expect(
      runCtx(ctxA, () =>
        proj.atualizarCompromisso(
          AtualizarCompromissoSchema.parse({ id: criado.id, recorrencia: 'UNICA' }),
          ctxA,
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // `dataFimRecorrencia: null` limpa o campo — é o caminho legítimo.
    const convertido = await runCtx(ctxA, () =>
      proj.atualizarCompromisso(
        AtualizarCompromissoSchema.parse({
          id: criado.id,
          recorrencia: 'UNICA',
          dataFimRecorrencia: null,
        }),
        ctxA,
      ),
    );
    expect(convertido.recorrencia).toBe('UNICA');
    expect(convertido.dataFimRecorrencia).toBeNull();
  });

  // -------------------------------------------------------------------------
  // P5 — valor ≤ 0 recusado PELO SERVIÇO (o Zod já trava na fronteira; o
  // serviço não confia em quem o chama)
  // -------------------------------------------------------------------------

  it('criarCompromisso com valor ≤ 0 lança ValidationError mesmo sem passar pelo Zod', async () => {
    const semZod = {
      descricao: 'Valor inválido injectado sem Zod',
      tipo: 'SAIDA',
      valor: -100,
      dataPrevista: diasDepois(3),
      recorrencia: 'UNICA',
    } as unknown as CriarCompromissoInput;

    await expect(
      runCtx(ctxA, () => proj.criarCompromisso(semZod, ctxA)),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
