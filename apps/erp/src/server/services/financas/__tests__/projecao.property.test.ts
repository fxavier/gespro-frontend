import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { TECTO_HORIZONTE_DIAS } from '@/lib/validations/tesouraria';
import type {
  Cenario,
  Granularidade,
  RecorrenciaCompromisso,
  TipoCompromisso,
} from '@/lib/validations/tesouraria';
import type {
  Bucket,
  CompromissoBase,
  Ocorrencia,
  PerfilAtraso,
} from '../projecao.interface';
// ---------------------------------------------------------------------------
// ORÁCULO do nó L2 (P2v, verificador-fluxo-caixa) — spec 22 · ADR-0036.
//
// O módulo abaixo AINDA NÃO EXISTE. O import é deliberado: enquanto o L2 não
// entregar `projecao.service.ts` com estas quatro funções puras exportadas
// (contra os tipos *Fn de projecao.interface.ts), este ficheiro rebenta na
// resolução do import — e essa é a prova vermelha de que o oráculo foi escrito
// antes da solução. Qualquer alteração a este ficheiro por um agente feat-* é
// BLOCKER (doutrina 00 §2).
// ---------------------------------------------------------------------------
import {
  acumularSaldos,
  distribuirCompromissos,
  expandirRecorrencia,
  montarBuckets,
} from '../projecao.service';

// ---------------------------------------------------------------------------
// Configuração e helpers
// ---------------------------------------------------------------------------

/** ≥ 1000 por propriedade — exigência do P2v. */
const NUM_RUNS = 1000;

/**
 * Dia civil em Africa/Maputo, pela convenção da casa: `new Date(ano, mes-1,
 * dia, 12)`. NUNCA `new Date('aaaa-mm-dd')` — lê como UTC e, a leste de
 * Greenwich, cai no dia anterior e muda o período fiscal.
 */
function dia(ano: number, mes: number, diaDoMes: number): Date {
  return new Date(ano, mes - 1, diaDoMes, 12);
}

/** Soma de dias preservando a convenção do meio-dia (o construtor normaliza). */
function somaDias(base: Date, dias: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias, 12);
}

function decimalDeCentavos(centavos: number): Prisma.Decimal {
  return new Prisma.Decimal(centavos).dividedBy(100);
}

/** Perfil de atraso válido e determinista, para os casos-exemplo. */
const PERFIL_NEUTRO: PerfilAtraso = {
  atrasoMedioDias: 5,
  desvioPadraoDias: 2,
  amostra: 50,
  amostraInsuficiente: false,
};

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

/**
 * Datas de referência nas fronteiras que já morderam esta casa:
 * fim/início de mês, 31 de Dezembro, 29 de Fevereiro (bissexto), e um dia
 * corrente sem nada de especial.
 */
const arbReferencia = fc.constantFrom(
  dia(2026, 1, 31), // fronteira de mês (Janeiro tem 31; Fevereiro não)
  dia(2026, 2, 1), // primeiro dia do mês
  dia(2026, 12, 31), // 31 de Dezembro — fim de ano
  dia(2024, 2, 29), // 29 de Fevereiro — ano bissexto
  dia(2026, 9, 21), // dia "normal"
);

/**
 * Granularidade e horizonte coerentes com o tecto do Zod (ADR-0036 §5):
 * o núcleo puro só recebe combinações que o schema admite. Os extremos 0 e
 * o próprio tecto (365 quando MENSAL) entram com peso próprio.
 */
const arbGranularidadeHorizonte = fc
  .constantFrom<Granularidade>('DIARIA', 'SEMANAL', 'MENSAL')
  .chain((granularidade) =>
    fc
      .oneof(
        fc.constant(0), // horizonte zero (invariante I1 vizinho)
        fc.constant(TECTO_HORIZONTE_DIAS[granularidade]), // tecto: 90/180/365
        fc.integer({ min: 0, max: TECTO_HORIZONTE_DIAS[granularidade] }),
      )
      .map((horizonteDias) => ({ granularidade, horizonteDias })),
  );

/**
 * Saldo de abertura em cêntimos exactos — inclui zero e NEGATIVO (uma conta a
 * descoberto é um saldo de abertura possível e legítimo).
 */
const arbSaldoAbertura = fc
  .integer({ min: -500_000_00, max: 500_000_00 })
  .map(decimalDeCentavos);

