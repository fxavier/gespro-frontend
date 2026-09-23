import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  PASSAGENS,
  avaliar,
  emparelhar,
  decidirDesfecho,
  type ConfiguracaoMatching,
  type MovimentoParaMatch,
  type Proposta,
} from '../matching';
import { normalizarReferencia } from '../reconciliacao.model';

const D = (v: string | number) => new Prisma.Decimal(v);
const dia = (d: number) => new Date(2026, 8, d, 12);

const CFG: ConfiguracaoMatching = {
  toleranciaDias: 5,
  toleranciaValor: D(0),
  permitirMatchPorReferencia: true,
  permitirMatchPorValor: true,
  permitirMatchPorDescricao: true,
};

function mov(p: Partial<MovimentoParaMatch> & { id: string }): MovimentoParaMatch {
  return {
    data: dia(10),
    valor: D('1000.00'),
    natureza: 'DEBITO',
    referencia: null,
    referenciaNormalizada: null,
    descricao: 'movimento',
    documento: null,
    estado: 'PENDENTE',
    ...p,
  };
}

// Geradores: poucos valores, poucas referências e poucos dias, para forçar colisões
// (rendas iguais, referências repetidas) — é aí que um motor ingénuo erra.
const arbMov = (prefixo: string) =>
  fc.record({
    id: fc.nat({ max: 10_000 }).map((n) => `${prefixo}${n}`),
    data: fc.integer({ min: 1, max: 30 }).map(dia),
    valor: fc.constantFrom('100.00', '250.50', '1000.00', '1000.01').map(D),
    natureza: fc.constantFrom('DEBITO' as const, 'CREDITO' as const),
    referencia: fc.option(fc.constantFrom('TRF-0458/2026', 'trf 0458 2026', 'FAC/2026/000458', 'RENDA'), { nil: null }),
    descricao: fc.constantFrom('pagamento renda escritorio', 'transferencia cliente', 'comissao'),
    documento: fc.option(fc.constantFrom('FAC/2026/000458', 'FAC/2026/000459'), { nil: null }),
  }).map((m) => mov({ ...m, referenciaNormalizada: normalizarReferencia(m.referencia) }));

const arbLado = (prefixo: string) =>
  fc.uniqueArray(arbMov(prefixo), { selector: (m) => m.id, maxLength: 25 });

const arbCfg: fc.Arbitrary<ConfiguracaoMatching> = fc.record({
  toleranciaDias: fc.integer({ min: 0, max: 10 }),
  toleranciaValor: fc.constantFrom('0', '0.01', '5').map(D),
  permitirMatchPorReferencia: fc.boolean(),
  permitirMatchPorValor: fc.boolean(),
  permitirMatchPorDescricao: fc.boolean(),
});

describe('PASSAGENS', () => {
  it('segue a ordem de declaração do enum RegraCorrespondencia (RF §6), sem MANUAL', () => {
    expect(PASSAGENS).toEqual([
      'REFERENCIA_EXACTA',
      'REFERENCIA_NORMALIZADA',
      'DOCUMENTO',
      'VALOR_NATUREZA_DATA',
      'VALOR_TOLERANCIA',
      'DESCRICAO',
    ]);
  });
});

