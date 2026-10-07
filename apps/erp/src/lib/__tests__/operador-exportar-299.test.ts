/**
 * Oráculo — issue #299: o papel OPERADOR recebia `financas:exportar` pelo filtro genérico
 * (`isReadOnly` aceita o sufixo `:exportar`) e exportava balancete, balanço, DRE, DFC e os
 * documentos do encerramento. Escrito pelo verificador ANTES da implementação; quem
 * implementa não o altera (BLOCKER).
 *
 * Contrato (decisão do orquestrador):
 *   - As exportações de finanças/contabilidade saem do OPERADOR: nenhum código `financas:*`
 *     de exportação no papel, e nenhuma Route Handler de exportação de contabilidade é
 *     alcançável com as permissões dele.
 *   - Os outros papéis não mudam: `financas:exportar` continua em ADMIN, FINANCEIRO, GESTOR
 *     e LEITURA (o LEITURA é «consulta e exportação» por definição).
 *   - Mudança mínima no OPERADOR: as leituras financeiras e as exportações operacionais
 *     (inventário) ficam — o defeito é a exportação de mapas financeiros, não a consulta.
 *     `financas:iva:mapas` e `faturacao:exportar` não são decididos aqui (fora do contrato).
 *
 * A migração de dados que corrige os tenants existentes está no oráculo de integração
 * `test/integration/operador-exportar-299.test.ts`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';

const RAIZ = path.resolve(__dirname, '../../..'); // apps/erp
const API = path.join(RAIZ, 'src', 'app', 'api');

function papeisCom(code: string): string[] {
  return SYSTEM_ROLES.filter((r) => r.permissionCodes.includes(code))
    .map((r) => r.nome)
    .sort();
}
const perms = (papel: string): string[] => SYSTEM_ROLES.find((r) => r.nome === papel)?.permissionCodes ?? [];

/** A permissão declarada no `withApi` de uma Route Handler (lida do código-fonte). */
function permissaoDaRota(relativo: string): string {
  const fonte = readFileSync(path.join(API, relativo), 'utf8');
  const m = fonte.match(/\bpermission:\s*'([^']+)'/);
  expect(m, `${relativo} declara uma permissão no withApi`).not.toBeNull();
  return m![1]!;
}

describe('#299 — o OPERADOR não exporta mapas financeiros', () => {
  it('financas:exportar está no catálogo', () => {
    expect(PERMISSIONS.map((p) => p.code)).toContain('financas:exportar');
  });

  it('financas:exportar — ADMIN, FINANCEIRO, GESTOR e LEITURA; o OPERADOR não', () => {
    expect(papeisCom('financas:exportar')).toEqual(['ADMIN', 'FINANCEIRO', 'GESTOR', 'LEITURA']);
  });

  it('o OPERADOR não tem nenhum código financas:* de exportação', () => {
    const exportacoes = perms('OPERADOR').filter((c) => c.startsWith('financas:') && c.includes('exportar'));
    expect(exportacoes).toEqual([]);
  });

  it.each([
    'contabilidade/balancete/export/route.ts',
    'contabilidade/balanco/export/route.ts',
    'contabilidade/dre/export/route.ts',
    'contabilidade/dfc/export/route.ts',
    'contabilidade/exercicios/[id]/encerramento/[documento]/route.ts',
  ])('a exportação %s não é alcançável pelo OPERADOR', (rota) => {
    const permissao = permissaoDaRota(rota);
    expect(perms('OPERADOR')).not.toContain(permissao);
    // …e continua alcançável pelo FINANCEIRO (a correcção não fecha a rota a toda a gente).
    expect(perms('FINANCEIRO')).toContain(permissao);
  });

  it('mudança mínima: o OPERADOR mantém a leitura financeira e as permissões operacionais', () => {
    const op = perms('OPERADOR');
    for (const code of ['financas:leitura', 'inventario:exportar', 'pos:operar', 'caixa:operar']) {
      expect(op, `OPERADOR mantém ${code}`).toContain(code);
    }
  });
});
