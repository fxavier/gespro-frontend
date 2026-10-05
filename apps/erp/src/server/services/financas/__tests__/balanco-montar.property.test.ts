/**
 * ORÁCULO P5-v (run exercicio-followups, issue #365, ADR-0035 §8) — núcleo puro `montarBalanco`
 * (`services/financas/balanco.ts`): guarda de propriedades e exemplos.
 *
 * Propriedade: para qualquer conjunto EQUILIBRADO de linhas de balancete (folhas das classes 1–8
 * e, opcionalmente, a linha sintética «resultados anteriores por encerrar»; Σ saldo devedor =
 * Σ saldo credor), o balanço sai equilibrado: Activo = Capital próprio + Passivo, exactamente.
 * E ainda: nenhuma linha de valor zero; cada razão da classe 4 aparece numa só massa, com valor
 * positivo; o resultado do período é o líquido credor das classes 6/7.
 *
 * Exemplos: compensação da classe 4 por RAZÃO (4411 credor + 4412 devedor na 44 — decide o
 * líquido), contra-natureza (Caixa credora → linha negativa no Activo), linha sintética no
 * Capital próprio, classes 6/7 → `resultadoDoPeriodo`.
 *
 * Escrito pelo autor do oráculo DEPOIS do núcleo (guarda). NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 */
import { Prisma, type ClassePGC, type NaturezaConta } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { montarBalanco, type Balanco } from '../balanco';
import type { ContaBV, LinhaBV } from '../balancete-verificacao';

const D = (v: string | number | bigint) => new Prisma.Decimal(String(v));
const ZERO = D(0);

function conta(codigo: string, nome: string, classe: ClassePGC, natureza: NaturezaConta = 'DEVEDORA'): ContaBV {
  return {
    id: `c-${codigo}`,
    codigo,
    nome,
    classe,
    natureza,
    nivel: codigo.length,
    contaMaeId: null,
    aceitaLancamento: true,
  };
}

/** Linha de balancete a partir de um saldo com sinal (D − C). */
function linha(c: ContaBV | null, saldo: Prisma.Decimal): LinhaBV {
  const dev = saldo.greaterThan(0) ? saldo : ZERO;
  const cred = saldo.lessThan(0) ? saldo.negated() : ZERO;
  return {
    conta: c,
    implicita: c === null,
    movD: ZERO,
    movC: ZERO,
    acumD: dev,
    acumC: cred,
    saldoDevedor: dev,
    saldoCredor: cred,
    contraNatureza:
      c !== null && ((c.natureza === 'DEVEDORA' && cred.greaterThan(0)) || (c.natureza === 'CREDORA' && dev.greaterThan(0))),
  };
}

const POOL: ContaBV[] = [
  conta('111', 'Caixa sede', 'CLASSE_1'),
  conta('121', 'Banco A', 'CLASSE_1'),
  conta('122', 'Banco B', 'CLASSE_1'),
  conta('211', 'Mercadorias', 'CLASSE_2'),
  conta('321', 'Equipamento', 'CLASSE_3'),
  conta('4111', 'Clientes c/c', 'CLASSE_4'),
  conta('4211', 'Fornecedores c/c', 'CLASSE_4', 'CREDORA'),
  conta('4411', 'IRPC', 'CLASSE_4', 'CREDORA'),
  conta('4412', 'IVA a recuperar', 'CLASSE_4'),
  conta('521', 'Capital social', 'CLASSE_5', 'CREDORA'),
  conta('551', 'Reservas legais', 'CLASSE_5', 'CREDORA'),
  conta('622', 'Fornecimentos', 'CLASSE_6'),
  conta('641', 'Pessoal', 'CLASSE_6'),
  conta('711', 'Vendas', 'CLASSE_7', 'CREDORA'),
  conta('721', 'Serviços', 'CLASSE_7', 'CREDORA'),
  conta('811', 'Resultados operacionais', 'CLASSE_8', 'CREDORA'),
  conta('88', 'Resultado líquido', 'CLASSE_8', 'CREDORA'),
];

