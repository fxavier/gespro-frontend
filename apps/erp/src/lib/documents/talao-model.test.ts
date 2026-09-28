import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { construirTalao, type TalaoModel } from '@/lib/documents/talao-model';

// Oráculo da issue #127 — talão do POS. O modelo REFLECTE a venda gravada:
// nunca recalcula totais, serializa dinheiro por toString() (lossless) e
// avisa que o talão não é documento fiscal.

const emitente = {
  nome: 'Empresa Demo, Lda',
  nuit: '400123456',
  endereco: 'Av. Julius Nyerere, 100',
  telefone: '+258 84 000 0000',
};

type VendaTalao = Parameters<typeof construirTalao>[0];

function vendaBase(overrides: Partial<VendaTalao> = {}): VendaTalao {
  return {
    numero: 'VD/2026/000017',
    dataVenda: new Date('2026-09-28T10:15:00Z'),
    subtotal: '150',
    ivaTotal: '24',
    total: '174',
    itens: [
      { nomeProduto: 'Arroz 5kg', quantidade: '2', precoUnitario: '50', total: '100' },
      { nomeProduto: 'Óleo 1L', quantidade: '1', precoUnitario: '50', total: '50' },
    ],
    pagamentos: [{ tipo: 'CARTAO', valor: '174', troco: null }],
    ...overrides,
  };
}

describe('construirTalao', () => {
  it('reflecte os totais gravados e nunca os recalcula a partir das linhas', () => {
    // Totais deliberadamente diferentes da soma das linhas (100 + 50 = 150).
    const talao: TalaoModel = construirTalao(
      vendaBase({ subtotal: '999.5', ivaTotal: '7.25', total: '1234.5' }),
      emitente,
    );

    expect(talao.subtotal).toBe('999.5');
    expect(talao.iva).toBe('7.25');
    expect(talao.total).toBe('1234.5');
    expect(talao.numero).toBe('VD/2026/000017');
    expect(talao.data).toEqual(new Date('2026-09-28T10:15:00Z'));
    expect(talao.emitente).toEqual(emitente);
  });

  it('aceita Prisma.Decimal e string e serializa dinheiro por toString()', () => {
    const talao = construirTalao(
      vendaBase({
        subtotal: new Prisma.Decimal('150.75'),
        ivaTotal: new Prisma.Decimal('24.12'),
        total: new Prisma.Decimal('174.87'),
        itens: [
          {
            nomeProduto: 'Açúcar',
            quantidade: new Prisma.Decimal('1.5'),
            precoUnitario: new Prisma.Decimal('100.5'),
            total: new Prisma.Decimal('150.75'),
          },
        ],
        pagamentos: [{ tipo: 'MPESA', valor: new Prisma.Decimal('174.87'), troco: null }],
      }),
      emitente,
    );

    expect(talao.subtotal).toBe('150.75');
    expect(talao.iva).toBe('24.12');
    expect(talao.total).toBe('174.87');
    expect(talao.linhas[0]).toEqual({
      descricao: 'Açúcar',
      quantidade: '1.5',
      precoUnitario: '100.5',
      total: '150.75',
    });
    expect(talao.pagamentos[0]?.valor).toBe('174.87');
    for (const v of [talao.subtotal, talao.iva, talao.total]) {
      expect(typeof v).toBe('string');
    }
  });

  it('mantém a ordem das linhas e usa o nome do produto como descrição', () => {
    const talao = construirTalao(vendaBase(), emitente);

    expect(talao.linhas).toEqual([
      { descricao: 'Arroz 5kg', quantidade: '2', precoUnitario: '50', total: '100' },
      { descricao: 'Óleo 1L', quantidade: '1', precoUnitario: '50', total: '50' },
    ]);
  });

  it('pagamento em dinheiro com troco: recebido = valor + troco', () => {
    const talao = construirTalao(
      vendaBase({ pagamentos: [{ tipo: 'DINHEIRO', valor: '100', troco: '20' }] }),
      emitente,
    );

    expect(talao.pagamentos).toEqual([
      { metodo: 'Dinheiro', valor: '100', recebido: '120', troco: '20' },
    ]);
  });

  it('pagamento sem troco: recebido = valor e troco null', () => {
    const talao = construirTalao(
      vendaBase({ pagamentos: [{ tipo: 'DINHEIRO', valor: '174', troco: null }] }),
      emitente,
    );

    expect(talao.pagamentos[0]).toEqual({
      metodo: 'Dinheiro',
      valor: '174',
      recebido: '174',
      troco: null,
    });
  });

  it('soma do recebido é exacta em Decimal (0.1 + 0.2 = 0.3)', () => {
    const talao = construirTalao(
      vendaBase({
        pagamentos: [{ tipo: 'DINHEIRO', valor: new Prisma.Decimal('0.1'), troco: '0.2' }],
      }),
      emitente,
    );

    expect(talao.pagamentos[0]?.recebido).toBe('0.3');
    expect(talao.pagamentos[0]?.troco).toBe('0.2');
  });

  it('traduz o método de pagamento para PT e deixa passar códigos desconhecidos', () => {
    const tipos = ['DINHEIRO', 'CARTAO', 'MPESA', 'EMOLA', 'TRANSFERENCIA', 'CREDITO', 'CHEQUE_XPTO'];
    const talao = construirTalao(
      vendaBase({ pagamentos: tipos.map((tipo) => ({ tipo, valor: '1', troco: null })) }),
      emitente,
    );

    expect(talao.pagamentos.map((p) => p.metodo)).toEqual([
      'Dinheiro',
      'Cartão',
      'M-Pesa',
      'e-Mola',
      'Transferência',
      'Crédito',
      'CHEQUE_XPTO',
    ]);
  });

  it('avisa que o talão não serve de factura', () => {
    const talao = construirTalao(vendaBase(), emitente);

    expect(talao.aviso.toLowerCase()).toContain('não serve de factura');
  });
});
