
export interface Fatura {
  id: string;
  tenantId: string;
  numeroFatura: string;
  serie: string;
  clienteId: string;
  vendaId?: string;
  itens: ItemFatura[];
  subtotal: number;
  descontoTotal: number;
  ivaTotal: number;
  total: number;
  statusFatura: 'emitida' | 'paga' | 'vencida' | 'cancelada';
  dataEmissao: string;
  dataVencimento: string;
  dataPagamento?: string;
  observacoes?: string;
  qrCode: string;
  hashValidacao: string;
  caminhoArquivoPdf?: string;
}

export interface ItemFatura {
  id: string;
  produtoId: string;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  taxaIva: number;
  subtotal: number;
  ivaItem: number;
  total: number;
}

export interface NotaCredito {
  id: string;
  tenantId: string;
  numeroNota: string;
  faturaOriginalId: string;
  motivo: string;
  itens: ItemFatura[];
  subtotal: number;
  ivaTotal: number;
  total: number;
  dataEmissao: string;
  observacoes?: string;
}