const RAZOES = [
  { codigo: '11', nome: 'Caixa' },
  { codigo: '12', nome: 'Bancos' },
  { codigo: '21', nome: 'Compras' },
  { codigo: '32', nome: 'Imobilizações corpóreas' },
  { codigo: '41', nome: 'Clientes' },
  { codigo: '42', nome: 'Fornecedores' },
  { codigo: '44', nome: 'Estado' },
  { codigo: '52', nome: 'Capital' },
  { codigo: '55', nome: 'Reservas' },
  { codigo: '62', nome: 'Fornecimentos e serviços' },
  { codigo: '64', nome: 'Gastos com pessoal' },
  { codigo: '71', nome: 'Vendas' },
  { codigo: '72', nome: 'Prestações de serviços' },
  { codigo: '81', nome: 'Resultados operacionais' },
  { codigo: '88', nome: 'Resultado líquido do exercício' },
];

const PLANO = [
  ...RAZOES,
  ...POOL.filter((c) => !RAZOES.some((r) => r.codigo === c.codigo)).map((c) => ({ codigo: c.codigo, nome: c.nome })),
];

const soma = (b: Balanco['activo']) => b.linhas.reduce((s, l) => s.plus(l.valor), ZERO);

/** Linhas equilibradas: saldos aleatórios em cêntimos; a última fecha a soma em zero. */
const arbLinhas = fc
  .record({
    saldos: fc.array(
      fc.record({
        i: fc.integer({ min: 0, max: POOL.length - 1 }),
        centimos: fc.bigInt({ min: -BigInt(10_000_000_000), max: BigInt(10_000_000_000) }),
      }),
      { minLength: 1, maxLength: 25 },
    ),
    sintetica: fc.boolean(),
    fecho: fc.integer({ min: 0, max: POOL.length - 1 }),
  })
  .map(({ saldos, sintetica, fecho }) => {
    // Uma folha por conta (o balancete tem uma linha por folha): agrega por índice.
    const porConta = new Map<number, bigint>();
    for (const s of saldos) porConta.set(s.i, (porConta.get(s.i) ?? BigInt(0)) + s.centimos);
    const total = [...porConta.values()].reduce((a, b) => a + b, BigInt(0));
    const linhas: LinhaBV[] = [];
    if (sintetica) {
      // A sintética fecha o equilíbrio (como na abertura implícita).
      for (const [i, c] of porConta) linhas.push(linha(POOL[i]!, D(c).dividedBy(100)));
      linhas.push(linha(null, D(-total).dividedBy(100)));
    } else {
      porConta.set(fecho, (porConta.get(fecho) ?? BigInt(0)) - total);
      for (const [i, c] of porConta) linhas.push(linha(POOL[i]!, D(c).dividedBy(100)));
    }
    return linhas;
  });

