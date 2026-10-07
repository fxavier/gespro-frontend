/**
 * Oráculo — issue #94: permissão `rh:ausencias:aprovar`.
 *
 * Aprovar/rejeitar ausências segue o molde das férias: quem aprova férias aprova ausências.
 * Hoje o `rh:ferias:aprovar` chega ao ADMIN (todas) e ao GESTOR (não restrita); não chega ao
 * FINANCEIRO (só `rh:payroll:*`), ao OPERADOR (self-service: criar ausência, solicitar férias)
 * nem ao LEITURA. A matriz da permissão nova tem de ser a mesma — e o OPERADOR, que REGISTA
 * ausências, não as aprova.
 *
 * Escrito pelo verificador do nó D:ausencias-aprovar-94; um agente de implementação que o
 * altere é BLOCKER.
 */
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../../../prisma/seed/rbac';

const CODIGO = 'rh:ausencias:aprovar';

function papeisCom(code: string): string[] {
  return SYSTEM_ROLES.filter((r) => r.permissionCodes.includes(code))
    .map((r) => r.nome)
    .sort();
}

describe('permissão rh:ausencias:aprovar (#94)', () => {
  it('está no catálogo (sem isso o seed ignora-a em silêncio)', () => {
    expect(PERMISSIONS.map((p) => p.code)).toContain(CODIGO);
  });

  it('chega exactamente aos mesmos papéis que rh:ferias:aprovar', () => {
    expect(papeisCom(CODIGO)).toEqual(papeisCom('rh:ferias:aprovar'));
  });

  it('ADMIN e GESTOR têm; OPERADOR, FINANCEIRO e LEITURA não', () => {
    expect(papeisCom(CODIGO)).toEqual(['ADMIN', 'GESTOR']);
  });

  it('o OPERADOR regista ausências mas não as aprova', () => {
    const operador = SYSTEM_ROLES.find((r) => r.nome === 'OPERADOR')!;
    expect(operador.permissionCodes).toContain('rh:ausencias:create');
    expect(operador.permissionCodes).not.toContain(CODIGO);
  });
});
