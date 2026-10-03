/**
 * Oráculo S1 (run razao-periodos, issue #297, ADR-0040 §7) — `FiltroRazaoSchema` em dois modos.
 *
 * Contrato (G1, `.scratch/sdlc/razao-periodos/RUN.md`):
 * - modo DATAS: { contaId, dataInicio, dataFim, cursor?, take } — o que existia;
 * - modo PERÍODOS: { contaId, exercicioId, periodoInicial 1..13, periodoFinal 1..13,
 *   incluir13 = false, take } — períodos coagidos (chegam do URL como texto).
 * A normalização do intervalo (de > ate, 13 sem p13) é do SERVIÇO, como no balancete:
 * o schema aceita de > ate tal como `FiltroBalanceteVerificacaoSchema` aceita.
 *
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */
import { describe, expect, it } from 'vitest';
import { FiltroRazaoSchema } from '@/lib/validations/contabilidade';

const CONTA_UUID = '99860c43-83f7-4b41-ae1d-9e895920452a'; // contas PGC nascem com uuid
const EXERCICIO_CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('FiltroRazaoSchema — modo por datas (inalterado)', () => {
  it('aceita contaId + dataInicio + dataFim e coage as datas', () => {
    const r = FiltroRazaoSchema.safeParse({ contaId: CONTA_UUID, dataInicio: '2026-01-01', dataFim: '2026-03-31' });
    expect(r.success).toBe(true);
    const d = r.data as Record<string, unknown>;
    expect(d.dataInicio).toBeInstanceOf(Date);
    expect(d.dataFim).toBeInstanceOf(Date);
    expect(d.take).toBe(50);
    expect(d).not.toHaveProperty('exercicioId');
  });

  it('respeita o take pedido', () => {
    const r = FiltroRazaoSchema.safeParse({ contaId: CONTA_UUID, dataInicio: '2026-01-01', dataFim: '2026-03-31', take: 10 });
    expect(r.success).toBe(true);
    expect((r.data as Record<string, unknown>).take).toBe(10);
  });
});

describe('FiltroRazaoSchema — modo por períodos', () => {
  it('aceita contaId + exercicioId + períodos numéricos; incluir13 por omissão false', () => {
    const r = FiltroRazaoSchema.safeParse({ contaId: CONTA_UUID, exercicioId: EXERCICIO_CUID, periodoInicial: 3, periodoFinal: 5 });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    const d = r.data as Record<string, unknown>;
    expect(d.contaId).toBe(CONTA_UUID);
    expect(d.exercicioId).toBe(EXERCICIO_CUID);
    expect(d.periodoInicial).toBe(3);
    expect(d.periodoFinal).toBe(5);
    expect(d.incluir13).toBe(false);
    expect(d).not.toHaveProperty('dataInicio');
  });

  it('coage os períodos vindos do URL como texto', () => {
    const r = FiltroRazaoSchema.safeParse({ contaId: CONTA_UUID, exercicioId: EXERCICIO_CUID, periodoInicial: '1', periodoFinal: '13', incluir13: true });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    const d = r.data as Record<string, unknown>;
    expect(d.periodoInicial).toBe(1);
    expect(d.periodoFinal).toBe(13);
    expect(d.incluir13).toBe(true);
  });

  it('aceita de > ate (a normalização é do serviço, como no balancete)', () => {
    const r = FiltroRazaoSchema.safeParse({ contaId: CONTA_UUID, exercicioId: EXERCICIO_CUID, periodoInicial: 7, periodoFinal: 3 });
    expect(r.success).toBe(true);
  });

  it('aceita o exercício com uuid ou cuid (idEntidade)', () => {
    const r = FiltroRazaoSchema.safeParse({ contaId: CONTA_UUID, exercicioId: CONTA_UUID, periodoInicial: 1, periodoFinal: 12 });
    expect(r.success).toBe(true);
  });

  it.each([
    ['período inicial 0', { periodoInicial: 0, periodoFinal: 5 }],
    ['período final 14', { periodoInicial: 1, periodoFinal: 14 }],
    ['período não inteiro', { periodoInicial: 2.5, periodoFinal: 5 }],
    ['período não numérico', { periodoInicial: 'abc', periodoFinal: 5 }],
    ['sem período inicial', { periodoFinal: 5 }],
    ['sem período final', { periodoInicial: 1 }],
  ])('recusa %s', (_nome, periodos) => {
    const r = FiltroRazaoSchema.safeParse({ contaId: CONTA_UUID, exercicioId: EXERCICIO_CUID, ...periodos });
    expect(r.success).toBe(false);
  });
});

describe('FiltroRazaoSchema — nenhum dos modos', () => {
  it.each([
    ['só contaId', { contaId: CONTA_UUID }],
    ['datas incompletas', { contaId: CONTA_UUID, dataInicio: '2026-01-01' }],
    ['períodos sem exercício', { contaId: CONTA_UUID, periodoInicial: 1, periodoFinal: 12 }],
    ['exercício sem períodos', { contaId: CONTA_UUID, exercicioId: EXERCICIO_CUID }],
    ['exercício com id inválido', { contaId: CONTA_UUID, exercicioId: 'nao-e-um-id', periodoInicial: 1, periodoFinal: 12 }],
    ['sem conta (datas)', { dataInicio: '2026-01-01', dataFim: '2026-03-31' }],
    ['sem conta (períodos)', { exercicioId: EXERCICIO_CUID, periodoInicial: 1, periodoFinal: 12 }],
  ])('recusa %s', (_nome, input) => {
    expect(FiltroRazaoSchema.safeParse(input).success).toBe(false);
  });
});
