/**
 * ORÁCULO — issue #526 (nó C:gestao-planos): Server Actions da gestão de planos.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de implementação
 * que altere este ficheiro é BLOCKER.
 *
 * Contrato:
 *   - `src/server/actions/plataforma-planos.actions.ts` ('use server') exporta `criarPlano`,
 *     `actualizarPlano`, `arquivarPlano`, `desarquivarPlano`, `apagarPlano` e `listarPlanosAdmin`,
 *     todas `createSafeAction({ plataforma: true, … })`;
 *   - `actualizarPlano` recebe `{ id, ...campos }`; `arquivarPlano`/`desarquivarPlano`/`apagarPlano`
 *     recebem `{ id }`; `listarPlanosAdmin` não recebe nada (ou `{}`);
 *   - delegam no `plano-admin.service` (soltas ou `planoAdminService`), SEM contexto de tenant,
 *     passando ao serviço o autor (o `id` da sessão, que na sessão só-plataforma é o `sub` do
 *     Keycloak);
 *   - sem o papel `plataforma-admin` → recusa (NAO_ENCONTRADO — a área não se revela), serviço
 *     não chamado — mesmo para o ADMIN de um tenant com todas as permissões;
 *   - as escritas revalidam `/plataforma/planos`;
 *   - o retorno vai serializado (Decimal → string), como em qualquer `createSafeAction`.
 *
 * ESTADO ESPERADO antes da implementação: RED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  runWithTenantContext: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
  revalidatePath: vi.fn(),
  svc: {
    criarPlano: vi.fn(),
    actualizarPlano: vi.fn(),
    arquivarPlano: vi.fn(),
    desarquivarPlano: vi.fn(),
    apagarPlano: vi.fn(),
    listarPlanosAdmin: vi.fn(),
  } as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: mocks.runWithTenantContext,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath, updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/server/services/plataforma/plano-admin.service', () => ({
  ...mocks.svc,
  planoAdminService: mocks.svc,
}));

const SUB = 'kc-sub-plat-526';

function sessaoSoPlataforma() {
  return {
    user: {
      id: SUB,
      email: 'plataforma@gespro.mz',
      name: 'Plataforma',
      tenantId: undefined,
      permissions: [],
      emailVerificado: true,
      acesso: 'aberto',
      plataformaAdmin: true,
    },
  };
}

function sessaoTenantAdmin() {
  return {
    user: {
      id: 'admin-tenant-526',
      email: 'admin@demo.mz',
      name: 'Admin',
      tenantId: 'tenant-526',
      permissions: ['core_tenancy:configurar', 'plataforma:admin', 'assinatura:gerir'],
      emailVerificado: true,
      acesso: 'aberto',
      plataformaAdmin: false,
    },
  };
}

const PLANO = {
  id: 'plano-526',
  codigo: 'TGP_ACCAO',
  nome: 'Plano acção',
  descricao: 'd',
  precoMensalUsd: new Prisma.Decimal('12.50'),
  precoAnualUsd: new Prisma.Decimal('125.00'),
  stripePriceIdMensal: null,
  stripePriceIdAnual: null,
  limiteUtilizadores: 5,
  limiteArmazens: -1,
  suporte: 'Email',
  funcionalidades: ['A'],
  ordem: 1,
  destaque: false,
  arquivadoEm: null,
};

const CAMPOS = {
  codigo: 'TGP_ACCAO',
  nome: 'Plano acção',
  descricao: 'd',
  precoMensalUsd: '12.50',
  precoAnualUsd: '125.00',
  stripePriceIdMensal: '',
  stripePriceIdAnual: '',
  limiteUtilizadores: 5,
  limiteArmazens: -1,
  suporte: 'Email',
  funcionalidades: ['A'],
  ordem: 1,
  destaque: false,
};

async function accoes(): Promise<Record<string, (input?: unknown) => Promise<any>>> {
  // Caminho em variável: o módulo ainda não existe e o `tsc` do `pnpm check` não pode partir.
  const caminho: string = '@/server/actions/plataforma-planos.actions';
  const mod: any = await import(/* @vite-ignore */ caminho);
  return mod;
}

