/**
 * Modelo do talão do POS (issue #127) — puro, testável, sem react.
 *
 * Talão NÃO fiscal: comprovativo da venda para o cliente. Reflecte a venda
 * gravada (nunca recalcula totais) e serializa dinheiro por `toString()`
 * (lossless). O único cálculo é `recebido = valor + troco`, em Decimal.
 */
import { Prisma } from '@prisma/client';
import type { DecimalLike } from '@/lib/reporting/dataset';

export interface EmitenteTalao {
  nome: string;
  nuit: string;
  endereco?: string | null;
  telefone?: string | null;
}

export interface VendaTalaoInput {
  numero: string;
  dataVenda: Date;
  subtotal: DecimalLike;
  ivaTotal: DecimalLike;
  total: DecimalLike;
  itens: {
    nomeProduto: string;
    quantidade: DecimalLike;
    precoUnitario: DecimalLike;
    total: DecimalLike;
  }[];
  pagamentos: { tipo: string; valor: DecimalLike; troco: DecimalLike | null }[];
}

export interface TalaoModel {
  emitente: EmitenteTalao;
  numero: string;
  data: Date;
  linhas: { descricao: string; quantidade: string; precoUnitario: string; total: string }[];
  subtotal: string;
  iva: string;
  total: string;
  pagamentos: { metodo: string; valor: string; recebido: string; troco: string | null }[];
  aviso: string;
}

const METODO_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  MPESA: 'M-Pesa',
  EMOLA: 'e-Mola',
  TRANSFERENCIA: 'Transferência',
  CREDITO: 'Crédito',
};

export function construirTalao(venda: VendaTalaoInput, emitente: EmitenteTalao): TalaoModel {
  return {
    emitente,
    numero: venda.numero,
    data: venda.dataVenda,
    linhas: venda.itens.map((i) => ({
      descricao: i.nomeProduto,
      quantidade: i.quantidade.toString(),
      precoUnitario: i.precoUnitario.toString(),
      total: i.total.toString(),
    })),
    subtotal: venda.subtotal.toString(),
    iva: venda.ivaTotal.toString(),
    total: venda.total.toString(),
    pagamentos: venda.pagamentos.map((p) => {
      const troco = p.troco == null ? null : p.troco.toString();
      return {
        metodo: METODO_LABELS[p.tipo] ?? p.tipo,
        valor: p.valor.toString(),
        recebido: new Prisma.Decimal(p.valor.toString()).plus(troco ?? '0').toString(),
        troco,
      };
    }),
    aviso: 'Talão de venda — não serve de factura.',
  };
}
