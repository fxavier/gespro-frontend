/**
 * Oráculo da issue #183 (parte notificações) — pesquisa e paginação por cursor na lista de
 * notificações (nó C:notificacoes-export-leitura-183-184; escrito pelo VERIFICADOR — alterá-lo do
 * lado de quem implementa é BLOCKER).
 *
 * Contrato do serviço (`notificacaoService.listar`), que é o que a página `/notificacoes` chama:
 *   1. Paginação por cursor: percorrer as páginas seguindo `nextCursor` devolve TODAS as
 *      notificações do utilizador, cada uma EXACTAMENTE uma vez, da mais recente para a mais
 *      antiga — mesmo quando várias têm o mesmo `createdAt` (o seed, o cron e os `createMany`
 *      gravam lotes no mesmo instante). A última página devolve `nextCursor: null`.
 *   2. Pesquisa (`q`): insensível a maiúsculas, procura no título e na mensagem; combina com a
 *      paginação (o cursor não perde o filtro) e com os outros filtros.
 *   3. Isolamento: nunca devolve notificações de outro utilizador do mesmo tenant nem de outro
 *      tenant, com ou sem `q`, e um cursor de outro utilizador não abre a lista dele.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// O serviço importa o provider de e-mail (require dinâmico que o vitest não resolve); a listagem
// não envia nada, por isso dobra-se como no vizinho cron-transporte-tenants-198.
vi.mock('@/server/email', () => ({ emailProvider: { enviar: async () => {} } }));

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('#183 — notificações: pesquisa e paginação por cursor (Testcontainers)', () => {
  let db: any;
  let servico: any;

  const sufixo = Date.now();
  const TENANT = `tenant-notif-183-${sufixo}`;
  const OUTRO_TENANT = `tenant-notif-183-outro-${sufixo}`;
  const USER = `user-notif-183-${sufixo}`;
  const COLEGA = `user-notif-183-colega-${sufixo}`;
  const ESTRANHO = `user-notif-183-estranho-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };

  /** Instantes fixos: três lotes com o MESMO createdAt, para exercitar empates no cursor. */
  const T1 = new Date('2026-03-01T10:00:00.000Z');
  const T2 = new Date('2026-03-02T10:00:00.000Z');
  const T3 = new Date('2026-03-03T10:00:00.000Z');

  /** Ids das notificações do USER (todas), e das que casam com a pesquisa «Fatura». */
  const meus: string[] = [];
  const comFatura: string[] = [];

  async function percorrer(filtro: Record<string, unknown>, c = ctx) {
    const vistos: any[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const { items, nextCursor } = await servico.listar({ ...filtro, cursor }, c);
      vistos.push(...items);
      if (!nextCursor) return { vistos, paginas: i + 1 };
      expect(items.length, 'uma página com nextCursor tem de vir cheia').toBe(filtro.take);
      cursor = nextCursor;
    }
    throw new Error('a paginação não terminou em 50 páginas — o cursor está em ciclo');
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ notificacaoService: servico } = await import('@/server/services/plataforma/notificacao.service'));

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant notif 183', slug: `notif-183-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.tenant.create({
      data: { id: OUTRO_TENANT, nome: 'Outro notif 183', slug: `notif-183-outro-${sufixo}`, nuit: `${sufixo + 1}`.slice(-9) },
    });
    for (const [id, tenantId] of [
      [USER, TENANT],
      [COLEGA, TENANT],
      [ESTRANHO, OUTRO_TENANT],
    ] as const) {
      await db.user.create({
        data: { id, tenantId, email: `${id}@test.mz`, nome: id, keycloakSub: `kc-${id}` },
      });
    }

    // 23 notificações do USER: 8 em T1, 8 em T2, 7 em T3 (empates dentro de cada lote).
    // As de índice par falam de «Fatura» (no título ou na mensagem, com caixas diferentes).
    let n = 0;
    for (const [instante, quantas] of [
      [T1, 8],
      [T2, 8],
      [T3, 7],
    ] as const) {
      for (let k = 0; k < quantas; k++, n++) {
        const temFatura = n % 2 === 0;
        const noTitulo = n % 4 === 0;
        const titulo = temFatura && noTitulo ? `FATURA vencida ${n}` : `Aviso ${n}`;
        const mensagem = temFatura && !noTitulo ? `A fatura n.º ${n} expira amanhã` : `Mensagem genérica ${n}`;
        const r = await db.notificacao.create({
          data: {
            tenantId: TENANT,
            userId: USER,
            tipo: 'ALERTA_SISTEMA',
            titulo,
            mensagem,
            canal: 'IN_APP',
            estadoEnvio: 'ENVIADO',
            lida: n % 3 === 0,
            createdAt: instante,
          },
          select: { id: true },
        });
        meus.push(r.id);
        if (temFatura) comFatura.push(r.id);
      }
    }

    // Ruído que nunca pode aparecer ao USER: colega do mesmo tenant e utilizador de outro tenant,
    // com «Fatura» no título e nos mesmos instantes.
    for (const [userId, tenantId] of [
      [COLEGA, TENANT],
      [ESTRANHO, OUTRO_TENANT],
    ] as const) {
      for (const instante of [T1, T2, T3]) {
        await db.notificacao.create({
          data: {
            tenantId,
            userId,
            tipo: 'ALERTA_SISTEMA',
            titulo: `Fatura alheia ${userId}`,
            mensagem: 'não é sua',
            canal: 'IN_APP',
            estadoEnvio: 'ENVIADO',
            createdAt: instante,
          },
        });
      }
    }
  }, 60_000);

  // ── 1. Paginação por cursor ────────────────────────────────────────────────

  it.each([1, 3, 5, 7, 10])(
    'take=%i: percorrer as páginas devolve cada notificação exactamente uma vez, mesmo com createdAt empatados',
    async (take) => {
      const { vistos, paginas } = await percorrer({ take });
      const ids = vistos.map((x) => x.id);

      expect(new Set(ids).size, 'sem repetidas entre páginas').toBe(ids.length);
      expect([...ids].sort()).toEqual([...meus].sort());
      expect(paginas).toBe(Math.ceil(meus.length / take));
    },
  );

  it('a ordem é da mais recente para a mais antiga, e estável entre duas leituras', async () => {
    const a = (await percorrer({ take: 4 })).vistos;
    const b = (await percorrer({ take: 4 })).vistos;
    const datas = a.map((x) => new Date(x.createdAt).getTime());
    for (let i = 1; i < datas.length; i++) {
      expect(datas[i]!, `posição ${i}`).toBeLessThanOrEqual(datas[i - 1]!);
    }
    expect(b.map((x) => x.id)).toEqual(a.map((x) => x.id));
  });

  it('a última página devolve nextCursor null; uma lista que cabe numa página também', async () => {
    const tudo = await servico.listar({ take: 100 }, ctx);
    expect(tudo.items).toHaveLength(meus.length);
    expect(tudo.nextCursor).toBeNull();

    const exacta = await servico.listar({ take: meus.length }, ctx);
    expect(exacta.items).toHaveLength(meus.length);
    expect(exacta.nextCursor, 'take igual ao total não promete uma página vazia').toBeNull();
  });

  it('com «apenas não lidas», a paginação devolve cada não lida uma vez', async () => {
    const naoLidas = await db.notificacao.findMany({
      where: { tenantId: TENANT, userId: USER, lida: false },
      select: { id: true },
    });
    const { vistos } = await percorrer({ take: 3, apenasNaoLidas: true });
    const ids = vistos.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(naoLidas.map((x: any) => x.id).sort());
    expect(vistos.every((x) => x.lida === false)).toBe(true);
  });

  // ── 2. Pesquisa ────────────────────────────────────────────────────────────

  it.each(['fatura', 'FATURA', 'Fatura'])(
    'q=%s procura no título e na mensagem, sem distinguir maiúsculas',
    async (q) => {
      const { items } = await servico.listar({ q, take: 100 }, ctx);
      expect(items.map((x: any) => x.id).sort()).toEqual([...comFatura].sort());
    },
  );

  it('a pesquisa combina com a paginação: o cursor não perde o filtro', async () => {
    const { vistos } = await percorrer({ q: 'fatura', take: 2 });
    const ids = vistos.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...comFatura].sort());
  });

  it('uma pesquisa sem resultados devolve lista vazia e nextCursor null', async () => {
    const r = await servico.listar({ q: 'inexistente-183-xyz', take: 5 }, ctx);
    expect(r.items).toEqual([]);
    expect(r.nextCursor).toBeNull();
  });

  // ── 3. Isolamento ──────────────────────────────────────────────────────────

  it('nunca devolve notificações do colega nem de outro tenant, com ou sem pesquisa', async () => {
    const semQ = (await percorrer({ take: 6 })).vistos;
    const comQ = (await percorrer({ q: 'alheia', take: 6 })).vistos;
    expect(semQ.every((x) => meus.includes(x.id))).toBe(true);
    expect(comQ).toEqual([]);
  });

  it('um cursor de uma notificação do colega não abre a lista do colega', async () => {
    const doColega = await db.notificacao.findFirst({ where: { tenantId: TENANT, userId: COLEGA }, select: { id: true } });
    let items: any[] = [];
    try {
      ({ items } = await servico.listar({ take: 50, cursor: doColega.id }, ctx));
    } catch {
      // Recusar o cursor alheio também cumpre o contrato (recusar > número errado).
      items = [];
    }
    expect(items.every((x) => meus.includes(x.id))).toBe(true);
  });
});
