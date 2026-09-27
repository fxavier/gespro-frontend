/**
 * Oráculo da issue #137 — schemas de editar e anular um lançamento em rascunho.
 *
 * Contrato (`docs/agentic/issue-137/spec.md`):
 * - `EditarLancamentoSchema` = `CriarLancamentoSchema` sem `diarioId`/`origem`/
 *   `documentoOrigem*`, mais `id: idEntidade()` (D2: diário e número não mudam);
 * - `AnularLancamentoSchema` = `{ id: idEntidade(), motivo: trim 3..500 }` (D3);
 * - `StatusLancamentoEnum` inclui `ANULADO` (D1).
 */
import { describe, expect, it } from 'vitest';
import * as schemas from '@/lib/validations/contabilidade';
import type { z } from 'zod';

// Acedidos pelo namespace: enquanto não existirem, falha cada caso com uma
// mensagem clara em vez de o ficheiro inteiro rebentar no import.
const sch = schemas as unknown as Record<string, z.ZodTypeAny>;
const Editar = () => sch.EditarLancamentoSchema;
const Anular = () => sch.AnularLancamentoSchema;

const CUID = 'cjld2cjxh0000qzrmn831i7rn';
const UUID = '6f1c2a0e-3b4d-4e5f-8a9b-0c1d2e3f4a5b'; // contas PGC do tenant-bootstrap

const editarValido = (sobre: Record<string, unknown> = {}) => ({
  id: CUID,
  data: '2026-06-15',
  historico: 'Reclassificação corrigida',
  observacoes: 'Valor revisto',
  partidas: [
    { contaId: UUID, tipo: 'DEBITO', valor: 1500 },
    { contaId: CUID, tipo: 'CREDITO', valor: 1500 },
  ],
  ...sobre,
});

describe('StatusLancamentoEnum', () => {
  it('aceita ANULADO', () => {
    expect(schemas.StatusLancamentoEnum.safeParse('ANULADO').success).toBe(true);
  });

  it('continua a aceitar RASCUNHO, LANCADO e ESTORNADO', () => {
    for (const s of ['RASCUNHO', 'LANCADO', 'ESTORNADO']) {
      expect(schemas.StatusLancamentoEnum.safeParse(s).success).toBe(true);
    }
  });

  it("o filtro da lista aceita status 'ANULADO' (D6)", () => {
    const r = schemas.FiltroLancamentoSchema.safeParse({ status: 'ANULADO' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe('ANULADO');
  });
});

describe('AnularLancamentoSchema', () => {
  it('existe', () => {
    expect(Anular()).toBeDefined();
  });

  it('aceita id cuid e id uuid (idEntidade)', () => {
    expect(Anular().safeParse({ id: CUID, motivo: 'Duplicado' }).success).toBe(true);
    expect(Anular().safeParse({ id: UUID, motivo: 'Duplicado' }).success).toBe(true);
  });

  it('recusa um id que não é cuid nem uuid', () => {
    expect(Anular().safeParse({ id: 'abc', motivo: 'Duplicado' }).success).toBe(false);
    expect(Anular().safeParse({ motivo: 'Duplicado' }).success).toBe(false);
  });

  it('motivo obrigatório', () => {
    expect(Anular().safeParse({ id: CUID }).success).toBe(false);
    expect(Anular().safeParse({ id: CUID, motivo: '' }).success).toBe(false);
  });

  it('motivo com menos de 3 caracteres DEPOIS do trim é recusado', () => {
    expect(Anular().safeParse({ id: CUID, motivo: 'ab' }).success).toBe(false);
    expect(Anular().safeParse({ id: CUID, motivo: '   ab   ' }).success).toBe(false);
    expect(Anular().safeParse({ id: CUID, motivo: '      ' }).success).toBe(false);
  });

  it('motivo de 3 caracteres é aceite, e sai aparado', () => {
    const r = Anular().safeParse({ id: CUID, motivo: '  abc  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.motivo).toBe('abc');
  });

  it('motivo até 500 caracteres; 501 é recusado', () => {
    expect(Anular().safeParse({ id: CUID, motivo: 'x'.repeat(500) }).success).toBe(true);
    expect(Anular().safeParse({ id: CUID, motivo: 'x'.repeat(501) }).success).toBe(false);
  });

  it('o limite de 500 conta depois do trim', () => {
    expect(Anular().safeParse({ id: CUID, motivo: `  ${'x'.repeat(500)}  ` }).success).toBe(true);
  });
});

describe('EditarLancamentoSchema', () => {
  it('existe', () => {
    expect(Editar()).toBeDefined();
  });

  it('aceita o lançamento editado sem diarioId, e devolve id, data, histórico e partidas', () => {
    const r = Editar().safeParse(editarValido());
    expect(r.success, JSON.stringify(!r.success && r.error.issues)).toBe(true);
    if (r.success) {
      expect(r.data.id).toBe(CUID);
      expect(r.data.data).toBeInstanceOf(Date);
      expect(r.data.historico).toBe('Reclassificação corrigida');
      expect(r.data.partidas).toHaveLength(2);
    }
  });

  it('id: cuid e uuid aceites; outro formato e ausente recusados', () => {
    expect(Editar().safeParse(editarValido({ id: UUID })).success).toBe(true);
    expect(Editar().safeParse(editarValido({ id: 'nao-e-id' })).success).toBe(false);
    const { id: _id, ...semId } = editarValido();
    expect(Editar().safeParse(semId).success).toBe(false);
  });

  it('diarioId, origem e documentoOrigem* não passam para o resultado (recusados ou ignorados)', () => {
    const r = Editar().safeParse(
      editarValido({
        diarioId: CUID,
        origem: 'VENDA',
        documentoOrigemId: 'doc-1',
        documentoOrigemTipo: 'Fatura',
      }),
    );
    if (r.success) {
      expect(r.data).not.toHaveProperty('diarioId');
      expect(r.data).not.toHaveProperty('origem');
      expect(r.data).not.toHaveProperty('documentoOrigemId');
      expect(r.data).not.toHaveProperty('documentoOrigemTipo');
    }
  });

  it('sem diarioId no input, o resultado também não tem origem por omissão', () => {
    const r = Editar().safeParse(editarValido());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty('diarioId');
      expect(r.data).not.toHaveProperty('origem');
    }
  });

  it('mantém o invariante débito = crédito do criar', () => {
    const r = Editar().safeParse(
      editarValido({
        partidas: [
          { contaId: UUID, tipo: 'DEBITO', valor: 1500 },
          { contaId: CUID, tipo: 'CREDITO', valor: 1499.99 },
        ],
      }),
    );
    expect(r.success).toBe(false);
  });

  it('mantém o mínimo de 2 partidas e o histórico obrigatório', () => {
    expect(
      Editar().safeParse(editarValido({ partidas: [{ contaId: UUID, tipo: 'DEBITO', valor: 1 }] })).success,
    ).toBe(false);
    expect(Editar().safeParse(editarValido({ historico: '' })).success).toBe(false);
  });
});
