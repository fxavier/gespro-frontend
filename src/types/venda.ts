
export interface Venda {
  id: string;
  tenantId: string;
  numeroVenda: string;
  clienteId?: string;
  vendedorId: string;
  itens: ItemVenda[];
  subtotal: number;
  descontoTotal: number;
  ivaTotal: number;
  total: number;
  metodoPagamento: MetodoPagamento[];
  statusVenda: 'pendente' | 'paga' | 'cancelada' | 'devolvida';
  observacoes?: string;
  dataVenda: string;
  faturaEmitida: boolean;
  numeroFatura?: string;
}

export interface ItemVenda {
  id: string;
  produtoId: string;
  nomeProduto: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  taxaIva: number;
  subtotal: number;
  ivaItem: number;
  total: number;
  varianteId?: string;
}

export interface MetodoPagamento {
  tipo: 'dinheiro' | 'cartao' | 'transferencia' | 'mpesa' | 'emola';
  valor: number;
  referencia?: string;
  troco?: number;
}

export interface Cliente {
  id: string;
  tenantId: string;
  nome: string;
  email?: string;
  telefone?: string;
  nuit?: string;
  endereco?: string;
  cidade?: string;
  provincia?: string;
  tipo: 'individual' | 'empresarial';
  ativo: boolean;
  dataCriacao: string;
  ultimaCompra?: string;
  totalCompras: number;
}
