import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  TRANSICOES_MOVIMENTO_RECONCILIACAO,
  TRANSICOES_PERIODO_RECONCILIACAO,
} from '@/lib/state-machines';
import {
  sinal,
  transitarMovimento,
  transitarPeriodoReconciliacao,
  ESTADOS_CORRESPONDIDOS,
  ESTADOS_EXCEPCAO,
  normalizarReferencia,
  nucleoNumerico,
  chaveIdempotenciaBanco,
  classificarSemCorrespondencia,
  distanciaDias,
  calcularSaldoReconciliado,
  calcularDiferencaResidual,
  type EstadoMovimento,
  type EstadoPeriodo,
  type MovimentoParaSaldo,
  type Natureza,
} from '../reconciliacao.model';

const ESTADOS: EstadoMovimento[] = [
  'PENDENTE', 'RECONCILIADO', 'EM_TRANSITO', 'BANCO_SEM_CONTABILIZACAO',
  'CONTABILIDADE_SEM_BANCO', 'DIFERENCA_VALOR', 'DIVERGENCIA',
  'RECONCILIADO_MANUALMENTE', 'IGNORADO',
];

const arbNatureza = fc.constantFrom<Natureza>('DEBITO', 'CREDITO');
const arbValor = fc.integer({ min: 1, max: 10_000_000 }).map((c) => new Prisma.Decimal(c).div(100));
const arbMovimento: fc.Arbitrary<MovimentoParaSaldo> = fc.record({
  valor: arbValor,
  natureza: arbNatureza,
});

// ---------------------------------------------------------------------------
// Máquinas de estado (RF §12, §17)
// ---------------------------------------------------------------------------

describe('TRANSICOES_MOVIMENTO_RECONCILIACAO', () => {
  it('cobre os nove estados da RF §12 e todos os destinos são estados conhecidos', () => {
    expect(Object.keys(TRANSICOES_MOVIMENTO_RECONCILIACAO).sort()).toEqual([...ESTADOS].sort());
    for (const destinos of Object.values(TRANSICOES_MOVIMENTO_RECONCILIACAO)) {
      for (const d of destinos) expect(ESTADOS).toContain(d);
    }
  });

  it('nenhum estado é terminal — todos conseguem voltar a ser trabalhados', () => {
    for (const [estado, destinos] of Object.entries(TRANSICOES_MOVIMENTO_RECONCILIACAO)) {
      expect(destinos.length, `${estado} é terminal`).toBeGreaterThan(0);
    }
  });

  it('reverter uma correspondência devolve sempre o movimento a PENDENTE', () => {
    for (const correspondido of ESTADOS_CORRESPONDIDOS) {
      expect(() => transitarMovimento(correspondido, 'PENDENTE')).not.toThrow();
    }
  });

  it('property: transitar só aceita destinos declarados', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ESTADOS), fc.constantFrom(...ESTADOS), (a, b) => {
        const permitido = TRANSICOES_MOVIMENTO_RECONCILIACAO[a].includes(b);
        if (permitido) expect(() => transitarMovimento(a, b)).not.toThrow();
        else expect(() => transitarMovimento(a, b)).toThrow(/TRANSICAO_INVALIDA|Transição inválida/);
      }),
    );
  });

  it('um movimento só chega a RECONCILIADO a partir de estados não correspondidos', () => {
    for (const [estado, destinos] of Object.entries(TRANSICOES_MOVIMENTO_RECONCILIACAO)) {
      if (ESTADOS_CORRESPONDIDOS.has(estado as EstadoMovimento)) {
        expect(destinos).not.toContain('RECONCILIADO');
      }
    }
  });

  it('os estados de excepção e os correspondidos são disjuntos', () => {
    for (const e of ESTADOS_EXCEPCAO) expect(ESTADOS_CORRESPONDIDOS.has(e)).toBe(false);
  });
});

