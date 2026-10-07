import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  ESTADOS_ASSINATURA,
  TRANSICOES_ASSINATURA,
  estadoDeAcesso,
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
    expect(transicaoAssinaturaValida('TRIAL', 'FECHADA')).toBe(false);
    expect(transicaoAssinaturaValida('EXPIRADO', 'TRIAL')).toBe(false);
    expect(transicaoAssinaturaValida('FECHADA', 'LEITURA')).toBe(false);
    expect(transicaoAssinaturaValida('CANCELADA', 'TRIAL')).toBe(false);
    expect(transicaoAssinaturaValida('ATIVA', 'TRIAL')).toBe(false);
  });

  it('as três saídas convergem em LEITURA (ADR-0027 §6)', () => {
    // Fim de Trial, cancelamento voluntário e dunning esgotado: um só destino.
    expect(transicaoAssinaturaValida('TRIAL', 'LEITURA')).toBe(true);
    expect(transicaoAssinaturaValida('ATIVA', 'LEITURA')).toBe(true);
    // E é o ÚNICO destino: nenhuma saída directa para um estado sem acesso.
    expect(transicaoAssinaturaValida('TRIAL', 'EXPIRADO')).toBe(false);
    expect(transicaoAssinaturaValida('ATIVA', 'SUSPENSA')).toBe(false);
    expect(transicaoAssinaturaValida('ATIVA', 'CANCELADA')).toBe(false);
  });

  it('da Leitura sai-se para FECHADA ou, pagando, para ATIVA', () => {
    expect(transicaoAssinaturaValida('LEITURA', 'FECHADA')).toBe(true);
    expect(transicaoAssinaturaValida('LEITURA', 'ATIVA')).toBe(true);
  });

  it('nunca se prende quem quer pagar: todo o estado sem acesso volta a ATIVA', () => {
    for (const e of ESTADOS_ASSINATURA.filter((x) => x !== 'ATIVA' && x !== 'TRIAL')) {
      expect(transicaoAssinaturaValida(e, 'ATIVA')).toBe(true);
    }
  });
});

describe('estadoDeAcesso — tabela completa (ADR-0032 §4, issue #99)', () => {
  // Issue #99: a FECHADA comercial deixou de ser um beco sem saída. Quem
  // fechou por não pagar entra num nível próprio, `pagamento` — sessão só para
  // regularizar a subscrição. O fecho decidido pela GestPro (`Tenant.deletedAt`)
  // continua `fechado`: esse não reabre por ter pago.
  //
  // `string` e não `EstadoAcesso` de propósito: o nível `pagamento` ainda não
  // existe no tipo, e o caso tem de falhar pela asserção, não pelo `tsc`.
  const acesso = estadoDeAcesso as unknown as (e: EstadoAssinatura, gestpro: boolean) => string;

  it('mapeia todos os estados do enum, com o tenant vivo', () => {
    const esperado: Record<EstadoAssinatura, string> = {
      TRIAL: 'aberto',
      ATIVA: 'aberto',
      LEITURA: 'leitura',
      FECHADA: 'pagamento',
      SUSPENSA: 'fechado',
      CANCELADA: 'fechado',
      EXPIRADO: 'fechado',
    };
    for (const e of ESTADOS_ASSINATURA) {
      expect(acesso(e, false), `estado ${e}`).toBe(esperado[e]);
    }
  });

  it('a FECHADA comercial tem saída: nível `pagamento`, nunca `fechado` (issue #99)', () => {
    expect(acesso('FECHADA', false)).toBe('pagamento');
    expect(acesso('FECHADA', false)).not.toBe('fechado');
  });

  it('a decisão da GestPro ganha sempre — nem o pagamento a desfaz', () => {
    // O defeito que o ADR-0032 §4 fecha: um tenant suspenso por abuso NÃO
    // reabre por ter pago. Vale para TODOS os estados, ATIVA incluído — e a
    // FECHADA também: fechado por nós não ganha a porta de pagamento.
    fc.assert(
      fc.property(arbEstado, (e) => {
        expect(acesso(e, true)).toBe('fechado');
      }),
    );
    expect(acesso('FECHADA', true)).toBe('fechado');
  });

  it('só a Leitura é leitura', () => {
    fc.assert(
      fc.property(arbEstado, (e) => {
        expect(acesso(e, false) === 'leitura').toBe(e === 'LEITURA');
      }),
    );
  });

  it('só a FECHADA comercial é pagamento', () => {
    fc.assert(
      fc.property(arbEstado, fc.boolean(), (e, gestpro) => {
        expect(acesso(e, gestpro) === 'pagamento').toBe(e === 'FECHADA' && !gestpro);
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
