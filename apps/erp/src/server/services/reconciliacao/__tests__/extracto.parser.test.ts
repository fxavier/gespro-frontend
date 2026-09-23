import fc from 'fast-check';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { MAXIMO_LINHAS, interpretarGrelha, parserCsv, parserPara, parserXlsx, type LinhaExtracto } from '../extracto.parser';
import { chaveIdempotenciaBanco } from '../reconciliacao.model';

const D = (v: string) => new Prisma.Decimal(v);

// ---------------------------------------------------------------------------
// Geradores: o que um banco escreveria. Datas de 2024–2028 (inclui 29 Fev e
// viragens de mês/ano); valores de 0,01 a 10 milhões; referência opcional.
// ---------------------------------------------------------------------------

const arbDia = fc
  .date({ min: new Date(2024, 0, 1), max: new Date(2028, 11, 31), noInvalidDate: true })
  .map((d) => ({ a: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }));
const arbCentimos = fc.integer({ min: 1, max: 1_000_000_000 });
const arbLinha = fc.record({
  dia: arbDia,
  centimos: arbCentimos,
  natureza: fc.constantFrom('DEBITO' as const, 'CREDITO' as const),
  referencia: fc.option(fc.stringMatching(/^[A-Z]{2,4}-\d{3,6}$/), { nil: null }),
  descricao: fc.stringMatching(/^[A-Za-z][A-Za-z ]{2,30}$/).map((s) => s.trim()).filter((s) => s.length > 0),
});
type Gerada = typeof arbLinha extends fc.Arbitrary<infer T> ? T : never;

const iso = ({ a, m, d }: { a: number; m: number; d: number }) =>
  `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const pt = ({ a, m, d }: { a: number; m: number; d: number }) =>
  `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
const valorPt = (c: number) => {
  const [int, dec] = (c / 100).toFixed(2).split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};

function csv(linhas: Gerada[], sep: ';' | ','): string {
  const cab = ['Referência', 'Data', 'Descrição', 'Valor', 'Tipo'].join(sep);
  const corpo = linhas.map((l) =>
    [
      l.referencia ?? '',
      sep === ';' ? pt(l.dia) : iso(l.dia),
      l.descricao,
      sep === ';' ? valorPt(l.centimos) : (l.centimos / 100).toFixed(2),
      l.natureza === 'DEBITO' ? 'D' : 'C',
    ].join(sep),
  );
  return [cab, ...corpo].join('\r\n');
}

async function xlsx(linhas: Gerada[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Extracto');
  ws.addRow(['referencia', 'data', 'descricao', 'valor', 'tipo']);
  for (const l of linhas) {
    // Datas como célula de data do Excel (meia-noite UTC, como o Excel as guarda);
    // valores como número — é o que um banco exporta.
    ws.addRow([l.referencia, new Date(Date.UTC(l.dia.a, l.dia.m - 1, l.dia.d)), l.descricao, l.centimos / 100, l.natureza]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function confere(l: LinhaExtracto, g: Gerada) {
  expect(l.dataMovimento.getFullYear()).toBe(g.dia.a);
  expect(l.dataMovimento.getMonth() + 1).toBe(g.dia.m);
  expect(l.dataMovimento.getDate()).toBe(g.dia.d);
  expect(l.dataMovimento.getHours()).toBe(12);
  expect(l.valor.equals(D((g.centimos / 100).toFixed(2))), `${l.valor} ≠ ${g.centimos / 100}`).toBe(true);
  expect(l.natureza).toBe(g.natureza);
  expect(l.referencia).toBe(g.referencia);
  expect(l.descricao).toBe(g.descricao);
}

const chaves = (ls: LinhaExtracto[]) => {
  const vistos = new Map<string, number>();
  return ls.map((l) => {
    const k = `${l.dataMovimento.toDateString()}|${l.valor}|${l.natureza}|${l.descricao}`;
    const ordinal = vistos.get(k) ?? 0;
    vistos.set(k, ordinal + 1);
    return chaveIdempotenciaBanco({
      referenciaBanco: l.referencia, dataMovimento: l.dataMovimento, valor: l.valor,
      natureza: l.natureza, descricao: l.descricao, ordinal,
    });
  });
};

const semRefsRepetidas = (ls: Gerada[]) =>
  new Set(ls.filter((l) => l.referencia).map((l) => l.referencia)).size === ls.filter((l) => l.referencia).length;

describe('parserCsv — ida e volta', () => {
  it('preserva dia civil, valor ao cêntimo, natureza, referência e descrição (; e ,)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbLinha, { minLength: 1, maxLength: 20 }).filter(semRefsRepetidas), fc.constantFrom(';' as const, ',' as const), async (ls, sep) => {
        const r = interpretarGrelha(await parserCsv.ler(Buffer.from(csv(ls, sep), 'utf8')));
        expect(r.erros).toEqual([]);
        expect(r.linhas).toHaveLength(ls.length);
        r.linhas.forEach((l, i) => confere(l, ls[i]));
      }),
      { numRuns: 1000 },
    );
  });
});

describe('parserXlsx — ida e volta', () => {
  it('preserva dia civil, valor ao cêntimo, natureza, referência e descrição', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbLinha, { minLength: 1, maxLength: 10 }).filter(semRefsRepetidas), async (ls) => {
        const r = interpretarGrelha(await parserXlsx.ler(await xlsx(ls)));
        expect(r.erros).toEqual([]);
        r.linhas.forEach((l, i) => confere(l, ls[i]));
      }),
      { numRuns: 200 },
    );
  });
});

