/**
 * Datas da URL → períodos da DFC (nó `fatia`). Acessório do autor; os
 * períodos imitam os da base: início às 00h00 de Maputo (22h00 UTC da
 * véspera), fim às 23h59:59.999 de Maputo, e o 13 como ponto no fim do 12.
 */
import { describe, expect, it } from 'vitest';
import { periodoQueContem, resolverIntervaloDFC, type PeriodoParaIntervalo } from '../dfc-intervalo';
import { formatarDiaIso } from '../format-date';

function periodosDe(ano: number, exercicioId: string): PeriodoParaIntervalo[] {
  const ps: PeriodoParaIntervalo[] = [];
  for (let m = 1; m <= 12; m++) {
    ps.push({
      id: `${ano}-${m}`,
      codigo: `${ano}-${String(m).padStart(2, '0')}`,
      ordem: m,
      exercicioId,
      dataInicio: new Date(Date.UTC(ano, m - 1, 1) - 2 * 3600_000),
      dataFim: new Date(Date.UTC(ano, m, 1) - 2 * 3600_000 - 1),
    });
  }
  const fimAno = new Date(Date.UTC(ano + 1, 0, 1) - 2 * 3600_000 - 1);
  ps.push({ id: `${ano}-13`, codigo: `${ano}-13`, ordem: 13, exercicioId, dataInicio: fimAno, dataFim: fimAno });
  return ps;
}

const P = [...periodosDe(2026, 'e26'), ...periodosDe(2025, 'e25')];
const HOJE = new Date('2026-09-26T10:00:00Z');

describe('formatarDiaIso', () => {
  it('dá o dia civil de Maputo, não o de UTC', () => {
    expect(formatarDiaIso(new Date('2025-12-31T22:00:00Z'))).toBe('2026-01-01');
    expect(formatarDiaIso(new Date('2026-01-31T21:59:59.999Z'))).toBe('2026-01-31');
  });
});

describe('periodoQueContem', () => {
  it('o 1.º dia do mês é do próprio mês (o início às 22h00 UTC da véspera não o empurra para trás)', () => {
    expect(periodoQueContem(P, '2026-01-01')?.codigo).toBe('2026-01');
    expect(periodoQueContem(P, '2026-02-01')?.codigo).toBe('2026-02');
  });
  it('o 31/12 está no 12 e no 13: escolhe o 12 (menor ordem)', () => {
    expect(periodoQueContem(P, '2026-12-31')?.codigo).toBe('2026-12');
  });
  it('dia sem período ⇒ null', () => {
    expect(periodoQueContem(P, '2024-06-01')).toBeNull();
  });
});

describe('resolverIntervaloDFC', () => {
  it('sem datas ⇒ do 1.º período do exercício ao período de hoje', () => {
    const r = resolverIntervaloDFC(P, {}, HOJE);
    expect(r.ok && [r.inicio.codigo, r.fim.codigo, r.dataInicio, r.dataFim, r.alargado]).toEqual([
      '2026-01', '2026-09', '2026-01-01', '2026-09-30', false,
    ]);
  });
  it('limites exactos de período ⇒ não alargado', () => {
    const r = resolverIntervaloDFC(P, { dataInicio: '2026-04-01', dataFim: '2026-06-30' }, HOJE);
    expect(r.ok && [r.inicio.codigo, r.fim.codigo, r.alargado]).toEqual(['2026-04', '2026-06', false]);
  });
  it('dias a meio do mês ⇒ períodos completos, e diz que alargou', () => {
    const r = resolverIntervaloDFC(P, { dataInicio: '2026-04-15', dataFim: '2026-06-10' }, HOJE);
    expect(r.ok && [r.dataInicio, r.dataFim, r.alargado]).toEqual(['2026-04-01', '2026-06-30', true]);
  });
  it('entre exercícios passa: quem recusa é o serviço (V4)', () => {
    const r = resolverIntervaloDFC(P, { dataInicio: '2025-11-01', dataFim: '2026-02-28' }, HOJE);
    expect(r.ok && [r.inicio.exercicioId, r.fim.exercicioId]).toEqual(['e25', 'e26']);
  });
  it('data inválida ou sem período ⇒ motivo, nunca excepção', () => {
    expect(resolverIntervaloDFC(P, { dataInicio: '2026-02-30' }, HOJE)).toMatchObject({ ok: false });
    expect(resolverIntervaloDFC(P, { dataFim: 'ontem' }, HOJE)).toMatchObject({ ok: false });
    const r = resolverIntervaloDFC(P, { dataFim: '2030-01-01' }, HOJE);
    expect(r).toEqual({ ok: false, motivo: 'Não há período contabilístico que contenha 01/01/2030.' });
    expect(resolverIntervaloDFC([], {}, HOJE)).toMatchObject({ ok: false });
  });
});

describe('resolverIntervaloDFC — sem exercício (nó `pagina`, NIT do `fatia`)', () => {
  it('diz que não há exercício nenhum (não «aberto»: a lista inclui períodos de qualquer estado)', () => {
    const r = resolverIntervaloDFC([], {}, HOJE);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/ainda não tem nenhum exercício contabilístico/);
    expect(!r.ok && r.motivo).not.toMatch(/aberto/);
  });
});
