/**
 * Teste de integração — registo público com palavra-passe (spec 21, tarefa 9.1)
 *
 * Postgres é real e efémero (Testcontainers); o Keycloak é dublado em memória,
 * porque o que aqui se prova é a **fronteira entre os dois sistemas com
 * estado**, não a Admin API (essa é provada no smoke do ADR-0031 §Verificação):
 *
 *   1. Atomicidade com palavra-passe — o Keycloak escreve, o Postgres falha, e
 *      não fica tenant nenhum. Como a falha é anterior à transacção, também não
 *      fica identidade meio-criada, e o pedido repete-se e conclui.
 *   2. Idempotência — a mesma `Idempotency-Key` não produz um segundo tenant
 *      nem uma segunda identidade.
 *
 * Requer Docker. Com `SKIP_INTEGRATION=true` (degradação graciosa do setup)
 * todos os testes saltam.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

// O `prismaBase` lê `DATABASE_URL` no import. O container só existe depois do
// globalSetup, por isso a URL é fixada aqui e os módulos são importados
// dinamicamente no `beforeAll` — nunca por import estático.
if (process.env.INTEGRATION_DB_URL) {
  process.env.DATABASE_URL = process.env.INTEGRATION_DB_URL;
  process.env.DIRECT_URL = process.env.INTEGRATION_DB_URL;
}

/** Keycloak em memória: guarda identidades por e-mail e a credencial escrita. */
const kc = vi.hoisted(() => {
  const identidades = new Map<string, { sub: string; senha?: string; accoes?: string[] }>();
  return {
    identidades,
    falharPalavraPasse: { valor: false },
    procurarPorEmail: vi.fn(async (email: string) => {
      const u = identidades.get(email);
      return u ? { id: u.sub, email } : null;
    }),
    garantirUtilizador: vi.fn(
      async (input: { email: string; nome: string; accoes?: string[]; emailVerificado?: boolean }) => {
        const existente = identidades.get(input.email);
        if (existente) return existente.sub;
        const sub = `kc-${identidades.size + 1}-${Date.now()}`;
        identidades.set(input.email, { sub, accoes: input.accoes });
        return sub;
      },
    ),
    definirPalavraPasse: vi.fn(async (sub: string, senha: string) => {
      if (kc.falharPalavraPasse.valor) throw new Error('[keycloak] reset-password falhou (HTTP 503)');
      for (const [, u] of identidades) if (u.sub === sub) u.senha = senha;
    }),
    eliminarUtilizador: vi.fn(async (sub: string) => {
      for (const [email, u] of identidades) if (u.sub === sub) identidades.delete(email);
    }),
  };
});

vi.mock('@/server/auth/keycloak', () => ({
  procurarPorEmail: kc.procurarPorEmail,
  garantirUtilizador: kc.garantirUtilizador,
  definirPalavraPasse: kc.definirPalavraPasse,
  eliminarUtilizador: kc.eliminarUtilizador,
}));

// O trial no Stripe é efeito externo best-effort — fora do âmbito deste teste.
vi.mock('@/server/services/plataforma/assinatura.service', () => ({
  criarSubscricaoTrial: vi.fn(async () => ({ criada: false })),
}));

const SENHA = 'entrada-imediata-2026';

function corpo(nuit: string, email: string) {
  return {
    empresa: { nome: `Padaria ${nuit}, Lda`, nuit },
    admin: { nome: 'Ana Sitoe', email },
    senha: SENHA,
    confirmacao: SENHA,
    planoId: 'PROFISSIONAL',
    provincia: 'Maputo Cidade',
    captchaToken: 'dev',
  };
}

/** NUITs válidos para `validarNUIT`: 9 dígitos, não todos iguais. */
let contador = 0;
function nuitNovo(): string {
  contador += 1;
  return String(400_000_000 + contador + (Date.now() % 100_000));
}

