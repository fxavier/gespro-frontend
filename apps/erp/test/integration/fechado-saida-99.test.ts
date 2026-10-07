/**
 * Oráculo da issue #99 — tenant com Assinatura FECHADA tem saída pelo produto.
 *
 * Antes: com a assinatura FECHADA ninguém entrava (`motivo: 'subscricao'`), mas
 * a mensagem mandava regularizar nas definições. Contrato:
 *
 *   - FECHADA comercial + utilizador com `assinatura:gerir` (o ADMIN) → sessão
 *     abre com `acesso: 'pagamento'` (só para regularizar a subscrição);
 *   - FECHADA comercial + utilizador sem essa permissão (operador) → recusado;
 *   - fechado pela GestPro (`Tenant.deletedAt`) → recusado, mesmo ao ADMIN e
 *     mesmo com a FECHADA (a decisão da GestPro ganha sempre, ADR-0032 §4);
 *   - controlo: LEITURA e ATIVA continuam como estavam.
 *
 * Exercita a resolução REAL `sub → User → acesso` de `@/lib/auth`
 * (`resolverUtilizadorLocal`, a mesma que o `authorize` e a re-resolução do
 * `jwt` usam), contra Postgres efémero. A função tem de ser exportada pelo
 * módulo — é o seam deste oráculo. Lida dinamicamente para que cada caso
 * falhe pela asserção e não o ficheiro inteiro.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// O `next-auth` não resolve `next/server` fora do runtime do Next (ESM sem
// extensão). Dobra-se SÓ a fábrica do Auth.js — o que se exercita é a
// resolução `sub → User → acesso`, que não passa por ela.
vi.mock('next-auth', () => {
  class CredentialsSignin extends Error {}
  return {
    default: () => ({ handlers: {}, auth: async () => null, signIn: async () => {}, signOut: async () => {} }),
    CredentialsSignin,
  };
});
vi.mock('next-auth/providers/credentials', () => ({ default: (c: unknown) => c }));

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type Resolucao =
  | { ok: true; userId: string; tenantId: string; permissions: string[]; acesso: string }
  | { ok: false; motivo: string };

describe.skipIf(skip)('#99 — FECHADA tem saída pelo produto (DB efémera)', () => {
  let db: any;
  let resolver: (sub: string) => Promise<Resolucao>;

  const sufixo = `fechado-saida-99-${Date.now()}`;

  async function criarTenant(
    nome: string,
    estado: 'FECHADA' | 'LEITURA' | 'ATIVA',
    opcoes: { apagado?: boolean } = {},
  ) {
    const id = `t-${nome}-${sufixo}`;
    await db.tenant.create({
      data: {
        id,
        nome: `Tenant ${nome}`,
        slug: `${nome}-${sufixo}`,
        nuit: `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9),
        deletedAt: opcoes.apagado ? new Date() : null,
      },
    });
    await db.assinatura.create({
      data: {
        tenantId: id,
        estado,
        trialFim: new Date(Date.now() - 60 * 86_400_000),
        leituraFim: estado === 'LEITURA' ? new Date(Date.now() + 10 * 86_400_000) : null,
      },
    });

    // Papéis do tenant: ADMIN com a permissão de gerir a subscrição; OPERADOR
    // com permissões de operação e a de VER a subscrição, nunca a de gerir.
    const admin = await db.role.create({ data: { tenantId: id, nome: 'ADMIN' } });
    const operador = await db.role.create({ data: { tenantId: id, nome: 'OPERADOR' } });
    await db.rolePermission.createMany({
      data: [
        { roleId: admin.id, permissionId: permIds['assinatura:gerir'] },
        { roleId: admin.id, permissionId: permIds['assinatura:ver'] },
        { roleId: admin.id, permissionId: permIds['vendas:criar'] },
        { roleId: operador.id, permissionId: permIds['assinatura:ver'] },
        { roleId: operador.id, permissionId: permIds['vendas:criar'] },
      ],
    });

    async function criarUser(papel: 'admin' | 'operador') {
      const sub = `kc-${papel}-${nome}-${sufixo}`;
      const user = await db.user.create({
        data: {
          id: `u-${papel}-${nome}-${sufixo}`,
          tenantId: id,
          email: `${papel}-${nome}-${sufixo}@test.mz`,
          nome: papel,
          keycloakSub: sub,
        },
      });
      await db.userRole.create({
        data: { userId: user.id, roleId: papel === 'admin' ? admin.id : operador.id },
      });
      return sub;
    }

    return { id, adminSub: await criarUser('admin'), operadorSub: await criarUser('operador') };
  }

  const permIds: Record<string, string> = {};
  let fechada: Awaited<ReturnType<typeof criarTenant>>;
  let fechadaApagada: Awaited<ReturnType<typeof criarTenant>>;
  let leitura: Awaited<ReturnType<typeof criarTenant>>;
  let ativa: Awaited<ReturnType<typeof criarTenant>>;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    const modAuth: any = await import('@/lib/auth');
    resolver = async (sub) => {
      expect(
        typeof modAuth.resolverUtilizadorLocal,
        '`resolverUtilizadorLocal` tem de ser exportado de @/lib/auth (seam do oráculo #99)',
      ).toBe('function');
      return modAuth.resolverUtilizadorLocal(sub);
    };

    for (const code of ['assinatura:gerir', 'assinatura:ver', 'vendas:criar']) {
      const p = await db.permission.upsert({
        where: { code },
        update: {},
        create: { code, descricao: code },
      });
      permIds[code] = p.id;
    }

    fechada = await criarTenant('fechada', 'FECHADA');
    fechadaApagada = await criarTenant('fechada-gestpro', 'FECHADA', { apagado: true });
    leitura = await criarTenant('leitura', 'LEITURA');
    ativa = await criarTenant('ativa', 'ATIVA');
  });

  it('FECHADA + admin (assinatura:gerir) → sessão abre em `pagamento`', async () => {
    const r = await resolver(fechada.adminSub);

    expect(r.ok, `esperava sessão aberta, veio ${JSON.stringify(r)}`).toBe(true);
    if (!r.ok) return;
    expect(r.acesso).toBe('pagamento');
    expect(r.tenantId).toBe(fechada.id);
    // Sem a permissão na sessão, a action de subscrição recusava-o à mesma.
    expect(r.permissions).toContain('assinatura:gerir');
  });

  it('FECHADA + operador (sem assinatura:gerir) → continua recusado', async () => {
    const r = await resolver(fechada.operadorSub);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Não é um problema de provisionamento nem de utilizador desactivado.
    expect(['nao-provisionado', 'inactivo']).not.toContain(r.motivo);
  });

  it('fechado pela GestPro (deletedAt) → admin recusado, mesmo com FECHADA', async () => {
    const r = await resolver(fechadaApagada.adminSub);
    expect(r.ok).toBe(false);
  });

  it('fechado pela GestPro (deletedAt) → operador recusado', async () => {
    const r = await resolver(fechadaApagada.operadorSub);
    expect(r.ok).toBe(false);
  });

  it('só o admin da FECHADA comercial entra; os outros três são recusados', async () => {
    // Controlo de sanidade do seam: os dois recusados recusam-se de facto, e o
    // admin da FECHADA comercial é o ÚNICO que entra.
    const resultados = await Promise.all([
      resolver(fechada.adminSub),
      resolver(fechada.operadorSub),
      resolver(fechadaApagada.adminSub),
      resolver(fechadaApagada.operadorSub),
    ]);
    expect(resultados.map((r) => r.ok)).toEqual([true, false, false, false]);
  });

  it('controlo: LEITURA continua a abrir para todos em `leitura`', async () => {
    const [a, o] = await Promise.all([resolver(leitura.adminSub), resolver(leitura.operadorSub)]);
    expect(a).toMatchObject({ ok: true, acesso: 'leitura' });
    expect(o).toMatchObject({ ok: true, acesso: 'leitura' });
  });

  it('controlo: ATIVA continua `aberto` para todos', async () => {
    const [a, o] = await Promise.all([resolver(ativa.adminSub), resolver(ativa.operadorSub)]);
    expect(a).toMatchObject({ ok: true, acesso: 'aberto' });
    expect(o).toMatchObject({ ok: true, acesso: 'aberto' });
  });
});
