/**
 * Issue #352 — a vigência de uma regra de comissão (`dataInicio`/`dataFim`) é o dia civil
 * INTEIRO de Maputo.
 *
 * `z.coerce.date('2026-06-30')` dá 2026-06-30T00:00Z = 02h00 em Maputo: gravada como `dataFim`,
 * a regra deixa de valer às 02h00 do último dia. Contrato dos schemas
 * Create/UpdateRegraComissaoSchema (`@/lib/validations/vendas`), igual ao dos filtros (#88, #349):
 *   dataInicio `aaaa-mm-dd` → `T00:00:00.000+02:00` · dataFim `aaaa-mm-dd` → `T23:59:59.999+02:00`
 *   campos continuam opcionais · no Update `null` continua a ser `null` (limpar a data) ·
 *   lixo continua recusado · `dataInicio` = `dataFim` (regra de um só dia) é válido.
 *
 * Instantes comparados por `toISOString()`/`getTime()` — nunca getters de hora local.
 *
 * Escrito pelo autor do oráculo (nó C:comissao-dia-maputo-352); um agente de implementação que
 * o altere é BLOCKER.
 */
import { describe, it, expect } from 'vitest';
import { CreateRegraComissaoSchema, UpdateRegraComissaoSchema } from '@/lib/validations/vendas';

const BASE_CREATE = {
  nome: 'Campanha de Junho',
  tipo: 'POR_PERIODO' as const,
  percentualBase: 12,
  descricao: 'Regra de período (#352)',
};

describe('#352 CreateRegraComissaoSchema — vigência no dia civil de Maputo', () => {
  it("dataFim '2026-06-30' → 2026-06-30T21:59:59.999Z (23:59:59,999 de Maputo)", () => {
    const r = CreateRegraComissaoSchema.parse({ ...BASE_CREATE, dataFim: '2026-06-30' });
    expect(r.dataFim?.toISOString()).toBe('2026-06-30T21:59:59.999Z');
  });

  it("dataInicio '2026-06-01' → 2026-05-31T22:00:00.000Z (00:00 de Maputo)", () => {
    const r = CreateRegraComissaoSchema.parse({ ...BASE_CREATE, dataInicio: '2026-06-01' });
    expect(r.dataInicio?.toISOString()).toBe('2026-05-31T22:00:00.000Z');
  });

  it('intervalo completo: os dois limites no dia civil de Maputo', () => {
    const r = CreateRegraComissaoSchema.parse({
      ...BASE_CREATE,
      dataInicio: '2026-06-01',
      dataFim: '2026-06-30',
    });
    expect(r.dataInicio?.getTime()).toBe(new Date('2026-06-01T00:00:00.000+02:00').getTime());
    expect(r.dataFim?.getTime()).toBe(new Date('2026-06-30T23:59:59.999+02:00').getTime());
  });

  it('regra de um só dia (dataInicio = dataFim) continua válida', () => {
    const r = CreateRegraComissaoSchema.safeParse({
      ...BASE_CREATE,
      dataInicio: '2026-06-30',
      dataFim: '2026-06-30',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dataInicio?.toISOString()).toBe('2026-06-29T22:00:00.000Z');
      expect(r.data.dataFim?.toISOString()).toBe('2026-06-30T21:59:59.999Z');
    }
  });

  it('dataInicio posterior a dataFim continua recusada', () => {
    const r = CreateRegraComissaoSchema.safeParse({
      ...BASE_CREATE,
      dataInicio: '2026-07-01',
      dataFim: '2026-06-30',
    });
    expect(r.success).toBe(false);
  });

  it('datas continuam opcionais', () => {
    const r = CreateRegraComissaoSchema.parse(BASE_CREATE);
    expect(r.dataInicio).toBeUndefined();
    expect(r.dataFim).toBeUndefined();
  });

  it('Date e ISO com hora passam inalterados', () => {
    const d = new Date('2026-06-15T09:30:00.000Z');
    const r = CreateRegraComissaoSchema.parse({
      ...BASE_CREATE,
      dataInicio: d,
      dataFim: '2026-06-30T12:00:00.000Z',
    });
    expect(r.dataInicio?.getTime()).toBe(d.getTime());
    expect(r.dataFim?.toISOString()).toBe('2026-06-30T12:00:00.000Z');
  });

  it('lixo continua recusado', () => {
    expect(CreateRegraComissaoSchema.safeParse({ ...BASE_CREATE, dataFim: 'amanhã' }).success).toBe(false);
  });
});

describe('#352 UpdateRegraComissaoSchema — vigência no dia civil de Maputo', () => {
  it("dataFim '2026-06-30' → 2026-06-30T21:59:59.999Z", () => {
    const r = UpdateRegraComissaoSchema.parse({ dataFim: '2026-06-30' });
    expect(r.dataFim?.toISOString()).toBe('2026-06-30T21:59:59.999Z');
  });

  it("dataInicio '2026-06-01' → 2026-05-31T22:00:00.000Z", () => {
    const r = UpdateRegraComissaoSchema.parse({ dataInicio: '2026-06-01' });
    expect(r.dataInicio?.toISOString()).toBe('2026-05-31T22:00:00.000Z');
  });

  it('null continua a ser null (limpar a data), não cai no preprocess', () => {
    const r = UpdateRegraComissaoSchema.parse({ dataInicio: null, dataFim: null });
    expect(r.dataInicio).toBeNull();
    expect(r.dataFim).toBeNull();
  });

  it('omitido continua omitido (não altera a data gravada)', () => {
    const r = UpdateRegraComissaoSchema.parse({ nome: 'Só o nome' });
    expect('dataInicio' in r ? r.dataInicio : undefined).toBeUndefined();
    expect('dataFim' in r ? r.dataFim : undefined).toBeUndefined();
  });

  it('lixo continua recusado', () => {
    expect(UpdateRegraComissaoSchema.safeParse({ dataInicio: 'ontem' }).success).toBe(false);
  });
});
