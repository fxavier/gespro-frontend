/**
 * Oráculo #95 — forma do contrato payroll × benefícios (leitura do código-fonte).
 *
 * O comportamento é provado contra Postgres real em
 * `test/integration/payroll-beneficios.test.ts`. Aqui fica só o que a issue/decisão
 * pede e que nenhum teste de comportamento consegue ver:
 *   - o comentário «PONTO DE EXTENSÃO … sem dependência hoje» sai (a dependência passa a existir);
 *   - o carregador em lote `beneficiosDoMes` existe ao lado de `agregadosDoMes` e é chamado
 *     pelos DOIS caminhos de cálculo (`processarFolhaMes` e `recalcularPayrollNoTx`);
 *   - nenhuma chamada por colaborador a `linhasPayrollDeBeneficios` dentro do serviço (N+1 e
 *     fora da tx: usa o `prisma` global, não o `tx`);
 *   - a exclusão dos benefícios não tributáveis está explicada num comentário.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FONTE = readFileSync(
  path.resolve(__dirname, '../payroll.service.ts'),
  'utf8',
);

/** Corpo (texto) de uma função/método do ficheiro, do nome até ao início do seguinte. */
function corpo(inicio: RegExp, fim: RegExp): string {
  const i = FONTE.search(inicio);
  expect(i, `início ${inicio}`).toBeGreaterThanOrEqual(0);
  const resto = FONTE.slice(i + 1);
  const j = resto.search(fim);
  return j < 0 ? resto : resto.slice(0, j);
}

describe('#95 — payroll.service consome os benefícios', () => {
  it('o comentário «PONTO DE EXTENSÃO … sem dependência hoje» foi removido', () => {
    expect(FONTE).not.toMatch(/PONTO DE EXTENS[ÃA]O/);
    expect(FONTE).not.toMatch(/sem depend[êe]ncia hoje/);
  });

  it('existe o carregador em lote beneficiosDoMes(tx, colaboradorIds, periodo, tenantId)', () => {
    expect(FONTE).toMatch(/async function beneficiosDoMes\s*\(\s*tx\b[\s\S]*?colaboradorIds[\s\S]*?periodo[\s\S]*?tenantId/);
  });

  it('processarFolhaMes chama beneficiosDoMes', () => {
    const c = corpo(/async processarFolhaMes\s*\(/, /\n  async \w+\s*\(/);
    expect(c).toMatch(/beneficiosDoMes\s*\(\s*tx\b/);
  });

  it('recalcularPayrollNoTx chama beneficiosDoMes', () => {
    const c = corpo(/async function recalcularPayrollNoTx\s*\(/, /\n(?:async )?function \w+|\nexport const PayrollService/);
    expect(c).toMatch(/beneficiosDoMes\s*\(\s*tx\b/);
  });

  it('não chama linhasPayrollDeBeneficios por colaborador (N+1, fora da tx)', () => {
    const codigo = FONTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(codigo).not.toMatch(/linhasPayrollDeBeneficios\s*\(/);
  });

  it('um comentário explica porque os benefícios não tributáveis não entram na folha', () => {
    const comentarios = (FONTE.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).join('\n');
    expect(comentarios).toMatch(/n[ãa]o[ -]tribut[áa]ve(l|is)|tributavel\s*(===|=)\s*false/i);
  });
});
