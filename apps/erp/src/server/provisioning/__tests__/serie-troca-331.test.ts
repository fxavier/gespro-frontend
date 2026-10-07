/**
 * Oráculo #331 (parte pura) — série de documento TROCA.
 *
 * O número da troca deixa de ser `TRC-${Date.now()}` e passa a sair de
 * `proximoNumeroSerie(tx, 'TROCA', …)`. Para isso: valor `TROCA` no enum `TipoSerieDocumento`,
 * `{ tipo: 'TROCA', prefixo: 'TRC' }` em SERIES_INICIAIS (tenants futuros) e duas migrações à mão
 * (precedente 20261002150000_pos_fatura_recibo_enum + 20261002150100_pos_consumidor_final_fr):
 * primeiro o ALTER TYPE sozinho, depois o INSERT … SELECT … ON CONFLICT DO NOTHING (tenants
 * existentes). O comportamento na base vive em test/integration/troca-serie-nc-tranca-331.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import * as client from '@prisma/client';
import { SERIES_INICIAIS } from '@/server/provisioning/tenant-bootstrap';

const MIGRACOES = path.resolve(__dirname, '../../../../prisma/migrations');
const SCHEMA_COMERCIAL = path.resolve(__dirname, '../../../../prisma/schema/comercial.prisma');

function migracoes(): Array<{ nome: string; sql: string }> {
  return readdirSync(MIGRACOES)
    .filter((m) => existsSync(path.join(MIGRACOES, m, 'migration.sql')))
    .sort()
    .map((nome) => ({ nome, sql: readFileSync(path.join(MIGRACOES, nome, 'migration.sql'), 'utf8') }));
}

describe('Série TROCA (#331)', () => {
  it('TROCA é um valor do enum TipoSerieDocumento', () => {
    const enums = (client as any).$Enums ?? client;
    const tipo = enums.TipoSerieDocumento as Record<string, string> | undefined;
    expect(tipo, 'enum TipoSerieDocumento gerado').toBeDefined();
    expect(Object.values(tipo!)).toContain('TROCA');
  });

  it('é uma das séries iniciais de todo o tenant, com prefixo TRC', () => {
    expect(SERIES_INICIAIS).toContainEqual({ tipo: 'TROCA', prefixo: 'TRC' });
  });

  it("migração 1 acrescenta o valor ao enum, sozinha (o Postgres não deixa usar o valor na mesma transacção)", () => {
    const alter = migracoes().filter((m) => /ALTER TYPE "TipoSerieDocumento" ADD VALUE 'TROCA'/.test(m.sql));
    expect(alter, 'uma migração com ALTER TYPE … ADD VALUE \'TROCA\'').toHaveLength(1);
    expect(alter[0].sql, 'o valor não é usado na migração que o acrescenta').not.toMatch(/INSERT INTO/);
  });

  it('migração 2, posterior, semeia a série TROCA/TRC dos tenants existentes com INSERT … SELECT … ON CONFLICT DO NOTHING', () => {
    const todas = migracoes();
    const iAlter = todas.findIndex((m) => /ALTER TYPE "TipoSerieDocumento" ADD VALUE 'TROCA'/.test(m.sql));
    const iInsert = todas.findIndex((m) => /INSERT INTO "SerieDocumento"/.test(m.sql) && /'TROCA'/.test(m.sql));
    expect(iAlter, 'migração do enum').toBeGreaterThanOrEqual(0);
    expect(iInsert, 'migração de dados').toBeGreaterThanOrEqual(0);
    expect(iInsert, 'a de dados corre depois da do enum').toBeGreaterThan(iAlter);
    const sql = todas[iInsert].sql;
    expect(sql).toMatch(/'TRC'/);
    expect(sql).toMatch(/FROM "Tenant"/);
    expect(sql).toMatch(/ON CONFLICT DO NOTHING/);
  });

  it('o comentário de Troca.numero no schema deixa de falar em numeração informal sem série', () => {
    const schema = readFileSync(SCHEMA_COMERCIAL, 'utf8');
    const linha = schema
      .slice(schema.indexOf('model Troca {'))
      .split('\n')
      .find((l) => /^\s*numero\s/.test(l));
    expect(linha, 'campo numero do model Troca').toBeDefined();
    expect(linha).not.toMatch(/informal/i);
    expect(linha).not.toMatch(/sem série/i);
  });
});
