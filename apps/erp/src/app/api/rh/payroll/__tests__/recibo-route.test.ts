/**
 * Oráculo da issue #200 — o recibo de vencimento (GET /api/rh/payroll/[id]/recibo).
 *
 * Contrato:
 *   1. a data «Pago em» sai pelo `src/lib/format-date.ts` (fuso fixo Africa/Maputo),
 *      nunca por `toLocaleDateString` no servidor — que corre em UTC e, perto da
 *      meia-noite, imprime o dia anterior;
 *   2. a resposta leva `Cache-Control: no-store` — é um documento pessoal (salário,
 *      NUIT, NIB) e nenhuma cache intermédia o pode guardar.
 *
 * Passa pelo `withApi` verdadeiro (só a sessão, o contexto de tenant e o limitador
 * são dobrados), porque o que interessa é o cabeçalho que chega ao cliente.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), obterRecibo: vi.fn() }));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/server/security/rate-limiter', () => ({
  exportLimiter: { consume: vi.fn(async () => ({ limited: false, retryAfterSec: 0 })) },
  rateLimitedResponse: vi.fn(() => new Response(null, { status: 429 })),
}));
vi.mock('@/server/services/pessoas-projetos/payroll.service', () => ({
  PayrollService: { obterRecibo: mocks.obterRecibo },
}));

import { formatarData } from '@/lib/format-date';

// Último dia de Março às 22h30 UTC = 1 de Abril às 00h30 em Maputo (UTC+2).
const PAGO_EM = new Date('2026-03-31T22:30:00.000Z');

const D = (v: string) => new Prisma.Decimal(v);

function recibo(dataPagamento: Date | null) {
  return {
    payroll: {
      id: 'pay-1',
      mesReferencia: 3,
      anoReferencia: 2026,
      status: 'PAGO',
      salarioBruto: D('50000'),
      descontoInss: D('1500'),
      descontoIrps: D('4000'),
      descontoOutros: D('0'),
      salarioLiquido: D('44500'),
      encargoInssEntidade: D('2000'),
      custoTotalEntidade: D('52000'),
      dataPagamento,
    },
    colaborador: {
      codigo: 'COL-001',
      nome: 'Ana Recibo',
      nuit: '100000001',
      niss: null,
      cargo: null,
      departamento: null,
      bancoNib: null,
    },
    empresa: { nome: 'Empresa Teste', nuit: '400000001' },
    linhas: [],
  };
}

function pedido() {
  return new NextRequest('http://localhost/api/rh/payroll/pay-1/recibo', { method: 'GET' });
}

async function chamar() {
  // Importação dinâmica e solta de tipos: o caso falha pela asserção, não pelo ficheiro.
  const mod: any = await import('../[id]/recibo/route');
  return (await mod.GET(pedido(), { params: Promise.resolve({ id: 'pay-1' }) })) as Response;
}

async function textoDoPdf(res: Response): Promise<string> {
  return Buffer.from(await res.arrayBuffer()).toString('latin1');
}

let tzOriginal: string | undefined;

beforeAll(() => {
  // O servidor corre em UTC (CLAUDE.md, «Datas na UI»). Forçar aqui torna o caso
  // independente do fuso da máquina que corre o teste.
  tzOriginal = process.env.TZ;
  process.env.TZ = 'UTC';
});

afterAll(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    user: {
      id: 'user-1',
      tenantId: 'tenant-1',
      permissions: ['rh:payroll:read'],
      emailVerificado: true,
      acesso: 'total',
    },
  });
});

describe('#200 — recibo de vencimento', () => {
  it('a data «Pago em» é o dia civil de Maputo, formatado pelo format-date', async () => {
    mocks.obterRecibo.mockResolvedValue(recibo(PAGO_EM));

    const res = await chamar();
    expect(res.status).toBe(200);
    const pdf = await textoDoPdf(res);

    // Âncora independente do format-date: em Maputo o pagamento foi a 1 de Abril.
    expect(formatarData(PAGO_EM)).toBe('01/04/2026');
    expect(pdf).toContain(`Pago em: ${formatarData(PAGO_EM)}`);
    // O dia UTC (o que o toLocaleDateString do servidor imprime) não pode aparecer.
    expect(pdf).not.toContain('31/03/2026');
  });

  it('responde com Cache-Control: no-store (documento pessoal)', async () => {
    mocks.obterRecibo.mockResolvedValue(recibo(PAGO_EM));

    const res = await chamar();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const cc = res.headers.get('Cache-Control') ?? '';
    expect(cc.split(',').map((s) => s.trim().toLowerCase())).toContain('no-store');
  });

  it('sem data de pagamento, continua sem linha «Pago em» e com no-store', async () => {
    mocks.obterRecibo.mockResolvedValue(recibo(null));

    const res = await chamar();
    expect(res.status).toBe(200);
    expect(await textoDoPdf(res)).not.toContain('Pago em:');
    expect(res.headers.get('Cache-Control') ?? '').toMatch(/(^|,\s*)no-store(\s*,|$)/i);
  });
});
