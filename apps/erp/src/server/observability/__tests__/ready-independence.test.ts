/**
 * Teste de independência do /api/ready (task 2.10).
 *
 * Verifica por leitura de código que /api/ready NÃO depende do Keycloak
 * nem do Valkey. Derrubaria instâncias saudáveis do ERP se dependesse
 * (regra explícita no ADR-0019 e na instrução da task 2.10).
 *
 * Este teste é uma verificação estrutural: lê o código-fonte e procura
 * referências proibidas. Não executa o handler (precisa de DB real).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readyRoutePath = resolve(
  __dirname,
  '../../../app/api/ready/route.ts',
);

const readyRouteCode = readFileSync(readyRoutePath, 'utf-8');

describe('/api/ready — independência de serviços externos', () => {
  it('não importa nem referencia Keycloak', () => {
    // O handler de /api/ready não deve mencionar Keycloak nem KEYCLOAK_*
    expect(readyRouteCode.toLowerCase()).not.toContain('keycloak');
  });

  it('não importa nem referencia Valkey/Redis', () => {
    // O handler de /api/ready não deve mencionar Valkey, Redis nem VALKEY_URL
    expect(readyRouteCode.toLowerCase()).not.toContain('valkey');
    expect(readyRouteCode.toLowerCase()).not.toContain('redis');
  });

  it('não importa sondas de saúde (probes)', () => {
    // As sondas são best-effort e correm em background — não bloqueiam /api/ready
    expect(readyRouteCode).not.toContain('probes');
    expect(readyRouteCode).not.toContain('startProbes');
  });

  it('contém SELECT 1 (verifica a base de dados e nada mais)', () => {
    expect(readyRouteCode).toContain('SELECT 1');
  });

  it('usa prismaBase (cliente cru, sem extensões de tenant)', () => {
    // prismaBase em vez de prisma para evitar dependências de contexto de tenant
    expect(readyRouteCode).toContain('prismaBase');
  });
});

// ---------------------------------------------------------------------------
// Verificação das sondas (probes.ts)
// ---------------------------------------------------------------------------

const probesPath = resolve(
  __dirname,
  '../probes.ts',
);

const probesCode = readFileSync(probesPath, 'utf-8');

describe('probes.ts — sondas como best-effort', () => {
  it('startProbes não lança (usa void para ignorar erros)', () => {
    // As chamadas às sondas devem usar void (fire-and-forget)
    expect(probesCode).toContain('void probeKeycloak()');
    expect(probesCode).toContain('void probeValkey()');
  });

  it('usa AbortSignal.timeout (não bloqueia indefinidamente)', () => {
    expect(probesCode).toContain('AbortSignal.timeout');
  });

  it('captura erros em bloco catch (sondas nunca propagam erros)', () => {
    const catchCount = (probesCode.match(/} catch/g) ?? []).length;
    expect(catchCount).toBeGreaterThanOrEqual(2); // Pelo menos um catch por sonda
  });
});