/** [nome da action, input, função do serviço que tem de chamar, é escrita?] */
const CASOS: Array<[string, unknown, string, boolean]> = [
  ['criarPlano', CAMPOS, 'criarPlano', true],
  ['actualizarPlano', { id: 'plano-526', ...CAMPOS }, 'actualizarPlano', true],
  ['arquivarPlano', { id: 'plano-526' }, 'arquivarPlano', true],
  ['desarquivarPlano', { id: 'plano-526' }, 'desarquivarPlano', true],
  ['apagarPlano', { id: 'plano-526' }, 'apagarPlano', true],
  ['listarPlanosAdmin', undefined, 'listarPlanosAdmin', false],
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const f of Object.values(mocks.svc)) f.mockResolvedValue(PLANO);
  mocks.svc.apagarPlano.mockResolvedValue(undefined);
  mocks.svc.listarPlanosAdmin.mockResolvedValue([{ ...PLANO, assinaturas: 2 }]);
});

describe('#526 — actions de planos (createSafeAction({ plataforma: true }))', () => {
  it.each(CASOS)('%s: administrador de TENANT sem o papel → recusado, serviço não chamado', async (nome, input, fn) => {
    const a = await accoes();
    expect(typeof a[nome], `action ${nome} em falta`).toBe('function');
    mocks.auth.mockResolvedValue(sessaoTenantAdmin());

    const r = await a[nome](input);

    expect(r.ok).toBe(false);
    expect(r.error.code).toBe('NAO_ENCONTRADO');
    expect(mocks.svc[fn]).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(CASOS)('%s: sem sessão → NAO_AUTENTICADO, serviço não chamado', async (nome, input, fn) => {
    const a = await accoes();
    mocks.auth.mockResolvedValue(null);
    const r = await a[nome](input);
    expect(r).toMatchObject({ ok: false, error: { code: 'NAO_AUTENTICADO' } });
    expect(mocks.svc[fn]).not.toHaveBeenCalled();
  });

  it.each(CASOS)('%s: com o papel → corre sem contexto de tenant e chega ao serviço', async (nome, input, fn, escrita) => {
    const a = await accoes();
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());

    const r = await a[nome](input);

    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(mocks.svc[fn]).toHaveBeenCalledTimes(1);
    expect(mocks.runWithTenantContext).not.toHaveBeenCalled();
    const args = JSON.stringify(mocks.svc[fn].mock.calls[0]);
    if (escrita) {
      // O autor chega ao serviço (vai para o trilho de auditoria).
      expect(args).toContain(SUB);
      expect(mocks.revalidatePath.mock.calls.map((c) => c[0])).toContain('/plataforma/planos');
    }
    if (input && typeof input === 'object' && 'id' in input) {
      expect(args).toContain('plano-526');
    }
    expect(args).not.toContain('tenant-526');
  });

  it('o retorno vai serializado: Decimal → string', async () => {
    const a = await accoes();
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await a.criarPlano(CAMPOS);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(typeof r.data.precoMensalUsd).toBe('string');
    expect(Number(r.data.precoMensalUsd)).toBe(12.5);
  });

  it('um tenantId vindo do cliente é recusado e não chega ao serviço', async () => {
    const a = await accoes();
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await a.arquivarPlano({ id: 'plano-526', tenantId: 'tenant-alheio' });
    expect(r.ok).toBe(false);
    expect(mocks.svc.arquivarPlano).not.toHaveBeenCalled();
  });

  it('criarPlano valida pelo schema partilhado: código em minúsculas é recusado antes do serviço', async () => {
    const a = await accoes();
    mocks.auth.mockResolvedValue(sessaoSoPlataforma());
    const r = await a.criarPlano({ ...CAMPOS, codigo: 'minusculas' });
    expect(r.ok).toBe(false);
    expect(mocks.svc.criarPlano).not.toHaveBeenCalled();
  });
});
