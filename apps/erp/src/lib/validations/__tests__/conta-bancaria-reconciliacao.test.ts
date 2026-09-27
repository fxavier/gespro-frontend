/**
 * ORÁCULO da issue #140, ticket T1 (verificador). As tolerâncias de
 * reconciliação da conta bancária passam a entrar pelo schema: antes, o
 * `AtualizarContaBancariaSchema` descartava-as em silêncio e o formulário não
 * as mostrava. Contrato em docs/agentic/issue-140/tickets.md (T1).
 *
 * Dois invariantes que o autor não pode «simplificar»:
 * - limites fechados em cada campo (dentro passa, fora recusa);
 * - SEM `.default()`: um campo omitido fica AUSENTE no resultado, senão uma
 *   edição de só um campo repunha as omissões nos outros oito.
 */
import { describe, expect, it } from 'vitest';
import {
  AtualizarContaBancariaSchema,
  ConfigReconciliacaoContaSchema,
  CriarContaBancariaSchema,
} from '../contabilidade';

const CUID = 'cmryxs0ig009dwg9kurri602u';
const CONTA_PGC_UUID = '99860c43-83f7-4b41-ae1d-9e895920452a';

const CONFIG_VALIDA = {
  toleranciaDias: 5,
  toleranciaValor: '0.00',
  permitirMatchPorReferencia: true,
  permitirMatchPorValor: true,
  permitirMatchPorDescricao: false,
  autoReconciliacao: false,
  limiarConfianca: 90,
  permitirAgregacao: false,
  maxMovimentosAgregacao: 5,
};

const BASE_CRIAR = {
  banco: 'BCI',
  agencia: '001',
  numeroConta: '123456789',
  tipoConta: 'CORRENTE',
  moeda: 'MZN',
  contaContabilId: CONTA_PGC_UUID,
};

const CAMPOS_CONFIG = Object.keys(CONFIG_VALIDA);

const ok = (patch: Record<string, unknown>) =>
  ConfigReconciliacaoContaSchema.safeParse({ ...CONFIG_VALIDA, ...patch }).success;

describe('ConfigReconciliacaoContaSchema — limites', () => {
  it('a configuração com as omissões da BD é válida', () => {
    expect(ConfigReconciliacaoContaSchema.safeParse(CONFIG_VALIDA).success).toBe(true);
  });

  it('toleranciaDias: 0..60 inteiro', () => {
    expect(ok({ toleranciaDias: 0 })).toBe(true);
    expect(ok({ toleranciaDias: 60 })).toBe(true);
    expect(ok({ toleranciaDias: -1 })).toBe(false);
    expect(ok({ toleranciaDias: 61 })).toBe(false);
    expect(ok({ toleranciaDias: 2.5 })).toBe(false);
  });

  it('limiarConfianca: 50..100 inteiro', () => {
    expect(ok({ limiarConfianca: 50 })).toBe(true);
    expect(ok({ limiarConfianca: 100 })).toBe(true);
    expect(ok({ limiarConfianca: 49 })).toBe(false);
    expect(ok({ limiarConfianca: 101 })).toBe(false);
    expect(ok({ limiarConfianca: 90.5 })).toBe(false);
  });

  it('maxMovimentosAgregacao: 3..20 inteiro (o motor conta os dois lados; 1+2 é a menor agregação)', () => {
    expect(ok({ maxMovimentosAgregacao: 3 })).toBe(true);
    expect(ok({ maxMovimentosAgregacao: 20 })).toBe(true);
    expect(ok({ maxMovimentosAgregacao: 2 })).toBe(false);
    expect(ok({ maxMovimentosAgregacao: 21 })).toBe(false);
  });

  it('toleranciaValor: texto ≥ 0 com até 2 casas', () => {
    for (const v of ['0', '0.00', '10', '10.5', '10.50', '9999999999999999.99']) {
      expect(ok({ toleranciaValor: v }), v).toBe(true);
    }
  });

  it('toleranciaValor negativo, com 3 casas, com vírgula ou vazio é recusado', () => {
    for (const v of ['-1', '-0.01', '1.234', '0.001', '1,50', '', 'abc', '1.']) {
      expect(ok({ toleranciaValor: v }), v).toBe(false);
    }
  });

  it('toleranciaValor tolera espaços à volta (trim)', () => {
    const r = ConfigReconciliacaoContaSchema.parse({ ...CONFIG_VALIDA, toleranciaValor: ' 12.30 ' });
    expect(r.toleranciaValor).toBe('12.30');
  });

  it('os interruptores são booleanos (texto recusado)', () => {
    for (const campo of [
      'permitirMatchPorReferencia',
      'permitirMatchPorValor',
      'permitirMatchPorDescricao',
      'autoReconciliacao',
      'permitirAgregacao',
    ]) {
      expect(ok({ [campo]: 'sim' }), campo).toBe(false);
      expect(ok({ [campo]: true }), campo).toBe(true);
      expect(ok({ [campo]: false }), campo).toBe(true);
    }
  });

  it('coage texto numérico nos inteiros (o <input type="number"> entrega string)', () => {
    const r = ConfigReconciliacaoContaSchema.parse({
      ...CONFIG_VALIDA,
      toleranciaDias: '7',
      limiarConfianca: '85',
      maxMovimentosAgregacao: '3',
    });
    expect(r.toleranciaDias).toBe(7);
    expect(r.limiarConfianca).toBe(85);
    expect(r.maxMovimentosAgregacao).toBe(3);
  });

  it('texto numérico fora dos limites continua recusado depois da coerção', () => {
    expect(ok({ toleranciaDias: '61' })).toBe(false);
    expect(ok({ limiarConfianca: '49' })).toBe(false);
    expect(ok({ maxMovimentosAgregacao: '21' })).toBe(false);
  });
});

