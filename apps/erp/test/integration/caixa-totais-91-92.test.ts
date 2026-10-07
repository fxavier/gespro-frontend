/**
 * Oráculo das issues #91 e #92 (nó A:caixa-totais-91-92) — escrito pelo verificador.
 * Alterar este ficheiro do lado de quem implementa é BLOCKER (doutrina 00 §2).
 *
 * Contra Postgres real (Testcontainers), pelos serviços reais do caixa:
 *
 *  #91 — o fecho contava o fundo inicial DUAS vezes: o movimento ABERTURA entrava em
 *        `totalEntradas` e o `fundoInicial` voltava a entrar no `saldoEsperado`. Com fundo 1000,
 *        uma venda de 300 e 1300 contados, gravava-se diferença −1000. Contrato:
 *        `fecharSessao` e `resumoSessao` usam `totaisSessaoCaixa` (ABERTURA e FECHAMENTO fora).
 *  #92 — `SessaoCaixa.totalEntradas/totalSaidas` só são escritos no fecho; numa sessão ABERTA a
 *        listagem mostrava-os a zero. Contrato: `listarSessoes` deriva-os dos movimentos para as
 *        sessões ABERTAS (as colunas ficam como fotografia do fecho); para as FECHADAS mostra a
 *        fotografia. (O ramo da projecção — `saldoTesourariaAte` — é julgado em
 *        `tesouraria-tenant-sintetico.test.ts`, e aqui num caso por delta.)
 *
 * O tenant é montado com o `bootstrapContabilidade` real (séries, plano, diários). Cada caso usa
 * um utilizador novo — uma sessão ABERTA por responsável. Os movimentos entram pelos caminhos de
 * produção: `registarMovimentoCaixa` (contrato cross-domínio, dentro de uma `$transaction`),
 * `registarSangria` e `registarReforco`. Nenhum total é escrito à mão.
 * Os números esperados são apurados à mão nos comentários de cada caso.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

const D = (v: string | number) => new Prisma.Decimal(v);
const dois = (v: unknown) => D(String(v)).toFixed(2);

type Ctx = { tenantId: string; userId: string };

describe.skipIf(skip)('#91/#92 — totais da sessão de caixa (DB efémera, Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let caixa: typeof import('@/server/services/financas/caixa.service');
  let proj: typeof import('@/server/services/financas/projecao.service');

  const sufixo = Date.now();
  const TENANT = `tenant-caixa-totais-91-92-${sufixo}`;
  let seq = 0;

  async function novoUtilizador(): Promise<Ctx> {
    seq += 1;
    const userId = `ccx9192${sufixo}u${seq}`;
    await db.user.create({
      data: {
        id: userId,
        tenantId: TENANT,
        email: `caixa-totais-91-92-${sufixo}-${seq}@test.mz`,
        nome: `Operador de caixa ${seq}`,
        keycloakSub: `kc-caixa-totais-91-92-${sufixo}-${seq}`,
      },
    });
    return { tenantId: TENANT, userId };
  }

  async function abrir(ctx: Ctx, fundoInicial: number): Promise<string> {
    const s: any = await runCtx(ctx, () => caixa.abrirSessao({ fundoInicial }, ctx));
    return s.id as string;
  }

  /** Pelo contrato cross-domínio, como a venda POS / o recebimento / o pagamento o chamam. */
  async function movimento(ctx: Ctx, sessaoCaixaId: string, tipo: string, valor: string) {
    await runCtx(ctx, () =>
      db.$transaction((tx: any) =>
        caixa.registarMovimentoCaixa(
          tx,
          {
            sessaoCaixaId,
            tipo: tipo as any,
            valor,
            descricao: `caixa-totais-91-92 ${tipo} ${valor}`,
            documentoOrigemTipo: 'Oraculo',
            documentoOrigemId: `oraculo-${tipo}-${valor}`,
          },
          ctx,
        ),
      ),
    );
  }

  async function fechar(ctx: Ctx, sessaoCaixaId: string, fundoFinal: number) {
    await runCtx(ctx, () => caixa.fecharSessao({ sessaoCaixaId, fundoFinal } as any, ctx));
    return db.sessaoCaixa.findFirst({ where: { id: sessaoCaixaId, tenantId: TENANT } });
  }

  async function itemDaListagem(ctx: Ctx, sessaoCaixaId: string): Promise<any> {
    const r: any = await runCtx(ctx, () => caixa.listarSessoes({ take: 100 } as any, ctx));
    const item = r.items.find((s: any) => s.id === sessaoCaixaId);
    expect(item, `a sessão ${sessaoCaixaId} tem de aparecer em listarSessoes`).toBeDefined();
    return item;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    caixa = await import('@/server/services/financas/caixa.service');
    proj = await import('@/server/services/financas/projecao.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: {
        id: TENANT,
        nome: `Tenant caixa-totais-91-92 ${sufixo}`,
        slug: `caixa-totais-91-92-${sufixo}`,
        nuit: `7${String(sufixo).slice(-8)}`,
      },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  // -------------------------------------------------------------------------
  // #91 — fecho
  // -------------------------------------------------------------------------

  it('#91 fecho: fundo 1000 + VENDA 300, contados 1300 ⇒ diferença 0 (hoje grava −1000)', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 1000);
    await movimento(ctx, id, 'VENDA', '300.00');

    const s = await fechar(ctx, id, 1300);

    expect(s.status).toBe('FECHADA');
    expect(dois(s.fundoFinal)).toBe('1300.00');
    // À mão: entradas = 300 (a ABERTURA de 1000 já está no fundoInicial); saídas = 0;
    // esperado = 1000 + 300 − 0 = 1300; diferença = 1300 − 1300 = 0.
    expect(dois(s.totalEntradas), 'totalEntradas não pode incluir a ABERTURA').toBe('300.00');
    expect(dois(s.totalSaidas)).toBe('0.00');
    expect(dois(s.diferenca), 'diferença = contado − (fundo + entradas − saídas)').toBe('0.00');
  });

  it('#91 fecho com todos os tipos: entradas 600, saídas 85, contados 1500 ⇒ diferença −15', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 1000);
    await movimento(ctx, id, 'VENDA', '300.00');
    await movimento(ctx, id, 'RECEBIMENTO', '200.00');
    await runCtx(ctx, () => caixa.registarReforco({ sessaoCaixaId: id, valor: 100, motivo: 'troco' } as any, ctx));
    await runCtx(ctx, () => caixa.registarSangria({ sessaoCaixaId: id, valor: 50, motivo: 'cofre' } as any, ctx));
    await movimento(ctx, id, 'PAGAMENTO', '25.00');
    await movimento(ctx, id, 'DEVOLUCAO', '10.00');

    const s = await fechar(ctx, id, 1500);

    // À mão: entradas 300 + 200 + 100 = 600; saídas 50 + 25 + 10 = 85;
    // esperado 1000 + 600 − 85 = 1515; diferença 1500 − 1515 = −15 (falta).
    expect(dois(s.totalEntradas)).toBe('600.00');
    expect(dois(s.totalSaidas)).toBe('85.00');
    expect(dois(s.diferenca)).toBe('-15.00');

    // O resumo depois do fecho ignora também o movimento FECHAMENTO que o fecho escreveu.
    const r: any = await runCtx(ctx, () => caixa.resumoSessao(id, ctx));
    expect(dois(r.totalEntradas)).toBe('600.00');
    expect(dois(r.totalSaidas)).toBe('85.00');
    expect(dois(r.saldoEsperado)).toBe('1515.00');
    expect(dois(r.diferenca)).toBe('-15.00');
  });

  // -------------------------------------------------------------------------
  // #91 — resumo de uma sessão ainda aberta (é o que o assistente de fecho compara)
  // -------------------------------------------------------------------------

  it('#91 resumoSessao: fundo 1000 + VENDA 300 ⇒ entradas 300, esperado 1300 (hoje 1300 / 2300)', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 1000);
    await movimento(ctx, id, 'VENDA', '300.00');

    const r: any = await runCtx(ctx, () => caixa.resumoSessao(id, ctx));

    expect(dois(r.fundoInicial)).toBe('1000.00');
    expect(dois(r.totalEntradas)).toBe('300.00');
    expect(dois(r.totalSaidas)).toBe('0.00');
    expect(dois(r.saldoEsperado)).toBe('1300.00');
  });

  // -------------------------------------------------------------------------
  // #92 — listagem
  // -------------------------------------------------------------------------

  it('#92 listarSessoes: sessão ABERTA mostra entradas e saídas derivadas dos movimentos', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 1000);
    await movimento(ctx, id, 'VENDA', '300.00');
    await runCtx(ctx, () => caixa.registarSangria({ sessaoCaixaId: id, valor: 50, motivo: 'cofre' } as any, ctx));

    const item = await itemDaListagem(ctx, id);

    expect(item.status).toBe('ABERTA');
    // À mão: VENDA 300 entra; SANGRIA 50 sai; a ABERTURA de 1000 não é entrada.
    expect(dois(item.totalEntradas), 'Entradas de uma sessão aberta não podem ficar a zero até ao fecho').toBe('300.00');
    expect(dois(item.totalSaidas)).toBe('50.00');
    expect(dois(item.fundoInicial)).toBe('1000.00');

    // As colunas são a fotografia do fecho: numa sessão ABERTA continuam por escrever.
    const linha = await db.sessaoCaixa.findFirst({ where: { id, tenantId: TENANT } });
    expect(dois(linha.totalEntradas)).toBe('0.00');
    expect(dois(linha.totalSaidas)).toBe('0.00');
  });

  it('#92 listarSessoes: sessão FECHADA mostra a fotografia gravada no fecho', async () => {
    const ctx = await novoUtilizador();
    const id = await abrir(ctx, 500);
    await movimento(ctx, id, 'VENDA', '120.00');
    await movimento(ctx, id, 'PAGAMENTO', '20.00');
    const s = await fechar(ctx, id, 600);

    const item = await itemDaListagem(ctx, id);

    expect(item.status).toBe('FECHADA');
    // À mão: entradas 120, saídas 20, esperado 600, diferença 0.
    expect(dois(item.totalEntradas)).toBe('120.00');
    expect(dois(item.totalSaidas)).toBe('20.00');
    expect(dois(item.diferenca)).toBe('0.00');
    expect(dois(item.totalEntradas)).toBe(dois(s.totalEntradas));
    expect(dois(item.totalSaidas)).toBe(dois(s.totalSaidas));
  });

  // -------------------------------------------------------------------------
  // #92 — projecção (delta; o caso absoluto vive no tenant sintético)
  // -------------------------------------------------------------------------

  it('#92 saldoTesourariaAte: abrir com fundo 0 e vender 300 em numerário sobe o saldo em 300', async () => {
    const ctx = await novoUtilizador();
    const agora = () => new Date(Date.now() + 60_000);

    const antes = await runCtx(ctx, () => proj.saldoTesourariaAte(agora(), ctx));
    const id = await abrir(ctx, 0);
    const aberta = await runCtx(ctx, () => proj.saldoTesourariaAte(agora(), ctx));
    await movimento(ctx, id, 'VENDA', '300.00');
    const depois = await runCtx(ctx, () => proj.saldoTesourariaAte(agora(), ctx));

    // Abrir com fundo 0 não mexe no saldo; a venda de 300 sim (hoje fica +0 até ao fecho).
    expect(dois(D(String(aberta)).minus(D(String(antes))))).toBe('0.00');
    expect(
      dois(D(String(depois)).minus(D(String(antes)))),
      'a tesouraria tem de ver o dinheiro de uma sessão ABERTA antes do fecho',
    ).toBe('300.00');
  });
});