describe('TRANSICOES_PERIODO_RECONCILIACAO', () => {
  it('RECONCILIADO e CANCELADO são terminais', () => {
    expect(TRANSICOES_PERIODO_RECONCILIACAO.RECONCILIADO).toEqual([]);
    expect(TRANSICOES_PERIODO_RECONCILIACAO.CANCELADO).toEqual([]);
  });

  it('não se fecha um período sem passar por EM_RECONCILIACAO', () => {
    expect(() => transitarPeriodoReconciliacao('ABERTO', 'RECONCILIADO')).toThrow();
    expect(() => transitarPeriodoReconciliacao('ABERTO', 'EM_RECONCILIACAO')).not.toThrow();
    expect(() => transitarPeriodoReconciliacao('EM_RECONCILIACAO', 'RECONCILIADO')).not.toThrow();
  });

  it('property: estados terminais não têm saída', () => {
    fc.assert(
      fc.property(fc.constantFrom<EstadoPeriodo>('RECONCILIADO', 'CANCELADO'), (terminal) => {
        for (const alvo of ['ABERTO', 'EM_RECONCILIACAO', 'RECONCILIADO', 'CANCELADO'] as EstadoPeriodo[]) {
          expect(() => transitarPeriodoReconciliacao(terminal, alvo)).toThrow();
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Normalização de referência (RF §6)
// ---------------------------------------------------------------------------

describe('normalizarReferencia', () => {
  it('colapsa formatações diferentes da mesma referência', () => {
    const esperado = 'TRF4582026';
    for (const v of ['TRF-458/2026', 'trf 458 2026', ' TRF.458.2026 ', 'Trf—458—2026']) {
      expect(normalizarReferencia(v)).toBe(esperado);
    }
  });

  it('remove acentos sem perder a letra', () => {
    expect(normalizarReferencia('TRANSFERÊNCIA-12')).toBe('TRANSFERENCIA12');
  });

  it('devolve null quando não sobra nada comparável', () => {
    for (const v of [null, undefined, '', '   ', '---', '///']) {
      expect(normalizarReferencia(v)).toBeNull();
    }
  });

  it('property: idempotente — normalizar duas vezes dá o mesmo', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const uma = normalizarReferencia(s);
        expect(normalizarReferencia(uma)).toBe(uma);
      }),
    );
  });

  it('property: o resultado é sempre alfanumérico maiúsculo ou null', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = normalizarReferencia(s);
        if (r !== null) expect(r).toMatch(/^[A-Z0-9]+$/);
      }),
    );
  });
});

