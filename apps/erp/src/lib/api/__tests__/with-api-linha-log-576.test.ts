/**
 * Contrato «linha de registo do withApi» ↔ filtros de métrica do CloudWatch (#576).
 *
 * Os alarmes de produção NÃO lêem métricas da app: lêem as linhas JSON que o
 * logger escreve no stdout/stderr, que o App Runner envia para o CloudWatch Logs.
 * Os padrões vivem em `infra/modules/monitoring/main.tf`:
 *
 *   cron_falhou  { ($.url = "/api/cron/*") && (($.status >= 400) || ($.level = "error")) }
 *   cron_sucesso { ($.msg = "request end") && ($.url = "/api/cron/*") && ($.status = 200) }
 *   erros        { $.level = "error" }
 *
 * Se um destes campos mudar de nome, de tipo (ex.: `status` em string — o `>= 400`
 * do CloudWatch só compara números) ou de stream, os alarmes calam-se SEM ERRO
 * NENHUM. Este teste tranca o lado da app; quem o mudar muda os padrões no IaC
 * na mesma alteração.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/server/db/tenant-extension', () => ({
  runWithTenantContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));

import { withApi } from '@/lib/api/with-api';
import { AppError } from '@/lib/errors';

type Linha = Record<string, unknown>;

let stdout: Linha[];
let stderr: Linha[];

function capturar(destino: () => Linha[]) {
  return ((chunk: string | Uint8Array) => {
    const texto = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    for (const l of texto.split('\n').filter(Boolean)) {
      try {
        destino().push(JSON.parse(l));
      } catch {
        // linha não-JSON (de outra origem): não é do logger
      }
    }
    return true;
  }) as typeof process.stdout.write;
}

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(capturar(() => stdout));
  vi.spyOn(process.stderr, 'write').mockImplementation(capturar(() => stderr));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const pedido = (path: string) => new NextRequest(new URL(path, 'http://localhost:3000'));

describe('#576 — linhas do withApi que os filtros do CloudWatch lêem', () => {
  it('fim de pedido com sucesso: stdout, level info, url, status numérico, msg «request end»', async () => {
    const rota = withApi(async () => NextResponse.json({ ok: true }), { public: true });
    const res = await rota(pedido('/api/cron/x'));
    expect(res.status).toBe(200);

    const fim = stdout.find((l) => l.msg === 'request end');
    expect(fim, 'sem linha «request end» no stdout').toBeDefined();
    expect(fim).toMatchObject({ level: 'info', url: '/api/cron/x', status: 200, msg: 'request end' });
    expect(typeof fim!.status, '`status` tem de ser número: o filtro compara `>= 400`').toBe('number');
  });

  it('cron que responde 500: a mesma linha «request end» com status 500 (número)', async () => {
    const rota = withApi(async () => NextResponse.json({}, { status: 500 }), { public: true });
    await rota(pedido('/api/cron/x'));

    const fim = stdout.find((l) => l.msg === 'request end');
    expect(fim).toMatchObject({ level: 'info', url: '/api/cron/x', status: 500 });
  });

  it('erro inesperado: stderr, level error, com url — e sem «request end»', async () => {
    const rota = withApi(
      async () => {
        throw new Error('rebentou');
      },
      { public: true },
    );
    const res = await rota(pedido('/api/cron/x'));
    expect(res.status).toBe(500);

    const erro = stderr.find((l) => l.level === 'error');
    expect(erro, 'sem linha `level: error` no stderr').toBeDefined();
    expect(erro).toMatchObject({ level: 'error', url: '/api/cron/x' });
    expect([...stdout, ...stderr].some((l) => l.msg === 'request end')).toBe(false);
  });

  it('AppError: stderr, level warn, com url e status numérico', async () => {
    const rota = withApi(
      async () => {
        throw new AppError('QUALQUER', 'recusado', 409);
      },
      { public: true },
    );
    await rota(pedido('/api/cron/x'));

    const aviso = stderr.find((l) => l.level === 'warn');
    expect(aviso).toMatchObject({ level: 'warn', url: '/api/cron/x', status: 409 });
  });
});
