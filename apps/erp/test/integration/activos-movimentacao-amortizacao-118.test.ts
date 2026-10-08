/**
 * Oráculo — issue #118: sem UI para movimentação de activos nem para amortização mensal.
 *
 * As actions já existem (`registarMovimentacaoAtivoAction`, `processarAmortizacaoTenantAction`) mas
 * nenhum ecrã as chama; a UI é provada em `e2e/52-activos-movimentacao-amortizacao-118.spec.ts`.
 * Este ficheiro tranca o comportamento de servidor de que essa UI depende, pelas actions reais.
 *
 * Contrato (decisão do orquestrador; as opções conservadoras escolhidas pelo verificador vão
 * marcadas [CONSERVADORA]):
 *
 *   Movimentação (`registarMovimentacaoAtivoAction`, tipo TRANSFERENCIA):
 *     - transferir de localização grava a `MovimentacaoAtivo` E actualiza `Ativo.localizacaoId`
 *       para o destino; a origem gravada é a localização ACTUAL do activo, lida no servidor (o
 *       cliente não a dita); `criadoPor` = sessão; o estado do activo não muda;
 *     - transferir de responsável idem para `Ativo.responsavelId` (origem = responsável actual);
 *     - [CONSERVADORA] o destino tem de ser do tenant: localização ou responsável de outro tenant
 *       → `NAO_ENCONTRADO`, sem movimentação e sem alterar o activo;
 *     - activo de outro tenant → `NAO_ENCONTRADO`, sem escrita (hoje grava uma movimentação
 *       apontada ao activo alheio);
 *     - [CONSERVADORA] activo BAIXADO → `ATIVO_BAIXADO`, sem escrita;
 *     - [CONSERVADORA] transferência que não muda nada (destino = actual e sem novo responsável)
 *       → `MOVIMENTACAO_SEM_ALTERACAO`, sem escrita.
 *
 *   Amortização do mês (`processarAmortizacaoTenantAction`, que chama o serviço existente):
 *     - processa os activos EM_USO do tenant (só desse tenant), uma `AmortizacaoCalculo` por
 *       activo e mês, com o valor do serviço existente (LINEAR: (compra − residual) / meses);
 *     - idempotente por mês: correr o mesmo mês outra vez devolve ok, `processados: 0`, nenhuma
 *       linha nova e nenhum erro para os activos já processados;
 *     - [CONSERVADORA] mês posterior ao mês corrente de Maputo → `AMORTIZACAO_MES_FUTURO`, nada
 *       gravado;
 *     - [CONSERVADORA] activo adquirido depois do mês processado não leva amortização nesse mês
 *       (hoje leva, com `mesIndex` truncado a 0 — número errado);
 *     - [CONSERVADORA] a amortização NÃO lança na contabilidade neste nó: não há mapeamento
 *       categoria→conta nem decisão sobre ele; `lancamentoContabilId` fica nulo e não nasce
 *       `Lancamento` nenhum (recusar > número errado). Quando houver, será por
 *       `registarLancamentoContabilistico` e num nó próprio;
 *     - em modo de Leitura a escrita é recusada (`ACESSO_LEITURA`).
 *
 * Sessão (`@/lib/auth`) é o único duplo, mutável por `vi.hoisted`; `next/cache` é dobrado porque
 * o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero, `createSafeAction`,
 * serviços. Catálogo (localizações, categorias, activos) escrito pelo client cru.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:activos-movimentacao-amortizacao-118; um agente de
 * implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

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

type Resultado<T = any> = { ok: boolean; data?: T; error?: { code: string; message: string } };
type Action = (input: unknown) => Promise<Resultado>;

/** Ano/mês civis correntes em Africa/Maputo. */
function mesCorrenteMaputo(): { ano: number; mes: number } {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date());
  return {
    ano: Number(partes.find((p) => p.type === 'year')!.value),
    mes: Number(partes.find((p) => p.type === 'month')!.value),
  };
}