describe('nucleoNumerico', () => {
  it('extrai o número do documento com prefixos diferentes dos dois lados', () => {
    expect(nucleoNumerico('FAC/2026/000458')).toBe('000458');
    expect(nucleoNumerico('TRF 000458')).toBe('000458');
    expect(nucleoNumerico('fac-2026-000458')).toBe('000458');
  });

  it('opera sobre a referência crua — normalizar primeiro destruiria os grupos', () => {
    // Regressão: com a referência já normalizada, `2026` e `000458` colapsam
    // numa corrida única e o núcleo sai errado.
    expect(nucleoNumerico(normalizarReferencia('FAC/2026/000458'))).toBe('2026000458');
    expect(nucleoNumerico('FAC/2026/000458')).toBe('000458');
  });

  it('ignora corridas curtas para não casar por acidente', () => {
    expect(nucleoNumerico('REF-12')).toBeNull();
    expect(nucleoNumerico('TRF458')).toBeNull();
  });

  it('null quando não há referência nem dígitos', () => {
    expect(nucleoNumerico(null)).toBeNull();
    expect(nucleoNumerico(undefined)).toBeNull();
    expect(nucleoNumerico('')).toBeNull();
    expect(nucleoNumerico('SEM-NUMERO')).toBeNull();
  });

  it('property: o núcleo, quando existe, é sufixo da referência normalizada', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const nucleo = nucleoNumerico(s);
        if (nucleo === null) return;
        expect(nucleo).toMatch(/^\d{4,}$/);
        expect(normalizarReferencia(s)?.endsWith(nucleo)).toBe(true);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Idempotência (RF §19, CA08)
// ---------------------------------------------------------------------------

describe('chaveIdempotenciaBanco', () => {
  const base = {
    dataMovimento: new Date('2026-09-12T00:00:00Z'),
    valor: new Prisma.Decimal('100000.00'),
    natureza: 'DEBITO' as Natureza,
    descricao: 'Transferência recebida',
    ordinal: 0,
  };

  it('é determinística — o mesmo movimento dá sempre a mesma chave', () => {
    expect(chaveIdempotenciaBanco({ ...base, referenciaBanco: 'TRF-458' })).toBe(
      chaveIdempotenciaBanco({ ...base, referenciaBanco: 'TRF-458' }),
    );
  });

  it('a referência do banco domina o tuplo natural', () => {
    const a = chaveIdempotenciaBanco({ ...base, referenciaBanco: 'TRF-458' });
    const b = chaveIdempotenciaBanco({
      ...base,
      referenciaBanco: 'trf 458',
      descricao: 'outra descrição',
      valor: new Prisma.Decimal('1.00'),
    });
    expect(a).toBe(b);
  });

  it('sem referência, duas linhas idênticas no mesmo dia continuam distintas (ordinal)', () => {
    const a = chaveIdempotenciaBanco({ ...base, referenciaBanco: null, ordinal: 0 });
    const b = chaveIdempotenciaBanco({ ...base, referenciaBanco: null, ordinal: 1 });
    expect(a).not.toBe(b);
  });

  it('sem referência, valor ou natureza diferentes produzem chaves diferentes', () => {
    const a = chaveIdempotenciaBanco({ ...base, referenciaBanco: null });
    expect(chaveIdempotenciaBanco({ ...base, referenciaBanco: null, natureza: 'CREDITO' })).not.toBe(a);
    expect(
      chaveIdempotenciaBanco({ ...base, referenciaBanco: null, valor: new Prisma.Decimal('100000.01') }),
    ).not.toBe(a);
  });

  it('property: a hora do dia não entra na chave (bancos exportam 00:00 ou meio-dia)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), (hora) => {
        const d = new Date(Date.UTC(2026, 8, 12, hora));
        expect(chaveIdempotenciaBanco({ ...base, referenciaBanco: null, dataMovimento: d })).toBe(
          chaveIdempotenciaBanco({ ...base, referenciaBanco: null }),
        );
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Classificação — a regra de negócio principal (RF §22)
// ---------------------------------------------------------------------------

describe('classificarSemCorrespondencia', () => {
  const dataReferencia = new Date('2026-09-12T00:00:00Z');

  it('CA03 — contabilístico dentro da tolerância é EM_TRANSITO, não divergência', () => {
    expect(
      classificarSemCorrespondencia({
        lado: 'CONTABILIDADE',
        dataMovimento: new Date('2026-09-10T00:00:00Z'),
        dataReferencia,
        toleranciaDias: 5,
      }),
    ).toBe('EM_TRANSITO');
  });

  it('passada a tolerância passa a excepção', () => {
    expect(
      classificarSemCorrespondencia({
        lado: 'CONTABILIDADE',
        dataMovimento: new Date('2026-09-01T00:00:00Z'),
        dataReferencia,
        toleranciaDias: 5,
      }),
    ).toBe('CONTABILIDADE_SEM_BANCO');
  });

  it('CA05 — bancário sem contrapartida é excepção desde o primeiro momento', () => {
    expect(
      classificarSemCorrespondencia({
        lado: 'BANCO',
        dataMovimento: dataReferencia,
        dataReferencia,
        toleranciaDias: 5,
      }),
    ).toBe('BANCO_SEM_CONTABILIZACAO');
  });

  it('property: nenhuma diferença de datas, por si só, produz DIVERGENCIA (RF §22)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 365 }),
        fc.integer({ min: 0, max: 30 }),
        (idadeDias, tolerancia) => {
          const dataMovimento = new Date(dataReferencia.getTime() - idadeDias * 86_400_000);
          const estado = classificarSemCorrespondencia({
            lado: 'CONTABILIDADE',
            dataMovimento,
            dataReferencia,
            toleranciaDias: tolerancia,
          });
          expect(estado).not.toBe('DIVERGENCIA');
          expect(estado).toBe(idadeDias <= tolerancia ? 'EM_TRANSITO' : 'CONTABILIDADE_SEM_BANCO');
        },
      ),
    );
  });

  it('a classificação é sempre uma transição válida a partir de PENDENTE', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'BANCO' | 'CONTABILIDADE'>('BANCO', 'CONTABILIDADE'),
        fc.integer({ min: 0, max: 60 }),
        (lado, idadeDias) => {
          const estado = classificarSemCorrespondencia({
            lado,
            dataMovimento: new Date(dataReferencia.getTime() - idadeDias * 86_400_000),
            dataReferencia,
            toleranciaDias: 5,
          });
          expect(() => transitarMovimento('PENDENTE', estado)).not.toThrow();
        },
      ),
    );
  });
});

