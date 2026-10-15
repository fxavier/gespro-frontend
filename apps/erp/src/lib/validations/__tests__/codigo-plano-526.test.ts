/**
 * ORÁCULO — issue #526 (nó C:gestao-planos, ADR-0049 §1): uma só forma de código de plano,
 * `^[A-Z][A-Z0-9_]{1,30}$`, partilhada pelo `codigoPlano()` de `lib/validations/common.ts`
 * (checkout, registo, filtros de tenants, formulário de planos) e pelo registo público.
 *
 * Escrito pelo VERIFICADOR antes da implementação. NUNCA `vitest -u`; um agente de implementação
 * que altere este ficheiro é BLOCKER.
 *
 * ESTADO ESPERADO antes da implementação: RED (hoje aceita minúsculas e até 64 caracteres).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { codigoPlano } from '@/lib/validations/common';

describe('#526 — codigoPlano() segue ^[A-Z][A-Z0-9_]{1,30}$', () => {
  it.each(['BASICO', 'PROFISSIONAL', 'EMPRESARIAL', 'AB', 'PLANO_NOVO_2027', `A${'B'.repeat(30)}`])(
    'aceita %s',
    (c) => {
      expect(codigoPlano().safeParse(c).success).toBe(true);
    },
  );

  it.each([
    ['minúsculas', 'basico'],
    ['misto', 'Basico'],
    ['um carácter', 'B'],
    ['começa por algarismo', '1PLANO'],
    ['começa por _', '_PLANO'],
    ['hífen', 'PLANO-X'],
    ['espaço interior', 'PLANO X'],
    ['acento', 'PLANOÇ'],
    ['32 caracteres', `A${'B'.repeat(31)}`],
    ['vazio', ''],
    ['script', '<script>alert(1)</script>'],
  ])('recusa (%s) %s', (_r, c) => {
    expect(codigoPlano().safeParse(c).success).toBe(false);
  });

  it('o registo público não tem uma segunda definição do formato (uma só, partilhada)', () => {
    const fonte = readFileSync(path.resolve(__dirname, '../../../app/registo/actions.ts'), 'utf8');
    // A regex antiga e divergente ({0,63}) desaparece; o formato vem do módulo partilhado.
    expect(fonte).not.toMatch(/\{0,63\}/);
    expect(fonte).not.toMatch(/\/\^\[A-Z\]\[A-Z0-9_\]/);
  });
});
