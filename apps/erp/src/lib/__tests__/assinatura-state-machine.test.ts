import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ESTADOS_ASSINATURA,
  TRANSICOES_ASSINATURA,
  bloqueiaAcesso,
  transicaoAssinaturaValida,
  type EstadoAssinatura,
} from '@/lib/state-machines';
import {
  PLANOS,
  PLANO_IDS,
  CICLO_IDS,
  catalogoPublico,
  isPlanoId,
  nomeEnvPrice,
  precoDoPlano,
} from '@/lib/planos';

const arbEstado = fc.constantFrom<EstadoAssinatura>(...ESTADOS_ASSINATURA);

describe('máquina de estados da Assinatura (spec 19)', () => {
  it('cobre todos os estados do enum, sem entradas a mais', () => {
    expect(Object.keys(TRANSICOES_ASSINATURA).sort()).toEqual([...ESTADOS_ASSINATURA].sort());
  });

  it('só transita para estados válidos do enum', () => {
    for (const alvos of Object.values(TRANSICOES_ASSINATURA)) {
      for (const alvo of alvos) {
        expect(ESTADOS_ASSINATURA).toContain(alvo);
      }
    }
  });

  it('é idempotente: qualquer estado para si próprio é válido', () => {
    fc.assert(
      fc.property(arbEstado, (e) => {
        expect(transicaoAssinaturaValida(e, e)).toBe(true);
      }),
    );
  });

  it('rejeita exactamente as transições fora do mapa', () => {
    fc.assert(
      fc.property(arbEstado, arbEstado, (de, para) => {
        const esperado = de === para || TRANSICOES_ASSINATURA[de].includes(para);
        expect(transicaoAssinaturaValida(de, para)).toBe(esperado);
      }),
    );
  });

  it('rejeita transições concretas impossíveis', () => {
    expect(transicaoAssinaturaValida('TRIAL', 'SUSPENSA')).toBe(false);
    expect(transicaoAssinaturaValida('EXPIRADO', 'TRIAL')).toBe(false);
    expect(transicaoAssinaturaValida('CANCELADA', 'SUSPENSA')).toBe(false);
    expect(transicaoAssinaturaValida('CANCELADA', 'TRIAL')).toBe(false);
    expect(transicaoAssinaturaValida('ATIVA', 'TRIAL')).toBe(false);
  });

  it('aceita as transições do requisito 3.1', () => {
    expect(transicaoAssinaturaValida('TRIAL', 'ATIVA')).toBe(true);
    expect(transicaoAssinaturaValida('TRIAL', 'EXPIRADO')).toBe(true);
    expect(transicaoAssinaturaValida('ATIVA', 'SUSPENSA')).toBe(true);
    expect(transicaoAssinaturaValida('SUSPENSA', 'ATIVA')).toBe(true);
    // Qualquer estado não-terminal pode ser cancelado.
    for (const e of ESTADOS_ASSINATURA.filter((x) => x !== 'CANCELADA')) {
      expect(transicaoAssinaturaValida(e, 'CANCELADA')).toBe(true);
    }
  });

  it('permite reactivar após CANCELADA (nova Checkout no mesmo registo)', () => {
    expect(transicaoAssinaturaValida('CANCELADA', 'ATIVA')).toBe(true);
  });
});

describe('bloqueiaAcesso — requisito 6.1', () => {
  it('reflecte exactamente o mapa do requisito para todos os estados', () => {
    const esperado: Record<EstadoAssinatura, boolean> = {
      TRIAL: false,
      ATIVA: false,
      SUSPENSA: true,
      CANCELADA: true,
      EXPIRADO: true,
    };
    for (const e of ESTADOS_ASSINATURA) {
      expect(bloqueiaAcesso(e)).toBe(esperado[e]);
    }
  });

  it('statusAtivo é sempre o inverso de bloqueiaAcesso', () => {
    fc.assert(
      fc.property(arbEstado, (e) => {
        expect(!bloqueiaAcesso(e)).toBe(e === 'TRIAL' || e === 'ATIVA');
      }),
    );
  });
});

describe('catálogo de planos — fonte única de preços', () => {
  it('tem os três planos e nenhum a mais', () => {
    expect(Object.keys(PLANOS).sort()).toEqual([...PLANO_IDS].sort());
  });

  it('serve todos os planos no payload público, sem nomes de env vars', () => {
    const { planos, trialDias } = catalogoPublico();
    expect(planos).toHaveLength(PLANO_IDS.length);
    expect(trialDias).toBe(14);
    for (const p of planos) {
      expect(JSON.stringify(p)).not.toContain('STRIPE_');
      expect(p.precoMensal.moeda).toBe('USD');
      expect(p.precoAnual.moeda).toBe('USD');
    }
  });

  it('o preço anual nunca é mais caro que 12 mensalidades', () => {
    for (const id of PLANO_IDS) {
      const p = PLANOS[id];
      expect(p.precoAnual.valor).toBeLessThanOrEqual(p.precoMensal.valor * 12);
    }
  });

  it('resolve o nome de env var certo para os 6 pares plano×ciclo', () => {
    const nomes = new Set<string>();
    for (const plano of PLANO_IDS) {
      for (const ciclo of CICLO_IDS) {
        const nome = nomeEnvPrice(plano, ciclo);
        expect(nome).toMatch(/^STRIPE_PRICE_[A-Z]+_(MENSAL|ANUAL)$/);
        nomes.add(nome);
      }
    }
    expect(nomes.size).toBe(6);
  });

  it('precoDoPlano devolve o preço do ciclo pedido', () => {
    expect(precoDoPlano('BASICO', 'MENSAL')).toEqual(PLANOS.BASICO.precoMensal);
    expect(precoDoPlano('BASICO', 'ANUAL')).toEqual(PLANOS.BASICO.precoAnual);
  });

  it('isPlanoId revalida input do cliente', () => {
    expect(isPlanoId('BASICO')).toBe(true);
    expect(isPlanoId('GRATIS')).toBe(false);
    expect(isPlanoId('basico')).toBe(false);
  });
});
