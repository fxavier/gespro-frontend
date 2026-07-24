// Testes de validação — Categoria de Ativo (update) e Documento de Ativo (delta WS-DOC-CORE).
// Puros/unit — sem acesso à DB.

import { describe, expect, it } from 'vitest';
import {
  CategoriaAtivoUpdateSchema,
  DocumentoAtivoCreateSchema,
} from './inventario-ativos';

const CUID = 'clh1234567890abcdefghijkl';

describe('CategoriaAtivoUpdateSchema', () => {
  it('não aceita/ignora o campo codigo (imutável)', () => {
    const parsed = CategoriaAtivoUpdateSchema.parse({ codigo: 'NOVO', nome: 'Equipamento TI' });
    expect(parsed).not.toHaveProperty('codigo');
    expect(parsed.nome).toBe('Equipamento TI');
  });

  it('permite actualização parcial (todos os campos opcionais)', () => {
    expect(() => CategoriaAtivoUpdateSchema.parse({})).not.toThrow();
    const parsed = CategoriaAtivoUpdateSchema.parse({ ativa: false });
    expect(parsed.ativa).toBe(false);
  });

  it('valida o intervalo de valorResidualPct (0..1)', () => {
    expect(() => CategoriaAtivoUpdateSchema.parse({ valorResidualPct: 0.1 })).not.toThrow();
    expect(() => CategoriaAtivoUpdateSchema.parse({ valorResidualPct: 2 })).toThrow();
  });
});

describe('DocumentoAtivoCreateSchema (delta WS-DOC-CORE)', () => {
  it('aceita a urlRef opaca (gestpro-storage:{key}) no campo url', () => {
    const parsed = DocumentoAtivoCreateSchema.parse({
      ativoId: CUID,
      nome: 'Factura de compra.pdf',
      tipo: 'NOTA_FISCAL',
      url: 'gestpro-storage:tenant/t1/ativo/a1/uuid-factura.pdf',
    });
    expect(parsed.url).toContain('gestpro-storage:');
  });

  it('aceita os metadados do storage (storageKey, contentType, tamanhoBytes)', () => {
    const parsed = DocumentoAtivoCreateSchema.parse({
      ativoId: CUID,
      nome: 'Manual.pdf',
      tipo: 'MANUAL',
      url: 'gestpro-storage:tenant/t1/ativo/a1/uuid-manual.pdf',
      storageKey: 'tenant/t1/ativo/a1/uuid-manual.pdf',
      contentType: 'application/pdf',
      tamanhoBytes: 20480,
    });
    expect(parsed.storageKey).toBe('tenant/t1/ativo/a1/uuid-manual.pdf');
    expect(parsed.contentType).toBe('application/pdf');
    expect(parsed.tamanhoBytes).toBe(20480);
  });

  it('mantém os metadados do storage opcionais (compat retroactiva)', () => {
    const parsed = DocumentoAtivoCreateSchema.parse({
      ativoId: CUID,
      nome: 'Certificado.pdf',
      tipo: 'CERTIFICADO',
      url: 'https://exemplo.mz/doc.pdf',
    });
    expect(parsed.storageKey).toBeUndefined();
  });

  it('rejeita tamanhoBytes negativo', () => {
    expect(() =>
      DocumentoAtivoCreateSchema.parse({
        ativoId: CUID,
        nome: 'x.pdf',
        tipo: 'OUTRO',
        url: 'gestpro-storage:k',
        tamanhoBytes: -1,
      }),
    ).toThrow();
  });
});