describe('CriarContaBancariaSchema — as tolerâncias são opcionais e sem omissão', () => {
  it('sem nenhum campo de reconciliação: nenhum aparece no resultado (a BD põe a omissão)', () => {
    const r = CriarContaBancariaSchema.parse(BASE_CRIAR) as Record<string, unknown>;
    for (const campo of CAMPOS_CONFIG) {
      expect(campo in r, campo).toBe(false);
    }
  });

  it('aceita e preserva os campos de reconciliação', () => {
    const r = CriarContaBancariaSchema.parse({ ...BASE_CRIAR, ...CONFIG_VALIDA, toleranciaDias: 12 });
    expect(r).toMatchObject({ ...CONFIG_VALIDA, toleranciaDias: 12 });
  });

  it('aplica os mesmos limites', () => {
    expect(CriarContaBancariaSchema.safeParse({ ...BASE_CRIAR, toleranciaDias: 61 }).success).toBe(false);
    expect(CriarContaBancariaSchema.safeParse({ ...BASE_CRIAR, toleranciaValor: '-5' }).success).toBe(false);
    expect(CriarContaBancariaSchema.safeParse({ ...BASE_CRIAR, limiarConfianca: 40 }).success).toBe(false);
  });

  it('só um campo fornecido: só esse aparece', () => {
    const r = CriarContaBancariaSchema.parse({ ...BASE_CRIAR, limiarConfianca: 70 }) as Record<string, unknown>;
    expect(r.limiarConfianca).toBe(70);
    for (const campo of CAMPOS_CONFIG.filter((c) => c !== 'limiarConfianca')) {
      expect(campo in r, campo).toBe(false);
    }
  });
});

describe('AtualizarContaBancariaSchema — o defeito da #140', () => {
  it('parse({ id, toleranciaDias: 9 }) preserva toleranciaDias: 9 (antes devolvia só { id })', () => {
    const r = AtualizarContaBancariaSchema.parse({ id: CUID, toleranciaDias: 9 });
    expect(r).toMatchObject({ id: CUID, toleranciaDias: 9 });
  });

  it('um update parcial não repõe omissões nos outros campos', () => {
    const r = AtualizarContaBancariaSchema.parse({ id: CUID, toleranciaDias: 9 }) as Record<string, unknown>;
    for (const campo of CAMPOS_CONFIG.filter((c) => c !== 'toleranciaDias')) {
      expect(campo in r, campo).toBe(false);
    }
  });

  it('preserva todos os nove campos quando fornecidos', () => {
    const r = AtualizarContaBancariaSchema.parse({ id: CUID, ...CONFIG_VALIDA, toleranciaValor: '2.50' });
    expect(r).toMatchObject({ ...CONFIG_VALIDA, toleranciaValor: '2.50' });
  });

  it('coage texto numérico e mantém os limites', () => {
    expect(AtualizarContaBancariaSchema.parse({ id: CUID, toleranciaDias: '9' }).toleranciaDias).toBe(9);
    expect(AtualizarContaBancariaSchema.safeParse({ id: CUID, toleranciaDias: 61 }).success).toBe(false);
    expect(AtualizarContaBancariaSchema.safeParse({ id: CUID, toleranciaValor: '1.234' }).success).toBe(false);
    expect(AtualizarContaBancariaSchema.safeParse({ id: CUID, maxMovimentosAgregacao: 1 }).success).toBe(false);
  });
});