describe('montarBalanco — propriedades', () => {
  it('linhas equilibradas ⇒ equilibrado e Activo = CP + Passivo exactamente', () => {
    fc.assert(
      fc.property(arbLinhas, (linhas) => {
        const b = montarBalanco(linhas, PLANO);
        expect(b.equilibrado).toBe(true);
        expect(b.activo.total.equals(b.capitalProprio.total.plus(b.passivo.total))).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('totais = soma das linhas (CP inclui o resultado); sem linhas zero; classe 4 numa só massa e positiva', () => {
    fc.assert(
      fc.property(arbLinhas, (linhas) => {
        const b = montarBalanco(linhas, PLANO);
        expect(b.activo.total.equals(soma(b.activo))).toBe(true);
        expect(b.passivo.total.equals(soma(b.passivo))).toBe(true);
        expect(b.capitalProprio.total.equals(soma(b.capitalProprio).plus(b.resultadoDoPeriodo))).toBe(true);
        const todas = [...b.activo.linhas, ...b.capitalProprio.linhas, ...b.passivo.linhas];
        for (const l of todas) expect(l.valor.isZero(), `linha ${l.codigo} a zero`).toBe(false);
        for (const l of b.passivo.linhas) {
          expect(l.codigo.startsWith('4'), 'passivo só da classe 4').toBe(true);
          expect(l.valor.greaterThan(0)).toBe(true);
        }
        const c4 = todas.filter((l) => l.codigo.startsWith('4'));
        for (const l of c4) expect(l.valor.greaterThan(0), `razão ${l.codigo} positiva`).toBe(true);
        expect(new Set(c4.map((l) => l.codigo)).size, 'cada razão da classe 4 numa só massa').toBe(c4.length);
        // o resultado do período é o líquido credor das classes 6/7
        const r67 = linhas
          .filter((l) => l.conta && (l.conta.classe === 'CLASSE_6' || l.conta.classe === 'CLASSE_7'))
          .reduce((s, l) => s.plus(l.saldoCredor).minus(l.saldoDevedor), ZERO);
        expect(b.resultadoDoPeriodo.equals(r67)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

const porCodigo = (m: Balanco['activo']) =>
  Object.fromEntries(m.linhas.map((l) => [l.codigo, l.valor.toFixed(2)]));
const c = (codigo: string) => POOL.find((x) => x.codigo === codigo)!;

describe('montarBalanco — exemplos', () => {
  it('classe 4 compensa-se por razão: 4411 C 500 + 4412 D 200 ⇒ Passivo 44 = 300', () => {
    const b = montarBalanco(
      [linha(c('111'), D(300)), linha(c('4411'), D(-500)), linha(c('4412'), D(200))],
      PLANO,
    );
    expect(porCodigo(b.passivo)).toEqual({ '44': '300.00' });
    expect(porCodigo(b.activo)).toEqual({ '11': '300.00' });
    expect(b.equilibrado).toBe(true);
  });

  it('classe 4 compensa-se por razão: 4411 C 200 + 4412 D 500 ⇒ Activo 44 = 300', () => {
    const b = montarBalanco(
      [linha(c('4411'), D(-200)), linha(c('4412'), D(500)), linha(c('521'), D(-300))],
      PLANO,
    );
    expect(porCodigo(b.activo)).toEqual({ '44': '300.00' });
    expect(porCodigo(b.passivo)).toEqual({});
    expect(porCodigo(b.capitalProprio)).toEqual({ '52': '300.00' });
    expect(b.equilibrado).toBe(true);
  });

  it('razão 44 a zero (4411 C 200 + 4412 D 200) não aparece', () => {
    const b = montarBalanco([linha(c('4411'), D(-200)), linha(c('4412'), D(200))], PLANO);
    expect(b.activo.linhas).toEqual([]);
    expect(b.passivo.linhas).toEqual([]);
    expect(b.equilibrado).toBe(true);
  });

  it('contra-natureza: Caixa credora ⇒ linha negativa no Activo', () => {
    const b = montarBalanco(
      [linha(c('111'), D(-150)), linha(c('121'), D(1000)), linha(c('521'), D(-850))],
      PLANO,
    );
    expect(porCodigo(b.activo)).toEqual({ '11': '-150.00', '12': '1000.00' });
    expect(b.activo.total.toFixed(2)).toBe('850.00');
    expect(b.equilibrado).toBe(true);
  });

  it('a linha sintética vai para o Capital próprio (credor positivo)', () => {
    const b = montarBalanco([linha(c('121'), D(400)), linha(null, D(-400))], PLANO);
    expect(b.capitalProprio.linhas).toHaveLength(1);
    const sint = b.capitalProprio.linhas[0]!;
    expect(sint.codigo).toBe('');
    expect(sint.nome.toLowerCase()).toContain('resultados');
    expect(sint.valor.toFixed(2)).toBe('400.00');
    expect(b.capitalProprio.total.toFixed(2)).toBe('400.00');
    expect(b.equilibrado).toBe(true);
  });

  it('classes 6/7 ⇒ resultadoDoPeriodo (credor positivo), não linhas', () => {
    const b = montarBalanco(
      [linha(c('111'), D(700)), linha(c('711'), D(-1000)), linha(c('622'), D(300))],
      PLANO,
    );
    expect(b.resultadoDoPeriodo.toFixed(2)).toBe('700.00');
    expect(b.capitalProprio.linhas).toEqual([]);
    expect(b.capitalProprio.total.toFixed(2)).toBe('700.00');
    expect(b.equilibrado).toBe(true);
  });

  it('prejuízo ⇒ resultadoDoPeriodo negativo', () => {
    const b = montarBalanco(
      [linha(c('111'), D(-200)), linha(c('711'), D(-100)), linha(c('622'), D(300))],
      PLANO,
    );
    expect(b.resultadoDoPeriodo.toFixed(2)).toBe('-200.00');
    expect(b.equilibrado).toBe(true);
  });

  it('as linhas levam o nome da conta de razão do plano', () => {
    const b = montarBalanco(
      [linha(c('111'), D(100)), linha(c('88'), D(-100))],
      PLANO,
    );
    expect(b.activo.linhas).toEqual([expect.objectContaining({ codigo: '11', nome: 'Caixa' })]);
    expect(b.capitalProprio.linhas).toEqual([
      expect.objectContaining({ codigo: '88', nome: 'Resultado líquido do exercício' }),
    ]);
  });
});