/**
 * Especificação de uma ocorrência, em dados planos (cêntimos + offset em dias
 * face à referência). Materializa-se por cenário para que nenhuma partilha de
 * `Date`/array entre pipelines possa mascarar mutação interna.
 *
 * Offsets deliberados:
 *  - [-400, -91]: vencidas há mais de 90 dias — exercitam a exclusão do
 *    PESSIMISTA (ADR-0036 §6);
 *  - [-90, -1]: vencidas recentes — primeiro bucket, assinaladas (R2.4);
 *  - 0: no próprio dia de referência;
 *  - [1, 365]: dentro e além do horizonte pedido.
 * Valor inclui ZERO de propósito: um bucket com ocorrência de valor nulo não
 * pode perturbar a conservação.
 */
const arbEspecOcorrencia = fc.record({
  tipo: fc.constantFrom<TipoCompromisso>('ENTRADA', 'SAIDA'),
  centavos: fc.oneof(
    fc.constant(0),
    fc.integer({ min: 0, max: 5_000_000_00 }),
  ),
  offsetDias: fc.oneof(
    fc.integer({ min: -400, max: -91 }),
    fc.integer({ min: -90, max: -1 }),
    fc.constant(0),
    fc.integer({ min: 1, max: 365 }),
  ),
});

type EspecOcorrencia = {
  tipo: TipoCompromisso;
  centavos: number;
  offsetDias: number;
};

function materializarOcorrencias(
  especs: EspecOcorrencia[],
  referencia: Date,
): Ocorrencia[] {
  return especs.map((e, i) => ({
    origem: 'COMPROMISSO_MANUAL' as const,
    origemId: 'oc-' + String(i),
    descricao: 'ocorrência ' + String(i),
    tipo: e.tipo,
    valor: decimalDeCentavos(e.centavos),
    data: somaDias(referencia, e.offsetDias),
    vencida: e.offsetDias < 0,
  }));
}

/** Perfil de atraso válido (não-negativo); `amostraInsuficiente` coerente. */
const arbPerfilAtraso = fc
  .record({
    atrasoMedioDias: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 120 })),
    desvioPadraoDias: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 60 })),
    amostra: fc.integer({ min: 0, max: 200 }),
  })
  .map((p) => ({ ...p, amostraInsuficiente: p.amostra < 20 }));

const arbCenario = fc.constantFrom<Cenario>('OTIMISTA', 'BASE', 'PESSIMISTA');

/** Pipeline completo do núcleo puro, sempre com estruturas frescas. */
function projectar(
  referencia: Date,
  granularidade: Granularidade,
  horizonteDias: number,
  especs: EspecOcorrencia[],
  cenario: Cenario,
  perfil: PerfilAtraso,
  saldoAbertura: Prisma.Decimal,
): Bucket[] {
  const vazios = montarBuckets(referencia, horizonteDias, granularidade);
  const distribuidos = distribuirCompromissos(
    vazios,
    materializarOcorrencias(especs, referencia),
    cenario,
    perfil,
  );
  return acumularSaldos(distribuidos, saldoAbertura);
}

// ---------------------------------------------------------------------------
// I2 — Conservação de buckets (ADR-0036 §Consequências)
// saldoFinal(n) == saldoFinal(n−1) + entradas(n) − saidas(n), ∀ n, Decimal exacto.
// ---------------------------------------------------------------------------