describe('distanciaDias', () => {
  it('é simétrica e em dias inteiros', () => {
    const a = new Date('2026-09-10T23:00:00Z');
    const b = new Date('2026-09-12T01:00:00Z');
    expect(distanciaDias(a, b)).toBe(1);
    expect(distanciaDias(b, a)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Saldo reconciliado (RF §16) — a propriedade que fecha o mapa
// ---------------------------------------------------------------------------

describe('calcularSaldoReconciliado', () => {
  it('sem movimentos por explicar, o saldo reconciliado é o saldo do banco', () => {
    const r = calcularSaldoReconciliado({
      saldoFinalBanco: new Prisma.Decimal('1000000.00'),
      bancoNaoContabilizados: [],
      contabilisticosNaoRefletidos: [],
    });
    expect(r.saldoReconciliado.toFixed(2)).toBe('1000000.00');
  });

  it('pagamento em trânsito reduz o saldo reconciliado', () => {
    const r = calcularSaldoReconciliado({
      saldoFinalBanco: new Prisma.Decimal('1000000.00'),
      bancoNaoContabilizados: [],
      contabilisticosNaoRefletidos: [{ valor: new Prisma.Decimal('50000.00'), natureza: 'CREDITO' }],
    });
    expect(r.saldoReconciliado.toFixed(2)).toBe('950000.00');
  });

  it('comissão bancária por contabilizar aumenta o saldo reconciliado', () => {
    // O banco já debitou 500 (saída). A contabilidade ainda não sabe, por isso o
    // saldo contabilístico está 500 acima — o ajuste desfaz o movimento do banco.
    const r = calcularSaldoReconciliado({
      saldoFinalBanco: new Prisma.Decimal('1000000.00'),
      bancoNaoContabilizados: [{ valor: new Prisma.Decimal('500.00'), natureza: 'CREDITO' }],
      contabilisticosNaoRefletidos: [],
    });
    expect(r.saldoReconciliado.toFixed(2)).toBe('1000500.00');
  });

  it('property: com tudo explicado, saldoReconciliado == saldoFinalContabil', () => {
    fc.assert(
      fc.property(
        arbValor,
        fc.array(arbMovimento, { maxLength: 25 }),
        fc.array(arbMovimento, { maxLength: 25 }),
        fc.array(arbMovimento, { maxLength: 25 }),
        (saldoInicial, correspondidos, soBanco, soContabilidade) => {
          const soma = (ms: MovimentoParaSaldo[]) =>
            ms.reduce(
              (acc, m) => (sinal(m.natureza) === 1 ? acc.plus(m.valor) : acc.minus(m.valor)),
              new Prisma.Decimal(0),
            );

          // Construção: os dois saldos partem do mesmo ponto e vêem os mesmos
          // movimentos correspondidos; cada lado vê ainda os seus não correspondidos.
          const saldoFinalBanco = saldoInicial.plus(soma(correspondidos)).plus(soma(soBanco));
          const saldoFinalContabil = saldoInicial
            .plus(soma(correspondidos))
            .plus(soma(soContabilidade));

          const { saldoReconciliado } = calcularSaldoReconciliado({
            saldoFinalBanco,
            bancoNaoContabilizados: soBanco,
            contabilisticosNaoRefletidos: soContabilidade,
          });

          expect(saldoReconciliado.equals(saldoFinalContabil)).toBe(true);
          expect(
            calcularDiferencaResidual(saldoReconciliado, saldoFinalContabil).isZero(),
          ).toBe(true);
        },
      ),
    );
  });

  it('property: a decomposição do mapa soma sempre ao saldo reconciliado', () => {
    fc.assert(
      fc.property(
        arbValor,
        fc.array(arbMovimento, { maxLength: 25 }),
        fc.array(arbMovimento, { maxLength: 25 }),
        (saldoFinalBanco, soBanco, soContabilidade) => {
          const r = calcularSaldoReconciliado({
            saldoFinalBanco,
            bancoNaoContabilizados: soBanco,
            contabilisticosNaoRefletidos: soContabilidade,
          });
          // O mapa da RF §17 tem de reconstituir o saldo a partir das suas parcelas.
          const reconstituido = saldoFinalBanco
            .minus(r.valorBancoSemContabilizacao)
            .plus(r.valorEmTransito);
          expect(r.saldoReconciliado.equals(reconstituido)).toBe(true);
        },
      ),
    );
  });
});
