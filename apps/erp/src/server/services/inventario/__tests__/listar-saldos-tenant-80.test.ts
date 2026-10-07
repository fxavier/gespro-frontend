/**
 * Oráculo do nó A:stock-saldos-80 (issue #80) — `listarSaldos` filtra o tenant EXPLICITAMENTE.
 *
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * A extensão de tenant injecta o `tenantId` nos `findMany` dentro do contexto, mas a regra da
 * casa (CLAUDE.md, «Multi-tenancy») é que os serviços filtram por `tenantId` explicitamente —
 * o comportamento cross-tenant é provado em test/integration/stock-saldos-80.test.ts (S4);
 * aqui prova-se que o filtro está escrito no `where` de `listarSaldos` e não depende só da extensão.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FONTE = path.resolve(__dirname, '../stock.service.ts');

function corpoDe(nome: string, src: string): string {
  const inicio = src.search(new RegExp(`export\\s+async\\s+function\\s+${nome}\\s*\\(`));
  expect(inicio, `função ${nome} não encontrada`).toBeGreaterThanOrEqual(0);
  const resto = src.slice(inicio + 1);
  const fim = resto.search(/\nexport\s/);
  return fim === -1 ? resto : resto.slice(0, fim);
}

describe('#80 — listarSaldos filtra tenantId explicitamente', () => {
  it('o where de listarSaldos inclui tenantId: ctx.tenantId', () => {
    const corpo = corpoDe('listarSaldos', fs.readFileSync(FONTE, 'utf8'));
    expect(corpo).toMatch(/tenantId\s*:\s*ctx\.tenantId/);
  });
});