describe('emparelhar — invariantes', () => {
  it('RF §14: nenhum movimento aparece em duas propostas', () => {
    fc.assert(
      fc.property(arbLado('b'), arbLado('c'), arbCfg, (bancos, contabs, cfg) => {
        const ps = emparelhar(bancos, contabs, cfg);
        expect(new Set(ps.map((p) => p.bancoId)).size).toBe(ps.length);
        expect(new Set(ps.map((p) => p.contabilisticoId)).size).toBe(ps.length);
      }),
      { numRuns: 1000 },
    );
  });

  it('cada proposta satisfaz a regra que declara, e só com a regra ligada', () => {
    fc.assert(
      fc.property(arbLado('b'), arbLado('c'), arbCfg, (bancos, contabs, cfg) => {
        const porId = new Map([...bancos, ...contabs].map((m) => [m.id, m]));
        for (const p of emparelhar(bancos, contabs, cfg)) {
          const r = avaliar(p.regra, porId.get(p.bancoId)!, porId.get(p.contabilisticoId)!, cfg);
          expect(r, `${p.regra} não se verifica`).not.toBeNull();
          if (p.regra === 'DESCRICAO') expect(cfg.permitirMatchPorDescricao).toBe(true);
          if (p.regra === 'VALOR_NATUREZA_DATA' || p.regra === 'VALOR_TOLERANCIA') {
            expect(cfg.permitirMatchPorValor).toBe(true);
          }
          if (p.regra.startsWith('REFERENCIA') || p.regra === 'DOCUMENTO') {
            expect(cfg.permitirMatchPorReferencia).toBe(true);
          }
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('natureza é sempre igual nos dois lados, e a diferença de datas nunca excede a tolerância', () => {
    fc.assert(
      fc.property(arbLado('b'), arbLado('c'), arbCfg, (bancos, contabs, cfg) => {
        const porId = new Map([...bancos, ...contabs].map((m) => [m.id, m]));
        for (const p of emparelhar(bancos, contabs, cfg)) {
          expect(porId.get(p.bancoId)!.natureza).toBe(porId.get(p.contabilisticoId)!.natureza);
          expect(p.diferencaDias).toBeLessThanOrEqual(cfg.toleranciaDias);
          expect(p.confianca).toBeGreaterThanOrEqual(0);
          expect(p.confianca).toBeLessThanOrEqual(100);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('prioridade: se o par foi apanhado pela regra k, nenhuma regra anterior o casava', () => {
    fc.assert(
      fc.property(arbLado('b'), arbLado('c'), arbCfg, (bancos, contabs, cfg) => {
        const porId = new Map([...bancos, ...contabs].map((m) => [m.id, m]));
        for (const p of emparelhar(bancos, contabs, cfg)) {
          const anteriores = PASSAGENS.slice(0, PASSAGENS.indexOf(p.regra));
          for (const r of anteriores) {
            expect(avaliar(r, porId.get(p.bancoId)!, porId.get(p.contabilisticoId)!, cfg)).toBeNull();
          }
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('é determinístico: a ordem de entrada não muda o resultado', () => {
    fc.assert(
      fc.property(arbLado('b'), arbLado('c'), arbCfg, (bancos, contabs, cfg) => {
        const norm = (ps: Proposta[]) =>
          ps.map((p) => `${p.bancoId}:${p.contabilisticoId}:${p.regra}`).sort();
        expect(norm(emparelhar([...bancos].reverse(), [...contabs].reverse(), cfg))).toEqual(
          norm(emparelhar(bancos, contabs, cfg)),
        );
      }),
      { numRuns: 500 },
    );
  });

  it('movimentos já correspondidos ou ignorados nunca entram numa proposta', () => {
    fc.assert(
      fc.property(arbLado('b'), arbLado('c'), arbCfg, (bancos, contabs, cfg) => {
        const bloqueados = contabs.map((c) => ({ ...c, estado: 'IGNORADO' as const }));
        expect(emparelhar(bancos, bloqueados, cfg)).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});

describe('emparelhar — casos', () => {
  it('a referência vence o valor: duas rendas iguais casam pela referência, não pela data', () => {
    const bancos = [mov({ id: 'b1', data: dia(10), referencia: 'REN-0009', referenciaNormalizada: 'REN0009' })];
    const contabs = [
      mov({ id: 'c-perto', data: dia(10), referencia: 'REN-0008', referenciaNormalizada: 'REN0008' }),
      mov({ id: 'c-certo', data: dia(12), referencia: 'ren 0009', referenciaNormalizada: 'REN0009' }),
    ];
    const [p] = emparelhar(bancos, contabs, CFG);
    expect(p.contabilisticoId).toBe('c-certo');
    expect(p.regra).toBe('REFERENCIA_EXACTA');
    expect(p.tipo).toBe('DIFERENCA_TEMPORAL');
  });

  it('REFERENCIA_NORMALIZADA casa prefixos diferentes pelo núcleo numérico', () => {
    const [p] = emparelhar(
      [mov({ id: 'b', referencia: 'TRF 000458', referenciaNormalizada: 'TRF000458' })],
      [mov({ id: 'c', referencia: 'FAC/2026/000458', referenciaNormalizada: 'FAC2026000458' })],
      CFG,
    );
    expect(p.regra).toBe('REFERENCIA_NORMALIZADA');
  });

  it('DOCUMENTO casa o número do documento contido na descrição bancária', () => {
    const [p] = emparelhar(
      [mov({ id: 'b', descricao: 'PAG FAC 2026 000777 CLIENTE X' })],
      [mov({ id: 'c', documento: 'FAC/2026/000777', descricao: 'recebimento' })],
      CFG,
    );
    expect(p.regra).toBe('DOCUMENTO');
  });

  it('referência igual com valor fora da tolerância dá proposta com diferença de valor', () => {
    const [p] = emparelhar(
      [mov({ id: 'b', valor: D('1000.00'), referencia: 'X1234', referenciaNormalizada: 'X1234' })],
      [mov({ id: 'c', valor: D('1500.00'), referencia: 'X1234', referenciaNormalizada: 'X1234' })],
      CFG,
    );
    expect(p.regra).toBe('REFERENCIA_EXACTA');
    expect(p.diferencaValor.equals(D('-500.00'))).toBe(true);
    expect(p.tipo).toBe('TOLERANCIA_VALOR');
  });

  it('valor igual fora da janela de datas não casa (RF §8)', () => {
    expect(
      emparelhar([mov({ id: 'b', data: dia(20) })], [mov({ id: 'c', data: dia(10) })], CFG),
    ).toEqual([]);
  });

  it('VALOR_TOLERANCIA só com tolerância > 0', () => {
    const b = [mov({ id: 'b', valor: D('1000.00') })];
    const c = [mov({ id: 'c', valor: D('1000.01') })];
    expect(emparelhar(b, c, CFG)).toEqual([]);
    const [p] = emparelhar(b, c, { ...CFG, toleranciaValor: D('0.05') });
    expect(p.regra).toBe('VALOR_TOLERANCIA');
    expect(p.tipo).toBe('TOLERANCIA_VALOR');
  });

  it('ambiguidade (dois candidatos igualmente bons) baixa a confiança', () => {
    const b = [mov({ id: 'b', data: dia(10) })];
    const unico = emparelhar(b, [mov({ id: 'c1', data: dia(11) })], CFG)[0];
    const ambiguo = emparelhar(b, [mov({ id: 'c1', data: dia(11) }), mov({ id: 'c2', data: dia(9) })], CFG)[0];
    expect(ambiguo.ambigua).toBe(true);
    expect(ambiguo.confianca).toBeLessThan(unico.confianca);
  });
});

describe('decidirDesfecho', () => {
  const base: Proposta = {
    bancoId: 'b', contabilisticoId: 'c', regra: 'REFERENCIA_EXACTA', tipo: 'EXACTO',
    confianca: 100, diferencaValor: D(0), diferencaDias: 0, ambigua: false,
  };
  const conta = { autoReconciliacao: true, limiarConfianca: 90, toleranciaValor: D(0) };

  it('confirma só com autoReconciliacao E confiança ≥ limiar', () => {
    expect(decidirDesfecho(base, conta)).toEqual({ confirmar: true, estadoAlvo: 'RECONCILIADO' });
    expect(decidirDesfecho(base, { ...conta, autoReconciliacao: false }).confirmar).toBe(false);
    expect(decidirDesfecho({ ...base, confianca: 89 }, conta).confirmar).toBe(false);
  });

  it('sugestão não muda o estado (opção a)', () => {
    expect(decidirDesfecho({ ...base, confianca: 10 }, conta)).toEqual({ confirmar: false, estadoAlvo: null });
  });

  it('diferença de valor acima da tolerância nunca confirma e marca DIFERENCA_VALOR', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.boolean(), (centimos, positivo) => {
        const dif = D(centimos).div(100).times(positivo ? 1 : -1);
        const r = decidirDesfecho({ ...base, diferencaValor: dif }, conta);
        expect(r).toEqual({ confirmar: false, estadoAlvo: 'DIFERENCA_VALOR' });
      }),
      { numRuns: 1000 },
    );
  });
});
