/**
 * Oráculo — issue #150: `/caixa/fechamento` ignora `?sessaoId=`.
 *
 * Defeito (lido em `3d4b62e`): o detalhe da sessão (`caixa/[id]/page.tsx`) e a listagem
 * (`caixa/_components/sessoes-table.tsx`) ligam «Fechar caixa» a `/caixa/fechamento?sessaoId=<id>`,
 * mas a página ignora o parâmetro e entrega ao assistente a sessão ABERTA de quem está autenticado
 * (`obterSessaoAtual`). Quem carrega em «Fechar caixa» na sessão de outra pessoa vê — e fecha — a sua.
 *
 * Contrato (decisão do orquestrador, não reaberta aqui):
 *   - a página lê `searchParams.sessaoId`;
 *   - se for uma sessão ABERTA do tenant da sessão, é ESSA que vai ao assistente (id, número,
 *     fundo inicial e `saldoEsperado` do servidor — `resumoSessao` dessa sessão, #91/#384);
 *   - senão (ausente, inexistente, de outro tenant, FECHADA/CANCELADA), cai na sessão ABERTA do
 *     utilizador — como hoje. Nunca expõe dados de uma sessão de outro tenant.
 *   - O fecho em si continua a ser do responsável (#267): o assistente mostra a sessão pedida e o
 *     servidor recusa fechá-la a quem não a abriu, sem tocar na sessão do próprio. (Recusar > fechar
 *     a sessão errada.)
 *
 * Como se prova: a página (Server Component) é chamada como função, com `@/lib/auth` dobrado, e
 * procura-se na árvore devolvida o elemento `FechamentoWizard` — as props dele são o que o
 * assistente usa (o `sessaoCaixaId` do formulário é `sessaoActual.id`). Postgres efémero, tenant
 * montado com o `bootstrapContabilidade` real, sessões abertas por `abrirSessao` e movimentos pelo
 * contrato `registarMovimentoCaixa` — nenhum total é escrito à mão.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:caixa-fechamento-sessao-150; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { isValidElement, type ReactElement } from 'react';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: { id: string; tenantId: string; permissions: string[]; acesso: 'aberto' | 'leitura' | 'fechado' };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect(${url})`);
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound()');
  }),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

const D = (v: string | number) => new Prisma.Decimal(v);
const dois = (v: unknown) => D(String(v)).toFixed(2);

type Ctx = { tenantId: string; userId: string };
type SessaoNoAssistente = {
  id: string;
  numero: string;
  fundoInicial: string;
  saldoEsperado: string;
  status: string;
} | null;

describe.skipIf(skip)('#150 — /caixa/fechamento respeita ?sessaoId= (DB efémera, Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let Pagina: (props: unknown) => Promise<unknown>;
  let Wizard: unknown;

  const sufixo = Date.now();
  const TENANT = `tenant-cx-fecho-150-${sufixo}`;
  const OUTRO_TENANT = `tenant-cx-fecho-150-outro-${sufixo}`;
  let seq = 0;

  async function criarTenant(id: string, tag: string) {
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');
    await db.tenant.create({
      data: {
        id,
        nome: `Tenant caixa-fechamento-sessao-150 ${tag} ${sufixo}`,
        slug: `cx-fecho-150-${tag}-${sufixo}`,
        nuit: `${tag === 'a' ? 6 : 5}${String(sufixo).slice(-8)}`,
      },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, id), { timeout: 60_000 });
  }

  async function novoUtilizador(tenantId: string): Promise<Ctx> {
    seq += 1;
    const userId = `ucxf150${sufixo}u${seq}`;
    await db.user.create({
      data: {
        id: userId,
        tenantId,
        email: `caixa-fechamento-sessao-150-${sufixo}-${seq}@test.mz`,
        nome: `Operador 150 ${seq}`,
        keycloakSub: `kc-caixa-fechamento-sessao-150-${sufixo}-${seq}`,
      },
    });
    return { tenantId, userId };
  }

  async function abrir(ctx: Ctx, fundoInicial: number): Promise<{ id: string; numero: string }> {
    const s: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial } as any, ctx));
    return { id: s.id as string, numero: s.numero as string };
  }

  async function venda(ctx: Ctx, sessaoCaixaId: string, valor: string) {
    await runCtx(ctx, () =>
      db.$transaction((tx: any) =>
        caixa.registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId,
            tipo: 'VENDA' as any,
            valor,
            descricao: `caixa-fechamento-sessao-150 VENDA ${valor}`,
            documentoOrigemTipo: 'Oraculo',
            documentoOrigemId: `oraculo-150-${sessaoCaixaId}-${valor}`,
          },
          ctx,
        ),
      ),
    );
  }

  function comoUtilizador(ctx: Ctx) {
    h.sessao = {
      user: { id: ctx.userId, tenantId: ctx.tenantId, permissions: ['*'], acesso: 'aberto' },
    };
  }

  /** Procura o elemento do assistente na árvore devolvida pela página (sem renderizar componentes). */
  function procurarWizard(no: unknown): ReactElement<Record<string, unknown>> | null {
    if (Array.isArray(no)) {
      for (const filho of no) {
        const r = procurarWizard(filho);
        if (r) return r;
      }
      return null;
    }
    if (!isValidElement(no)) return null;
    const el = no as ReactElement<Record<string, unknown>>;
    if (el.type === Wizard) return el;
    return procurarWizard(el.props?.children);
  }

  /** O que o assistente recebe quando `ctx` abre `/caixa/fechamento[?sessaoId=…]`. */
  async function sessaoNoAssistente(ctx: Ctx, sessaoId?: string): Promise<SessaoNoAssistente> {
    comoUtilizador(ctx);
    const searchParams = Promise.resolve(sessaoId === undefined ? {} : { sessaoId });
    const arvore = await Pagina({ searchParams, params: Promise.resolve({}) });
    const wizard = procurarWizard(arvore);
    expect(wizard, 'a página tem de entregar o FechamentoWizard').not.toBeNull();
    return (wizard!.props.sessaoActual ?? null) as SessaoNoAssistente;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    caixa = await import('@/server/services/financas/caixa.service');
    Pagina = (await import('@/app/(dashboard)/caixa/fechamento/page')).default as any;
    Wizard = (await import('@/app/(dashboard)/caixa/fechamento/_components/fechamento-wizard'))
      .FechamentoWizard;

    await criarTenant(TENANT, 'a');
    await criarTenant(OUTRO_TENANT, 'b');
  });

  afterAll(async () => {
    h.sessao = null;
    if (db) await db.$disconnect();
  });

  // -------------------------------------------------------------------------
  // O defeito: o parâmetro é ignorado
  // -------------------------------------------------------------------------

  it('?sessaoId= de outra sessão ABERTA do tenant: o assistente recebe ESSA, não a do próprio (hoje recebe a do próprio)', async () => {
    const ana = await novoUtilizador(TENANT);
    const beto = await novoUtilizador(TENANT);
    const daAna = await abrir(ana, 500);
    await venda(ana, daAna.id, '200.00');
    const doBeto = await abrir(beto, 1000);

    const s = await sessaoNoAssistente(beto, daAna.id);

    expect(s, 'o assistente tem de ter uma sessão').not.toBeNull();
    expect(s!.id, 'o assistente tem de mostrar a sessão pedida no URL').toBe(daAna.id);
    expect(s!.id).not.toBe(doBeto.id);
    expect(s!.numero).toBe(daAna.numero);
    expect(s!.status).toBe('ABERTA');
    // À mão: fundo 500 + VENDA 200 − 0 = 700 (ABERTURA fora, #91). A do Beto daria 1000.
    expect(dois(s!.fundoInicial)).toBe('500.00');
    expect(dois(s!.saldoEsperado)).toBe('700.00');
  });

  it('?sessaoId= de sessão ABERTA de outro utilizador, sem sessão própria: o assistente recebe a pedida (hoje «sem sessão»)', async () => {
    const ana = await novoUtilizador(TENANT);
    const carla = await novoUtilizador(TENANT); // sem caixa aberto
    const daAna = await abrir(ana, 300);
    await venda(ana, daAna.id, '50.00');

    const s = await sessaoNoAssistente(carla, daAna.id);

    expect(s, 'a sessão pedida existe e está ABERTA no tenant — não pode aparecer «sem sessão»').not.toBeNull();
    expect(s!.id).toBe(daAna.id);
    // À mão: 300 + 50 = 350.
    expect(dois(s!.saldoEsperado)).toBe('350.00');
  });

  it('o saldo esperado mostrado é o do servidor para a sessão pedida (resumoSessao), não o da sessão do próprio', async () => {
    const ana = await novoUtilizador(TENANT);
    const beto = await novoUtilizador(TENANT);
    const daAna = await abrir(ana, 1000);
    await venda(ana, daAna.id, '125.50');
    await venda(ana, daAna.id, '74.50');
    const doBeto = await abrir(beto, 20);
    await venda(beto, doBeto.id, '5.00');

    const s = await sessaoNoAssistente(beto, daAna.id);
    const resumo: any = await runCtx(ana, () => caixa.resumoSessao(daAna.id, ana));

    expect(s?.id).toBe(daAna.id);
    // À mão: 1000 + 125,50 + 74,50 = 1200,00.
    expect(dois(resumo.saldoEsperado)).toBe('1200.00');
    expect(dois(s!.saldoEsperado)).toBe(dois(resumo.saldoEsperado));
  });

  // -------------------------------------------------------------------------
  // Fecho pela sessão pedida: recusar, nunca fechar a errada (#267 + #150)
  // -------------------------------------------------------------------------

  it('fechar o que o assistente mostra para a sessão de outro: recusado, e a sessão do próprio continua ABERTA', async () => {
    const ana = await novoUtilizador(TENANT);
    const beto = await novoUtilizador(TENANT);
    const daAna = await abrir(ana, 400);
    const doBeto = await abrir(beto, 100);

    const s = await sessaoNoAssistente(beto, daAna.id);
    // O assistente submete `sessaoCaixaId: sessaoActual.id`.
    expect(s?.id, 'o assistente tem de submeter a sessão pedida, não a do próprio').toBe(daAna.id);

    await expect(
      runCtx(beto, () => caixa.fecharSessao({ sessaoCaixaId: s!.id, fundoFinal: 400 } as any, beto)),
    ).rejects.toMatchObject({ code: 'SESSAO_CAIXA_DE_OUTRO_UTILIZADOR' });

    const ambas = await db.sessaoCaixa.findMany({
      where: { tenantId: TENANT, id: { in: [daAna.id, doBeto.id] } },
      select: { id: true, status: true },
    });
    expect(ambas.find((x: any) => x.id === daAna.id)?.status).toBe('ABERTA');
    expect(ambas.find((x: any) => x.id === doBeto.id)?.status, 'a sessão do próprio não pode ser fechada').toBe('ABERTA');
  });

  it('?sessaoId= da própria sessão ABERTA: o assistente recebe-a e o fecho passa', async () => {
    const dora = await novoUtilizador(TENANT);
    const daDora = await abrir(dora, 250);
    await venda(dora, daDora.id, '50.00');

    const s = await sessaoNoAssistente(dora, daDora.id);
    expect(s?.id).toBe(daDora.id);
    expect(dois(s!.saldoEsperado)).toBe('300.00');

    await runCtx(dora, () => caixa.fecharSessao({ sessaoCaixaId: s!.id, fundoFinal: 300 } as any, dora));
    const fechada = await db.sessaoCaixa.findFirst({ where: { id: daDora.id, tenantId: TENANT } });
    expect(fechada.status).toBe('FECHADA');
    expect(dois(fechada.diferenca)).toBe('0.00');
  });

  // -------------------------------------------------------------------------
  // Parâmetro inválido ⇒ sessão ABERTA do utilizador (comportamento actual preservado)
  // -------------------------------------------------------------------------

  it('sem ?sessaoId=: o assistente recebe a sessão ABERTA do utilizador', async () => {
    const eva = await novoUtilizador(TENANT);
    const daEva = await abrir(eva, 80);

    const s = await sessaoNoAssistente(eva);
    expect(s?.id).toBe(daEva.id);
    expect(dois(s!.saldoEsperado)).toBe('80.00');
  });

  it('sem ?sessaoId= e sem sessão própria: o assistente fica sem sessão', async () => {
    const fabio = await novoUtilizador(TENANT);
    expect(await sessaoNoAssistente(fabio)).toBeNull();
  });

  it('?sessaoId= inexistente: cai na sessão ABERTA do utilizador', async () => {
    const gil = await novoUtilizador(TENANT);
    const doGil = await abrir(gil, 60);

    const s = await sessaoNoAssistente(gil, `nao-existe-150-${sufixo}`);
    expect(s?.id).toBe(doGil.id);
  });

  it('?sessaoId= de sessão FECHADA do tenant: cai na sessão ABERTA do utilizador (nunca a FECHADA)', async () => {
    const ines = await novoUtilizador(TENANT);
    const joao = await novoUtilizador(TENANT);
    const daInes = await abrir(ines, 10);
    await runCtx(ines, () => caixa.fecharSessao({ sessaoCaixaId: daInes.id, fundoFinal: 10 } as any, ines));
    const doJoao = await abrir(joao, 70);

    const s = await sessaoNoAssistente(joao, daInes.id);
    expect(s?.id, 'uma sessão FECHADA não vai ao assistente').toBe(doJoao.id);
    expect(s!.status).toBe('ABERTA');
  });

  it('?sessaoId= de sessão FECHADA e sem sessão própria: o assistente fica sem sessão', async () => {
    const leo = await novoUtilizador(TENANT);
    const mia = await novoUtilizador(TENANT);
    const daLeo = await abrir(leo, 15);
    await runCtx(leo, () => caixa.fecharSessao({ sessaoCaixaId: daLeo.id, fundoFinal: 15 } as any, leo));

    expect(await sessaoNoAssistente(mia, daLeo.id)).toBeNull();
  });

  it('?sessaoId= de sessão CANCELADA: cai na sessão ABERTA do utilizador', async () => {
    const nuno = await novoUtilizador(TENANT);
    const olga = await novoUtilizador(TENANT);
    const doNuno = await abrir(nuno, 5);
    await runCtx(nuno, () => caixa.cancelarSessao(doNuno.id, 'oráculo #150', nuno));
    const daOlga = await abrir(olga, 45);

    const s = await sessaoNoAssistente(olga, doNuno.id);
    expect(s?.id).toBe(daOlga.id);
  });

  it('?sessaoId= de sessão ABERTA de OUTRO tenant: nunca chega ao assistente — cai na do utilizador', async () => {
    const forasteiro = await novoUtilizador(OUTRO_TENANT);
    const deFora = await abrir(forasteiro, 9999);
    const paula = await novoUtilizador(TENANT);
    const daPaula = await abrir(paula, 35);

    const s = await sessaoNoAssistente(paula, deFora.id);
    expect(s?.id, 'sessão de outro tenant não pode aparecer').toBe(daPaula.id);
    expect(dois(s!.saldoEsperado)).toBe('35.00');
  });

  it('?sessaoId= de sessão ABERTA de OUTRO tenant e sem sessão própria: sem sessão (nada do outro tenant)', async () => {
    const forasteiro = await novoUtilizador(OUTRO_TENANT);
    const deFora = await abrir(forasteiro, 8888);
    const rui = await novoUtilizador(TENANT);

    expect(await sessaoNoAssistente(rui, deFora.id)).toBeNull();
  });
});
