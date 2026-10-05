/**
 * Permissões do encerramento do exercício (ADR-0035, «Consequências»; #138 N2).
 *
 * Encerrar, encerrar em definitivo e reabrir são só do ADMIN. O padrão das
 * outras `financas:*` não serve: o prefixo daria-as ao FINANCEIRO e a lista de
 * restrições do GESTOR não as tem — por isso o teste fixa a matriz inteira.
 */
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../../../prisma/seed/rbac';

const CODIGOS = [
  'financas:exercicio:encerrar',
  'financas:exercicio:encerrar-definitivo',
  'financas:exercicio:reabrir',
] as const;

function papeisCom(code: string): string[] {
  return SYSTEM_ROLES.filter((r) => r.permissionCodes.includes(code))
    .map((r) => r.nome)
    .sort();
}

describe('permissões financas:exercicio:* do encerramento (ADR-0035)', () => {
  it.each(CODIGOS)('%s está no catálogo (sem isso o seed ignora-a em silêncio)', (code) => {
    expect(PERMISSIONS.map((p) => p.code)).toContain(code);
  });

  it.each(CODIGOS)('%s — só o ADMIN (FINANCEIRO, GESTOR, OPERADOR e LEITURA não)', (code) => {
    expect(papeisCom(code)).toEqual(['ADMIN']);
  });
});
