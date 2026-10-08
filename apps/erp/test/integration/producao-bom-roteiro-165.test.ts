/**
 * Oráculo — issue #165: [produção] sem activar BOM/roteiro nem criar centros de trabalho.
 *
 * Contrato (decisão do orquestrador; as escolhas em aberto foram fechadas pelo verificador do lado
 * conservador e são contrato):
 *
 *   - BOM e roteiro: as transições JÁ existem (`transitarStatusBOMAction`,
 *     `transitarStatusRoteiroAction`, mapas `TRANSICOES_BOM`/`TRANSICOES_ROTEIRO`); a UI liga-as nos
 *     detalhes. Este oráculo tranca o comportamento de servidor de que a UI depende: activar
 *     (RASCUNHO/INATIVO → ATIVO; no roteiro também EM_REVISAO → ATIVO), desactivar (ATIVO → INATIVO),
 *     transição fora do mapa recusada como regra de negócio (`TRANSICAO_INVALIDA`, nunca
 *     `ERRO_INTERNO`) e sem mudar nada; permissões EXISTENTES `producao:bom:update` e
 *     `producao:roteiros:update`; outro tenant → `NAO_ENCONTRADO`; modo de leitura → `ACESSO_LEITURA`.
 *   - Centros de trabalho: `/producao/centros-trabalho` (lista + novo + editar) usa o serviço e as
 *     actions existentes (`criarCentroTrabalhoAction`, `actualizarCentroTrabalhoAction`, permissões
 *     existentes `producao:centros:create`/`producao:centros:update` — nenhuma permissão nova).
 *     Decisões conservadoras do verificador (o formulário novo passa a expor estes caminhos ao
 *     utilizador, por isso deixam de poder sair como «Erro interno»):
 *       · código duplicado no mesmo tenant (ao criar OU ao editar) é recusado como regra de negócio
 *         (`ok: false`, código ≠ `ERRO_INTERNO`) e nada é gravado/alterado — hoje rebenta no
 *         `@@unique([tenantId, codigo])` e chega como `ERRO_INTERNO`;
 *       · o mesmo código noutro tenant é aceite (a unicidade é por tenant);
 *       · `capacidadeHorasDia` acima de 24 h é recusada (ao criar e ao editar) e nada muda —
 *         um dia não tem mais de 24 horas; hoje 25–999 gravam-se e ≥ 1000 rebenta a coluna
 *         `Decimal(9,6)` como `ERRO_INTERNO`. 24 é aceite;
 *       · editar só um campo não mexe nos outros (em particular não reactiva um centro inactivo);
 *         desactivar é editar `ativo: false` (não há apagar).
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é dobrado
 * porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero, `createSafeAction`,
 * serviços de produção.
 *
 * ESTADO ESPERADO antes da implementação: RED só nos casos marcados «[RED]» (código duplicado ao
 * criar e ao editar; capacidade acima de 24 h). Os restantes são trancas do contrato que a UI liga
 * e devem já estar verdes — se ficarem vermelhos, a implementação partiu o servidor.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:producao-bom-roteiro-165; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

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

type Resultado = { ok: boolean; data?: unknown; error?: { code: string; message: string } };
type NomeAction =
  | 'criarCentroTrabalhoAction'
  | 'actualizarCentroTrabalhoAction'
  | 'criarEstruturaProdutoAction'
  | 'transitarStatusBOMAction'
  | 'criarRoteiroAction'
  | 'transitarStatusRoteiroAction';

describe.skipIf(skip)('Produção: activar BOM/roteiro e gerir centros de trabalho (#165) — DB efémera', () => {
  let db: any;
  // Acesso dinâmico: falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;

  const sufixo = Date.now();
  const TENANT = `tenant-pbr-165-${sufixo}`;
  const OUTRO_TENANT = `tenant-pbr-165-outro-${sufixo}`;
  const GESTOR = `user-pbr-165-gestor-${sufixo}`;
  const OUTRO = `user-pbr-165-outro-${sufixo}`;

  const PERMS = [
    'producao:centros:create',
    'producao:centros:update',
    'producao:bom:read',
    'producao:bom:create',
    'producao:bom:update',
    'producao:roteiros:read',
    'producao:roteiros:create',
    'producao:roteiros:update',
  ];
  const SO_LEITURA = ['producao:bom:read', 'producao:roteiros:read', 'producao:ver'];

  const produtos: Record<string, string> = {};
  let seq = 0;
  const unico = (p: string) => `${p}${(++seq).toString(36)}${sufixo.toString(36).slice(-5)}`.toUpperCase();

  function sessao(
    userId = GESTOR,
    permissions: string[] = PERMS,
    tenantId = TENANT,
    acesso: 'aberto' | 'leitura' = 'aberto',
  ) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso } };
  }

  function action(nome: NomeAction) {
    const fn = actions[nome];
    expect(typeof fn, `${nome} não está exportada de producao.actions.ts`).toBe('function');
    return fn;
  }

  function esperarRecusaDeNegocio(r: Resultado, oQue: string) {
    expect(r.ok, `${oQue}: foi aceite — ${JSON.stringify(r)}`).toBe(false);
    expect(r.error?.code, `${oQue}: chegou ao utilizador como «Erro interno»`).not.toBe('ERRO_INTERNO');
  }

  // ─── centros ─────────────────────────────────────────────────────────────────

  const lerCentro = (id: string) => db.centroTrabalho.findUnique({ where: { id } });
  const contarCentros = (tenantId: string, codigo: string) =>
    db.centroTrabalho.count({ where: { tenantId, codigo } });

  async function criarCentro(over: Record<string, unknown> = {}, tenantId = TENANT): Promise<string> {
    sessao(tenantId === TENANT ? GESTOR : OUTRO, PERMS, tenantId);
    const r = await action('criarCentroTrabalhoAction')({
      codigo: unico('CT'),
      nome: 'Serra de fita',
      tipo: 'MAQUINA',
      custoHora: 850,
      capacidadeHorasDia: 8,
      ...over,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const id = (r.data as { id: string }).id;
    expect(typeof id).toBe('string');
    return id;
  }

  // ─── BOM / roteiro ───────────────────────────────────────────────────────────

  const lerBom = (id: string) => db.estruturaProduto.findUnique({ where: { id } });
  const lerRoteiro = (id: string) => db.roteiro.findUnique({ where: { id } });

  async function criarBom(status?: string, tenantId = TENANT): Promise<string> {
    sessao(tenantId === TENANT ? GESTOR : OUTRO, PERMS, tenantId);
    const codigo = unico('BOM');
    const r = await action('criarEstruturaProdutoAction')({
      produtoId: produtos[tenantId],
      codigo,
      nome: `Estrutura ${codigo}`,
      versao: codigo,
      unidadeProducao: 'UN',
      ...(status ? { status } : {}),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return (r.data as { id: string }).id;
  }

  async function criarRoteiro(status?: string, tenantId = TENANT): Promise<string> {
    sessao(tenantId === TENANT ? GESTOR : OUTRO, PERMS, tenantId);
    const codigo = unico('ROT');
    const r = await action('criarRoteiroAction')({
      codigo,
      nome: `Roteiro ${codigo}`,
      versao: '1',
      ...(status ? { status } : {}),
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    return (r.data as { id: string }).id;
  }

  async function transitarBom(id: string, novoStatus: string, perms = PERMS, tenantId = TENANT, acesso: 'aberto' | 'leitura' = 'aberto') {
    sessao(GESTOR, perms, tenantId, acesso);
    return action('transitarStatusBOMAction')({ id, novoStatus });
  }

  async function transitarRoteiro(id: string, novoStatus: string, perms = PERMS, tenantId = TENANT, acesso: 'aberto' | 'leitura' = 'aberto') {
    sessao(GESTOR, perms, tenantId, acesso);
    return action('transitarStatusRoteiroAction')({ id, novoStatus });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    actions = (await import('@/server/actions/producao.actions')) as unknown as typeof actions;

    for (const [id, slug, nuit] of [
      [TENANT, `pbr-165-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `pbr-165-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    for (const [id, tenantId, tag] of [
      [GESTOR, TENANT, 'gestor'],
      [OUTRO, OUTRO_TENANT, 'outro'],
    ] as const) {
      await db.user.create({
        data: { id, tenantId, email: `pbr-165-${tag}-${sufixo}@test.mz`, nome: `User ${tag}`, keycloakSub: `kc-pbr-165-${tag}-${sufixo}` },
      });
    }
    for (const tenantId of [TENANT, OUTRO_TENANT]) {
      const cat = await db.categoriaProduto.create({ data: { tenantId, nome: `Mobiliário ${tenantId}` } });
      const p = await db.produto.create({
        data: {
          tenantId,
          sku: `MESA-165-${tenantId === TENANT ? 'A' : 'B'}-${sufixo}`,
          nome: 'Mesa de jantar',
          categoriaId: cat.id,
          unidadeMedida: 'UN',
          precoVenda: '9000.00',
          precoCompra: '6000.00',
          margemLucro: '0.33',
          stockMinimo: '0',
        },
        select: { id: true },
      });
      produtos[tenantId] = p.id;
    }
  }, 120_000);

  // ═══ Centros de trabalho ═════════════════════════════════════════════════════

  describe('centros de trabalho', () => {
    it('criar grava todos os campos no tenant da sessão e nasce activo', async () => {
      const codigo = unico('CT');
      const id = await criarCentro({
        codigo,
        nome: 'Linha de montagem 1',
        tipo: 'LINHA',
        descricao: 'Montagem final de mesas',
        custoHora: 1250.5,
        capacidadeHorasDia: 16,
      });
      const c = await lerCentro(id);
      expect(c.tenantId).toBe(TENANT);
      expect(c.codigo).toBe(codigo);
      expect(c.nome).toBe('Linha de montagem 1');
      expect(c.tipo).toBe('LINHA');
      expect(c.descricao).toBe('Montagem final de mesas');
      expect(c.custoHora.toString()).toBe('1250.5');
      expect(Number(c.capacidadeHorasDia)).toBe(16);
      expect(c.ativo).toBe(true);
    });

    it('[RED] código duplicado no mesmo tenant é recusado como regra de negócio e não grava segunda linha', async () => {
      const codigo = unico('CT');
      await criarCentro({ codigo });
      sessao();
      const r = await action('criarCentroTrabalhoAction')({
        codigo,
        nome: 'Outra serra',
        tipo: 'MAQUINA',
        custoHora: 100,
      });
      esperarRecusaDeNegocio(r, 'código duplicado ao criar');
      expect(await contarCentros(TENANT, codigo)).toBe(1);
    });

    it('o mesmo código noutro tenant é aceite (unicidade por tenant)', async () => {
      const codigo = unico('CT');
      await criarCentro({ codigo });
      await criarCentro({ codigo }, OUTRO_TENANT);
      expect(await contarCentros(TENANT, codigo)).toBe(1);
      expect(await contarCentros(OUTRO_TENANT, codigo)).toBe(1);
    });

    it('[RED] capacidade acima de 24 h/dia é recusada ao criar; 24 h é aceite', async () => {
      for (const capacidadeHorasDia of [25, 1000]) {
        const codigo = unico('CT');
        sessao();
        const r = await action('criarCentroTrabalhoAction')({
          codigo,
          nome: 'Forno',
          tipo: 'MAQUINA',
          custoHora: 100,
          capacidadeHorasDia,
        });
        esperarRecusaDeNegocio(r, `capacidade ${capacidadeHorasDia} h/dia ao criar`);
        expect(await contarCentros(TENANT, codigo)).toBe(0);
      }
      const id = await criarCentro({ capacidadeHorasDia: 24 });
      expect(Number((await lerCentro(id)).capacidadeHorasDia)).toBe(24);
    });

    it('editar altera os campos dados e não mexe nos outros', async () => {
      const id = await criarCentro({ nome: 'Torno', tipo: 'MAQUINA', custoHora: 500, capacidadeHorasDia: 8, descricao: 'Torno CNC' });
      const antes = await lerCentro(id);
      sessao();
      const r = await action('actualizarCentroTrabalhoAction')({ id, data: { nome: 'Torno CNC 2', custoHora: 650 } });
      expect(r.ok, JSON.stringify(r)).toBe(true);
      const c = await lerCentro(id);
      expect(c.nome).toBe('Torno CNC 2');
      expect(c.custoHora.toString()).toBe('650');
      expect(c.codigo).toBe(antes.codigo);
      expect(c.tipo).toBe('MAQUINA');
      expect(c.descricao).toBe('Torno CNC');
      expect(Number(c.capacidadeHorasDia)).toBe(8);
      expect(c.ativo).toBe(true);
    });

    it('desactivar é editar ativo:false; editar só o nome depois não o reactiva; reactivar volta a true', async () => {
      const id = await criarCentro();
      sessao();
      const fn = action('actualizarCentroTrabalhoAction');
      expect((await fn({ id, data: { ativo: false } })).ok).toBe(true);
      expect((await lerCentro(id)).ativo).toBe(false);

      expect((await fn({ id, data: { nome: 'Serra de fita (parada)' } })).ok).toBe(true);
      const c = await lerCentro(id);
      expect(c.nome).toBe('Serra de fita (parada)');
      expect(c.ativo, 'editar só o nome reactivou o centro').toBe(false);

      expect((await fn({ id, data: { ativo: true } })).ok).toBe(true);
      expect((await lerCentro(id)).ativo).toBe(true);
    });

    it('[RED] editar para o código de outro centro do mesmo tenant é recusado e nada muda', async () => {
      const codigoA = unico('CT');
      await criarCentro({ codigo: codigoA });
      const idB = await criarCentro({ nome: 'Centro B' });
      const antes = await lerCentro(idB);

      sessao();
      const r = await action('actualizarCentroTrabalhoAction')({ id: idB, data: { codigo: codigoA, nome: 'Renomeado' } });
      esperarRecusaDeNegocio(r, 'código duplicado ao editar');

      const c = await lerCentro(idB);
      expect(c.codigo).toBe(antes.codigo);
      expect(c.nome).toBe('Centro B');
      expect(await contarCentros(TENANT, codigoA)).toBe(1);
    });

    it('[RED] editar a capacidade para mais de 24 h/dia é recusado e nada muda', async () => {
      const id = await criarCentro({ capacidadeHorasDia: 8 });
      sessao();
      const r = await action('actualizarCentroTrabalhoAction')({ id, data: { capacidadeHorasDia: 30 } });
      esperarRecusaDeNegocio(r, 'capacidade 30 h/dia ao editar');
      expect(Number((await lerCentro(id)).capacidadeHorasDia)).toBe(8);
    });

    it('sem producao:centros:create/update → SEM_PERMISSAO e nada muda', async () => {
      const id = await criarCentro({ nome: 'Intocável' });
      const codigo = unico('CT');
      sessao(GESTOR, SO_LEITURA);
      const cr = await action('criarCentroTrabalhoAction')({ codigo, nome: 'X', tipo: 'PESSOA', custoHora: 1 });
      expect(cr.ok).toBe(false);
      expect(cr.error?.code).toBe('SEM_PERMISSAO');
      expect(await contarCentros(TENANT, codigo)).toBe(0);

      const up = await action('actualizarCentroTrabalhoAction')({ id, data: { nome: 'Mudado' } });
      expect(up.ok).toBe(false);
      expect(up.error?.code).toBe('SEM_PERMISSAO');
      expect((await lerCentro(id)).nome).toBe('Intocável');
    });

    it('centro de outro tenant → NAO_ENCONTRADO ao editar; nada muda', async () => {
      const idOutro = await criarCentro({ nome: 'Do outro tenant' }, OUTRO_TENANT);
      sessao();
      const r = await action('actualizarCentroTrabalhoAction')({ id: idOutro, data: { nome: 'Sequestrado', ativo: false } });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('NAO_ENCONTRADO');
      const c = await lerCentro(idOutro);
      expect(c.nome).toBe('Do outro tenant');
      expect(c.ativo).toBe(true);
    });

    it('tenant em modo de leitura → ACESSO_LEITURA ao criar e editar; nada muda', async () => {
      const id = await criarCentro({ nome: 'Em leitura' });
      const codigo = unico('CT');
      sessao(GESTOR, PERMS, TENANT, 'leitura');
      const cr = await action('criarCentroTrabalhoAction')({ codigo, nome: 'X', tipo: 'CELULA', custoHora: 1 });
      expect(cr.ok).toBe(false);
      expect(cr.error?.code).toBe('ACESSO_LEITURA');
      const up = await action('actualizarCentroTrabalhoAction')({ id, data: { ativo: false } });
      expect(up.ok).toBe(false);
      expect(up.error?.code).toBe('ACESSO_LEITURA');
      expect(await contarCentros(TENANT, codigo)).toBe(0);
      expect((await lerCentro(id)).ativo).toBe(true);
    });

    it('a listagem do serviço mostra os centros do tenant (activos e inactivos) e nunca os de outro tenant', async () => {
      const idAtivo = await criarCentro({ nome: 'Listado activo' });
      const idInativo = await criarCentro({ nome: 'Listado inactivo' });
      sessao();
      expect((await action('actualizarCentroTrabalhoAction')({ id: idInativo, data: { ativo: false } })).ok).toBe(true);
      const idOutro = await criarCentro({ nome: 'Listado noutro tenant' }, OUTRO_TENANT);

      const { CentroTrabalhoService } = await import('@/server/services/pessoas-projetos/producao.service');
      const { runWithTenantContext } = await import('@/server/db/tenant-extension');
      const ctx = { tenantId: TENANT, userId: GESTOR };
      const res = await runWithTenantContext(ctx, () => CentroTrabalhoService.listar({ take: 100 }, ctx));
      const ids = (res.items as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(idAtivo);
      expect(ids).toContain(idInativo);
      expect(ids).not.toContain(idOutro);
    });
  });

  // ═══ BOM ═════════════════════════════════════════════════════════════════════

  describe('estrutura de produto (BOM): activar / desactivar', () => {
    it('RASCUNHO → ATIVO → INATIVO → ATIVO pela transitarStatusBOMAction', async () => {
      const id = await criarBom();
      expect((await lerBom(id)).status).toBe('RASCUNHO');
      for (const alvo of ['ATIVO', 'INATIVO', 'ATIVO']) {
        const r = await transitarBom(id, alvo);
        expect(r.ok, `→ ${alvo}: ${JSON.stringify(r)}`).toBe(true);
        expect((await lerBom(id)).status).toBe(alvo);
      }
    });

    it.each([
      ['SUBSTITUIDO', 'ATIVO', ['ATIVO', 'SUBSTITUIDO']],
      ['SUBSTITUIDO', 'INATIVO', ['ATIVO', 'SUBSTITUIDO']],
      ['INATIVO', 'INATIVO', ['INATIVO']],
      ['ATIVO', 'ATIVO', ['ATIVO']],
      ['RASCUNHO', 'XPTO', [] as string[]],
    ])('em %s, transitar para %s é recusado (TRANSICAO_INVALIDA) e o estado fica', async (estado, alvo, caminho) => {
      const id = await criarBom();
      for (const s of caminho) expect((await transitarBom(id, s)).ok).toBe(true);
      expect((await lerBom(id)).status).toBe(estado);

      const r = await transitarBom(id, alvo);
      esperarRecusaDeNegocio(r, `BOM ${estado} → ${alvo}`);
      expect(r.error?.code).toBe('TRANSICAO_INVALIDA');
      expect((await lerBom(id)).status).toBe(estado);
    });

    it('sem producao:bom:update → SEM_PERMISSAO; outro tenant → NAO_ENCONTRADO; leitura → ACESSO_LEITURA', async () => {
      const id = await criarBom();
      const semPerm = await transitarBom(id, 'ATIVO', SO_LEITURA);
      expect(semPerm.ok).toBe(false);
      expect(semPerm.error?.code).toBe('SEM_PERMISSAO');

      const leitura = await transitarBom(id, 'ATIVO', PERMS, TENANT, 'leitura');
      expect(leitura.ok).toBe(false);
      expect(leitura.error?.code).toBe('ACESSO_LEITURA');
      expect((await lerBom(id)).status).toBe('RASCUNHO');

      const idOutro = await criarBom(undefined, OUTRO_TENANT);
      const cross = await transitarBom(idOutro, 'ATIVO');
      expect(cross.ok).toBe(false);
      expect(cross.error?.code).toBe('NAO_ENCONTRADO');
      expect((await lerBom(idOutro)).status).toBe('RASCUNHO');
    });
  });

  // ═══ Roteiro ═════════════════════════════════════════════════════════════════

  describe('roteiro: activar / desactivar', () => {
    it('RASCUNHO → ATIVO → INATIVO → ATIVO pela transitarStatusRoteiroAction', async () => {
      const id = await criarRoteiro();
      expect((await lerRoteiro(id)).status).toBe('RASCUNHO');
      for (const alvo of ['ATIVO', 'INATIVO', 'ATIVO']) {
        const r = await transitarRoteiro(id, alvo);
        expect(r.ok, `→ ${alvo}: ${JSON.stringify(r)}`).toBe(true);
        expect((await lerRoteiro(id)).status).toBe(alvo);
      }
    });

    it('EM_REVISAO → ATIVO é activar', async () => {
      const id = await criarRoteiro();
      expect((await transitarRoteiro(id, 'EM_REVISAO')).ok).toBe(true);
      const r = await transitarRoteiro(id, 'ATIVO');
      expect(r.ok, JSON.stringify(r)).toBe(true);
      expect((await lerRoteiro(id)).status).toBe('ATIVO');
    });

    it.each([
      ['RASCUNHO', 'INATIVO', [] as string[]],
      ['SUBSTITUIDO', 'ATIVO', ['ATIVO', 'SUBSTITUIDO']],
      ['INATIVO', 'INATIVO', ['ATIVO', 'INATIVO']],
      ['ATIVO', 'XPTO', ['ATIVO']],
    ])('em %s, transitar para %s é recusado (TRANSICAO_INVALIDA) e o estado fica', async (estado, alvo, caminho) => {
      const id = await criarRoteiro();
      for (const s of caminho) expect((await transitarRoteiro(id, s)).ok).toBe(true);
      expect((await lerRoteiro(id)).status).toBe(estado);

      const r = await transitarRoteiro(id, alvo);
      esperarRecusaDeNegocio(r, `roteiro ${estado} → ${alvo}`);
      expect(r.error?.code).toBe('TRANSICAO_INVALIDA');
      expect((await lerRoteiro(id)).status).toBe(estado);
    });

    it('sem producao:roteiros:update → SEM_PERMISSAO; outro tenant → NAO_ENCONTRADO; leitura → ACESSO_LEITURA', async () => {
      const id = await criarRoteiro();
      const semPerm = await transitarRoteiro(id, 'ATIVO', SO_LEITURA);
      expect(semPerm.ok).toBe(false);
      expect(semPerm.error?.code).toBe('SEM_PERMISSAO');

      const leitura = await transitarRoteiro(id, 'ATIVO', PERMS, TENANT, 'leitura');
      expect(leitura.ok).toBe(false);
      expect(leitura.error?.code).toBe('ACESSO_LEITURA');
      expect((await lerRoteiro(id)).status).toBe('RASCUNHO');

      const idOutro = await criarRoteiro(undefined, OUTRO_TENANT);
      const cross = await transitarRoteiro(idOutro, 'ATIVO');
      expect(cross.ok).toBe(false);
      expect(cross.error?.code).toBe('NAO_ENCONTRADO');
      expect((await lerRoteiro(idOutro)).status).toBe('RASCUNHO');
    });
  });
});