describe.skipIf(skip)('Movimentação e amortização mensal de activos (#118) — DB efémera (Testcontainers)', () => {
  let db: any;
  // Acesso dinâmico: falha o caso, não o ficheiro.
  let actions: Record<string, Action>;

  const sufixo = Date.now();
  const TENANT = `tenant-act-118-${sufixo}`;
  const OUTRO_TENANT = `tenant-act-118-b-${sufixo}`;
  const USER = `cuser118${sufixo}a`;
  const USER2 = `cuser118${sufixo}b`;
  const USER_OUTRO = `cuser118${sufixo}c`;

  let locA: string;
  let locB: string;
  let locOutro: string; // de OUTRO_TENANT
  let categoriaId: string;
  let categoriaOutro: string;
  let seq = 0;

  function sessao(permissions: string[] = ['ativos:read', 'ativos:write', 'ativos:admin'], tenantId = TENANT, acesso: 'aberto' | 'leitura' = 'aberto') {
    h.sessao = { user: { id: USER, tenantId, permissions, acesso } };
  }

  function action(nome: string): Action {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de inventario.actions.ts`).toBe('function');
    return fn;
  }

  const movimentar = (dados: Record<string, unknown>) =>
    action('registarMovimentacaoAtivoAction')({
      tipo: 'TRANSFERENCIA',
      dataMovimentacao: new Date(),
      motivo: 'Mudança de sala',
      ...dados,
    });

  const processarMes = (ano: number, mes: number) => action('processarAmortizacaoTenantAction')({ ano, mes });

  async function criarAtivo(opts: {
    tenantId?: string;
    localizacaoId?: string;
    estado?: string;
    responsavelId?: string | null;
    valorCompra?: number;
    valorResidual?: number | null;
    dataAquisicao?: Date;
    deletedAt?: Date | null;
  } = {}): Promise<string> {
    seq++;
    const tenantId = opts.tenantId ?? TENANT;
    return (
      await db.ativo.create({
        data: {
          tenantId,
          codigoInterno: `AT-118-${sufixo}-${seq}`,
          nome: `Activo #118 ${seq}`,
          categoriaId: tenantId === TENANT ? categoriaId : categoriaOutro,
          localizacaoId: opts.localizacaoId ?? (tenantId === TENANT ? locA : locOutro),
          dataAquisicao: opts.dataAquisicao ?? new Date('2025-01-10T10:00:00Z'),
          valorCompra: opts.valorCompra ?? 48000,
          valorResidual: opts.valorResidual ?? null,
          vidaUtilAnos: 4,
          metodoAmortizacao: 'LINEAR',
          estado: opts.estado ?? 'EM_USO',
          responsavelId: opts.responsavelId ?? null,
          criadoPor: USER,
          deletedAt: opts.deletedAt ?? null,
        },
      })
    ).id;
  }

  const lerAtivo = (id: string) => db.ativo.findUnique({ where: { id } });
  const movsDe = (ativoId: string) => db.movimentacaoAtivo.findMany({ where: { ativoId } });
  const calculo = (ativoId: string, ano: number, mes: number) =>
    db.amortizacaoCalculo.findFirst({ where: { ativoId, ano, mes } });
  const calculosDoMes = (tenantId: string, ano: number, mes: number) =>
    db.amortizacaoCalculo.count({ where: { tenantId, ano, mes } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    actions = (await import('@/server/actions/inventario.actions')) as unknown as typeof actions;

    for (const [id, tag] of [[TENANT, 'a'], [OUTRO_TENANT, 'b']] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant act #118 ${tag}`, slug: `act-118-${tag}-${sufixo}`, nuit: `${sufixo}${tag === 'a' ? 3 : 4}`.slice(-9) },
      });
    }
    for (const [id, tenantId, tag] of [[USER, TENANT, 'a'], [USER2, TENANT, 'b'], [USER_OUTRO, OUTRO_TENANT, 'c']] as const) {
      await db.user.create({
        data: { id, tenantId, email: `act-118-${tag}-${sufixo}@test.mz`, nome: `Utilizador ${tag}`, keycloakSub: `kc-act-118-${tag}-${sufixo}` },
      });
    }

    const loc = async (tenantId: string, tag: string) =>
      (
        await db.localizacao.create({
          data: { tenantId, codigo: `LOC-118-${tag}-${sufixo}`, nome: `Sala ${tag}`, tipo: 'SALA', ativa: true },
        })
      ).id;
    locA = await loc(TENANT, 'A');
    locB = await loc(TENANT, 'B');
    locOutro = await loc(OUTRO_TENANT, 'X');
    const cat = async (tenantId: string, tag: string) =>
      (
        await db.categoriaAtivo.create({
          data: { tenantId, codigo: `CAT-118-${tag}-${sufixo}`, nome: `Equipamento ${tag}`, vidaUtilAnos: 4 },
        })
      ).id;
    categoriaId = await cat(TENANT, 'A');
    categoriaOutro = await cat(OUTRO_TENANT, 'X');
  }, 120_000);

  beforeEach(() => {
    sessao();
  });

  // ─── Movimentação ───────────────────────────────────────────────────────────

  describe('movimentação (transferência)', () => {
    it('de localização: grava a movimentação com a origem real e muda a localização do activo', async () => {
      const id = await criarAtivo({ localizacaoId: locA });
      const r = await movimentar({ ativoId: id, localizacaoDestinoId: locB });
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const movs = await movsDe(id);
      expect(movs).toHaveLength(1);
      expect(movs[0].tenantId).toBe(TENANT);
      expect(movs[0].tipo).toBe('TRANSFERENCIA');
      expect(movs[0].localizacaoOrigemId).toBe(locA);
      expect(movs[0].localizacaoDestinoId).toBe(locB);
      expect(movs[0].criadoPor).toBe(USER);

      const a = await lerAtivo(id);
      expect(a.localizacaoId).toBe(locB);
      expect(a.estado).toBe('EM_USO');
    });

    it('a origem não é ditada pelo cliente: ou é recusada, ou fica gravada a localização real', async () => {
      const id = await criarAtivo({ localizacaoId: locA });
      // O cliente mente sobre a origem (diz que está em B) e pede para ir para B.
      const r = await movimentar({ ativoId: id, localizacaoOrigemId: locB, localizacaoDestinoId: locB });
      const movs = await movsDe(id);
      if (r.ok) {
        expect(movs).toHaveLength(1);
        expect(movs[0].localizacaoOrigemId).toBe(locA);
        expect((await lerAtivo(id)).localizacaoId).toBe(locB);
      } else {
        expect(movs).toHaveLength(0);
        expect((await lerAtivo(id)).localizacaoId).toBe(locA);
      }
    });

    it('de responsável: grava origem/destino e muda o responsável do activo', async () => {
      const id = await criarAtivo({ responsavelId: null });
      const r1 = await movimentar({ ativoId: id, responsavelDestinoId: USER2 });
      expect(r1.ok, JSON.stringify(r1)).toBe(true);
      expect((await lerAtivo(id)).responsavelId).toBe(USER2);

      const r2 = await movimentar({ ativoId: id, responsavelDestinoId: USER });
      expect(r2.ok, JSON.stringify(r2)).toBe(true);
      expect((await lerAtivo(id)).responsavelId).toBe(USER);

      const movs = (await movsDe(id)).sort((x: any, y: any) => x.createdAt.getTime() - y.createdAt.getTime());
      expect(movs).toHaveLength(2);
      expect(movs[0].responsavelOrigemId).toBeNull();
      expect(movs[0].responsavelDestinoId).toBe(USER2);
      expect(movs[1].responsavelOrigemId).toBe(USER2);
      expect(movs[1].responsavelDestinoId).toBe(USER);
      // A localização não muda numa transferência só de responsável.
      expect((await lerAtivo(id)).localizacaoId).toBe(locA);
    });

    it('localização de destino de outro tenant → NAO_ENCONTRADO, sem escrita', async () => {
      const id = await criarAtivo({ localizacaoId: locA });
      const r = await movimentar({ ativoId: id, localizacaoDestinoId: locOutro });
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('NAO_ENCONTRADO');
      expect(await movsDe(id)).toHaveLength(0);
      expect((await lerAtivo(id)).localizacaoId).toBe(locA);
    });

    it('responsável de destino de outro tenant → NAO_ENCONTRADO, sem escrita', async () => {
      const id = await criarAtivo({ responsavelId: USER2 });
      const r = await movimentar({ ativoId: id, responsavelDestinoId: USER_OUTRO });
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('NAO_ENCONTRADO');
      expect(await movsDe(id)).toHaveLength(0);
      expect((await lerAtivo(id)).responsavelId).toBe(USER2);
    });

    it('activo de outro tenant → NAO_ENCONTRADO, sem movimentação gravada', async () => {
      const id = await criarAtivo({ localizacaoId: locA });
      sessao(undefined, OUTRO_TENANT);
      const r = await movimentar({ ativoId: id, localizacaoDestinoId: locOutro });
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('NAO_ENCONTRADO');
      expect(await movsDe(id)).toHaveLength(0);
      expect((await lerAtivo(id)).localizacaoId).toBe(locA);
    });

    it('activo BAIXADO → ATIVO_BAIXADO, sem escrita', async () => {
      const id = await criarAtivo({ localizacaoId: locA, estado: 'BAIXADO' });
      const r = await movimentar({ ativoId: id, localizacaoDestinoId: locB });
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('ATIVO_BAIXADO');
      expect(await movsDe(id)).toHaveLength(0);
      expect((await lerAtivo(id)).localizacaoId).toBe(locA);
    });

    it('transferência que não muda nada → MOVIMENTACAO_SEM_ALTERACAO, sem escrita', async () => {
      const id = await criarAtivo({ localizacaoId: locA, responsavelId: USER2 });
      for (const dados of [
        { localizacaoDestinoId: locA },
        { responsavelDestinoId: USER2 },
        { localizacaoDestinoId: locA, responsavelDestinoId: USER2 },
        {},
      ]) {
        const r = await movimentar({ ativoId: id, ...dados });
        expect(r.ok, `aceite sem alteração: ${JSON.stringify(dados)}`).toBe(false);
        expect(r.error!.code).toBe('MOVIMENTACAO_SEM_ALTERACAO');
      }
      expect(await movsDe(id)).toHaveLength(0);
    });
  });

  // ─── Amortização do mês ─────────────────────────────────────────────────────

  describe('processar amortização do mês', () => {
    // Meses fixos no passado (o relógio do teste está depois de 2026-04).
    const ANO = 2026;

    it('processa os EM_USO do tenant com o valor do serviço, sem lançar na contabilidade', async () => {
      const sem = await criarAtivo({ valorCompra: 48000, valorResidual: null });
      const com = await criarAtivo({ valorCompra: 48000, valorResidual: 8000 });
      const baixado = await criarAtivo({ estado: 'BAIXADO' });
      const apagado = await criarAtivo({ deletedAt: new Date() });
      const alheio = await criarAtivo({ tenantId: OUTRO_TENANT });

      const r = await processarMes(ANO, 3);
      expect(r.ok, JSON.stringify(r)).toBe(true);

      const cSem = await calculo(sem, ANO, 3);
      expect(cSem, 'activo EM_USO sem amortização do mês').not.toBeNull();
      expect(cSem.tenantId).toBe(TENANT);
      expect(cSem.valorAmortizacaoMensal.toFixed(2)).toBe('1000.00');
      expect(cSem.processadoPor).toBe(USER);
      expect(cSem.lancamentoContabilId).toBeNull();

      const cCom = await calculo(com, ANO, 3);
      expect(cCom.valorAmortizacaoMensal.toFixed(2)).toBe('833.33');

      expect(await calculo(baixado, ANO, 3)).toBeNull();
      expect(await calculo(apagado, ANO, 3)).toBeNull();
      expect(await calculo(alheio, ANO, 3)).toBeNull();
      expect(await calculosDoMes(OUTRO_TENANT, ANO, 3)).toBe(0);

      expect(await db.lancamento.count({ where: { tenantId: TENANT } })).toBe(0);

      // Mês seguinte acumula sobre o anterior.
      const r4 = await processarMes(ANO, 4);
      expect(r4.ok, JSON.stringify(r4)).toBe(true);
      const cSem4 = await calculo(sem, ANO, 4);
      expect(cSem4.valorAmortizadoAcumulado.toFixed(2)).toBe(cSem.valorAmortizadoAcumulado.plus(1000).toFixed(2));
    });

    it('é idempotente por mês: segunda corrida não grava nada nem acusa erro nos já processados', async () => {
      const a = await criarAtivo();
      const b = await criarAtivo({ valorResidual: 4800 });

      const r1 = await processarMes(ANO, 5);
      expect(r1.ok, JSON.stringify(r1)).toBe(true);
      const linhas = await calculosDoMes(TENANT, ANO, 5);
      expect(linhas).toBeGreaterThanOrEqual(2);
      const processados = new Set(
        (await db.amortizacaoCalculo.findMany({ where: { tenantId: TENANT, ano: ANO, mes: 5 }, select: { ativoId: true } }))
          .map((c: { ativoId: string }) => c.ativoId),
      );
      expect(processados.has(a)).toBe(true);
      expect(processados.has(b)).toBe(true);
      const antes = await calculo(a, ANO, 5);

      const r2 = await processarMes(ANO, 5);
      expect(r2.ok, JSON.stringify(r2)).toBe(true);
      expect(r2.data.processados).toBe(0);
      const errosNosProcessados = (r2.data.erros as { ativoId: string }[]).filter((e) => processados.has(e.ativoId));
      expect(errosNosProcessados, 'a segunda corrida acusa erro em activos já amortizados').toEqual([]);

      expect(await calculosDoMes(TENANT, ANO, 5)).toBe(linhas);
      const depois = await calculo(a, ANO, 5);
      expect(depois.id).toBe(antes.id);
      expect(depois.valorAmortizacaoMensal.toFixed(2)).toBe(antes.valorAmortizacaoMensal.toFixed(2));
    });

    it('activo adquirido depois do mês processado não leva amortização nesse mês', async () => {
      const tardio = await criarAtivo({ dataAquisicao: new Date('2026-06-15T10:00:00Z') });
      const r = await processarMes(ANO, 2);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect(await calculo(tardio, ANO, 2)).toBeNull();
    });

    it('mês futuro (depois do mês corrente de Maputo) → AMORTIZACAO_MES_FUTURO, nada gravado', async () => {
      await criarAtivo();
      const { ano, mes } = mesCorrenteMaputo();
      const futuro = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
      for (const alvo of [futuro, { ano: ano + 1, mes }]) {
        const r = await processarMes(alvo.ano, alvo.mes);
        expect(r.ok, `mês futuro aceite: ${alvo.ano}/${alvo.mes}`).toBe(false);
        expect(r.error!.code).toBe('AMORTIZACAO_MES_FUTURO');
        expect(await calculosDoMes(TENANT, alvo.ano, alvo.mes)).toBe(0);
      }
    });

    it('em modo de Leitura é recusada (ACESSO_LEITURA) e nada é gravado', async () => {
      await criarAtivo();
      sessao(undefined, TENANT, 'leitura');
      const r = await processarMes(ANO, 1);
      expect(r.ok).toBe(false);
      expect(r.error!.code).toBe('ACESSO_LEITURA');
      expect(await calculosDoMes(TENANT, ANO, 1)).toBe(0);
    });
  });
});
