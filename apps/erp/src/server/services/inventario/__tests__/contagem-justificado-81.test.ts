/**
 * Oráculo — issue #81: a aprovação de discrepância deixa de ser parâmetro do cliente.
 *
 * - `ReconciliarSchema` só aceita `contagemId`: `aprovadoPorId` e `limiarDiscrepanciaPct` saem
 *   do contrato (o limiar passa a constante do servidor, o aprovador a utilizador da sessão);
 * - permissão nova `inventario:contagens:aprovar-discrepancia`, ligada a ADMIN e GESTOR. O
 *   OPERADOR leva hoje tudo o que começa por `inventario:` — conta, reconcilia, mas não aprova a
 *   própria discrepância.
 *
 * Escrito pelo verificador do nó D:contagem-justificado-81; um agente de implementação que o
 * altere é BLOCKER.
 */
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../../../prisma/seed/rbac';
import * as validacoes from '@/lib/validations/inventario-contagem';

const CODIGO = 'inventario:contagens:aprovar-discrepancia';
const CONTAGEM_ID = 'cjld2cjxh0000qzrmn831i7rn';

function papeisCom(code: string): string[] {
  return SYSTEM_ROLES.filter((r) => r.permissionCodes.includes(code))
    .map((r) => r.nome)
    .sort();
}

describe('ReconciliarSchema (#81) — o cliente não decide a aprovação', () => {
  // Acesso dinâmico: falha o caso, não o ficheiro.
  const schema = (validacoes as any).ReconciliarSchema;

  it('o schema só tem contagemId', () => {
    expect(Object.keys(schema.shape).sort()).toEqual(['contagemId']);
  });

  it('aprovadoPorId e limiarDiscrepanciaPct enviados pelo cliente não sobrevivem ao parse', () => {
    const r = schema.safeParse({
      contagemId: CONTAGEM_ID,
      aprovadoPorId: 'cjld2cjxh0000qzrmn831i7ro',
      limiarDiscrepanciaPct: 100,
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ contagemId: CONTAGEM_ID });
  });
});

describe(`permissão ${CODIGO} (#81)`, () => {
  it('está no catálogo (sem isso o seed ignora-a em silêncio)', () => {
    expect(PERMISSIONS.map((p) => p.code)).toContain(CODIGO);
  });

  it('ADMIN e GESTOR têm; OPERADOR, FINANCEIRO e LEITURA não', () => {
    expect(papeisCom(CODIGO)).toEqual(['ADMIN', 'GESTOR']);
  });

  it('o OPERADOR reconcilia mas não aprova a discrepância', () => {
    const operador = SYSTEM_ROLES.find((r) => r.nome === 'OPERADOR')!;
    expect(operador.permissionCodes).toContain('inventario:contagens:reconciliar');
    expect(operador.permissionCodes).not.toContain(CODIGO);
  });
});
