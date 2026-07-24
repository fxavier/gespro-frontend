import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  derivarKey,
  sanitizarSegmento,
  prefixoTenant,
  keyParaUrlRef,
  urlRefParaKey,
} from '../key';

describe('sanitizarSegmento', () => {
  it('é idempotente', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const uma = sanitizarSegmento(s);
        const duas = sanitizarSegmento(uma);
        expect(duas).toBe(uma);
      }),
    );
  });

  it('nunca produz separadores, `..`, espaços ou vazio', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = sanitizarSegmento(s);
        expect(out).not.toMatch(/[/\\]/);
        expect(out).not.toContain('..');
        expect(out).not.toMatch(/\s/);
        expect(out.length).toBeGreaterThan(0);
        expect(out).toMatch(/^[a-z0-9._-]+$/);
      }),
    );
  });

  it('remove diacríticos e normaliza para slug', () => {
    expect(sanitizarSegmento('Café Ação.pdf')).toBe('cafe-acao.pdf');
    expect(sanitizarSegmento('  Relatório 2026  ')).toBe('relatorio-2026');
  });
});

describe('derivarKey — invariante de tenant', () => {
  const recursos = ['fornecedor', 'ativo', 'viatura', 'motorista', 'colaborador'] as const;

  it('a key começa sempre pelo prefixo do tenant, mesmo com nomes adversariais', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.constantFrom(...recursos),
        fc.string({ minLength: 1 }),
        fc.string(),
        (tenantId, recurso, recursoId, nome) => {
          const key = derivarKey({ tenantId, recurso, recursoId, nome });
          expect(key.startsWith(prefixoTenant(tenantId))).toBe(true);
          // nunca escapa: sem traversal nem barras duplas
          expect(key).not.toContain('..');
          expect(key).not.toContain('//');
          expect(key).not.toContain('\\');
          // exatamente 5 segmentos: tenant / {tid} / {recurso} / {rid} / {uuid-nome}
          expect(key.split('/')).toHaveLength(5);
        },
      ),
    );
  });

  it('rejeita tentativas explícitas de path traversal no nome', () => {
    const key = derivarKey({
      tenantId: 't1',
      recurso: 'fornecedor',
      recursoId: 'r1',
      nome: '../../../etc/passwd',
    });
    expect(key.startsWith('tenant/t1/fornecedor/r1/')).toBe(true);
    expect(key).not.toContain('..');
    expect(key).not.toContain('etc/passwd');
  });

  it('preserva a extensão do ficheiro no slug', () => {
    const key = derivarKey({
      tenantId: 't1',
      recurso: 'ativo',
      recursoId: 'a1',
      nome: 'Fatura Final.PDF',
    });
    expect(key).toMatch(/\/[0-9a-f-]{36}-fatura-final\.pdf$/);
  });

  it('gera keys únicas para o mesmo input (uuid)', () => {
    const input = { tenantId: 't', recurso: 'ativo' as const, recursoId: 'a', nome: 'x.pdf' };
    expect(derivarKey(input)).not.toBe(derivarKey(input));
  });
});

describe('keyParaUrlRef / urlRefParaKey', () => {
  it('faz round-trip da key', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (nome) => {
        const key = derivarKey({ tenantId: 't', recurso: 'fornecedor', recursoId: 'r', nome });
        expect(urlRefParaKey(keyParaUrlRef(key))).toBe(key);
      }),
    );
  });

  it('devolve null para URLs http externas (legado)', () => {
    expect(urlRefParaKey('https://exemplo.mz/doc.pdf')).toBeNull();
  });

  it('aceita key crua (sem esquema) como fallback', () => {
    expect(urlRefParaKey('tenant/t/fornecedor/r/uuid-x.pdf')).toBe('tenant/t/fornecedor/r/uuid-x.pdf');
  });
});
