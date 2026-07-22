// Testes de SLA de Ticket — WS F (Wave 2)
// Verifica calcularSla e recalcularSlaEmAtraso como funções puras.

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { calcularSla, recalcularSlaEmAtraso } from '../ticket.service';
import { SLA_PADRAO_MIN } from '../ticket.interface';

// ============================================================
// calcularSla
// ============================================================

describe('calcularSla', () => {
  it('usa tempos padrão BAIXA correctamente', () => {
    const agora = new Date('2026-01-01T10:00:00Z');
    const sla = calcularSla('BAIXA', agora);

    expect(sla.slaTempoResposta).toBe(SLA_PADRAO_MIN['BAIXA'].resposta); // 480
    expect(sla.slaTempoResolucao).toBe(SLA_PADRAO_MIN['BAIXA'].resolucao); // 4320

    const esperadaResposta = new Date(agora.getTime() + 480 * 60_000);
    const esperadaResolucao = new Date(agora.getTime() + 4320 * 60_000);
    expect(sla.slaDataLimiteResposta.getTime()).toBe(esperadaResposta.getTime());
    expect(sla.slaDataLimiteResolucao.getTime()).toBe(esperadaResolucao.getTime());
  });

  it('usa tempos padrão URGENTE correctamente', () => {
    const agora = new Date('2026-01-01T10:00:00Z');
    const sla = calcularSla('URGENTE', agora);

    expect(sla.slaTempoResposta).toBe(60); // 1h
    expect(sla.slaTempoResolucao).toBe(480); // 8h
  });

  it('substitui tempos padrão se categoria fornecida', () => {
    const agora = new Date('2026-01-01T10:00:00Z');
    const categoriaTempos = { slaTempoResposta: 15, slaTempoResolucao: 60 };
    const sla = calcularSla('NORMAL', agora, categoriaTempos);

    expect(sla.slaTempoResposta).toBe(15);
    expect(sla.slaTempoResolucao).toBe(60);
  });

  it('slaEmAtraso é false na criação (ticket ainda não abriu)', () => {
    const sla = calcularSla('NORMAL', new Date());
    expect(sla.slaEmAtraso).toBe(false);
  });

  it('property: dataLimiteResposta < dataLimiteResolucao para qualquer prioridade', () => {
    const prioridades = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...prioridades),
        fc.date({ min: new Date('2025-01-01'), max: new Date('2027-01-01') })
          .filter(d => !isNaN(d.getTime())), // fast-check v4 pode produzir NaN ao encolher
        (prioridade, agora) => {
          const sla = calcularSla(prioridade, agora);
          expect(sla.slaDataLimiteResposta.getTime()).toBeLessThan(
            sla.slaDataLimiteResolucao.getTime(),
          );
        },
      ),
    );
  });

  it('property: maior prioridade → menor tempo de resolução', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2025-01-01'), max: new Date('2027-01-01') })
          .filter(d => !isNaN(d.getTime())),
        (agora) => {
          const baixa = calcularSla('BAIXA', agora);
          const urgente = calcularSla('URGENTE', agora);
          expect(urgente.slaTempoResolucao).toBeLessThan(baixa.slaTempoResolucao);
          expect(urgente.slaDataLimiteResolucao.getTime()).toBeLessThan(
            baixa.slaDataLimiteResolucao.getTime(),
          );
        },
      ),
    );
  });
});

// ============================================================
// recalcularSlaEmAtraso
// ============================================================

describe('recalcularSlaEmAtraso', () => {
  const limite = new Date('2026-01-01T12:00:00Z');

  it('retorna false para tickets terminais (RESOLVIDO)', () => {
    const agoraTarde = new Date('2026-01-01T15:00:00Z');
    expect(recalcularSlaEmAtraso('RESOLVIDO', limite, agoraTarde)).toBe(false);
  });

  it('retorna false para tickets terminais (FECHADO)', () => {
    const agoraTarde = new Date('2026-01-01T15:00:00Z');
    expect(recalcularSlaEmAtraso('FECHADO', limite, agoraTarde)).toBe(false);
  });

  it('retorna false para tickets terminais (CANCELADO)', () => {
    const agoraTarde = new Date('2026-01-01T15:00:00Z');
    expect(recalcularSlaEmAtraso('CANCELADO', limite, agoraTarde)).toBe(false);
  });

  it('retorna true quando agora > limite e estado é aberto', () => {
    const agoraTarde = new Date('2026-01-01T15:00:00Z');
    expect(recalcularSlaEmAtraso('ABERTO', limite, agoraTarde)).toBe(true);
  });

  it('retorna false quando agora < limite e estado é aberto', () => {
    const agoraCedo = new Date('2026-01-01T10:00:00Z');
    expect(recalcularSlaEmAtraso('ABERTO', limite, agoraCedo)).toBe(false);
  });

  it('property: estado terminal → sempre false, independentemente do tempo', () => {
    const terminais = ['RESOLVIDO', 'FECHADO', 'CANCELADO'] as const;
    fc.assert(
      fc.property(
        fc.constantFrom(...terminais),
        fc.date({ min: new Date('2025-01-01'), max: new Date('2028-01-01') }),
        fc.date({ min: new Date('2025-01-01'), max: new Date('2028-01-01') }),
        (estado, limite, agora) => {
          expect(recalcularSlaEmAtraso(estado, limite, agora)).toBe(false);
        },
      ),
    );
  });

  it('property: EM_PROGRESSO depois do limite → sempre true', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2025-01-01'), max: new Date('2026-06-01') })
          .filter(d => !isNaN(d.getTime())), // fast-check v4 pode produzir NaN ao encolher
        fc.integer({ min: 1, max: 720 }),
        (limite, minutosApos) => {
          const agora = new Date(limite.getTime() + minutosApos * 60_000);
          expect(recalcularSlaEmAtraso('EM_PROGRESSO', limite, agora)).toBe(true);
        },
      ),
    );
  });
});

// ============================================================
// SLA_PADRAO_MIN — validação dos valores
// ============================================================

describe('SLA_PADRAO_MIN — configuração correcta', () => {
  it('todos os tempos de resposta < resolução', () => {
    for (const [prioridade, tempos] of Object.entries(SLA_PADRAO_MIN)) {
      expect(tempos.resposta).toBeLessThan(tempos.resolucao);
    }
  });

  it('URGENTE.resolucao < ALTA.resolucao < NORMAL.resolucao < BAIXA.resolucao', () => {
    expect(SLA_PADRAO_MIN['URGENTE'].resolucao)
      .toBeLessThan(SLA_PADRAO_MIN['ALTA'].resolucao);
    expect(SLA_PADRAO_MIN['ALTA'].resolucao)
      .toBeLessThan(SLA_PADRAO_MIN['NORMAL'].resolucao);
    expect(SLA_PADRAO_MIN['NORMAL'].resolucao)
      .toBeLessThan(SLA_PADRAO_MIN['BAIXA'].resolucao);
  });
});
