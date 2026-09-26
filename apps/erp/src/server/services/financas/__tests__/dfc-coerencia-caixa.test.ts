import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ClassePGC } from '../contabilidade.interface';
import type {
  AvisoConfiguracao,
  CodigoAvisoConfiguracao,
  CoerenciaContasCaixaFn,
  ContaCaixaInfo,
} from '../dfc.interface';
// ---------------------------------------------------------------------------
// ORÁCULO do nó `oraculos` (ticket 2.3, verificador-fluxo-caixa) — spec 22 ·
// WS-2 · ADR-0037 E2 (coerência da configuração de caixa).
//
// O módulo abaixo AINDA NÃO EXISTE (ticket 3.1). O import é deliberado: o
// ficheiro rebenta na resolução até o nó `nucleo` entregar
// `coerenciaContasCaixa` (contra `CoerenciaContasCaixaFn`). Alterá-lo num nó
// de autor é BLOCKER (doutrina 00 §2).
//
// A função só vê o que recebe: as contas que o tenant mapeou a rubricas de
// actividade CAIXA. Não tem o plano de contas, e por isso não pode — nem
// deve — «completar» a lista com a classe 1. É essa a decisão Q6/E2.
// ---------------------------------------------------------------------------
import { coerenciaContasCaixa as coerenciaContasCaixaImpl } from '../dfc.model';

/** Ligada ao contrato: se a assinatura do núcleo divergir de `CoerenciaContasCaixaFn`, o tsc acusa aqui. */
const coerenciaContasCaixa: CoerenciaContasCaixaFn = coerenciaContasCaixaImpl;

/** ≥ 1000 por propriedade — exigência do verificador. */
const NUM_RUNS = 1000;

const CLASSES: readonly ClassePGC[] = [
  'CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4', 'CLASSE_5', 'CLASSE_6', 'CLASSE_7', 'CLASSE_8',
];

let sequencia = 0;

function conta(parcial: Partial<ContaCaixaInfo> & Pick<ContaCaixaInfo, 'codigo'>): ContaCaixaInfo {
  sequencia += 1;
  return {
    id: `pgc-${sequencia}`,
    nome: `Conta ${parcial.codigo}`,
    classe: 'CLASSE_1',
    aceitaLancamento: true,
    ativo: true,
    ...parcial,
  };
}

/** O que o oráculo espera de UMA conta: um aviso por motivo violado. */
function avisosEsperados(c: ContaCaixaInfo): CodigoAvisoConfiguracao[] {
  const codigos: CodigoAvisoConfiguracao[] = [];
  if (c.classe !== 'CLASSE_1') codigos.push('CAIXA_FORA_CLASSE_1');
  if (!c.aceitaLancamento) codigos.push('CAIXA_CONTA_AGREGADORA');
  if (!c.ativo) codigos.push('CAIXA_CONTA_INATIVA');
  return codigos;
}

function pares(avisos: AvisoConfiguracao[]): string[] {
  return avisos.map((a) => `${a.conta.id}|${a.codigo}`).sort();
}

const arbConta: fc.Arbitrary<ContaCaixaInfo> = fc
  .record({
    codigo: fc.constantFrom('111', '121', '123', '129', '2311', '314', '411', '511', '12', '1'),
    classe: fc.constantFrom(...CLASSES),
    aceitaLancamento: fc.boolean(),
    ativo: fc.boolean(),
  })
  .map((c) => conta(c));