describe('I2 — conservação de buckets', () => {
  it('[property] saldoFinal(n) == saldoInicial(n) + entradas(n) − saidas(n) e a cadeia é contígua, em Decimal exacto', () => {
    fc.assert(
      fc.property(
        arbReferencia,
        arbGranularidadeHorizonte,
        fc.array(arbEspecOcorrencia, { maxLength: 30 }),
        arbCenario,
        arbPerfilAtraso,
        arbSaldoAbertura,
        (referencia, gh, especs, cenario, perfil, saldoAbertura) => {
          const buckets = projectar(
            referencia,
            gh.granularidade,
            gh.horizonteDias,
            especs,
            cenario,
            perfil,
            saldoAbertura,
          );

          // Há sempre pelo menos um bucket (horizonte 0 ⇒ o próprio dia).
          expect(buckets.length).toBeGreaterThan(0);

          // A cadeia arranca no saldo de abertura, exacto.
          expect(buckets[0].saldoInicial.equals(saldoAbertura)).toBe(true);

          for (let n = 0; n < buckets.length; n++) {
            const b = buckets[n];
            // Conservação local — NUNCA toBeCloseTo, NUNCA number.
            expect(
              b.saldoFinal.equals(b.saldoInicial.plus(b.entradas).minus(b.saidas)),
            ).toBe(true);
            // Contiguidade: o fecho de um bucket é a abertura do seguinte.
            if (n > 0) {
              expect(b.saldoInicial.equals(buckets[n - 1].saldoFinal)).toBe(true);
            }
          }

          // Conservação global: nada aparece nem desaparece entre a abertura
          // e o fecho — somada SOBRE OS BUCKETS (o que o cenário excluiu ou
          // deslocou para fora do horizonte não conta, e é por isso que esta
          // igualdade é independente da semântica do cenário).
          const totalEntradas = buckets.reduce(
            (acc, b) => acc.plus(b.entradas),
            new Prisma.Decimal(0),
          );
          const totalSaidas = buckets.reduce(
            (acc, b) => acc.plus(b.saidas),
            new Prisma.Decimal(0),
          );
          expect(
            buckets[buckets.length - 1].saldoFinal.equals(
              saldoAbertura.plus(totalEntradas).minus(totalSaidas),
            ),
          ).toBe(true);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] horizonte 0: um único bucket do próprio dia e conservação num só passo', () => {
    fc.assert(
      fc.property(
        arbReferencia,
        fc.array(arbEspecOcorrencia, { maxLength: 15 }),
        arbCenario,
        arbPerfilAtraso,
        arbSaldoAbertura,
        (referencia, especs, cenario, perfil, saldoAbertura) => {
          const buckets = projectar(
            referencia,
            'DIARIA',
            0,
            especs,
            cenario,
            perfil,
            saldoAbertura,
          );
          // Contrato de montarBuckets: horizonte zero produz UM bucket.
          expect(buckets.length).toBe(1);
          const b = buckets[0];
          expect(b.saldoInicial.equals(saldoAbertura)).toBe(true);
          expect(
            b.saldoFinal.equals(b.saldoInicial.plus(b.entradas).minus(b.saidas)),
          ).toBe(true);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Caso que TEM de lançar (I2). Porquê este: o Zod trava `min(0)` na
   * fronteira, mas o núcleo puro não pode confiar em quem o chama — um
   * horizonte negativo não tem sequência válida de buckets. Se `montarBuckets`
   * devolvesse `[]` em silêncio, I2 passaria por vacuidade sobre lixo e a
   * projecção sairia vazia sem erro nenhum, indistinguível de «não há
   * compromissos». A guarda tem de viver no próprio núcleo.
   */
  it('TEM de lançar: montarBuckets com horizonte negativo', () => {
    expect(() => montarBuckets(dia(2026, 9, 21), -1, 'DIARIA')).toThrow();
    expect(() => montarBuckets(dia(2026, 12, 31), -30, 'MENSAL')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// I3 — Monotonia de cenário (ADR-0036 §Consequências)
// saldo_PESSIMISTA(d) ≤ saldo_BASE(d) ≤ saldo_OTIMISTA(d), ∀ d do horizonte.
// ---------------------------------------------------------------------------

describe('I3 — monotonia de cenário', () => {
  /**
   * Compara bucket a bucket com `lessThanOrEqualTo` de Decimal — é uma
   * desigualdade exacta, não uma tolerância. A desigualdade é NÃO-ESTRITA por
   * natureza: com atraso médio 0, com amostra insuficiente (BASE degrada para
   * OTIMISTA, R5.3) ou sem entradas nenhumas, os três cenários coincidem
   * legitimamente. Exigir < seria inventar semântica que o ADR não fixa.
   */
  function assertMonotonia(
    referencia: Date,
    granularidade: Granularidade,
    horizonteDias: number,
    especs: EspecOcorrencia[],
    perfil: PerfilAtraso,
    saldoAbertura: Prisma.Decimal,
  ): void {
    // Buckets e ocorrências FRESCOS por cenário: partilhar estruturas entre
    // pipelines deixaria uma mutação interna mascarar a comparação.
    const porCenario = (c: Cenario) =>
      projectar(referencia, granularidade, horizonteDias, especs, c, perfil, saldoAbertura);
    const otimista = porCenario('OTIMISTA');
    const base = porCenario('BASE');
    const pessimista = porCenario('PESSIMISTA');

    expect(base.length).toBe(otimista.length);
    expect(pessimista.length).toBe(otimista.length);

    for (let d = 0; d < otimista.length; d++) {
      expect(
        pessimista[d].saldoFinal.lessThanOrEqualTo(base[d].saldoFinal),
      ).toBe(true);
      expect(
        base[d].saldoFinal.lessThanOrEqualTo(otimista[d].saldoFinal),
      ).toBe(true);
    }
  }

  it('[property] saldo_PESSIMISTA(d) ≤ saldo_BASE(d) ≤ saldo_OTIMISTA(d), ∀ d', () => {
    fc.assert(
      fc.property(
        arbReferencia,
        arbGranularidadeHorizonte,
        fc.array(arbEspecOcorrencia, { maxLength: 30 }),
        arbPerfilAtraso,
        arbSaldoAbertura,
        (referencia, gh, especs, perfil, saldoAbertura) => {
          assertMonotonia(
            referencia,
            gh.granularidade,
            gh.horizonteDias,
            especs,
            perfil,
            saldoAbertura,
          );
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Extremo 1: horizonte 0. É onde uma implementação preguiçosa passa por
   * acidente (um só bucket, «tudo igual») — mas também onde uma errada cai:
   * uma entrada adiada pelo cenário SAI do único bucket, logo o saldo do
   * PESSIMISTA tem de poder descer, nunca subir. A desigualdade mantém-se,
   * não-estrita quando o atraso é 0 (os três coincidem — ver nota acima).
   */
  it('[property] extremo: horizonte 0 mantém a monotonia num único bucket', () => {
    fc.assert(
      fc.property(
        arbReferencia,
        fc.array(arbEspecOcorrencia, { maxLength: 15 }),
        arbPerfilAtraso,
        arbSaldoAbertura,
        (referencia, especs, perfil, saldoAbertura) => {
          assertMonotonia(referencia, 'DIARIA', 0, especs, perfil, saldoAbertura);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Extremo 2: TODOS os compromissos vencidos. Vencidas entram no primeiro
   * bucket em todos os cenários (R2.4 — o atraso já aconteceu, não se
   * re-aplica), pelo que OTIMISTA e BASE coincidem; o PESSIMISTA só difere
   * pela exclusão das vencidas há mais de 90 dias (ADR-0036 §6). Só «≤» é
   * exigível aqui — exigir «<» obrigaria a excluir sempre alguma coisa, o que
   * o ADR não diz.
   */
  it('[property] extremo: todos os compromissos vencidos mantêm a monotonia (não-estrita)', () => {
    const arbEspecVencida = fc.record({
      tipo: fc.constantFrom<TipoCompromisso>('ENTRADA', 'SAIDA'),
      centavos: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 5_000_000_00 })),
      // Todos no passado; metade do gerador para lá dos 90 dias, para a
      // exclusão do PESSIMISTA ter sempre matéria-prima.
      offsetDias: fc.oneof(
        fc.integer({ min: -400, max: -91 }),
        fc.integer({ min: -90, max: -1 }),
      ),
    });
    fc.assert(
      fc.property(
        arbReferencia,
        arbGranularidadeHorizonte,
        fc.array(arbEspecVencida, { minLength: 1, maxLength: 30 }),
        arbPerfilAtraso,
        arbSaldoAbertura,
        (referencia, gh, especs, perfil, saldoAbertura) => {
          assertMonotonia(
            referencia,
            gh.granularidade,
            gh.horizonteDias,
            especs,
            perfil,
            saldoAbertura,
          );
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Perfil de atraso NEGATIVO (clientes que, em média, pagam adiantado — é um
   * dado histórico possível). Aplicado ingenuamente, ANTECIPA as entradas do
   * BASE face ao OTIMISTA e inverte I3. O contrato não fixa se o núcleo lança
   * ou trunca o atraso a zero; o oráculo aceita qualquer das duas e proíbe a
   * terceira — a violação silenciosa da monotonia. (Registado no handoff como
   * ponto a fixar no contrato.)
   */
  it('[property] atraso médio negativo: ou lança, ou a monotonia mantém-se', () => {
    const arbPerfilNegativo = fc
      .record({
        atrasoMedioDias: fc.integer({ min: -120, max: -1 }),
        desvioPadraoDias: fc.integer({ min: 0, max: 60 }),
        amostra: fc.integer({ min: 20, max: 200 }),
      })
      .map((p) => ({ ...p, amostraInsuficiente: false }));
    fc.assert(
      fc.property(
        arbReferencia,
        arbGranularidadeHorizonte,
        fc.array(arbEspecOcorrencia, { maxLength: 20 }),
        arbPerfilNegativo,
        arbSaldoAbertura,
        (referencia, gh, especs, perfil, saldoAbertura) => {
          try {
            assertMonotonia(
              referencia,
              gh.granularidade,
              gh.horizonteDias,
              especs,
              perfil,
              saldoAbertura,
            );
          } catch (erro) {
            // Lançar é aceitável — desde que seja um throw deliberado, não uma
            // falha de asserção do vitest (que significaria monotonia violada).
            const mensagem = erro instanceof Error ? erro.message : String(erro);
            expect(mensagem).not.toContain('expected');
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Caso que TEM de lançar (I3). Porquê este: `distribuirCompromissos` tem de
   * ser total sobre o enum de cenários. Um `switch` com `default` silencioso
   * trataria um cenário novo — ou um typo de quem chama — como OTIMISTA e
   * devolveria números plausíveis e falsos, que é o pior defeito possível num
   * mapa que decide se se paga a folha.
   */
  it('TEM de lançar: cenário desconhecido', () => {
    const buckets = montarBuckets(dia(2026, 9, 21), 30, 'DIARIA');
    const ocorrencias = materializarOcorrencias(
      [{ tipo: 'ENTRADA', centavos: 100_00, offsetDias: 10 }],
      dia(2026, 9, 21),
    );
    expect(() =>
      distribuirCompromissos(
        buckets,
        ocorrencias,
        'CATASTROFICO' as Cenario,
        PERFIL_NEUTRO,
      ),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// I5 — Idempotência de recorrência (ADR-0036 §Consequências)
// expandirRecorrencia(c, ate) duas vezes produz conjuntos iguais.
// ---------------------------------------------------------------------------

describe('I5 — idempotência de recorrência', () => {
  /** Datas previstas nas fronteiras que partem expansões mensais/anuais. */
  const arbDataPrevista = fc.oneof(
    fc.constantFrom(
      dia(2026, 1, 31), // MENSAL a partir do dia 31 — Fevereiro não o tem
      dia(2026, 12, 31), // ANUAL a partir de 31 de Dezembro
      dia(2024, 2, 29), // ANUAL a partir de 29 de Fevereiro (bissexto)
      dia(2026, 2, 1),
      dia(2026, 9, 21),
    ),
    fc
      .record({
        ano: fc.integer({ min: 2024, max: 2027 }),
        mes: fc.integer({ min: 1, max: 12 }),
        diaDoMes: fc.integer({ min: 1, max: 28 }),
      })
      .map((d) => dia(d.ano, d.mes, d.diaDoMes)),
  );

  const arbRecorrencia = fc.constantFrom<RecorrenciaCompromisso>(
    'UNICA',
    'MENSAL',
    'TRIMESTRAL',
    'ANUAL',
  );

  type EspecCompromisso = {
    dataPrevista: Date;
    recorrencia: RecorrenciaCompromisso;
    tipo: TipoCompromisso;
    centavos: number;
    /** null = sem fim; ≥ 0 = dias após a dataPrevista. */
    fimOffsetDias: number | null;
    /** dias após a dataPrevista até ao fim do horizonte (negativo = ate antes). */
    ateOffsetDias: number;
  };

  function construirCompromisso(e: EspecCompromisso): CompromissoBase {
    return {
      id: 'comp-1',
      descricao: 'compromisso de teste',
      tipo: e.tipo,
      valor: decimalDeCentavos(e.centavos),
      dataPrevista: e.dataPrevista,
      recorrencia: e.recorrencia,
      dataFimRecorrencia:
        e.fimOffsetDias === null ? null : somaDias(e.dataPrevista, e.fimOffsetDias),
    };
  }

  /** Chave canónica de uma ocorrência; o valor compara-se à parte, por equals. */
  function chave(o: Ocorrencia): string {
    return [o.origem, o.origemId, String(o.data.getTime()), o.tipo, String(o.vencida)].join('|');
  }

  function assertConjuntosIguais(a: Ocorrencia[], b: Ocorrencia[]): void {
    expect(b.length).toBe(a.length);
    const ordA = [...a].sort((x, y) => chave(x).localeCompare(chave(y)));
    const ordB = [...b].sort((x, y) => chave(x).localeCompare(chave(y)));
    for (let i = 0; i < ordA.length; i++) {
      expect(chave(ordB[i])).toBe(chave(ordA[i]));
      // Dinheiro compara-se por Decimal.equals — nunca por number nem string.
      expect(ordB[i].valor.equals(ordA[i].valor)).toBe(true);
    }
  }

  it('[property] expandir duas vezes sobre o mesmo horizonte produz o mesmo conjunto', () => {
    fc.assert(
      fc.property(
        fc.record({
          dataPrevista: arbDataPrevista,
          recorrencia: arbRecorrencia,
          tipo: fc.constantFrom<TipoCompromisso>('ENTRADA', 'SAIDA'),
          centavos: fc.integer({ min: 1, max: 5_000_000_00 }),
          // fim nulo ou DEPOIS da dataPrevista (o fim anterior tem propriedade própria)
          fimOffsetDias: fc.oneof(
            fc.constant(null),
            fc.integer({ min: 0, max: 800 }),
          ),
          // horizonte: antes da dataPrevista, no próprio dia (0), 365, e além
          ateOffsetDias: fc.oneof(
            fc.integer({ min: -100, max: -1 }),
            fc.constant(0),
            fc.constant(365),
            fc.integer({ min: 1, max: 730 }),
          ),
        }),
        (espec) => {
          const compromisso = construirCompromisso(espec);
          const ate = somaDias(espec.dataPrevista, espec.ateOffsetDias);
          const primeira = expandirRecorrencia(compromisso, ate);
          const segunda = expandirRecorrencia(compromisso, ate);
          assertConjuntosIguais(primeira, segunda);
          // Contrato explícito da interface: UNICA produz no máximo UMA ocorrência.
          if (espec.recorrencia === 'UNICA') {
            expect(primeira.length).toBeLessThanOrEqual(1);
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Recorrência com fim ANTERIOR ao início (R3.4 recusa-a na fronteira Zod,
   * mas o núcleo puro pode recebê-la por bug de quem chama). Duas respostas
   * são defensáveis: lançar (input fora do domínio) ou devolver o conjunto
   * vazio (uma recorrência que acaba antes de começar não tem ocorrências).
   * O que o oráculo proíbe é a terceira: devolver ocorrências — seriam datas
   * fora de [dataPrevista, fim], uma contradição — ou responder de forma
   * diferente à segunda chamada.
   */
  it('[property] fim anterior à dataPrevista: ou lança (nas duas chamadas), ou devolve vazio duas vezes', () => {
    fc.assert(
      fc.property(
        arbDataPrevista,
        arbRecorrencia,
        fc.integer({ min: -400, max: -1 }), // fimOffsetDias < 0 ⇒ fim antes do início
        fc.integer({ min: 0, max: 400 }),
        (dataPrevista, recorrencia, fimOffsetDias, ateOffsetDias) => {
          const compromisso = construirCompromisso({
            dataPrevista,
            recorrencia,
            tipo: 'SAIDA',
            centavos: 10_000_00,
            fimOffsetDias,
            ateOffsetDias,
          });
          const ate = somaDias(dataPrevista, ateOffsetDias);
          let primeira: Ocorrencia[] | 'lancou';
          let segunda: Ocorrencia[] | 'lancou';
          try {
            primeira = expandirRecorrencia(compromisso, ate);
          } catch {
            primeira = 'lancou';
          }
          try {
            segunda = expandirRecorrencia(compromisso, ate);
          } catch {
            segunda = 'lancou';
          }
          if (primeira === 'lancou' || segunda === 'lancou') {
            // Se lança, lança nas duas — idempotência também é isto.
            expect(primeira).toBe('lancou');
            expect(segunda).toBe('lancou');
          } else {
            expect(primeira).toEqual([]);
            expect(segunda).toEqual([]);
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Caso que TEM de lançar (I5). Porquê este: `expandirRecorrencia` tem de ser
   * total sobre o enum de recorrências. Um `switch` com `default` silencioso
   * expandiria um valor novo do enum (uma futura SEMANAL, por exemplo) como
   * UNICA ou como nada — e 51 ocorrências semanais desapareceriam da projecção
   * sem erro nenhum. A guarda é a diferença entre «falha alto» e «mente baixo».
   */
  it('TEM de lançar: recorrência desconhecida', () => {
    const compromisso: CompromissoBase = {
      id: 'comp-x',
      descricao: 'recorrência fora do enum',
      tipo: 'SAIDA',
      valor: decimalDeCentavos(50_000_00),
      dataPrevista: dia(2026, 1, 31),
      recorrencia: 'SEMANAL' as RecorrenciaCompromisso,
      dataFimRecorrencia: null,
    };
    expect(() => expandirRecorrencia(compromisso, dia(2026, 12, 31))).toThrow();
  });
});
