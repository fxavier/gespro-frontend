/**
 * Matriz das permissões da DFC (ticket 6.1, ADR-0037 E5). Acessório do autor
 * (nó `fatia`), sem base.
 *
 * O padrão das outras `financas:*` NÃO serve aqui, e é por isso que isto tem
 * teste: o sufixo `:leitura` daria a DFC ao OPERADOR pelo `isReadOnly`, e o
 * prefixo `financas:` daria `:validar` ao FINANCEIRO. E5 é segregação de
 * funções — quem configura o mapeamento não o valida por omissão.
 */
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../../../prisma/seed/rbac';

function papeisCom(code: string): string[] {
  return SYSTEM_ROLES.filter((r) => r.permissionCodes.includes(code))
    .map((r) => r.nome)
    .sort();
}

describe('permissões financas:fluxo-caixa:* (ADR-0037 E5)', () => {
  it(':leitura — ADMIN, FINANCEIRO, GESTOR e LEITURA; o OPERADOR não', () => {
    expect(papeisCom('financas:fluxo-caixa:leitura')).toEqual(['ADMIN', 'FINANCEIRO', 'GESTOR', 'LEITURA']);
  });
  it(':configurar — ADMIN e FINANCEIRO', () => {
    expect(papeisCom('financas:fluxo-caixa:configurar')).toEqual(['ADMIN', 'FINANCEIRO']);
  });
  it(':validar — só o ADMIN', () => {
    expect(papeisCom('financas:fluxo-caixa:validar')).toEqual(['ADMIN']);
  });
  it('as três estão no catálogo (sem isso o createMany do seed ignora-as em silêncio)', () => {
    const catalogo = PERMISSIONS.map((p) => p.code);
    for (const c of ['leitura', 'configurar', 'validar']) {
      expect(catalogo).toContain(`financas:fluxo-caixa:${c}`);
    }
  });
});