describe.skipIf(skip)('Registo público com palavra-passe — Postgres real', () => {
  let registarTenant: typeof import('@/server/provisioning/registo-publico').registarTenant;
  let db: typeof import('@/server/db/client').prismaBase;

  beforeAll(async () => {
    process.env.CAPTCHA_PROVIDER = 'none';
    ({ registarTenant } = await import('@/server/provisioning/registo-publico'));
    ({ prismaBase: db } = await import('@/server/db/client'));
  });

  afterAll(async () => {
    if (db) await db.$disconnect();
  });

  beforeEach(() => {
    kc.falharPalavraPasse.valor = false;
    kc.identidades.clear();
    vi.clearAllMocks();
  });

  it('atomicidade: a palavra-passe falha → nem tenant, nem identidade, e o pedido repete-se', async () => {
    const nuit = nuitNovo();
    const email = `ana+${nuit}@padaria.mz`;
    const chave = `chave-atomicidade-${nuit}`;

    kc.falharPalavraPasse.valor = true;
    const primeira = await registarTenant(corpo(nuit, email), {
      ip: `41.0.0.${(contador % 200) + 1}`,
      idempotencyKey: chave,
    });

    expect(primeira.ok).toBe(false);
    if (primeira.ok) throw new Error('esperava recusa');
    expect(primeira.estado).toBe(500);

    // Postgres intacto: nenhum tenant, nenhum utilizador.
    expect(await db.tenant.count({ where: { nuit } })).toBe(0);
    expect(await db.user.count({ where: { email } })).toBe(0);

    // Keycloak sem identidade meio-criada — foi removida (tarefa 2.3).
    expect(kc.identidades.has(email)).toBe(false);

    // E a chave ficou repetível, não presa.
    const marcada = await db.chaveIdempotencia.findUnique({ where: { chave } });
    expect(marcada?.estado).toBe('FALHADA');

    // Repetir com o Keycloak de pé conclui o registo.
    kc.falharPalavraPasse.valor = false;
    const segunda = await registarTenant(corpo(nuit, email), {
      ip: `41.0.0.${(contador % 200) + 1}`,
      idempotencyKey: chave,
    });

    expect(segunda.ok).toBe(true);
    if (!segunda.ok) throw new Error('esperava sucesso');
    expect(segunda.repetido).toBe(false);
    expect(await db.tenant.count({ where: { nuit } })).toBe(1);
    expect(kc.identidades.get(email)?.senha).toBe(SENHA);
    // A identidade nasce sem acções pendentes — com VERIFY_EMAIL o direct
    // grant recusaria a sessão e o registo não daria entrada nenhuma.
    expect(kc.identidades.get(email)?.accoes).toEqual([]);
  });

  it('idempotência: a mesma chave não cria segundo tenant nem segunda identidade', async () => {
    const nuit = nuitNovo();
    const email = `ana+${nuit}@padaria.mz`;
    const chave = `chave-idempotencia-${nuit}`;
    const contexto = { ip: `41.1.0.${(contador % 200) + 1}`, idempotencyKey: chave };

    const primeira = await registarTenant(corpo(nuit, email), contexto);
    expect(primeira.ok).toBe(true);
    if (!primeira.ok) throw new Error('esperava sucesso');
    expect(primeira.repetido).toBe(false);

    // Contagens depois da 1.ª entrega: a reentrega não lhes pode tocar.
    const chamadasIdentidade = kc.garantirUtilizador.mock.calls.length;
    const chamadasCredencial = kc.definirPalavraPasse.mock.calls.length;
    expect(chamadasCredencial).toBe(1);

    const segunda = await registarTenant(corpo(nuit, email), contexto);
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) throw new Error('esperava sucesso');
    expect(segunda.repetido).toBe(true);
    expect(segunda.tenantSlug).toBe(primeira.tenantSlug);
    expect(segunda.sub).toBe(primeira.sub);

    expect(await db.tenant.count({ where: { nuit } })).toBe(1);
    expect(await db.user.count({ where: { email } })).toBe(1);
    expect(kc.identidades.size).toBe(1);
    // A reentrega não volta a tocar no Keycloak: nem identidade, nem credencial.
    expect(kc.garantirUtilizador.mock.calls.length).toBe(chamadasIdentidade);
    expect(kc.definirPalavraPasse.mock.calls.length).toBe(chamadasCredencial);
  });
});
