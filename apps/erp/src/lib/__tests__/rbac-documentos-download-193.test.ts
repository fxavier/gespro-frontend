/**
 * ORÁCULO — issue #193 (lado do RBAC): quem pode subir um documento de um recurso tem de o poder
 * descarregar. Com o download a exigir a permissão de LEITURA do recurso (ver
 * `src/app/api/documentos/__tests__/download-permissao-leitura-193.test.ts`), o invariante é:
 *
 *   para todo o papel de sistema e todo o recurso com upload do cliente,
 *   ter a permissão de ESCRITA (upload) ⇒ ter a permissão de LEITURA (download).
 *
 * Hoje o `rbac.ts` já o cumpre (todos os papéis levam as leituras pelo `isReadOnly`), por isso a
 * decisão conservadora é NÃO mexer nos papéis nem migrar dados de tenants existentes: este teste
 * tranca o invariante para que uma mudança futura ao RBAC não reabra a lacuna «upload sem
 * download». Tranca também que as permissões de leitura existem no catálogo (um código que não
 * exista nunca chega a papel nenhum e o download fica 403 para todos).
 *
 * Escrito pelo verificador ANTES da implementação; NUNCA `vitest -u`; quem implementa não o altera.
 */
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, SYSTEM_ROLES } from '../../../prisma/seed/rbac';

const PERMS = {
  fornecedor: { leitura: 'fornecedores:ver', escrita: 'fornecedores:editar' },
  ativo: { leitura: 'ativos:read', escrita: 'ativos:write' },
  viatura: { leitura: 'transporte:viatura:listar', escrita: 'transporte:viatura:documentos' },
  motorista: { leitura: 'transporte:motorista:listar', escrita: 'transporte:motorista:documentos' },
  colaborador: { leitura: 'rh:colaboradores:read', escrita: 'rh:colaboradores:update' },
} as const;

const CATALOGO = new Set(PERMISSIONS.map((p) => p.code));

describe('#193 — RBAC: upload de documento implica download', () => {
  it.each(Object.entries(PERMS))('%s: leitura e escrita existem no catálogo', (_r, { leitura, escrita }) => {
    expect(CATALOGO.has(leitura), `${leitura} no catálogo`).toBe(true);
    expect(CATALOGO.has(escrita), `${escrita} no catálogo`).toBe(true);
  });

  for (const papel of SYSTEM_ROLES) {
    it(`${papel.nome}: onde tem upload, tem download`, () => {
      const tem = new Set(papel.permissionCodes);
      const semDownload = Object.entries(PERMS)
        .filter(([, p]) => tem.has(p.escrita) && !tem.has(p.leitura))
        .map(([r]) => r);
      expect(semDownload, `${papel.nome} com upload sem download`).toEqual([]);
    });
  }

  it('LEITURA descarrega de todos os recursos e não sobe para nenhum', () => {
    const leitura = new Set(SYSTEM_ROLES.find((r) => r.nome === 'LEITURA')?.permissionCodes ?? []);
    for (const [r, p] of Object.entries(PERMS)) {
      expect(leitura.has(p.leitura), `LEITURA com ${p.leitura} (${r})`).toBe(true);
      expect(leitura.has(p.escrita), `LEITURA sem ${p.escrita} (${r})`).toBe(false);
    }
  });
});
