/**
 * Oráculo — issue #117: o inventário físico de activos só cria e consulta (fica sempre «Planeado»).
 *
 * O serviço (`inventario-fisico.service.ts`) já tem `transitarStatus` e `registarContagem`, e as
 * actions (`transitarStatusInventarioFisicoAction`, `registarContagemAction`) já existem; falta a
 * UI no detalhe (provada em `e2e/51-activos-inventario-fisico-117.spec.ts`). Este ficheiro tranca
 * o comportamento de servidor de que essa UI depende, pelas actions reais:
 *
 * Contrato (decisão do orquestrador; a opção conservadora escolhida pelo verificador vai marcada):
 *   - a máquina `TRANSICOES_INVENTARIO_FISICO` não muda: PLANEJADO → AGENDADO → EM_ANDAMENTO
 *     («iniciar»), EM_ANDAMENTO ⇄ PAUSADO, EM_ANDAMENTO → CONCLUIDO («concluir»), e CANCELADO a partir
 *     de qualquer estado não terminal («cancelar»); PLANEJADO → EM_ANDAMENTO directo é recusado;
 *   - iniciar gera uma contagem por activo do âmbito (localizações/categorias incluídas; activos
 *     apagados ficam de fora), com o esperado (localização, estado) fotografado;
 *   - registar contagem: encontrado / não encontrado / estado encontrado; discrepância quando não
 *     encontrado ou estado diferente; totais do inventário actualizados; `contadoPorId` = sessão;
 *   - concluir com activos por contar → `CONTAGENS_PENDENTES`, e o inventário fica EM_ANDAMENTO;
 *   - [CONSERVADORA — nova] só se regista contagem com o inventário EM_ANDAMENTO: em PAUSADO,
 *     CONCLUIDO ou CANCELADO a action devolve `INVENTARIO_NAO_EM_ANDAMENTO` e nada muda (nem o
 *     item, nem os totais). Sem isto, um ecrã de contagem reescreve o resultado de um inventário
 *     concluído;
 *   - item de outro tenant → `NAO_ENCONTRADO`, sem escrita.
 *
 * Sessão (`@/lib/auth`) é o único duplo, mutável por `vi.hoisted`; `next/cache` é dobrado porque
 * o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero, `createSafeAction`,
 * serviço. Catálogo de activos e localizações escrito pelo client cru (não são documentos).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:activos-inventario-fisico-117; um agente de implementação que o
 * altere é BLOCKER.
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

describe.skipIf(skip)('Inventário físico de activos (#117) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any;
  // Acesso dinâmico: falha o caso, não o ficheiro.
  let actions: Record<string, Action>;

  const sufixo = Date.now();
  const TENANT = `tenant-invf-117-${sufixo}`;
  const OUTRO_TENANT = `tenant-invf-117-b-${sufixo}`;
  const USER = `cuser117${sufixo}a`;
  const ctx = { tenantId: TENANT, userId: USER };

  let locA: string; // no âmbito
  let locB: string; // fora do âmbito
  let categoriaId: string;
  const ativos: Record<'emUso' | 'novo' | 'manut' | 'fora' | 'apagado', string> = {} as never;
  let seq = 0;

  function sessao(permissions: string[] = ['inventario:write']) {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso: 'aberto' } };
  }

  function action(nome: string): Action {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de inventario.actions.ts`).toBe('function');
    return fn;
  }

  const transitar = (inventarioId: string, novoStatus: string, extra: Record<string, unknown> = {}) =>
    action('transitarStatusInventarioFisicoAction')({ inventarioId, novoStatus, ...extra });

  const contar = (itemId: string, dados: Record<string, unknown>) =>
    action('registarContagemAction')({ itemId, ...dados });

  async function criarInventario(): Promise<string> {
    seq++;
    const inv = await runCtx(ctx, () =>
      svc.inventarioFisicoService.criarInventario(
        {
          codigo: `INVF-117-${sufixo}-${seq}`,
          titulo: `Inventário #117 ${seq}`,
          dataInicio: new Date(),
          responsavelId: USER,
          localizacoesIncluidas: [locA],
          categoriasIncluidas: [],
        },
        ctx,
      ),
    );
    return (inv as { id: string }).id;
  }

  /** Cria e leva até EM_ANDAMENTO pelas actions; devolve ids das contagens por activo. */
  async function iniciado(): Promise<{ id: string; itens: Record<string, string> }> {
    const id = await criarInventario();
    const r1 = await transitar(id, 'AGENDADO');
    expect(r1.ok, JSON.stringify(r1)).toBe(true);
    const r2 = await transitar(id, 'EM_ANDAMENTO');
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    const cs: any[] = await db.contagemInventario.findMany({ where: { tenantId: TENANT, inventarioId: id } });
    return { id, itens: Object.fromEntries(cs.map((c) => [c.ativoId, c.id])) };
  }

  const lerInv = (id: string) => db.inventarioFisico.findUnique({ where: { id } });
  const lerItem = (id: string) => db.contagemInventario.findUnique({ where: { id } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    svc = await import('@/server/services/inventario/inventario-fisico.service');
    actions = (await import('@/server/actions/inventario.actions')) as unknown as typeof actions;

    for (const [id, tag] of [[TENANT, 'a'], [OUTRO_TENANT, 'b']] as const) {
      await db.tenant.create({
        data: { id, nome: `Tenant invf #117 ${tag}`, slug: `invf-117-${tag}-${sufixo}`, nuit: `${sufixo}${tag === 'a' ? 1 : 2}`.slice(-9) },
      });
    }
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `invf-117-${sufixo}@test.mz`, nome: 'Contador', keycloakSub: `kc-invf-117-${sufixo}` },
    });

    const loc = async (tenantId: string, tag: string) =>
      (
        await db.localizacao.create({
          data: { tenantId, codigo: `LOC-117-${tag}-${sufixo}`, nome: `Sala ${tag}`, tipo: 'SALA', ativa: true },
        })
      ).id;
    locA = await loc(TENANT, 'A');
    locB = await loc(TENANT, 'B');
    categoriaId = (
      await db.categoriaAtivo.create({
        data: { tenantId: TENANT, codigo: `CAT-117-${sufixo}`, nome: 'Equipamento informático', vidaUtilAnos: 4 },
      })
    ).id;

    const ativo = async (tag: string, localizacaoId: string, estado: string, deletedAt: Date | null = null) =>
      (
        await db.ativo.create({
          data: {
            tenantId: TENANT,
            codigoInterno: `AT-117-${tag}-${sufixo}`,
            nome: `Activo ${tag}`,
            categoriaId,
            localizacaoId,
            dataAquisicao: new Date('2025-01-10T10:00:00Z'),
            valorCompra: 50000,
            vidaUtilAnos: 4,
            estado,
            criadoPor: USER,
            deletedAt,
          },
        })
      ).id;
    ativos.emUso = await ativo('EMUSO', locA, 'EM_USO');
    ativos.novo = await ativo('NOVO', locA, 'NOVO');
    ativos.manut = await ativo('MANUT', locA, 'EM_MANUTENCAO');
    ativos.fora = await ativo('FORA', locB, 'EM_USO');
    ativos.apagado = await ativo('APAGADO', locA, 'EM_USO', new Date());
  }, 120_000);

  beforeEach(() => {
    sessao();
  });

  // ─── Transições (máquina existente) ─────────────────────────────────────────

  it('PLANEJADO → EM_ANDAMENTO directo é recusado; a máquina não muda', async () => {
    const id = await criarInventario();
    const r = await transitar(id, 'EM_ANDAMENTO');
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('TRANSICAO_INVALIDA');
    expect((await lerInv(id)).status).toBe('PLANEJADO');
    expect(await db.contagemInventario.count({ where: { inventarioId: id } })).toBe(0);
  });

  it('iniciar (AGENDADO → EM_ANDAMENTO) gera uma contagem por activo do âmbito, com o esperado fotografado', async () => {
    const { id, itens } = await iniciado();
    const inv = await lerInv(id);
    expect(inv.status).toBe('EM_ANDAMENTO');
    expect(inv.totalAtivosEsperados).toBe(3);
    expect(Object.keys(itens).sort()).toEqual([ativos.emUso, ativos.novo, ativos.manut].sort());
    expect(itens[ativos.fora]).toBeUndefined();
    expect(itens[ativos.apagado]).toBeUndefined();

    const c = await lerItem(itens[ativos.manut]);
    expect(c.localizacaoEsperadaId).toBe(locA);
    expect(c.estadoEsperado).toBe('EM_MANUTENCAO');
    expect(c.dataContagem).toBeNull();
  });

  // ─── Contagem ───────────────────────────────────────────────────────────────

  it('regista encontrado / não encontrado / estado diferente; discrepâncias e totais certos', async () => {
    const { id, itens } = await iniciado();

    const r1 = await contar(itens[ativos.emUso], { encontrado: true, estadoEncontrado: 'EM_USO' });
    expect(r1.ok, JSON.stringify(r1)).toBe(true);
    const r2 = await contar(itens[ativos.novo], { encontrado: false, observacoesContagem: 'Não está na sala' });
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
    const r3 = await contar(itens[ativos.manut], { encontrado: true, estadoEncontrado: 'OBSOLETO' });
    expect(r3.ok, JSON.stringify(r3)).toBe(true);

    const a = await lerItem(itens[ativos.emUso]);
    expect(a.encontrado).toBe(true);
    expect(a.temDiscrepancia).toBe(false);
    expect(a.contadoPorId).toBe(USER);
    expect(a.dataContagem).not.toBeNull();

    const b = await lerItem(itens[ativos.novo]);
    expect(b.encontrado).toBe(false);
    expect(b.temDiscrepancia).toBe(true);
    expect(b.observacoesContagem).toBe('Não está na sala');

    const m = await lerItem(itens[ativos.manut]);
    expect(m.estadoEncontrado).toBe('OBSOLETO');
    expect(m.temDiscrepancia).toBe(true);

    const inv = await lerInv(id);
    expect(inv.totalAtivosContados).toBe(3);
    expect(inv.totalDiscrepancias).toBe(2);
  });

  it('recontar um activo corrige a discrepância e não conta duas vezes', async () => {
    const { id, itens } = await iniciado();
    expect((await contar(itens[ativos.novo], { encontrado: false })).ok).toBe(true);
    expect((await contar(itens[ativos.novo], { encontrado: true, estadoEncontrado: 'NOVO' })).ok).toBe(true);
    expect((await lerItem(itens[ativos.novo])).temDiscrepancia).toBe(false);
    const inv = await lerInv(id);
    expect(inv.totalAtivosContados).toBe(1);
    expect(inv.totalDiscrepancias).toBe(0);
  });

  // ─── Concluir ───────────────────────────────────────────────────────────────

  it('concluir com activos por contar é recusado (CONTAGENS_PENDENTES) e fica EM_ANDAMENTO', async () => {
    const { id, itens } = await iniciado();
    await contar(itens[ativos.emUso], { encontrado: true });
    const r = await transitar(id, 'CONCLUIDO');
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('CONTAGENS_PENDENTES');
    const inv = await lerInv(id);
    expect(inv.status).toBe('EM_ANDAMENTO');
    expect(inv.dataConclusao).toBeNull();
  });

  it('concluir com tudo contado → CONCLUIDO com data de conclusão; depois só é terminal', async () => {
    const { id, itens } = await iniciado();
    for (const itemId of Object.values(itens)) {
      expect((await contar(itemId, { encontrado: true })).ok).toBe(true);
    }
    const r = await transitar(id, 'CONCLUIDO');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const inv = await lerInv(id);
    expect(inv.status).toBe('CONCLUIDO');
    expect(inv.dataConclusao).not.toBeNull();

    const r2 = await transitar(id, 'CANCELADO');
    expect(r2.ok).toBe(false);
    expect(r2.error!.code).toBe('TRANSICAO_INVALIDA');
  });

  // ─── Cancelar ───────────────────────────────────────────────────────────────

  it('cancelar a partir de PLANEJADO grava o motivo; CANCELADO é terminal', async () => {
    const id = await criarInventario();
    const r = await transitar(id, 'CANCELADO', { motivoCancelamento: 'Sala em obras' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const inv = await lerInv(id);
    expect(inv.status).toBe('CANCELADO');
    expect(inv.motivoCancelamento).toBe('Sala em obras');
    expect((await transitar(id, 'AGENDADO')).ok).toBe(false);
  });

  // ─── Contagem só EM_ANDAMENTO (contrato novo — RED antes da implementação) ───

  async function contagemRecusada(id: string, itemId: string) {
    const antesItem = await lerItem(itemId);
    const antesInv = await lerInv(id);
    const r = await contar(itemId, { encontrado: false, observacoesContagem: 'tentativa fora de prazo' });
    expect(r.ok, `contagem aceite com o inventário ${antesInv.status}`).toBe(false);
    expect(r.error!.code).toBe('INVENTARIO_NAO_EM_ANDAMENTO');
    const depoisItem = await lerItem(itemId);
    expect(depoisItem.encontrado).toBe(antesItem.encontrado);
    expect(depoisItem.temDiscrepancia).toBe(antesItem.temDiscrepancia);
    expect(depoisItem.observacoesContagem).toBe(antesItem.observacoesContagem);
    expect(depoisItem.dataContagem?.getTime() ?? null).toBe(antesItem.dataContagem?.getTime() ?? null);
    const depoisInv = await lerInv(id);
    expect(depoisInv.totalAtivosContados).toBe(antesInv.totalAtivosContados);
    expect(depoisInv.totalDiscrepancias).toBe(antesInv.totalDiscrepancias);
  }

  it('inventário CONCLUIDO: registar contagem é recusado e o resultado não muda', async () => {
    const { id, itens } = await iniciado();
    for (const itemId of Object.values(itens)) await contar(itemId, { encontrado: true });
    expect((await transitar(id, 'CONCLUIDO')).ok).toBe(true);
    await contagemRecusada(id, itens[ativos.emUso]);
  });

  it('inventário PAUSADO: recusa; ao retomar aceita, sem duplicar contagens nem perder as feitas', async () => {
    const { id, itens } = await iniciado();
    expect((await contar(itens[ativos.emUso], { encontrado: true })).ok).toBe(true);
    expect((await transitar(id, 'PAUSADO')).ok).toBe(true);

    await contagemRecusada(id, itens[ativos.novo]);

    expect((await transitar(id, 'EM_ANDAMENTO')).ok).toBe(true);
    expect(await db.contagemInventario.count({ where: { inventarioId: id } })).toBe(3);
    expect((await lerItem(itens[ativos.emUso])).encontrado).toBe(true);
    const r = await contar(itens[ativos.novo], { encontrado: true });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect((await lerInv(id)).totalAtivosContados).toBe(2);
  });

  it('inventário CANCELADO (depois de iniciado): registar contagem é recusado', async () => {
    const { id, itens } = await iniciado();
    expect((await transitar(id, 'CANCELADO', { motivoCancelamento: 'Desistência' })).ok).toBe(true);
    await contagemRecusada(id, itens[ativos.manut]);
  });

  // ─── Isolamento ─────────────────────────────────────────────────────────────

  it('item de contagem de outro tenant → NAO_ENCONTRADO, sem escrita', async () => {
    const { itens } = await iniciado();
    h.sessao = { user: { id: USER, tenantId: OUTRO_TENANT, permissions: ['inventario:write'], acesso: 'aberto' } };
    const r = await contar(itens[ativos.emUso], { encontrado: false });
    expect(r.ok).toBe(false);
    expect(r.error!.code).toBe('NAO_ENCONTRADO');
    expect((await lerItem(itens[ativos.emUso])).dataContagem).toBeNull();
  });
});
