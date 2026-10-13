/**
 * Oráculo — issue #143: «GESTOR pode abrir exercício e FINANCEIRO não; reabrir período só ADMIN».
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contrato (decisão do orquestrador, alinhada com o ADR-0033):
 *   - O GESTOR já perdeu `financas:exercicio:abrir` (#366) e assim continua.
 *   - O FINANCEIRO passa a ter `financas:exercicio:abrir` em `prisma/seed/rbac.ts` (tenants
 *     novos); os existentes são corrigidos por migração de dados (oráculo de integração
 *     `test/integration/rbac-exercicio-143.test.ts`).
 *   - Reabrir período (`financas:periodo:reabrir`) continua só do ADMIN — decisão conservadora.
 *   - Mudança mínima: o FINANCEIRO não ganha mais nada do ciclo do exercício (encerrar,
 *     encerrar em definitivo, reabrir exercício, aplicar resultado continuam só do ADMIN).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';

const RAIZ = path.resolve(__dirname, '../../..'); // apps/erp
const ACTIONS = path.join(RAIZ, 'src', 'server', 'actions', 'contabilidade.actions.ts');

function papeisCom(code: string): string[] {
  return SYSTEM_ROLES.filter((r) => r.permissionCodes.includes(code))
    .map((r) => r.nome)
    .sort();
}
const perms = (papel: string): string[] => SYSTEM_ROLES.find((r) => r.nome === papel)?.permissionCodes ?? [];

/** A permissão declarada no `createSafeAction` de uma Server Action (lida do código-fonte). */
function permissaoDaAction(nome: string): string {
  const fonte = readFileSync(ACTIONS, 'utf8');
  const inicio = fonte.indexOf(`export const ${nome} =`);
  expect(inicio, `${nome} existe em contabilidade.actions.ts`).toBeGreaterThanOrEqual(0);
  const m = fonte.slice(inicio).match(/\bpermission:\s*'([^']+)'/);
  expect(m, `${nome} declara uma permissão`).not.toBeNull();
  return m![1]!;
}

describe('#143 — abrir exercício: ADMIN e FINANCEIRO; reabrir período: só ADMIN', () => {
  it('financas:exercicio:abrir e financas:periodo:reabrir estão no catálogo', () => {
    const codes = PERMISSIONS.map((p) => p.code);
    expect(codes).toContain('financas:exercicio:abrir');
    expect(codes).toContain('financas:periodo:reabrir');
  });

  it('financas:exercicio:abrir — exactamente ADMIN e FINANCEIRO (GESTOR, OPERADOR e LEITURA não)', () => {
    expect(papeisCom('financas:exercicio:abrir')).toEqual(['ADMIN', 'FINANCEIRO']);
  });

  it('financas:periodo:reabrir — continua só do ADMIN (decisão conservadora)', () => {
    expect(papeisCom('financas:periodo:reabrir')).toEqual(['ADMIN']);
  });

  it('a Server Action abrirExercicio é alcançável pelo FINANCEIRO e não pelo GESTOR', () => {
    const permissao = permissaoDaAction('abrirExercicio');
    expect(permissao).toBe('financas:exercicio:abrir');
    expect(perms('FINANCEIRO')).toContain(permissao);
    expect(perms('GESTOR')).not.toContain(permissao);
  });

  it('a Server Action reabrirPeriodo continua fora do alcance do FINANCEIRO e do GESTOR', () => {
    const permissao = permissaoDaAction('reabrirPeriodo');
    expect(permissao).toBe('financas:periodo:reabrir');
    expect(perms('FINANCEIRO')).not.toContain(permissao);
    expect(perms('GESTOR')).not.toContain(permissao);
  });

  it('mudança mínima: do ciclo do exercício/período o FINANCEIRO só ganha abrir exercício', () => {
    const sensiveis = [
      'financas:periodo:reabrir',
      'financas:exercicio:abrir',
      'financas:exercicio:encerrar',
      'financas:exercicio:encerrar-definitivo',
      'financas:exercicio:reabrir',
      'financas:exercicio:aplicar-resultado',
      'financas:fluxo-caixa:validar',
    ];
    expect(perms('FINANCEIRO').filter((c) => sensiveis.includes(c)).sort()).toEqual(['financas:exercicio:abrir']);
  });

  it('o FINANCEIRO mantém o que já tinha (fechar período, lançamentos, exportar)', () => {
    const fin = perms('FINANCEIRO');
    for (const code of ['financas:fechar_periodo', 'financas:exportar', 'financas:lancamentos:estornar']) {
      expect(fin, `FINANCEIRO mantém ${code}`).toContain(code);
    }
  });
});
