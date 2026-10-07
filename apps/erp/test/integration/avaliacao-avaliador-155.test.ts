/**
 * Oráculo — issue #155: criar avaliação falhava porque `avaliadorId` recebia o id do User.
 *
 * `Avaliacao.avaliadorId` tem FK para `Colaborador` (`Avaliacao_avaliadorId_fkey`), mas a página
 * `rh/avaliacoes/nova` passa `session.user.id` ao formulário, que o envia como `avaliadorId`; o
 * `AvaliacaoService.criar` grava-o tal e qual → violação de FK → «Erro interno».
 *
 * Contrato (opção conservadora, sem UI nova nem endpoint novo): o AVALIADOR é o Colaborador do
 * utilizador da sessão, resolvido no servidor — nunca o valor que o cliente manda.
 *   - A correspondência User↔Colaborador faz-se por email, no MESMO tenant (precedente da casa:
 *     `payroll.service.ts`, comissões, «a correspondência Colaborador↔User faz-se por email»).
 *   - O `avaliadorId` que venha do cliente é ignorado: o que o formulário manda hoje (id do User),
 *     nada, ou o id de outro colaborador — grava-se sempre o Colaborador da sessão.
 *   - Utilizador sem Colaborador associado no tenant → `BusinessRuleError` com código
 *     `AVALIADOR_SEM_COLABORADOR` (mensagem legível, nunca `ERRO_INTERNO`); nada é criado.
 *     Um Colaborador com o mesmo email noutro tenant não conta.
 *   - O avaliador não se avalia a si próprio: se o colaborador avaliado for o da sessão, recusa
 *     com erro de negócio (não `ERRO_INTERNO`) e nada é criado. (A regra existia no schema Zod,
 *     comparando com o id do User; com o avaliador resolvido no servidor tem de ficar no serviço.)
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`. `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `createSafeAction`, `criarAvaliacaoAction`, `AvaliacaoService.criar`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:avaliacao-avaliador-155; um agente de implementação que o
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

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

describe.skipIf(skip)('Criar avaliação resolve o avaliador pelo utilizador da sessão (#155) — DB efémera', () => {
  let db: any;
  let criar: (input: unknown) => Promise<Resultado>;

  const sufixo = Date.now();
  const TENANT = `tenant-av-155-${sufixo}`;
  const OUTRO_TENANT = `tenant-av-155-outro-${sufixo}`;
  // Ids com forma de cuid, como os reais (o schema valida `avaliadorId` com `.cuid()`).
  const USER_COM_COLAB = `cuseravcom${sufixo}`;
  const USER_SEM_COLAB = `cuseravsem${sufixo}`;
  const USER_SO_OUTRO_TENANT = `cuseravout${sufixo}`;
  const EMAIL_COM = `gestor-av-155-${sufixo}@test.mz`;
  const EMAIL_SEM = `sem-colab-av-155-${sufixo}@test.mz`;
  const EMAIL_OUTRO = `outro-av-155-${sufixo}@test.mz`;

  let colabAvaliadorId: string; // Colaborador do USER_COM_COLAB (mesmo email, mesmo tenant)
  let colabAvaliadoId: string;
  let colabTerceiroId: string;

  function sessao(userId: string) {
    h.sessao = { user: { id: userId, tenantId: TENANT, permissions: ['rh:avaliacoes:create'], acesso: 'aberto' } };
  }

  let seq = 0;
  async function criarColaborador(tenant: string, tag: string, email: string): Promise<string> {
    seq += 1; // bi/nuit são únicos por tenant
    const c = await db.colaborador.create({
      data: {
        tenantId: tenant,
        codigo: `COL-${tag}-${sufixo}`,
        nome: `Colaborador ${tag}`,
        dataNascimento: new Date('1990-05-05T00:00:00Z'),
        genero: 'FEMININO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: `11010000000${seq}A`,
        nuit: `40000000${seq}`,
        email,
        telefone: '+258840000001',
        enderecoRua: 'Av. 24 de Julho',
        enderecoNumero: '1',
        enderecoBairro: 'Polana',
        enderecoCidade: 'Maputo',
        enderecoProvincia: 'Maputo',
        emergenciaNome: 'Contacto',
        emergenciaParentesco: 'Irmão',
        emergenciaTelefone: '+258840000002',
        dataAdmissao: new Date('2020-01-01T00:00:00Z'),
        status: 'ACTIVO',
        tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL',
        salarioBase: '30000.00',
        nivelAcesso: 'USUARIO',
      },
      select: { id: true },
    });
    return c.id;
  }

  function input(periodo: string, extra: Record<string, unknown> = {}) {
    return {
      colaboradorId: colabAvaliadoId,
      periodo,
      tipo: 'DESEMPENHO',
      dataInicio: new Date('2027-03-01T10:00:00Z'),
      criterios: [{ nome: 'Pontualidade', descricao: 'Cumpre horários', peso: 50, nota: 8 }],
      pontosFortes: [],
      pontosDesenvolvimento: [],
      planoAcao: [],
      ...extra,
    };
  }

  const contar = (periodo: string) => db.avaliacao.count({ where: { tenantId: TENANT, periodo } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    const actions = (await import('@/server/actions/rh.actions')) as unknown as Record<string, any>;
    criar = actions.criarAvaliacaoAction;

    for (const [id, slug, nuit] of [
      [TENANT, `av-155-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `av-155-outro-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    for (const [id, email, nome] of [
      [USER_COM_COLAB, EMAIL_COM, 'Gestor RH'],
      [USER_SEM_COLAB, EMAIL_SEM, 'Sem Colaborador'],
      [USER_SO_OUTRO_TENANT, EMAIL_OUTRO, 'Colaborador só noutro tenant'],
    ] as const) {
      await db.user.create({ data: { id, tenantId: TENANT, email, nome, keycloakSub: `kc-${id}` } });
    }

    colabAvaliadorId = await criarColaborador(TENANT, 'avaliador', EMAIL_COM);
    colabAvaliadoId = await criarColaborador(TENANT, 'avaliado', `avaliado-155-${sufixo}@test.mz`);
    colabTerceiroId = await criarColaborador(TENANT, 'terceiro', `terceiro-155-${sufixo}@test.mz`);
    // Mesmo email do USER_SO_OUTRO_TENANT, mas noutro tenant — não pode ser resolvido.
    await criarColaborador(OUTRO_TENANT, 'fora', EMAIL_OUTRO);
  }, 60_000);

  beforeEach(() => {
    sessao(USER_COM_COLAB);
  });

  it('o que o formulário manda hoje (avaliadorId = id do User) cria a avaliação com o Colaborador da sessão', async () => {
    expect(typeof criar, 'criarAvaliacaoAction não está exportada').toBe('function');
    const r = await criar(input('2027-T1', { avaliadorId: USER_COM_COLAB }));
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const av = await db.avaliacao.findFirst({ where: { tenantId: TENANT, periodo: '2027-T1' } });
    expect(av, 'a avaliação não foi gravada').toBeTruthy();
    expect(av.avaliadorId).toBe(colabAvaliadorId);
    expect(av.colaboradorId).toBe(colabAvaliadoId);
    expect(av.status).toBe('PENDENTE');
    expect(await db.criterioAvaliacao.count({ where: { avaliacaoId: av.id } })).toBe(1);
  });

  it('sem avaliadorId no input, o servidor resolve o avaliador pela sessão', async () => {
    const r = await criar(input('2027-T2'));
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const av = await db.avaliacao.findFirst({ where: { tenantId: TENANT, periodo: '2027-T2' } });
    expect(av, 'a avaliação não foi gravada').toBeTruthy();
    expect(av.avaliadorId).toBe(colabAvaliadorId);
  });

  it('um avaliadorId de outro colaborador vindo do cliente é ignorado — grava o da sessão', async () => {
    const r = await criar(input('2027-T3', { avaliadorId: colabTerceiroId }));
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const av = await db.avaliacao.findFirst({ where: { tenantId: TENANT, periodo: '2027-T3' } });
    expect(av, 'a avaliação não foi gravada').toBeTruthy();
    expect(av.avaliadorId).toBe(colabAvaliadorId);
    expect(av.avaliadorId).not.toBe(colabTerceiroId);
  });

  it('utilizador sem Colaborador associado → AVALIADOR_SEM_COLABORADOR, mensagem clara, nada criado', async () => {
    sessao(USER_SEM_COLAB);
    const r = await criar(input('2027-SEM', { avaliadorId: USER_SEM_COLAB }));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('AVALIADOR_SEM_COLABORADOR');
    expect(r.error?.message ?? '').toMatch(/colaborador/i);
    expect(await contar('2027-SEM')).toBe(0);
  });

  it('Colaborador com o mesmo email só noutro tenant não conta → AVALIADOR_SEM_COLABORADOR', async () => {
    sessao(USER_SO_OUTRO_TENANT);
    const r = await criar(input('2027-OUTRO'));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('AVALIADOR_SEM_COLABORADOR');
    expect(await contar('2027-OUTRO')).toBe(0);
  });

  it('o avaliador não se avalia a si próprio: recusa com erro de negócio e nada é criado', async () => {
    const r = await criar(input('2027-SELF', { colaboradorId: colabAvaliadorId, avaliadorId: USER_COM_COLAB }));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBeTruthy();
    expect(r.error?.code).not.toBe('ERRO_INTERNO');
    expect(await contar('2027-SELF')).toBe(0);
  });
});
