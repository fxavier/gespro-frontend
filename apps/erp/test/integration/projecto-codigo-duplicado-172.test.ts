/**
 * Oráculo — issue #172: criar projecto com código duplicado dava «Erro interno».
 *
 * `Projeto` tem `@@unique([tenantId, codigo])` e o `ProjetoService.criar` não verificava nada nem
 * traduzia o P2002: a violação subia ao `createSafeAction` como erro inesperado (`ERRO_INTERNO`,
 * 500) e o formulário mostrava um toast genérico.
 *
 * Contrato (decisão do orquestrador; mesmo padrão do #160, PR #487):
 *   1. Criar com um código já usado no MESMO tenant → `ok:false`, código
 *      `PROJECTO_CODIGO_DUPLICADO` (BusinessRuleError, nunca `ERRO_INTERNO`), e
 *      `error.details.fieldErrors.codigo` com uma mensagem — é o formato que o
 *      `novo-projeto-form.tsx` já passa ao `form.setError`, por isso o erro aparece no campo.
 *      Nenhuma linha nova é gravada e o projecto existente fica intacto.
 *   2. Corrida: duas criações simultâneas com o mesmo código → uma grava, a outra recebe
 *      `PROJECTO_CODIGO_DUPLICADO` (o P2002 da escrita é traduzido, não só a verificação prévia).
 *   3. A unicidade é por tenant: o mesmo código noutro tenant grava.
 *   4. Controlo: um código novo continua a gravar (a correcção não recusa tudo).
 *
 * O código não é editável (`UpdateProjetoSchema` omite-o) e `Projeto` não tem soft delete, por
 * isso não há caso de edição nem de arquivado. A comparação é a da base (exacta): este oráculo
 * não impõe nada sobre maiúsculas/minúsculas.
 *
 * Sessão (`@/lib/auth`) é o único duplo, mutável por `vi.hoisted`; `next/cache` dobrado porque o
 * `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero, `createSafeAction`,
 * `criarProjetoAction`, `ProjetoService`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó A:projecto-codigo-duplicado-172; um agente de implementação que o
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

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string; details?: any } };

describe.skipIf(skip)('Novo projecto — código duplicado (#172) — DB efémera', () => {
  let db: any;
  let criar: (input: unknown) => Promise<Resultado>;

  const sufixo = Date.now();
  const s6 = `${sufixo}`.slice(-6);
  const s9 = `${sufixo}`.slice(-9);
  const TENANT = `tenant-proj-dup-172-${sufixo}`;
  const OUTRO_TENANT = `tenant-proj-dup-172-b-${sufixo}`;
  const USER = `cuserprojdup${sufixo}`;
  const USER_B = `cuserprojdupb${sufixo}`;

  let seq = 0;
  /** Código único e ≤ 20 caracteres (limite do `CreateProjetoSchema`). */
  function codigoNovo(): string {
    seq += 1;
    return `P172-${s6}-${seq}`;
  }

  /** Um input válido do `CreateProjetoSchema` (o que o formulário envia). */
  function input(tag: string, over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      codigo: codigoNovo(),
      nome: `Projecto ${tag}`,
      tipo: 'INTERNO',
      prioridade: 'MEDIA',
      dataInicio: '2027-01-04',
      dataFimPrevista: '2027-06-30',
      tags: [],
      ...over,
    };
  }

  function sessao(tenantId: string, userId: string) {
    h.sessao = {
      user: { id: userId, tenantId, permissions: ['projetos:create', 'projetos:read'], acesso: 'aberto' },
    };
  }

  async function contar(tenantId: string): Promise<number> {
    return db.projeto.count({ where: { tenantId } });
  }

  async function criarBase(tag: string): Promise<Record<string, unknown>> {
    const dados = input(tag);
    const r = await criar(dados);
    expect(r.ok, `criação base «${tag}» falhou: ${JSON.stringify(r)}`).toBe(true);
    return dados;
  }

  function esperarDuplicado(r: Resultado) {
    expect(r.ok, `código duplicado foi aceite: ${JSON.stringify(r)}`).toBe(false);
    expect(r.error?.code, `esperado PROJECTO_CODIGO_DUPLICADO, veio ${JSON.stringify(r.error)}`).not.toBe(
      'ERRO_INTERNO',
    );
    expect(r.error?.code).toBe('PROJECTO_CODIGO_DUPLICADO');
    const fe = r.error?.details?.fieldErrors;
    expect(fe, `details.fieldErrors em falta — o formulário não consegue pôr o erro no campo: ${JSON.stringify(r.error)}`).toBeTruthy();
    expect(Array.isArray(fe.codigo), `fieldErrors.codigo em falta: ${JSON.stringify(fe)}`).toBe(true);
    expect(fe.codigo.length).toBeGreaterThan(0);
    expect(typeof fe.codigo[0]).toBe('string');
    expect(fe.codigo[0].length).toBeGreaterThan(0);
    // A mensagem é para o utilizador: nada de jargão do Prisma.
    expect(`${r.error?.message} ${fe.codigo[0]}`).not.toMatch(/P2002|Unique constraint|prisma/i);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    const actions = (await import('@/server/actions/projetos.actions')) as unknown as Record<string, any>;
    criar = actions.criarProjetoAction;

    for (const [t, u, slug, nuit] of [
      [TENANT, USER, `proj-dup-172-${sufixo}`, `7${s9}`.slice(0, 9)],
      [OUTRO_TENANT, USER_B, `proj-dup-172-b-${sufixo}`, `8${s9}`.slice(0, 9)],
    ] as const) {
      await db.tenant.create({ data: { id: t, nome: `Tenant ${slug}`, slug, nuit } });
      await db.user.create({
        data: { id: u, tenantId: t, email: `gestor-${slug}@test.mz`, nome: 'Gestor Projectos', keycloakSub: `kc-${u}` },
      });
    }
  }, 60_000);

  beforeEach(() => {
    sessao(TENANT, USER);
  });

  it('controlo: um código novo grava', async () => {
    const dados = input('controlo');
    const r = await criar(dados);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const linha = await db.projeto.findFirst({ where: { tenantId: TENANT, codigo: dados.codigo } });
    expect(linha?.nome).toBe('Projecto controlo');
  });

  it('código duplicado no mesmo tenant → PROJECTO_CODIGO_DUPLICADO com fieldErrors.codigo, nada gravado', async () => {
    const base = await criarBase('base');
    const antes = await contar(TENANT);

    const r = await criar(input('dup', { codigo: base.codigo }));
    esperarDuplicado(r);

    expect(await contar(TENANT)).toBe(antes);
    const linhas = await db.projeto.findMany({ where: { tenantId: TENANT, codigo: base.codigo } });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].nome, 'o projecto existente foi alterado').toBe('Projecto base');
  });

  it('corrida: duas criações simultâneas com o mesmo código → uma grava, a outra PROJECTO_CODIGO_DUPLICADO', async () => {
    const a = input('corrida-a');
    const b = input('corrida-b', { codigo: a.codigo });
    const antes = await contar(TENANT);

    const rs = await Promise.all([criar(a), criar(b)]);
    const oks = rs.filter((r) => r.ok);
    const recusas = rs.filter((r) => !r.ok);
    expect(oks.length, JSON.stringify(rs)).toBe(1);
    expect(recusas.length).toBe(1);
    esperarDuplicado(recusas[0]);
    expect(await contar(TENANT)).toBe(antes + 1);
  });

  it('a unicidade é por tenant: o mesmo código noutro tenant grava', async () => {
    const base = await criarBase('cross-a');
    sessao(OUTRO_TENANT, USER_B);
    const r = await criar(input('cross-b', { codigo: base.codigo }));
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const linha = await db.projeto.findFirst({ where: { tenantId: OUTRO_TENANT, codigo: base.codigo } });
    expect(linha?.nome).toBe('Projecto cross-b');
  });
});
