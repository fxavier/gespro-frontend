/**
 * ORÁCULO da issue #140, ticket T2 (verificador). Validação das regras de
 * sugestão de lançamento. Contrato em docs/agentic/issue-140/tickets.md (T2).
 *
 * As contas PGC nascem com uuid (tenant-bootstrap) e as contas bancárias com
 * cuid (Prisma): os dois formatos têm de passar em todos os campos de id,
 * senão a contrapartida de qualquer tenant real é recusada.
 */
import { describe, expect, it } from 'vitest';
import {
  EditarRegraSugestaoSchema,
  RegraSugestaoIdSchema,
  RegraSugestaoSchema,
} from '../reconciliacao';

const CUID = 'cmryxs0ig009dwg9kurri602u';
const UUID = '99860c43-83f7-4b41-ae1d-9e895920452a';

const VALIDA = {
  contaBancariaId: CUID,
  padrao: 'COMISSAO|ENCARGO',
  natureza: 'CREDITO',
  contaContrapartidaId: UUID,
  descricao: 'Comissões bancárias',
  prioridade: 100,
};

const ok = (patch: Record<string, unknown>) => RegraSugestaoSchema.safeParse({ ...VALIDA, ...patch }).success;

describe('RegraSugestaoSchema', () => {
  it('aceita a regra válida', () => {
    expect(RegraSugestaoSchema.safeParse(VALIDA).success).toBe(true);
  });

  it('contaBancariaId: null = todas as contas', () => {
    const r = RegraSugestaoSchema.parse({ ...VALIDA, contaBancariaId: null });
    expect(r.contaBancariaId).toBeNull();
  });

  it('ids em formato cuid E uuid nos dois campos de conta', () => {
    expect(ok({ contaBancariaId: CUID, contaContrapartidaId: UUID })).toBe(true);
    expect(ok({ contaBancariaId: UUID, contaContrapartidaId: CUID })).toBe(true);
    expect(ok({ contaBancariaId: UUID, contaContrapartidaId: UUID })).toBe(true);
    expect(ok({ contaBancariaId: CUID, contaContrapartidaId: CUID })).toBe(true);
  });

  it('ids que não são cuid nem uuid são recusados', () => {
    expect(ok({ contaContrapartidaId: '6981' })).toBe(false);
    expect(ok({ contaContrapartidaId: '' })).toBe(false);
    expect(ok({ contaBancariaId: 'abc' })).toBe(false);
  });

  it('contaContrapartidaId é obrigatória', () => {
    const { contaContrapartidaId: _omit, ...sem } = VALIDA;
    expect(RegraSugestaoSchema.safeParse(sem).success).toBe(false);
    expect(ok({ contaContrapartidaId: null })).toBe(false);
  });

  it('padrão só com «|» e espaços é recusado', () => {
    for (const p of ['|', '||', ' | ', '|  |  |', '   ', '']) {
      expect(ok({ padrao: p }), JSON.stringify(p)).toBe(false);
    }
  });

  it('padrão com pelo menos uma palavra entre «|» é aceite', () => {
    for (const p of ['TAXA', 'COMISSAO|', '|TAXA|', ' IMPOSTO DE SELO | ']) {
      expect(ok({ padrao: p }), JSON.stringify(p)).toBe(true);
    }
  });

  it('padrão: trim e máximo de 200', () => {
    expect(RegraSugestaoSchema.parse({ ...VALIDA, padrao: '  TAXA  ' }).padrao).toBe('TAXA');
    expect(ok({ padrao: 'A'.repeat(200) })).toBe(true);
    expect(ok({ padrao: 'A'.repeat(201) })).toBe(false);
  });

  it('natureza só DEBITO ou CREDITO', () => {
    expect(ok({ natureza: 'DEBITO' })).toBe(true);
    expect(ok({ natureza: 'CREDITO' })).toBe(true);
    for (const n of ['SAIDA', 'credito', 'ENTRADA', '', null]) {
      expect(ok({ natureza: n }), String(n)).toBe(false);
    }
  });

  it('prioridade 1..999 inteira; 0 e 1000 recusadas', () => {
    expect(ok({ prioridade: 1 })).toBe(true);
    expect(ok({ prioridade: 999 })).toBe(true);
    expect(ok({ prioridade: 0 })).toBe(false);
    expect(ok({ prioridade: 1000 })).toBe(false);
    expect(ok({ prioridade: 1.5 })).toBe(false);
  });

  it('prioridade coage texto numérico', () => {
    expect(RegraSugestaoSchema.parse({ ...VALIDA, prioridade: '42' }).prioridade).toBe(42);
    expect(ok({ prioridade: '0' })).toBe(false);
  });

  it('descrição é opcional e tem máximo de 200', () => {
    const { descricao: _omit, ...sem } = VALIDA;
    expect(RegraSugestaoSchema.safeParse(sem).success).toBe(true);
    expect(ok({ descricao: 'x'.repeat(200) })).toBe(true);
    expect(ok({ descricao: 'x'.repeat(201) })).toBe(false);
  });
});

describe('EditarRegraSugestaoSchema e RegraSugestaoIdSchema', () => {
  it('editar exige id (cuid ou uuid) além dos campos da regra', () => {
    expect(EditarRegraSugestaoSchema.safeParse({ ...VALIDA, id: CUID }).success).toBe(true);
    expect(EditarRegraSugestaoSchema.safeParse({ ...VALIDA, id: UUID }).success).toBe(true);
    expect(EditarRegraSugestaoSchema.safeParse(VALIDA).success).toBe(false);
    expect(EditarRegraSugestaoSchema.safeParse({ ...VALIDA, id: 'x' }).success).toBe(false);
  });

  it('editar aplica as mesmas regras de campo', () => {
    expect(EditarRegraSugestaoSchema.safeParse({ ...VALIDA, id: CUID, prioridade: 0 }).success).toBe(false);
    expect(EditarRegraSugestaoSchema.safeParse({ ...VALIDA, id: CUID, padrao: '|' }).success).toBe(false);
  });

  it('RegraSugestaoIdSchema aceita cuid e uuid e recusa lixo', () => {
    expect(RegraSugestaoIdSchema.safeParse({ id: CUID }).success).toBe(true);
    expect(RegraSugestaoIdSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(RegraSugestaoIdSchema.safeParse({ id: '1' }).success).toBe(false);
    expect(RegraSugestaoIdSchema.safeParse({}).success).toBe(false);
  });
});
