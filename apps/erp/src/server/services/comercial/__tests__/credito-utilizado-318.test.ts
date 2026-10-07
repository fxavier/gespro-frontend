/**
 * Oráculo #318 (parte estática) — `Cliente.creditoUtilizadoMT` está morto.
 *
 * Escrito ANTES da implementação; quem implementa não o altera.
 *
 * O crédito utilizado passa a ser derivado das facturas (`creditoUtilizadoDoCliente`, provado
 * contra Postgres real em `test/integration/credito-utilizado-318.test.ts`). O campo fica no
 * schema sem migração, por isso:
 *   - nenhum código de `src/` o escreve: os escritores `incrementarCreditoUtilizado` /
 *     `liberarCredito` (sem chamador em produção) desaparecem com o contador;
 *   - os dois leitores que decidiam por ele (relatório de clientes e a recusa
 *     `CLIENTE_COM_DEBITOS_PENDENTES` do `desativar`) deixam de o ler;
 *   - o schema diz, junto ao campo, que está morto — para ninguém lhe voltar a dar um escritor.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ERP = process.cwd();

/** `git grep -n` a partir de apps/erp; sem resultados devolve []. */
function gitGrep(padrao: string, ...caminhos: string[]): string[] {
  try {
    const out = execFileSync('git', ['grep', '-nE', padrao, '--', ...caminhos], { cwd: ERP, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch (e: any) {
    if (e?.status === 1) return [];
    throw e;
  }
}

describe('#318 — Cliente.creditoUtilizadoMT deixa de ter escritor e leitores que decidem', () => {
  it('nenhum código de src/ (fora de testes) define ou chama incrementarCreditoUtilizado / liberarCredito', () => {
    const achados = gitGrep('incrementarCreditoUtilizado|liberarCredito', 'src', ':!**/__tests__/**', ':!**/*.test.ts');
    expect(achados, achados.join('\n')).toEqual([]);
  });

  it('nenhum serviço de src/server escreve creditoUtilizadoMT (update/create/upsert com o campo)', () => {
    // Escrita = o campo num objecto `data` ou como operação atómica do Prisma.
    const escritas = gitGrep(
      'creditoUtilizadoMT\\s*:\\s*\\{\\s*(increment|decrement|set)|data\\s*:\\s*\\{[^}]*creditoUtilizadoMT',
      'src/server',
      ':!**/__tests__/**',
    );
    expect(escritas, escritas.join('\n')).toEqual([]);
  });

  it('relatorios.service.ts já não lê creditoUtilizadoMT', () => {
    const achados = gitGrep('creditoUtilizadoMT', 'src/server/services/plataforma/relatorios.service.ts');
    expect(achados, achados.join('\n')).toEqual([]);
  });

  it('cliente.service.ts: o desativar já não decide por creditoUtilizadoMT', () => {
    const fonte = readFileSync(path.join(ERP, 'src/server/services/comercial/cliente.service.ts'), 'utf8');
    const inicio = fonte.indexOf('async desativar(');
    expect(inicio, 'desativar existe').toBeGreaterThan(-1);
    const resto = fonte.slice(inicio + 1);
    const fim = resto.search(/\n {2}(async |\/\/ ---)/);
    const corpo = fim === -1 ? resto : resto.slice(0, fim);
    expect(corpo).toContain('CLIENTE_COM_DEBITOS_PENDENTES');
    expect(corpo).not.toContain('creditoUtilizadoMT');
  });

  it('o schema marca creditoUtilizadoMT como morto, junto ao campo', () => {
    const schema = readFileSync(path.join(ERP, 'prisma/schema/comercial.prisma'), 'utf8').split('\n');
    const i = schema.findIndex((l) => /^\s*creditoUtilizadoMT\s/.test(l));
    expect(i, 'o campo continua no schema (sem migração)').toBeGreaterThan(-1);
    const vizinhanca = schema.slice(Math.max(0, i - 3), i + 1).join('\n');
    expect(vizinhanca).toMatch(/\/\/.*(morto|obsolet|n[ãa]o [ée] (escrito|lido|usado)|ningu[ée]m (o )?escreve)/i);
    expect(vizinhanca).toMatch(/#318|creditoUtilizadoDoCliente/);
  });
});