describe('CA08 entre formatos (armadilha do handoff do MODEL)', () => {
  it('o mesmo extracto em CSV e em XLSX produz exactamente as mesmas chaves de idempotência', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbLinha, { minLength: 1, maxLength: 10 }).filter(semRefsRepetidas), async (ls) => {
        const deCsv = interpretarGrelha(await parserCsv.ler(Buffer.from(csv(ls, ';'), 'utf8')));
        const deXlsx = interpretarGrelha(await parserXlsx.ler(await xlsx(ls)));
        expect(chaves(deXlsx.linhas)).toEqual(chaves(deCsv.linhas));
      }),
      { numRuns: 200 },
    );
  });
});

describe('interpretarGrelha — regras', () => {
  const cab = ['referencia', 'data', 'descricao', 'valor', 'tipo'];

  it('colunas opcionais: data-valor e saldo após movimento', () => {
    const r = interpretarGrelha([
      [...cab, 'Data Valor', 'Saldo'],
      ['TRF-458', '12/09/2026', 'Transferência', '100.000,00', 'C', '14/09/2026', '1.250.000,50'],
    ]);
    expect(r.erros).toEqual([]);
    const [l] = r.linhas;
    expect(l.dataValor?.getDate()).toBe(14);
    expect(l.saldoAposMovimento!.equals(D('1250000.50'))).toBe(true);
  });

  it('sem coluna tipo, o sinal do valor decide: positivo = DEBITO (entrada), negativo = CREDITO', () => {
    const r = interpretarGrelha([
      ['data', 'descricao', 'valor'],
      ['2026-09-15', 'Comissão bancária', '-500,00'],
      ['2026-09-16', 'Depósito', '1.000,00'],
    ]);
    expect(r.erros).toEqual([]);
    expect(r.linhas.map((l) => [l.natureza, l.valor.toFixed(2)])).toEqual([
      ['CREDITO', '500.00'],
      ['DEBITO', '1000.00'],
    ]);
  });

  it('referência é opcional — linhas sem referência não são erro', () => {
    const r = interpretarGrelha([cab, ['', '2026-09-15', 'Comissão', '500', 'C'], ['', '2026-09-15', 'Comissão', '500', 'C']]);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(2);
    expect(new Set(chaves(r.linhas)).size).toBe(2); // o ordinal separa-as
  });

  it('erros por linha, com número de linha do ficheiro, e todos de uma vez', () => {
    const r = interpretarGrelha([
      cab,
      ['A-1', '31/02/2026', 'x', '10', 'D'],
      ['A-2', '2026-09-01', '', '10', 'D'],
      ['A-3', '2026-09-01', 'y', '10,001', 'D'],
      ['A-4', '2026-09-01', 'z', '0', 'X'],
      ['A-1', '2026-09-01', 'w', '10', 'D'],
    ]);
    expect(r.erros.map((e) => e.linha)).toEqual([2, 3, 4, 5, 6]);
    expect(r.erros[0].mensagem).toMatch(/data/);
    expect(r.erros[1].mensagem).toMatch(/descrição/);
    expect(r.erros[2].mensagem).toMatch(/valor/);
    expect(r.erros[3].mensagem).toMatch(/valor|tipo/);
    expect(r.erros[4].mensagem).toMatch(/referência repetida/);
  });

  it('referências que só diferem na pontuação são a mesma referência (a chave compara normalizado)', () => {
    const r = interpretarGrelha([cab, ['TRF-458', '2026-09-01', 'a', '10', 'D'], ['trf.458', '2026-09-02', 'b', '20', 'D']]);
    expect(r.erros).toEqual([{ linha: 3, mensagem: 'referência repetida no ficheiro (trf.458)' }]);
  });

  it('acima do tecto de linhas, recusa o ficheiro inteiro', () => {
    const muitas = Array.from({ length: MAXIMO_LINHAS + 1 }, (_, i) => ['', '2026-09-01', `m${i}`, '1', 'D']);
    const r = interpretarGrelha([cab, ...muitas]);
    expect(r.linhas).toEqual([]);
    expect(r.erros[0].mensagem).toMatch(/mais de/);
  });

  it('cabeçalho sem as colunas obrigatórias é erro na linha 1', () => {
    const r = interpretarGrelha([['data', 'valor'], ['2026-09-01', '10']]);
    expect(r.linhas).toEqual([]);
    expect(r.erros[0]).toMatchObject({ linha: 1 });
    expect(r.erros[0].mensagem).toMatch(/descricao/);
  });

  it('ficheiro sem linhas de movimento é erro', () => {
    expect(interpretarGrelha([cab]).erros[0].mensagem).toMatch(/sem movimentos/i);
    expect(interpretarGrelha([]).erros).toHaveLength(1);
  });
});

describe('parserPara', () => {
  it('escolhe pela extensão, sem distinguir maiúsculas', () => {
    expect(parserPara('extracto.CSV').origem).toBe('CSV');
    expect(parserPara('extracto.xlsx').origem).toBe('XLSX');
  });
  it('formato desconhecido lança', () => {
    expect(() => parserPara('extracto.pdf')).toThrow(/formato/i);
  });
});
