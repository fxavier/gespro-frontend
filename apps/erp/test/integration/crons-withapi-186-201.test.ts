/**
 * Oráculo das issues #186 e #201 contra Postgres efémero — o handler REAL de
 * `/api/cron/transporte-alertas`, com documentos reais a recalcular.
 *
 * #201 — a resposta passa a `motoristasActualizados` (por tenant) e
 * `totalMotoristasActualizados` (total). Decisão conservadora (a issue pede
 * «corrigir com compatibilidade»): a chave nova é obrigatória e tem o número certo;
 * a antiga (`motoistas…`) pode ficar como alias, mas se ficar tem o mesmo valor.
 *
 * #186 — a rota corre dentro do `withApi`: a resposta traz `x-request-id`.
 *
 * Prova: um tenant ATIVA com um documento de viatura e DOIS documentos de motorista
 * expirados mas gravados `VALIDO`. Depois do GET: viaturas=1, motoristas=2 na linha do
 * tenant, os documentos passam a `EXPIRADO`, e os totais contam pelo menos esses
 * (outros ficheiros podem partilhar o contentor).
 *
 * Requer: Docker em execução + @testcontainers/postgresql.
 * SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// O provider de e-mail usa `require('./noop')`, que não resolve no vitest ESM. Dobra-se só o envio.
vi.mock('@/server/email', () => ({ emailProvider: { enviar: async () => {} } }));

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('#186/#201 — transporte-alertas no withApi, com motoristasActualizados (DB efémera)', () => {
  let db: any;
  let resposta: { status: number; requestId: string | null; body: any };

  const sufixo = `crons-withapi-186-201-${Date.now()}`;
  const SEGREDO = `segredo-${sufixo}`;
  const tenantId = `t-ativa-${sufixo}`;
  const docs: { viatura: string; motorista: string[] } = { viatura: '', motorista: [] };

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));

    await db.tenant.create({
      data: {
        id: tenantId,
        nome: 'Tenant crons-withapi-186-201',
        slug: `ativa-${sufixo}`,
        nuit: `8${String(Date.now()).slice(-8)}`,
      },
    });
    await db.assinatura.create({
      data: { tenantId, estado: 'ATIVA', trialFim: new Date(Date.now() - 60 * 86_400_000) },
    });

    const viatura = await db.viatura.create({
      data: {
        tenantId,
        matricula: 'MT-186-201',
        marca: 'Toyota',
        modelo: 'Hilux',
        tipoViatura: 'LIGEIRO_MERCADORIAS',
        capacidade: '1000',
        unidadeCapacidade: 'KG',
        localActividade: 'Maputo',
        dataInicioActividade: new Date('2025-01-01T10:00:00Z'),
      },
    });
    const dv = await db.documentoViatura.create({
      data: {
        tenantId,
        viaturaId: viatura.id,
        tipo: 'SEGURO',
        numero: 'SEG-186-201',
        dataEmissao: new Date('2024-01-01T10:00:00Z'),
        dataValidade: new Date('2025-01-01T10:00:00Z'), // já expirado
        entidadeEmissora: 'Seguradora',
        estado: 'VALIDO', // desactualizado de propósito
      },
    });
    docs.viatura = dv.id;

    const motorista = await db.motorista.create({
      data: {
        tenantId,
        nomeCompleto: 'Motorista crons-withapi-186-201',
        contacto: '840000000',
        numeroCarta: 'CC-186-201',
        categoriaCarta: ['B'],
        dataEmissaoCarta: new Date('2020-01-01T10:00:00Z'),
        validadeCarta: new Date('2030-01-01T10:00:00Z'),
      },
    });
    for (const tipo of ['CARTA_CONDUCAO', 'BI'] as const) {
      const dm = await db.documentoMotorista.create({
        data: {
          tenantId,
          motoristaId: motorista.id,
          tipo,
          numero: `${tipo}-186-201`,
          dataEmissao: new Date('2020-01-01T10:00:00Z'),
          dataValidade: new Date('2025-01-01T10:00:00Z'), // já expirado
          entidadeEmissora: 'INATTER',
          estado: 'VALIDO', // desactualizado de propósito
        },
      });
      docs.motorista.push(dm.id);
    }

    process.env.CRON_SECRET = SEGREDO;
    const { NextRequest } = await import('next/server');
    const mod: any = await import('@/app/api/cron/transporte-alertas/route');
    const req = new NextRequest('http://localhost/api/cron/transporte-alertas', {
      method: 'GET',
      headers: { authorization: `Bearer ${SEGREDO}` },
    });
    const res: Response = await mod.GET(req);
    resposta = { status: res.status, requestId: res.headers.get('x-request-id'), body: await res.json() };
  });

  function linhaDoTenant(): any {
    const resultados: any[] = resposta.body?.data?.resultados ?? [];
    return resultados.find((r) => r.tenantId === tenantId);
  }

  it('o cron responde 200', () => {
    expect(resposta.status, JSON.stringify(resposta.body)).toBe(200);
  });

  it('#186 — a resposta traz x-request-id (passou pelo withApi)', () => {
    expect(resposta.requestId ?? '').toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('o recálculo aconteceu: os três documentos passam a EXPIRADO', async () => {
    const v = await db.documentoViatura.findUnique({ where: { id: docs.viatura } });
    expect(v.estado).toBe('EXPIRADO');
    for (const id of docs.motorista) {
      const m = await db.documentoMotorista.findUnique({ where: { id } });
      expect(m.estado).toBe('EXPIRADO');
    }
  });

  it('#201 — a linha do tenant tem motoristasActualizados = 2 e viaturasActualizadas = 1', () => {
    const linha = linhaDoTenant();
    expect(linha, JSON.stringify(resposta.body)).toBeDefined();
    expect(linha).toHaveProperty('motoristasActualizados', 2);
    expect(linha).toHaveProperty('viaturasActualizadas', 1);
    if ('motoistasActualizados' in linha) {
      expect(linha.motoistasActualizados).toBe(linha.motoristasActualizados);
    }
  });

  it('#201 — totalMotoristasActualizados conta os do tenant (e o alias antigo, se ficar, concorda)', () => {
    const data = resposta.body?.data ?? {};
    expect(typeof data.totalMotoristasActualizados, JSON.stringify(data)).toBe('number');
    expect(data.totalMotoristasActualizados).toBeGreaterThanOrEqual(2);
    expect(data.totalViaturasActualizadas).toBeGreaterThanOrEqual(1);
    // O total é a soma das linhas — com a grafia nova.
    const soma = (data.resultados ?? []).reduce(
      (s: number, r: any) => s + (r.motoristasActualizados ?? 0),
      0,
    );
    expect(data.totalMotoristasActualizados).toBe(soma);
    if ('totalMotoistasActualizados' in data) {
      expect(data.totalMotoistasActualizados).toBe(data.totalMotoristasActualizados);
    }
  });
});
