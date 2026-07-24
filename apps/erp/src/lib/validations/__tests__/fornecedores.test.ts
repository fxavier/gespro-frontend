/**
 * Testes de validação — Fornecedores (WS-FORNECEDORES, spec 02 T4/T5).
 * Foco: caminho de escrita de contactos (bug corrigido) e metadados de documento.
 * Puro: sem BD.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CreateContactoFornecedorSchema,
  CreateFornecedorSchema,
  CreateDocumentoFornecedorSchema,
} from '../fornecedores';

const CUID = 'clh1234567890abcdefghijkl';

const fornecedorBase = {
  codigo: 'FOR-0001',
  nome: 'Fornecedor Teste',
  tipo: 'PESSOA_JURIDICA' as const,
  nuit: '123456789',
  email: 'geral@empresa.co.mz',
};

// =====================================================================
// T4 — Validação de contacto
// =====================================================================

describe('CreateContactoFornecedorSchema', () => {
  it('aceita um contacto mínimo válido e aplica defaults (tipo/ativo)', () => {
    const parsed = CreateContactoFornecedorSchema.parse({
      fornecedorId: CUID,
      nome: 'Ana Sitoe',
    });
    expect(parsed.tipo).toBe('PRINCIPAL');
    expect(parsed.ativo).toBe(true);
  });

  it('rejeita nome demasiado curto (< 2)', () => {
    const r = CreateContactoFornecedorSchema.safeParse({ fornecedorId: CUID, nome: 'A' });
    expect(r.success).toBe(false);
  });

  it('rejeita email inválido', () => {
    const r = CreateContactoFornecedorSchema.safeParse({
      fornecedorId: CUID,
      nome: 'Ana Sitoe',
      email: 'nao-e-email',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita fornecedorId que não é cuid', () => {
    const r = CreateContactoFornecedorSchema.safeParse({ fornecedorId: 'abc', nome: 'Ana' });
    expect(r.success).toBe(false);
  });

  it('aceita apenas os tipos do enum', () => {
    for (const tipo of ['PRINCIPAL', 'SECUNDARIO', 'TECNICO', 'FINANCEIRO']) {
      const r = CreateContactoFornecedorSchema.safeParse({ fornecedorId: CUID, nome: 'Ana', tipo });
      expect(r.success).toBe(true);
    }
    const invalido = CreateContactoFornecedorSchema.safeParse({
      fornecedorId: CUID,
      nome: 'Ana',
      tipo: 'GERAL',
    });
    expect(invalido.success).toBe(false);
  });

  // Property: qualquer nome com 2..150 caracteres não-vazios é aceite
  it('property: nome válido (2..150) é sempre aceite', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2, maxLength: 150 }).filter((s) => s.trim().length >= 2),
        (nome) => {
          const r = CreateContactoFornecedorSchema.safeParse({ fornecedorId: CUID, nome });
          return r.success === true;
        },
      ),
    );
  });
});

// =====================================================================
// T5 — Caminho de escrita: contactos no CreateFornecedorSchema
// =====================================================================

describe('CreateFornecedorSchema — contactos (caminho de escrita corrigido)', () => {
  it('sem contactos: aplica default [] (não undefined)', () => {
    const parsed = CreateFornecedorSchema.parse(fornecedorBase);
    expect(parsed.contactos).toEqual([]);
  });

  it('PRESERVA os contactos fornecidos (antes eram descartados pelo Zod)', () => {
    const parsed = CreateFornecedorSchema.parse({
      ...fornecedorBase,
      contactos: [
        { nome: 'Ana Sitoe', tipo: 'PRINCIPAL' },
        { nome: 'João Malema', email: 'joao@empresa.co.mz', tipo: 'FINANCEIRO' },
      ],
    });
    expect(parsed.contactos).toHaveLength(2);
    expect(parsed.contactos[0].nome).toBe('Ana Sitoe');
    expect(parsed.contactos[1].email).toBe('joao@empresa.co.mz');
  });

  it('os contactos na criação NÃO exigem fornecedorId (omitido)', () => {
    const r = CreateFornecedorSchema.safeParse({
      ...fornecedorBase,
      contactos: [{ nome: 'Ana Sitoe' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejeita se um contacto tiver email inválido', () => {
    const r = CreateFornecedorSchema.safeParse({
      ...fornecedorBase,
      contactos: [{ nome: 'Ana', email: 'invalido' }],
    });
    expect(r.success).toBe(false);
  });

  // Property: N contactos válidos → array preservado com o mesmo comprimento
  it('property: N contactos válidos são todos preservados', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            nome: fc.string({ minLength: 2, maxLength: 50 }).filter((s) => s.trim().length >= 2),
          }),
          { maxLength: 8 },
        ),
        (lista) => {
          const parsed = CreateFornecedorSchema.parse({ ...fornecedorBase, contactos: lista });
          return parsed.contactos.length === lista.length;
        },
      ),
    );
  });
});

// =====================================================================
// Documento — metadados de storage (WS-DOC-CORE)
// =====================================================================

describe('CreateDocumentoFornecedorSchema — metadados de storage', () => {
  it('aceita a ref opaca do storage no campo url + storageKey/contentType/tamanhoBytes', () => {
    const parsed = CreateDocumentoFornecedorSchema.parse({
      fornecedorId: CUID,
      tipo: 'CONTRATO',
      nome: 'contrato.pdf',
      url: 'gestpro-storage:tenant/t1/fornecedor/f1/uuid-contrato.pdf',
      storageKey: 'tenant/t1/fornecedor/f1/uuid-contrato.pdf',
      contentType: 'application/pdf',
      tamanhoBytes: 20480,
    });
    expect(parsed.storageKey).toBeDefined();
    expect(parsed.contentType).toBe('application/pdf');
    expect(parsed.tamanhoBytes).toBe(20480);
  });

  it('os metadados de storage são opcionais (url legada http continua válida)', () => {
    const r = CreateDocumentoFornecedorSchema.safeParse({
      fornecedorId: CUID,
      nome: 'doc.pdf',
      url: 'https://exemplo.mz/doc.pdf',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita tamanhoBytes negativo', () => {
    const r = CreateDocumentoFornecedorSchema.safeParse({
      fornecedorId: CUID,
      nome: 'doc.pdf',
      url: 'gestpro-storage:tenant/t1/fornecedor/f1/uuid-doc.pdf',
      tamanhoBytes: -1,
    });
    expect(r.success).toBe(false);
  });
});
