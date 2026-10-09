/**
 * Oráculo — issue #136: o motivo da desactivação de cliente não é enviado ao servidor.
 *
 * Contrato (decidido pelo orquestrador; a forma de gravar escolhida pelo verificador como a
 * mais conservadora das duas que o contrato admite — «campo existente ou histórico»):
 *   - a action `desativarCliente` (clientes.actions.ts) aceita `{ id, motivo? }`; `motivo` é
 *     opcional, aparado (trim), no máximo 500 caracteres (o `maxLength` que a UI já tinha) —
 *     acima disso a action recusa com `VALIDACAO` e NADA muda;
 *   - quando há motivo, a desactivação grava, NA MESMA transacção, UMA entrada append-only no
 *     histórico do cliente (`HistoricoTransacao`, escrita pelo contrato
 *     `registarHistoricoTransacaoEmTx`): `tipo` AJUSTE, `valor` 0, `status` CONCLUIDO,
 *     `userId` do utilizador da sessão, `descricao` que contém o motivo aparado. Nenhum campo
 *     existente do cliente (ex.: `observacoes`) é reescrito;
 *   - a entrada é legível depois da desactivação por `clienteService.obterHistorico`;
 *   - sem motivo (ou só espaços) a desactivação continua a funcionar como antes;
 *   - uma desactivação recusada (Consumidor Final, outro tenant, modo de Leitura, sem
 *     permissão, motivo longo) não deixa entrada nenhuma no histórico.
 *
 * Porquê o histórico e não `observacoes`: é append-only (não altera dado nenhum já escrito pelo
 * utilizador), não precisa de migração, e `obterHistorico` não filtra `deletedAt` — o motivo
 * continua consultável depois de o cliente sair das listagens.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache`
 * é dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó C:cliente-motivo-desactivacao-136; um agente de implementação
 * que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: {
      id: string;
      tenantId: string;
      permissions: string[];
      acesso: 'aberto' | 'leitura' | 'fechado';
      emailVerificado: boolean;
    };
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

describe.skipIf(skip)('Motivo da desactivação de cliente (#136) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  // Acesso dinâmico: a action ainda ignora o motivo — falha o caso, não o ficheiro.
  let actions: Record<string, (input: unknown) => Promise<Resultado>>;
  let clienteService: any;
  let CF_CODIGO: string;

  const sufixo = Date.now();
  const TENANT = `tenant-cli-mot-136-${sufixo}`;
  const TENANT_B = `tenant-cli-mot-136-b-${sufixo}`;
  const USER = `user-cli-mot-136-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let seq = 0;

  function sessao(permissions: string[], acesso: 'aberto' | 'leitura' = 'aberto') {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions, acesso, emailVerificado: true } };
  }

  async function novoCliente(tenantId: string, rotulo: string, extra: Record<string, unknown> = {}) {
    seq += 1;
    return db.cliente.create({
      data: {
        tenantId,
        codigo: `CLI-136-${rotulo}-${seq}`,
        nome: `Cliente 136 ${rotulo}`,
        tipo: 'JURIDICA',
        nuit: `4${String(sufixo).slice(-6)}${String(seq).padStart(2, '0')}`,
        email: `cli-136-${seq}-${sufixo}@test.mz`,
        telefone: '840000000',
        ...extra,
      },
    });
  }

  const ler = (id: string) => db.cliente.findUnique({ where: { id } });
  const historico = (clienteId: string) =>
    db.historicoTransacao.findMany({ where: { clienteId }, orderBy: { createdAt: 'asc' } });

  function desativar(input: unknown): Promise<Resultado> {
    const fn = actions.desativarCliente;
    expect(typeof fn, 'desativarCliente não está exportada de clientes.actions.ts').toBe('function');
    return fn(input);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    actions = (await import('@/server/actions/clientes.actions')) as unknown as typeof actions;
    ({ clienteService } = await import('@/server/services/comercial/cliente.service'));
    ({
      CLIENTE_CONSUMIDOR_FINAL: { codigo: CF_CODIGO },
    } = await import('@/lib/consumidor-final'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant clientes 136', slug: `cli-mot-136-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `cli-mot-136-${sufixo}@test.mz`, nome: 'Gestor', keycloakSub: `kc-cli-mot-136-${sufixo}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    await db.tenant.create({
      data: { id: TENANT_B, nome: 'Tenant clientes 136 B', slug: `cli-mot-136-b-${sufixo}`, nuit: `${sufixo + 1}`.slice(-9) },
    });
  }, 90_000);

  beforeEach(() => {
    sessao(['clientes:ver', 'clientes:desativar']);
  });

  // -------------------------------------------------------------------------
  // O motivo chega ao servidor e fica gravado
  // -------------------------------------------------------------------------

  it('desactivar com motivo: o cliente fica INATIVO e o histórico tem UMA entrada AJUSTE de 0 MT com o motivo aparado', async () => {
    const c = await novoCliente(TENANT, 'COM-MOTIVO', { observacoes: 'Nota original do utilizador' });
    const antes = new Date(Date.now() - 1000);

    const r = await desativar({ id: c.id, motivo: '   Encerrou a actividade em Maputo   ' });
    expect(r.ok, `a desactivação tinha de passar: ${JSON.stringify(r.error)}`).toBe(true);

    const depois = await ler(c.id);
    expect(depois.deletedAt).not.toBeNull();
    expect(depois.status).toBe('INATIVO');
    // Nenhum campo existente é reescrito com o motivo.
    expect(depois.observacoes).toBe('Nota original do utilizador');

    const linhas = await historico(c.id);
    expect(linhas, 'o motivo tem de ficar no histórico do cliente').toHaveLength(1);
    const e = linhas[0];
    expect(e.tenantId).toBe(TENANT);
    expect(e.tipo).toBe('AJUSTE');
    expect(e.status).toBe('CONCLUIDO');
    expect(String(e.valor)).toMatch(/^0(\.0+)?$/);
    expect(e.userId).toBe(USER);
    expect(e.descricao).toContain('Encerrou a actividade em Maputo');
    expect(e.descricao).not.toContain('   Encerrou');
    expect(typeof e.referencia).toBe('string');
    expect(e.referencia.length).toBeGreaterThan(0);
    expect(e.dataTransacao.getTime()).toBeGreaterThanOrEqual(antes.getTime());
    expect(e.dataTransacao.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('o motivo continua consultável pelo serviço depois de o cliente estar desactivado', async () => {
    const c = await novoCliente(TENANT, 'LEGIVEL');
    const r = await desativar({ id: c.id, motivo: 'Mudou de fornecedor' });
    expect(r.ok, JSON.stringify(r.error)).toBe(true);

    const pagina = await noCtx<{ items: Array<{ descricao: string }>; nextCursor: string | null }>(() =>
      clienteService.obterHistorico(c.id, {}, ctx),
    );
    const descricoes = pagina.items.map((i) => i.descricao);
    expect(descricoes.some((d: string) => d.includes('Mudou de fornecedor')), JSON.stringify(descricoes)).toBe(true);
  });

  it('motivo com exactamente 500 caracteres passa e fica gravado inteiro', async () => {
    const c = await novoCliente(TENANT, 'M500');
    const motivo = 'x'.repeat(500);
    const r = await desativar({ id: c.id, motivo });
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    const linhas = await historico(c.id);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].descricao).toContain(motivo);
  });

  // -------------------------------------------------------------------------
  // Sem motivo: comportamento anterior mantém-se
  // -------------------------------------------------------------------------

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['só espaços', '    '],
  ])('motivo %s → a desactivação continua a funcionar', async (_caso, motivo) => {
    const c = await novoCliente(TENANT, `SEM-${seq + 1}`);
    const input = motivo === undefined ? { id: c.id } : { id: c.id, motivo };
    const r = await desativar(input);
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    const depois = await ler(c.id);
    expect(depois.deletedAt).not.toBeNull();
    expect(depois.status).toBe('INATIVO');
    // Nenhuma entrada com descrição de motivo vazio.
    for (const l of await historico(c.id)) {
      expect(String(l.descricao).trim().length).toBeGreaterThan(0);
    }
  });

  // -------------------------------------------------------------------------
  // Recusas: nada muda, nada fica no histórico
  // -------------------------------------------------------------------------

  it('motivo com 501 caracteres → VALIDACAO; o cliente fica activo e sem histórico', async () => {
    const c = await novoCliente(TENANT, 'M501');
    const r = await desativar({ id: c.id, motivo: 'y'.repeat(501) });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('VALIDACAO');
    const depois = await ler(c.id);
    expect(depois.deletedAt).toBeNull();
    expect(depois.status).toBe('ATIVO');
    expect(await historico(c.id)).toHaveLength(0);
  });

  it('Consumidor Final com motivo → CLIENTE_TECNICO_PROTEGIDO e nenhuma entrada nova no histórico', async () => {
    const cf = await db.cliente.findFirst({ where: { tenantId: TENANT, codigo: CF_CODIGO } });
    expect(cf, 'o bootstrap cria o Consumidor Final').not.toBeNull();
    const nAntes = (await historico(cf.id)).length;

    const r = await desativar({ id: cf.id, motivo: 'Tentativa indevida' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('CLIENTE_TECNICO_PROTEGIDO');
    expect((await ler(cf.id)).deletedAt).toBeNull();
    expect(await historico(cf.id)).toHaveLength(nAntes);
  });

  it('cliente de outro tenant com motivo → NAO_ENCONTRADO; nada muda nem fica no histórico', async () => {
    const alheio = await novoCliente(TENANT_B, 'ALHEIO');
    const r = await desativar({ id: alheio.id, motivo: 'Cruzar tenants' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    const depois = await ler(alheio.id);
    expect(depois.deletedAt).toBeNull();
    expect(depois.status).toBe('ATIVO');
    expect(await historico(alheio.id)).toHaveLength(0);
  });

  it('modo de Leitura → ACESSO_LEITURA; nada muda nem fica no histórico', async () => {
    const c = await novoCliente(TENANT, 'LEITURA');
    sessao(['clientes:ver', 'clientes:desativar'], 'leitura');
    const r = await desativar({ id: c.id, motivo: 'Em leitura' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('ACESSO_LEITURA');
    expect((await ler(c.id)).deletedAt).toBeNull();
    expect(await historico(c.id)).toHaveLength(0);
  });

  it('sem a permissão clientes:desativar → SEM_PERMISSAO; nada muda nem fica no histórico', async () => {
    const c = await novoCliente(TENANT, 'SEMPERM');
    sessao(['clientes:ver']);
    const r = await desativar({ id: c.id, motivo: 'Sem permissão' });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect((await ler(c.id)).deletedAt).toBeNull();
    expect(await historico(c.id)).toHaveLength(0);
  });

  it('cliente já desactivado → NAO_ENCONTRADO e a segunda tentativa não acrescenta entrada', async () => {
    const c = await novoCliente(TENANT, 'DUPLO');
    const r1 = await desativar({ id: c.id, motivo: 'Primeira vez' });
    expect(r1.ok, JSON.stringify(r1.error)).toBe(true);
    const r2 = await desativar({ id: c.id, motivo: 'Segunda vez' });
    expect(r2.ok).toBe(false);
    expect(r2.error?.code).toBe('NAO_ENCONTRADO');
    const linhas = await historico(c.id);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].descricao).toContain('Primeira vez');
  });
});
