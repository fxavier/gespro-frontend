/**
 * Oráculo — issue #160: NUIT/BI/email (e código) duplicados em «Novo Colaborador» davam «Erro interno».
 *
 * O `Colaborador` tem `@@unique([tenantId, codigo|nuit|bi|email])` e o `ColaboradorService.criar` não
 * verificava nada nem traduzia o P2002: a violação subia ao `createSafeAction` como erro inesperado
 * (`ERRO_INTERNO`, 500) e o formulário mostrava um toast genérico.
 *
 * Contrato:
 *   1. Criar com NUIT / BI / email / código já usado no MESMO tenant → `ok:false`, código
 *      `COLABORADOR_<CAMPO>_DUPLICADO` (BusinessRuleError, nunca `ERRO_INTERNO`), e
 *      `error.details.fieldErrors.<campo>` com uma mensagem — é o formato que o
 *      `novo-colaborador-form.tsx` (e o de edição) já passa ao `form.setError`, por isso o erro aparece
 *      no campo. Nenhuma linha nova é gravada.
 *   2. O colaborador ARQUIVADO (soft delete) continua a ocupar o NUIT/BI/email — a unicidade da base não
 *      olha para `deletedAt`. Opção conservadora: recusar com o mesmo código (não reactivar, não gravar).
 *   3. Corrida: duas criações simultâneas com o mesmo NUIT → uma grava, a outra recebe
 *      `COLABORADOR_NUIT_DUPLICADO` (o P2002 da escrita é traduzido, não só a verificação prévia).
 *   4. A unicidade é por tenant: o mesmo NUIT/BI/email noutro tenant grava.
 *   5. Editar (o `UpdateColaboradorSchema` aceita `email`) para o email de outro colaborador →
 *      `COLABORADOR_EMAIL_DUPLICADO` com `fieldErrors.email`, linha intacta; manter o próprio email
 *      não é duplicado.
 *
 * Sessão (`@/lib/auth`) é o único duplo, mutável por `vi.hoisted`; `next/cache` dobrado porque o
 * `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero, `createSafeAction`,
 * `criarColaboradorAction`/`actualizarColaboradorAction`, `ColaboradorService`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:colaborador-duplicados-160; um agente de implementação que o
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

describe.skipIf(skip)('Novo colaborador — NUIT/BI/email/código duplicados (#160) — DB efémera', () => {
  let db: any;
  let criar: (input: unknown) => Promise<Resultado>;
  let actualizar: (input: unknown) => Promise<Resultado>;

  const sufixo = Date.now();
  const s9 = `${sufixo}`.slice(-9);
  const TENANT = `tenant-colab-dup-160-${sufixo}`;
  const OUTRO_TENANT = `tenant-colab-dup-160-b-${sufixo}`;
  const USER = `cusercolabdup${sufixo}`;
  const USER_B = `cusercolabdupb${sufixo}`;

  // NUIT: 9 dígitos não todos iguais. BI: 12 dígitos + letra (8–16 chars no schema).
  let seq = 0;
  function nuitNovo(): string {
    seq += 1;
    return `1${String(seq).padStart(2, '0')}${s9.slice(-6)}`;
  }
  function biNovo(): string {
    return `1101${String(seq).padStart(2, '0')}${s9.slice(-6)}A`;
  }

  /** Um input completo e válido do `CreateColaboradorSchema`, com identificadores únicos. */
  function input(tag: string, over: Record<string, unknown> = {}): Record<string, unknown> {
    const nuit = nuitNovo();
    const bi = biNovo();
    return {
      codigo: `C${seq}-${s9.slice(-5)}`,
      nome: `Colaborador ${tag}`,
      dataNascimento: '1990-05-05',
      genero: 'FEMININO',
      estadoCivil: 'SOLTEIRO',
      nacionalidade: 'Moçambicana',
      naturalidadeProvincia: 'Maputo',
      naturalidadeDistrito: 'KaMpfumo',
      bi,
      nuit,
      email: `colab-${tag}-${seq}-${sufixo}@test.mz`,
      telefone: '+258840000001',
      enderecoRua: 'Av. 24 de Julho',
      enderecoNumero: '1',
      enderecoBairro: 'Polana',
      enderecoCidade: 'Maputo',
      enderecoProvincia: 'Maputo',
      emergenciaNome: 'Contacto',
      emergenciaParentesco: 'Irmão',
      emergenciaTelefone: '+258840000002',
      dataAdmissao: '2020-01-01',
      status: 'ACTIVO',
      tipoContrato: 'EFECTIVO',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      salarioBase: 30000,
      nivelAcesso: 'USUARIO',
      ...over,
    };
  }

  function sessao(tenantId: string, userId: string) {
    h.sessao = {
      user: {
        id: userId,
        tenantId,
        permissions: ['rh:colaboradores:create', 'rh:colaboradores:update'],
        acesso: 'aberto',
      },
    };
  }

  async function contar(tenantId: string): Promise<number> {
    return db.colaborador.count({ where: { tenantId } });
  }

  /** Cria pela action e devolve o input usado (falha o caso se a criação base não gravar). */
  async function criarBase(tag: string): Promise<Record<string, unknown>> {
    const dados = input(tag);
    const r = await criar(dados);
    expect(r.ok, `criação base «${tag}» falhou: ${JSON.stringify(r)}`).toBe(true);
    return dados;
  }

  function esperarDuplicado(r: Resultado, codigo: string, campo: string) {
    expect(r.ok, `duplicado de «${campo}» foi aceite: ${JSON.stringify(r)}`).toBe(false);
    expect(r.error?.code, `esperado ${codigo}, veio ${JSON.stringify(r.error)}`).not.toBe('ERRO_INTERNO');
    expect(r.error?.code).toBe(codigo);
    const fe = r.error?.details?.fieldErrors;
    expect(fe, `details.fieldErrors em falta — o formulário não consegue pôr o erro no campo: ${JSON.stringify(r.error)}`).toBeTruthy();
    expect(Array.isArray(fe[campo]), `fieldErrors.${campo} em falta: ${JSON.stringify(fe)}`).toBe(true);
    expect(fe[campo].length).toBeGreaterThan(0);
    expect(typeof fe[campo][0]).toBe('string');
    expect(fe[campo][0].length).toBeGreaterThan(0);
    // A mensagem é para o utilizador: nada de jargão do Prisma.
    expect(`${r.error?.message} ${fe[campo][0]}`).not.toMatch(/P2002|Unique constraint|prisma/i);
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    const actions = (await import('@/server/actions/rh.actions')) as unknown as Record<string, any>;
    criar = actions.criarColaboradorAction;
    actualizar = actions.actualizarColaboradorAction;

    for (const [t, u, slug] of [
      [TENANT, USER, `colab-dup-160-${sufixo}`],
      [OUTRO_TENANT, USER_B, `colab-dup-160-b-${sufixo}`],
    ] as const) {
      await db.tenant.create({ data: { id: t, nome: `Tenant ${slug}`, slug, nuit: (t === TENANT ? `7${s9}` : `8${s9}`).slice(0, 9) } });
      await db.user.create({
        data: { id: u, tenantId: t, email: `gestor-${slug}@test.mz`, nome: 'Gestor RH', keycloakSub: `kc-${u}` },
      });
    }
  }, 60_000);

  beforeEach(() => {
    sessao(TENANT, USER);
  });

  const CAMPOS: Array<[campo: 'nuit' | 'bi' | 'email' | 'codigo', codigo: string]> = [
    ['nuit', 'COLABORADOR_NUIT_DUPLICADO'],
    ['bi', 'COLABORADOR_BI_DUPLICADO'],
    ['email', 'COLABORADOR_EMAIL_DUPLICADO'],
    ['codigo', 'COLABORADOR_CODIGO_DUPLICADO'],
  ];

  for (const [campo, codigo] of CAMPOS) {
    it(`«${campo}» duplicado no mesmo tenant → ${codigo} com fieldErrors.${campo}, nada gravado`, async () => {
      const base = await criarBase(`base-${campo}`);
      const antes = await contar(TENANT);

      const r = await criar(input(`dup-${campo}`, { [campo]: base[campo] }));
      esperarDuplicado(r, codigo, campo);
      expect(await contar(TENANT)).toBe(antes);
    });
  }

  for (const campo of ['nuit', 'bi', 'email'] as const) {
    it(`«${campo}» de um colaborador ARQUIVADO continua ocupado → recusado, nada gravado nem reactivado`, async () => {
      const base = await criarBase(`arq-${campo}`);
      await db.colaborador.updateMany({
        where: { tenantId: TENANT, nuit: base.nuit },
        data: { deletedAt: new Date() },
      });
      const antes = await contar(TENANT);

      const r = await criar(input(`dup-arq-${campo}`, { [campo]: base[campo] }));
      esperarDuplicado(r, `COLABORADOR_${campo.toUpperCase()}_DUPLICADO`, campo);
      expect(await contar(TENANT)).toBe(antes);
      const arquivado = await db.colaborador.findFirst({ where: { tenantId: TENANT, nuit: base.nuit } });
      expect(arquivado.deletedAt, 'o arquivado foi reactivado').not.toBeNull();
      expect(arquivado.nome).toBe(`Colaborador arq-${campo}`);
    });
  }

  it('corrida: duas criações simultâneas com o mesmo NUIT → uma grava, a outra COLABORADOR_NUIT_DUPLICADO', async () => {
    const a = input('corrida-a');
    const b = input('corrida-b', { nuit: a.nuit });
    const antes = await contar(TENANT);

    const rs = await Promise.all([criar(a), criar(b)]);
    const oks = rs.filter((r) => r.ok);
    const recusas = rs.filter((r) => !r.ok);
    expect(oks.length, JSON.stringify(rs)).toBe(1);
    expect(recusas.length).toBe(1);
    esperarDuplicado(recusas[0], 'COLABORADOR_NUIT_DUPLICADO', 'nuit');
    expect(await contar(TENANT)).toBe(antes + 1);
  });

  it('a unicidade é por tenant: o mesmo NUIT/BI/email/código noutro tenant grava', async () => {
    const base = await criarBase('cross-a');
    sessao(OUTRO_TENANT, USER_B);
    const r = await criar(
      input('cross-b', { nuit: base.nuit, bi: base.bi, email: base.email, codigo: base.codigo }),
    );
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const linha = await db.colaborador.findFirst({ where: { tenantId: OUTRO_TENANT, nuit: base.nuit } });
    expect(linha?.nome).toBe('Colaborador cross-b');
  });

  it('editar para o email de outro colaborador → COLABORADOR_EMAIL_DUPLICADO com fieldErrors.email, linha intacta', async () => {
    const outro = await criarBase('edit-outro');
    const alvoDados = await criarBase('edit-alvo');
    const alvo = await db.colaborador.findFirst({ where: { tenantId: TENANT, nuit: alvoDados.nuit } });

    const r = await actualizar({ id: alvo.id, data: { nome: 'Nome Que Não Pode Ficar', email: outro.email } });
    esperarDuplicado(r, 'COLABORADOR_EMAIL_DUPLICADO', 'email');

    const depois = await db.colaborador.findUnique({ where: { id: alvo.id } });
    expect(depois.email).toBe(alvoDados.email);
    expect(depois.nome).toBe('Colaborador edit-alvo');
  });

  it('editar mantendo o próprio email não é duplicado', async () => {
    const dados = await criarBase('edit-proprio');
    const alvo = await db.colaborador.findFirst({ where: { tenantId: TENANT, nuit: dados.nuit } });

    const r = await actualizar({ id: alvo.id, data: { nome: 'Nome Revisto', email: dados.email } });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const depois = await db.colaborador.findUnique({ where: { id: alvo.id } });
    expect(depois.nome).toBe('Nome Revisto');
  });
});
