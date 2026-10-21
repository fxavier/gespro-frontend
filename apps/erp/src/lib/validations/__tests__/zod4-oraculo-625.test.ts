/**
 * Oráculo da migração para o zod 4 (#625). Escrito pelo VERIFICADOR, não pelo implementador:
 * trava o comportamento OBSERVÁVEL dos schemas reais — aceita/recusa, valor e tipo do `parse`,
 * `issues[].message` e `issues[].path` — tal como está com o zod 3.25.76. A migração tem de o
 * manter verde sem tocar neste ficheiro. Nada aqui depende de internals do zod (classes, `_def`).
 *
 * Achado ao escrevê-lo: `dinheiro()` RECUSA hoje `0.1 + 0.2` (0.30000000000000004 tem mais de
 * duas casas em `toString`). A issue presume o contrário; trava-se o comportamento actual, que é
 * o correcto para uma coluna `Decimal(18,2)`: o valor nunca chegou a ser 0.30.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { dataDocumento, dinheiro } from '../common';
import { AbrirSessaoCaixaSchema } from '../caixa';
import { CreateContaPagarSchema, CreatePagamentoSchema } from '../compras';
import { EmitirFaturaSchema, LinhaDocumentoSchema, RegistarPagamentoFaturaSchema } from '../faturacao';
import { UpdateColaboradorSchema } from '../rh';
import { CreateEncomendaSchema } from '../vendas';

const CUID = 'cjld2cjxh0000qzrmn831i7rn';
const INGLES = /Required|Expected|Invalid input|must be|received|Unrecognized|String must/i;
const MSG_DINHEIRO = 'O valor tem no máximo duas casas decimais';
const MSG_IVA = 'Taxa de IVA inválida — use 0.16 (16%) ou 0 (isento)';

type Issue = { path: (string | number)[]; message: string };
type ResultadoSafe = { success: true; data: unknown } | { success: false; error: { issues: Issue[] } };
type Schema = { safeParse: (v: unknown) => unknown };

/** Issues como pares [path, message], na ordem em que o schema as produz. */
function issues(schema: Schema, v: unknown): [(string | number)[], string][] {
  const r = schema.safeParse(v) as ResultadoSafe;
  if (r.success) throw new Error(`esperava recusa e foi aceite: ${JSON.stringify(v)}`);
  return r.error.issues.map((i) => [i.path.map((p) => p), i.message]);
}

function dados(schema: Schema, v: unknown): unknown {
  const r = schema.safeParse(v) as ResultadoSafe;
  if (!r.success) throw new Error(`esperava aceite e foi recusado: ${JSON.stringify(r.error.issues)}`);
  return r.data;
}

// ---------------------------------------------------------------------------
// 1. dinheiro() — #568
// ---------------------------------------------------------------------------

