/**
 * Oráculo — issue #113: o papel FINANCEIRO não podia registar pagamentos a fornecedores
 * (`compras:pagamento:registar`) nem gerir contas a pagar (`compras:conta-pagar:criar`,
 * `compras:conta-pagar:cancelar`) — só ADMIN e GESTOR as tinham.
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contrato (decisão do orquestrador):
 *   - As três permissões entram no FINANCEIRO em `prisma/seed/rbac.ts` (tenants novos).
 *   - Os tenants existentes são corrigidos por uma migração de dados (oráculo de integração
 *     `test/integration/financeiro-contas-pagar-113.test.ts`).
 *   - Mudança mínima: o FINANCEIRO não ganha mais nada de compras/fornecedores (não aprova,
 *     não encomenda, não recebe mercadoria, não edita fornecedores); OPERADOR e LEITURA não
 *     mudam; ADMIN e GESTOR continuam com as três.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';

const RAIZ = path.resolve(__dirname, '../../..'); // apps/erp
const ACTIONS = path.join(RAIZ, 'src', 'server', 'actions', 'fornecedores.actions.ts');

const CONTAS_PAGAR = [
  'compras:conta-pagar:cancelar',
  'compras:conta-pagar:criar',
  'compras:pagamento:registar',
] as const;

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
  expect(inicio, `${nome} existe em fornecedores.actions.ts`).toBeGreaterThanOrEqual(0);
  const m = fonte.slice(inicio).match(/\bpermission:\s*'([^']+)'/);
  expect(m, `${nome} declara uma permissão`).not.toBeNull();
  return m![1]!;
}

describe('#113 — o FINANCEIRO regista pagamentos a fornecedores e gere contas a pagar', () => {
  it.each(CONTAS_PAGAR)('%s está no catálogo', (code) => {
    expect(PERMISSIONS.map((p) => p.code)).toContain(code);
  });

  // Tabela do contrato: quem tem cada permissão, depois da correcção.
  it.each(CONTAS_PAGAR)('%s — ADMIN, FINANCEIRO e GESTOR; OPERADOR e LEITURA não', (code) => {
    expect(papeisCom(code)).toEqual(['ADMIN', 'FINANCEIRO', 'GESTOR']);
  });

  it.each([
    ['criarContaPagarAction', 'compras:conta-pagar:criar'],
    ['cancelarContaPagarAction', 'compras:conta-pagar:cancelar'],
    ['registarPagamentoAction', 'compras:pagamento:registar'],
  ])('a Server Action %s é alcançável pelo FINANCEIRO', (action, esperado) => {
    const permissao = permissaoDaAction(action);
    expect(permissao).toBe(esperado);
    expect(perms('FINANCEIRO')).toContain(permissao);
  });

  it('mudança mínima: de compras/fornecedores o FINANCEIRO só tem a consulta e as três de contas a pagar', () => {
    const doFinanceiro = perms('FINANCEIRO')
      .filter((c) => c.startsWith('compras:') || c.startsWith('fornecedores:'))
      .sort();
    expect(doFinanceiro).toEqual([...CONTAS_PAGAR, 'compras:ver', 'fornecedores:ver'].sort());
  });

  it('o FINANCEIRO mantém o que já tinha (finanças, faturação, caixa) e não ganha permissões só do ADMIN', () => {
    const fin = perms('FINANCEIRO');
    for (const code of ['financas:exportar', 'caixa:operar', 'compras:ver', 'fornecedores:ver']) {
      expect(fin, `FINANCEIRO mantém ${code}`).toContain(code);
    }
    for (const code of ['financas:periodo:reabrir', 'financas:exercicio:abrir', 'compras:aprovar',
                        'compras:pedido:criar', 'compras:recebimento:registar', 'fornecedores:editar']) {
      expect(fin, `FINANCEIRO não leva ${code}`).not.toContain(code);
    }
  });
});
