import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { serializarDecimais } from '../serializar';

describe('serializarDecimais', () => {
  it('converte Decimal em string sem perder cêntimos', () => {
    expect(serializarDecimais(new Prisma.Decimal('1234.56'))).toBe('1234.56');
    expect(serializarDecimais(new Prisma.Decimal('0.1').plus('0.2'))).toBe('0.3');
  });

  // `toString()` deixa cair zeros à direita (115.00 → «115.5» para 115.50).
  // É a convenção já usada em todo o SC→CC; o valor não se perde, só a escala,
  // e quem mostra o número passa pelo formatMZN.
  it('desce por objectos e arrays aninhados — o caso da factura', () => {
    const fatura = {
      id: 'f1',
      total: new Prisma.Decimal('115.50'),
      linhas: [
        { descricao: 'A', valor: new Prisma.Decimal('100.25') },
        { descricao: 'B', valor: new Prisma.Decimal('15.25') },
      ],
      serieDocumento: { prefixo: 'FAT', proximoNumero: 2 },
    };

    expect(serializarDecimais(fatura)).toEqual({
      id: 'f1',
      total: '115.5',
      linhas: [
        { descricao: 'A', valor: '100.25' },
        { descricao: 'B', valor: '15.25' },
      ],
      serieDocumento: { prefixo: 'FAT', proximoNumero: 2 },
    });
  });

  it('deixa em paz o que não é Decimal', () => {
    const data = new Date('2026-07-24T13:01:00.000Z');
    const entrada = { data, nulo: null, indefinido: undefined, n: 7, b: true, s: 'x' };
    const saida = serializarDecimais(entrada);
    expect(saida.data).toBe(data);
    expect(saida).toEqual(entrada);
  });

  it('não desmonta instâncias de classes que não conhece', () => {
    class Coisa {
      constructor(public valor = 1) {}
    }
    const c = new Coisa();
    expect(serializarDecimais({ c }).c).toBe(c);
  });
});
