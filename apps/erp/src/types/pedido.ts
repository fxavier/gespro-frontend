export type OrigemPedido = 'loja' | 'pos' | 'ecommerce' | 'manual';
export type EstadoPedido = 'pendente' | 'confirmado' | 'faturado' | 'entregue' | 'cancelado';

export interface ItemPedido {
  id: string;
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  total: number;
  disponibilidadeStock?: boolean;
  stockAtual?: number;
}

export interface Pedido {
  id: string;
  numero: string;
  data: Date;
  origem: OrigemPedido;
  estado: EstadoPedido;
  clienteId: string;
  clienteNome: string;
  vendedorId?: string;
  vendedorNome?: string;
  comissaoPercentual?: number;
  comissaoValor?: number;
  itens: ItemPedido[];
  subtotal: number;
  desconto: number;
  iva: number;
  total: number;
  observacoes?: string;
  lojaId?: string;
  lojaNome?: string;
  faturaId?: string;
  entregaId?: string;
  criadoPor: string;
  atualizadoPor?: string;
  criadoEm: Date;
  atualizadoEm?: Date;
}

export interface ValidacaoStock {
  produtoId: string;
  quantidadeSolicitada: number;
  quantidadeDisponivel: number;
  disponivel: boolean;
  mensagem?: string;
}

export interface ComissaoVendedor {
  vendedorId: string;
  vendedorNome: string;
  percentualBase: number;
  percentualAplicado: number;
  valorBase: number;
  valorComissao: number;
  pedidoId: string;
  pedidoNumero: string;
  data: Date;
  pago: boolean;
}