describe('coerenciaContasCaixa (ADR-0037 E2)', () => {
  // -------------------------------------------------------------------------
  // Nenhuma conta CAIXA ⇒ impedimento (sem elas não há Δcaixa nem articulação)
  // -------------------------------------------------------------------------

  it('nenhuma conta CAIXA dá exactamente um impedimento, e nenhum aviso', () => {
    const r = coerenciaContasCaixa([]);
    expect(r.impedimentos).toHaveLength(1);
    expect(typeof r.impedimentos[0]).toBe('string');
    expect(r.impedimentos[0].length).toBeGreaterThan(0);
    expect(r.avisos).toEqual([]);
  });

  it('nenhuma conta CAIXA continua a ser um impedimento mesmo que a classe 1 exista no plano — a função não a vê e não a assume', () => {
    // O que a função recebe é a configuração do tenant. Um plano com 111, 121
    // e 123 mas sem nenhuma conta mapeada a CAIXA está mal configurado — e a
    // resposta é «configure», nunca «assumi a classe 1».
    const r = coerenciaContasCaixa([]);
    expect(r.impedimentos).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Contas conformes: classe 1, folha, activa ⇒ nada a dizer
  // -------------------------------------------------------------------------

  it('[property] contas de classe 1, folha e activas: sem impedimentos e sem avisos', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('111', '121', '122', '123', '131').map((codigo) => conta({ codigo })),
          { minLength: 1, maxLength: 6 },
        ),
        (contas) => {
          const r = coerenciaContasCaixa(contas);
          expect(r.impedimentos).toEqual([]);
          expect(r.avisos).toEqual([]);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('uma única conta de caixa (a 111, sem a 121 nem a 123) chega: não se exige a classe 1 inteira', () => {
    const r = coerenciaContasCaixa([conta({ codigo: '111' })]);
    expect(r.impedimentos).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Fora da classe 1, de agregação, inactiva ⇒ aviso (não bloqueia)
  // -------------------------------------------------------------------------

  it('conta CAIXA fora da classe 1 dá um aviso CAIXA_FORA_CLASSE_1 e nenhum impedimento', () => {
    const c = conta({ codigo: '2311', nome: 'Depósitos a prazo > 1 ano', classe: 'CLASSE_2' });
    const r = coerenciaContasCaixa([c]);
    expect(r.impedimentos).toEqual([]);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].codigo).toBe('CAIXA_FORA_CLASSE_1');
    expect(r.avisos[0].conta).toEqual({ id: c.id, codigo: '2311', nome: 'Depósitos a prazo > 1 ano' });
    expect(r.avisos[0].mensagem).toContain('2311');
  });

  it('conta CAIXA de agregação (aceitaLancamento: false) dá um aviso CAIXA_CONTA_AGREGADORA', () => {
    const c = conta({ codigo: '12', nome: 'Bancos', aceitaLancamento: false });
    const r = coerenciaContasCaixa([c]);
    expect(r.impedimentos).toEqual([]);
    expect(r.avisos.map((a) => a.codigo)).toEqual(['CAIXA_CONTA_AGREGADORA']);
    expect(r.avisos[0].conta.id).toBe(c.id);
    expect(r.avisos[0].mensagem).toContain('12');
  });

  it('conta CAIXA inactiva dá um aviso CAIXA_CONTA_INATIVA', () => {
    const c = conta({ codigo: '123', ativo: false });
    const r = coerenciaContasCaixa([c]);
    expect(r.impedimentos).toEqual([]);
    expect(r.avisos.map((a) => a.codigo)).toEqual(['CAIXA_CONTA_INATIVA']);
    expect(r.avisos[0].conta.id).toBe(c.id);
    expect(r.avisos[0].mensagem).toContain('123');
  });

  it('uma conta com os três problemas dá três avisos — um por motivo — e continua a não bloquear', () => {
    const c = conta({ codigo: '31', nome: 'Investimentos financeiros', classe: 'CLASSE_3', aceitaLancamento: false, ativo: false });
    const r = coerenciaContasCaixa([c]);
    expect(r.impedimentos).toEqual([]);
    expect(r.avisos.map((a) => a.codigo).sort()).toEqual(
      ['CAIXA_CONTA_AGREGADORA', 'CAIXA_CONTA_INATIVA', 'CAIXA_FORA_CLASSE_1'],
    );
    for (const a of r.avisos) expect(a.conta.id).toBe(c.id);
  });

  it('uma conta de classe 1 mas de agregação (a 12 Bancos) é aviso, não passe livre: estar na classe 1 não a torna caixa', () => {
    const r = coerenciaContasCaixa([conta({ codigo: '111' }), conta({ codigo: '12', aceitaLancamento: false })]);
    expect(r.impedimentos).toEqual([]);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0].codigo).toBe('CAIXA_CONTA_AGREGADORA');
  });

  it('[property] com pelo menos uma conta: nunca há impedimento, e os avisos são exactamente (conta, motivo) por cada motivo violado', () => {
    fc.assert(
      fc.property(fc.array(arbConta, { minLength: 1, maxLength: 10 }), (contas) => {
        const r = coerenciaContasCaixa(contas);
        // Avisos não bloqueiam — só a lista vazia bloqueia.
        expect(r.impedimentos).toEqual([]);
        const esperados = contas.flatMap((c) => avisosEsperados(c).map((codigo) => `${c.id}|${codigo}`)).sort();
        expect(pares(r.avisos)).toEqual(esperados);
        for (const a of r.avisos) {
          const original = contas.find((c) => c.id === a.conta.id)!;
          expect(a.conta).toEqual({ id: original.id, codigo: original.codigo, nome: original.nome });
          expect(a.mensagem).toContain(original.codigo);
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] só olha para o que recebe: acrescentar uma conta conforme não altera os avisos das outras', () => {
    fc.assert(
      fc.property(fc.array(arbConta, { minLength: 1, maxLength: 8 }), (contas) => {
        const antes = coerenciaContasCaixa(contas);
        const depois = coerenciaContasCaixa([...contas, conta({ codigo: '111' })]);
        expect(pares(depois.avisos)).toEqual(pares(antes.avisos));
        expect(depois.impedimentos).toEqual([]);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Caso que TEM de lançar. A mesma conta duas vezes na lista de caixa não é
   * configuração: é um estado que o `@@unique([tenantId, contaId])` proíbe e
   * que, somado, contaria a caixa a dobrar no Δcaixa. Não é aviso nem
   * impedimento — é input fora do domínio, e o núcleo não o pode normalizar
   * em silêncio.
   */
  it('TEM de lançar: a mesma conta repetida na lista de contas de caixa', () => {
    const c = conta({ codigo: '111' });
    expect(() => coerenciaContasCaixa([c, { ...c }])).toThrow();
  });
});