describe('#625 · dinheiro() — no máximo duas casas decimais', () => {
  it.each([19.99, 1234567.89, 0.01, 100, 0, 9999999.99, 10_000_000.07])('aceita %s e devolve o mesmo número', (v) => {
    expect(dados(dinheiro(), v)).toBe(v);
  });

  it.each([0.001, 100.005, 1.234])('recusa %s com a mensagem pt-PT', (v) => {
    expect(issues(dinheiro(), v)).toEqual([[[], MSG_DINHEIRO]]);
  });

  it('recusa 0.1 + 0.2 (0.30000000000000004) — comportamento actual do zod 3, travado', () => {
    expect(issues(dinheiro(), 0.1 + 0.2)).toEqual([[[], MSG_DINHEIRO]]);
  });

  it('aceita 0.30 escrito como literal', () => {
    expect(dados(dinheiro(), 0.3)).toBe(0.3);
  });

  it('a mensagem é a passada ao helper', () => {
    expect(issues(dinheiro('Máximo 2 casas'), 0.001)).toEqual([[[], 'Máximo 2 casas']]);
  });

  it('propriedade: todo o n/100 com n inteiro em [0, 1e9] é aceite', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (n) => dinheiro().safeParse(n / 100).success),
      { numRuns: 2000 },
    );
  });

  it('propriedade: todo o n/1000 com n inteiro em [0, 1e9] e n não múltiplo de 10 é recusado', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }).filter((n) => n % 10 !== 0),
        (n) => !dinheiro().safeParse(n / 1000).success,
      ),
      { numRuns: 2000 },
    );
  });

  it('não coage: string numérica é recusada', () => {
    expect(dinheiro().safeParse('1').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Mensagens pt-PT e paths
// ---------------------------------------------------------------------------

describe('#625 · mensagens pt-PT e paths (nenhuma em inglês)', () => {
  const casos: { nome: string; schema: Schema; entrada: unknown; esperado: [(string | number)[], string][] }[] = [
    {
      nome: 'faturação/LinhaDocumento — campos em falta (required_error) e string vazia',
      schema: LinhaDocumentoSchema,
      entrada: { descricao: '', taxaIva: 0.16 },
      esperado: [
        [['descricao'], 'Descrição obrigatória'],
        [['quantidade'], 'Quantidade obrigatória'],
        [['precoUnitario'], 'Preço unitário obrigatório'],
      ],
    },
    {
      nome: 'faturação/LinhaDocumento — taxaIva em falta',
      schema: LinhaDocumentoSchema,
      entrada: { descricao: 'x', quantidade: 2, precoUnitario: 10 },
      esperado: [[['taxaIva'], MSG_IVA]],
    },
    {
      nome: 'faturação/RegistarPagamento — valor em falta (required_error)',
      schema: RegistarPagamentoFaturaSchema,
      entrada: { faturaId: CUID, dataPagamento: '2026-01-01', formaPagamento: 'NUMERARIO' },
      esperado: [[['valor'], 'Valor de pagamento obrigatório']],
    },
    {
      nome: 'faturação/RegistarPagamento — tipo errado (invalid_type_error) e id inválido',
      schema: RegistarPagamentoFaturaSchema,
      entrada: { faturaId: 'x', valor: 'a', dataPagamento: '2026-01-01', formaPagamento: 'NUMERARIO' },
      esperado: [
        [['faturaId'], 'ID de factura inválido'],
        [['valor'], 'Valor inválido'],
      ],
    },
    {
      nome: 'faturação/EmitirFatura — mínimos e refine de datas',
      schema: EmitirFaturaSchema,
      entrada: { clienteId: '', dataEmissao: '2026-02-01', dataVencimento: '2026-01-01', linhas: [] },
      esperado: [
        [['clienteId'], 'Cliente obrigatório'],
        [['linhas'], 'Mínimo 1 linha de factura'],
        [['dataVencimento'], 'Data de vencimento não pode ser anterior à data de emissão'],
      ],
    },
    {
      nome: 'faturação/EmitirFatura — só o refine de datas',
      schema: EmitirFaturaSchema,
      entrada: {
        clienteId: 'c',
        dataEmissao: '2026-02-01',
        dataVencimento: '2026-01-01',
        linhas: [{ descricao: 'x', quantidade: 2, precoUnitario: 10, taxaIva: 0.16 }],
      },
      esperado: [[['dataVencimento'], 'Data de vencimento não pode ser anterior à data de emissão']],
    },
    {
      nome: 'compras/ContaPagar — dinheiro() com 3 casas + refine de datas',
      schema: CreateContaPagarSchema,
      entrada: { fornecedorId: CUID, descricao: 'x', valorOriginal: 10.005, dataEmissao: '2026-02-01', dataVencimento: '2026-01-01' },
      esperado: [
        [['valorOriginal'], MSG_DINHEIRO],
        [['dataVencimento'], 'Data de vencimento deve ser igual ou posterior à data de emissão'],
      ],
    },
    {
      nome: 'compras/ContaPagar — dinheiro().positive',
      schema: CreateContaPagarSchema,
      entrada: { fornecedorId: CUID, descricao: 'x', valorOriginal: -1, dataEmissao: '2026-02-01', dataVencimento: '2026-03-01' },
      esperado: [[['valorOriginal'], 'Valor deve ser positivo']],
    },
    {
      nome: 'compras/Pagamento — superRefine (conta bancária fora do numerário)',
      schema: CreatePagamentoSchema,
      entrada: { contaPagarId: CUID, dataPagamento: '2026-01-01', valor: 5, formaPagamento: 'CHEQUE' },
      esperado: [[['contaBancariaId'], 'A conta bancária é obrigatória para esta forma de pagamento.']],
    },
    {
      nome: 'faturação/RegistarPagamento — superRefine partilhado',
      schema: RegistarPagamentoFaturaSchema,
      entrada: { faturaId: CUID, valor: 10, dataPagamento: '2026-01-01', formaPagamento: 'M-PESA' },
      esperado: [[['contaBancariaId'], 'A conta bancária é obrigatória para esta forma de pagamento.']],
    },
    {
      nome: 'rh/UpdateColaborador — email inválido',
      schema: UpdateColaboradorSchema,
      entrada: { email: 'nao-email' },
      esperado: [[['email'], 'Email inválido']],
    },
    {
      nome: 'vendas/Encomenda — cuid com mensagem e array vazio',
      schema: CreateEncomendaSchema,
      entrada: { clienteId: 'x', itens: [] },
      esperado: [
        [['clienteId'], 'ID de cliente inválido'],
        [['itens'], 'Encomenda deve ter pelo menos um item'],
      ],
    },
    {
      nome: 'vendas/Encomenda — item com valores fora do domínio (paths aninhados)',
      schema: CreateEncomendaSchema,
      entrada: {
        clienteId: CUID,
        itens: [{ produtoId: CUID, nomeProduto: 'a', quantidade: 0, precoUnitario: -1, taxaIva: 0.5 }],
      },
      esperado: [
        [['itens', 0, 'quantidade'], 'Quantidade deve ser positiva'],
        [['itens', 0, 'precoUnitario'], 'Preço não pode ser negativo'],
        [['itens', 0, 'taxaIva'], MSG_IVA],
      ],
    },
    {
      nome: 'caixa/AbrirSessao — campo em falta (required_error)',
      schema: AbrirSessaoCaixaSchema,
      entrada: {},
      esperado: [[['fundoInicial'], 'Fundo inicial obrigatório']],
    },
    {
      nome: 'caixa/AbrirSessao — negativo e com 3 casas (duas issues no mesmo campo)',
      schema: AbrirSessaoCaixaSchema,
      entrada: { fundoInicial: -0.005 },
      esperado: [
        [['fundoInicial'], 'Fundo inicial não pode ser negativo'],
        [['fundoInicial'], 'Máximo 2 casas decimais'],
      ],
    },
  ];

  it.each(casos)('$nome', ({ schema, entrada, esperado }) => {
    const obtido = issues(schema, entrada);
    expect(obtido).toEqual(esperado);
    for (const [, msg] of obtido) expect(msg).not.toMatch(INGLES);
  });

  it('UpdateColaborador é strict: chave fora da lista é recusada (não despida) no nível de topo', () => {
    const r = UpdateColaboradorSchema.safeParse({ bi: '1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues).toHaveLength(1);
      expect(r.error.issues[0].path).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Coerções: taxaIva e datas de documento
// ---------------------------------------------------------------------------

describe('#625 · coerção da taxaIva (LinhaDocumento)', () => {
  const linha = { descricao: 'x', quantidade: 2, precoUnitario: 10 };

  it.each([
    [0.16, 0.16],
    ['0.16', 0.16],
    [' 0 ', 0],
    [0, 0],
  ])('taxaIva %j → %s (number)', (entrada, esperado) => {
    const d = dados(LinhaDocumentoSchema, { ...linha, taxaIva: entrada }) as Record<string, unknown>;
    expect(d.taxaIva).toBe(esperado);
    expect(typeof d.taxaIva).toBe('number');
  });

  it('o transform da linha corre sobre a taxa coagida (string → totais a 16%)', () => {
    expect(dados(LinhaDocumentoSchema, { ...linha, taxaIva: '0.16' })).toEqual({
      ...linha,
      desconto: 0,
      taxaIva: 0.16,
      ordemLinha: 0,
      subtotal: 20,
      ivaItem: 3.2,
      total: 23.2,
    });
  });

  it.each(['', null, 0.17, 'abc', '16'])('taxaIva %j é recusada com a mensagem pt-PT no path taxaIva', (t) => {
    expect(issues(LinhaDocumentoSchema, { ...linha, taxaIva: t })).toEqual([[['taxaIva'], MSG_IVA]]);
  });
});

describe('#625 · dataDocumento() — aaaa-mm-dd', () => {
  const schema = dataDocumento('Data de emissão');

  it('2026-09-26 → Date à meia-noite UTC', () => {
    const d = dados(schema, '2026-09-26');
    expect(d).toBeInstanceOf(Date);
    expect((d as Date).toISOString()).toBe('2026-09-26T00:00:00.000Z');
  });

  it('um Date passa inalterado', () => {
    const entrada = new Date('2026-01-15T10:30:00.000Z');
    expect((dados(schema, entrada) as Date).toISOString()).toBe('2026-01-15T10:30:00.000Z');
  });

  it.each([
    ['abc', 'Data de emissão inválida'],
    [undefined, 'Data de emissão inválida'],
    ['92026-09-26', 'Data de emissão inválida: o ano tem de estar entre 2000 e 2100'],
    ['1999-12-31', 'Data de emissão inválida: o ano tem de estar entre 2000 e 2100'],
    // null coage para 1970-01-01 e cai no refine do ano.
    [null, 'Data de emissão inválida: o ano tem de estar entre 2000 e 2100'],
  ])('%j é recusada com «%s»', (entrada, msg) => {
    expect(issues(schema, entrada)).toEqual([[[], msg]]);
  });

  it('dentro de um objecto o path é o do campo', () => {
    expect(
      issues(RegistarPagamentoFaturaSchema, { faturaId: CUID, valor: 1, dataPagamento: 'abc', formaPagamento: 'NUMERARIO' }),
    ).toEqual([[['dataPagamento'], 'Data do pagamento inválida']]);
  });
});
