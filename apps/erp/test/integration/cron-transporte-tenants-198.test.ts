/**
 * Oráculo da issue #198 — `/api/cron/transporte-alertas` só processa tenants com acesso.
 *
 * Antes: `prismaBase.tenant.findMany()` sem filtro — o cron recalculava documentos (e
 * emitia notificações) em tenants apagados pela GestPro (`Tenant.deletedAt`) e com a
 * Assinatura FECHADA.
 *
 * Contrato (decisão do orquestrador; a opção conservadora, a mesma lista que o cron
 * `abrir-exercicio` já usa):
 *   processados  → `Tenant.deletedAt` nulo E `Assinatura.estado` ∈ {TRIAL, ATIVA, LEITURA}
 *                  (os estados que `estadoDeAcesso` trata como `aberto`/`leitura`);
 *   excluídos    → tenant apagado (mesmo com ATIVA), FECHADA, estados legados que
 *                  `estadoDeAcesso` fecha (CANCELADA), e tenant sem Assinatura (como no
 *                  `abrir-exercicio`, que só parte das assinaturas).
 *   O cron tem de correr de facto: hoje `recalcularEstadosDocumentos` usa o cliente estendido
 *   fora de `runWithTenantContext` e o GET inteiro devolve 500 (`SEM_CONTEXTO_TENANT`) — os
 *   casos positivos exigem 200 e o recálculo feito nos tenants com acesso.
 *   Prova: um documento de viatura já expirado mas gravado `VALIDO` em cada tenant.
 *   Depois do GET, só os processados passam a `EXPIRADO` e só eles aparecem em
 *   `data.resultados`; nos excluídos o documento fica `VALIDO` (nada escrito).
 *
 * Exercita o handler REAL da rota contra Postgres efémero. Os tenants de outros ficheiros
 * que partilhem o contentor não entram nas asserções (filtra-se pelos ids deste ficheiro).
 *
 * Requer: Docker em execução + @testcontainers/postgresql.
 * SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// O provider de e-mail usa `require('./noop')`, que não resolve no vitest ESM. Dobra-se só
// o envio — o que se prova é o conjunto de tenants processados, não o correio.
vi.mock('@/server/email', () => ({ emailProvider: { enviar: async () => {} } }));

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type EstadoAss = 'TRIAL' | 'ATIVA' | 'LEITURA' | 'FECHADA' | 'CANCELADA';

describe.skipIf(skip)('#198 — cron transporte-alertas filtra tenants sem acesso (DB efémera)', () => {
  let db: any;
  let resposta: { status: number; body: any };

  const sufixo = `cron-transporte-tenants-198-${Date.now()}`;
  const SEGREDO = `segredo-${sufixo}`;
  let seqNuit = 0;

  /** Cria tenant + (opcional) assinatura + viatura com um documento expirado gravado VALIDO. */
  async function criarTenant(
    nome: string,
    estado: EstadoAss | null,
    opcoes: { apagado?: boolean } = {},
  ): Promise<{ id: string; docId: string }> {
    const id = `t-${nome}-${sufixo}`;
    seqNuit += 1;
    await db.tenant.create({
      data: {
        id,
        nome: `Tenant ${nome}`,
        slug: `${nome}-${sufixo}`,
        nuit: `9${String(Date.now()).slice(-6)}${String(seqNuit).padStart(2, '0')}`,
        deletedAt: opcoes.apagado ? new Date() : null,
      },
    });
    if (estado) {
      await db.assinatura.create({
        data: {
          tenantId: id,
          estado,
          trialFim:
            estado === 'TRIAL'
              ? new Date(Date.now() + 10 * 86_400_000)
              : new Date(Date.now() - 60 * 86_400_000),
          leituraFim: estado === 'LEITURA' ? new Date(Date.now() + 10 * 86_400_000) : null,
        },
      });
    }
    const viatura = await db.viatura.create({
      data: {
        tenantId: id,
        matricula: `MT-${nome}`.slice(0, 20),
        marca: 'Toyota',
        modelo: 'Hilux',
        tipoViatura: 'LIGEIRO_MERCADORIAS',
        capacidade: '1000',
        unidadeCapacidade: 'KG',
        localActividade: 'Maputo',
        dataInicioActividade: new Date('2025-01-01T10:00:00Z'),
      },
    });
    const doc = await db.documentoViatura.create({
      data: {
        tenantId: id,
        viaturaId: viatura.id,
        tipo: 'SEGURO',
        numero: `SEG-${nome}`,
        dataEmissao: new Date('2024-01-01T10:00:00Z'),
        dataValidade: new Date('2025-01-01T10:00:00Z'), // já expirado
        entidadeEmissora: 'Seguradora',
        estado: 'VALIDO', // desactualizado de propósito: o cron é que o recalcula
      },
    });
    return { id, docId: doc.id };
  }

  const t: Record<string, { id: string; docId: string }> = {};

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));

    t.ativa = await criarTenant('ativa', 'ATIVA');
    t.trial = await criarTenant('trial', 'TRIAL');
    t.leitura = await criarTenant('leitura', 'LEITURA');
    t.fechada = await criarTenant('fechada', 'FECHADA');
    t.apagado = await criarTenant('apagado', 'ATIVA', { apagado: true });
    t.cancelada = await criarTenant('cancelada', 'CANCELADA');
    t.semAssinatura = await criarTenant('sem-ass', null);

    process.env.CRON_SECRET = SEGREDO;
    const mod: any = await import('@/app/api/cron/transporte-alertas/route');
    const req: any = {
      headers: new Headers({ authorization: `Bearer ${SEGREDO}` }),
      nextUrl: new URL('http://localhost/api/cron/transporte-alertas'),
      url: 'http://localhost/api/cron/transporte-alertas',
    };
    const res = await mod.GET(req);
    resposta = { status: res.status, body: await res.json() };
  });

  async function estadoDoc(chave: string): Promise<string> {
    const d = await db.documentoViatura.findUnique({ where: { id: t[chave].docId } });
    return d.estado;
  }

  function idsProcessados(): string[] {
    const resultados: Array<{ tenantId: string }> = resposta.body?.data?.resultados ?? [];
    return resultados.map((r) => r.tenantId);
  }

  it('o cron responde 200', () => {
    expect(resposta.status, JSON.stringify(resposta.body)).toBe(200);
  });

  it.each(['ativa', 'trial', 'leitura'])(
    'tenant com acesso (%s) é processado: documento passa a EXPIRADO e aparece nos resultados',
    async (chave) => {
      expect(await estadoDoc(chave)).toBe('EXPIRADO');
      expect(idsProcessados()).toContain(t[chave].id);
    },
  );

  it.each([
    ['fechada', 'Assinatura FECHADA'],
    ['apagado', 'Tenant.deletedAt (com ATIVA)'],
    ['cancelada', 'estado legado CANCELADA'],
    ['semAssinatura', 'sem Assinatura'],
  ])('tenant sem acesso (%s — %s) não é processado: documento fica VALIDO e fora dos resultados', async (chave) => {
    // Guarda contra a passagem vazia: um cron que rebenta (ou não processa ninguém) também
    // deixa estes documentos VALIDO. A exclusão só conta se o tenant activo foi processado.
    expect(resposta.status, JSON.stringify(resposta.body)).toBe(200);
    expect(idsProcessados(), 'o tenant ATIVA tem de ter sido processado').toContain(t.ativa.id);
    expect(idsProcessados()).not.toContain(t[chave].id);
    expect(await estadoDoc(chave)).toBe('VALIDO');
  });
});
