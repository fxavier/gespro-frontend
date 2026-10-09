/**
 * Oráculo — issue #124: o OPERADOR recebia `inventario:admin` pelo `startsWith('inventario:')`
 * de `prisma/seed/rbac.ts`, o GESTOR não o tinha (estava na lista `restricted`), e o OPERADOR
 * não tinha `ativos:write` (registar/editar activos fixos é trabalho de armazém).
 * Escrito pelo verificador ANTES da implementação; quem implementa não o altera (BLOCKER).
 *
 * Contrato (decisão do orquestrador):
 *   - `inventario:admin` — ADMIN e GESTOR; o OPERADOR deixa de o ter.
 *   - `ativos:write` — o OPERADOR passa a tê-lo (ADMIN e GESTOR continuam).
 *   - Os tenants existentes são corrigidos por uma migração de dados só nos papéis de sistema
 *     (oráculo de integração `test/integration/rbac-inventario-124.test.ts`).
 *
 * Decisão conservadora do verificador (o contrato não fala dela): `ativos:admin` (processar a
 * amortização, alienar/abater) NÃO muda — continua só do ADMIN. Fica trancada abaixo como
 * «mudança mínima», junto com o resto de `inventario:*`/`ativos:*` de cada papel.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';

const RAIZ = path.resolve(__dirname, '../../..'); // apps/erp
const ACTIONS = path.join(RAIZ, 'src', 'server', 'actions', 'inventario.actions.ts');

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
  expect(inicio, `${nome} existe em inventario.actions.ts`).toBeGreaterThanOrEqual(0);
  const m = fonte.slice(inicio).match(/\bpermission:\s*'([^']+)'/);
  expect(m, `${nome} declara uma permissão`).not.toBeNull();
  return m![1]!;
}

const TODOS = ['ADMIN', 'FINANCEIRO', 'GESTOR', 'LEITURA', 'OPERADOR'];

// Tabela do contrato: quem tem cada permissão de inventário/activos DEPOIS da correcção.
// Revisão explícita (critério de aceitação da issue): todos os códigos `inventario:*` e
// `ativos:*` do catálogo estão aqui; um código novo sem linha parte o teste de cobertura.
const TABELA: Record<string, string[]> = {
  // Leituras — todos (o FINANCEIRO e o LEITURA pelo isReadOnly).
  'inventario:ver': TODOS,
  'inventario:exportar': TODOS,
  'inventario:contagens:ver': TODOS,
  'ativos:read': TODOS,
  // Escrita operacional de inventário — ADMIN, GESTOR e OPERADOR.
  'inventario:movimentar': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:ajustar': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:configurar': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:write': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:contagens:abrir': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:contagens:registar': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:contagens:justificar': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:contagens:reconciliar': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:contagens:concluir': ['ADMIN', 'GESTOR', 'OPERADOR'],
  'inventario:contagens:cancelar': ['ADMIN', 'GESTOR', 'OPERADOR'],
  // #81 — aprovar a discrepância é de ADMIN e GESTOR (não regride).
  'inventario:contagens:aprovar-discrepancia': ['ADMIN', 'GESTOR'],
  // #124 — administração do inventário: ADMIN e GESTOR; o OPERADOR não.
  'inventario:admin': ['ADMIN', 'GESTOR'],
  // #124 — o OPERADOR regista e edita activos fixos.
  'ativos:write': ['ADMIN', 'GESTOR', 'OPERADOR'],
  // Decisão conservadora: a administração de activos (amortização) não muda — só ADMIN.
  'ativos:admin': ['ADMIN'],
};

describe('#124 — permissões de inventário e activos por papel', () => {
  it('inventario:admin — ADMIN e GESTOR; o OPERADOR não', () => {
    expect(papeisCom('inventario:admin')).toEqual(['ADMIN', 'GESTOR']);
  });

  it('o OPERADOR tem ativos:write', () => {
    expect(perms('OPERADOR')).toContain('ativos:write');
  });

  it('a tabela cobre todos os códigos inventario:* e ativos:* do catálogo', () => {
    const doCatalogo = PERMISSIONS.map((p) => p.code)
      .filter((c) => c.startsWith('inventario:') || c.startsWith('ativos:'))
      .sort();
    expect(Object.keys(TABELA).sort()).toEqual(doCatalogo);
  });

  it.each(Object.entries(TABELA))('%s → %j', (code, esperado) => {
    expect(papeisCom(code)).toEqual([...esperado].sort());
  });

  it('o OPERADOR deixa de alcançar a reconciliação do inventário físico (inventario:admin)', () => {
    const permissao = permissaoDaAction('reconciliarInventarioAction');
    expect(permissao).toBe('inventario:admin');
    expect(perms('OPERADOR')).not.toContain(permissao);
    expect(perms('GESTOR')).toContain(permissao);
  });

  it.each(['criarAtivoAction', 'actualizarAtivoAction', 'registarMovimentacaoAtivoAction'])(
    'a Server Action %s (ativos:write) é alcançável pelo OPERADOR',
    (action) => {
      const permissao = permissaoDaAction(action);
      expect(permissao).toBe('ativos:write');
      expect(perms('OPERADOR')).toContain(permissao);
    },
  );

  it('mudança mínima: o GESTOR continua sem as configurações de sistema perigosas', () => {
    const g = perms('GESTOR');
    for (const code of ['admin:gerir_permissoes', 'core_tenancy:configurar', 'ativos:admin',
                        'financas:plano-contas:escrita', 'faturacao:series:escrita']) {
      expect(g, `GESTOR não leva ${code}`).not.toContain(code);
    }
  });

  it('mudança mínima: o OPERADOR mantém o seu trabalho e não ganha administração', () => {
    const op = perms('OPERADOR');
    for (const code of ['inventario:movimentar', 'inventario:contagens:reconciliar', 'pos:operar',
                        'caixa:operar', 'produtos:write', 'ativos:read']) {
      expect(op, `OPERADOR mantém ${code}`).toContain(code);
    }
    for (const code of ['inventario:admin', 'ativos:admin', 'inventario:contagens:aprovar-discrepancia',
                        'admin:ver_utilizadores', 'admin:ver_auditoria', 'financas:exportar']) {
      expect(op, `OPERADOR não leva ${code}`).not.toContain(code);
    }
  });
});
