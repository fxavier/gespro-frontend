
export interface Produto {
  id: string;
  tenantId: string;
  codigo: string;
  codigoBarras?: string;
  nome: string;
  descricao?: string;
  categoria: string;
  marca?: string;
  unidadeMedida: string;
  precoVenda: number;
  precoCompra: number;
  margemLucro: number;
  taxaIva: number;
  stockMinimo: number;
  stockMaximo: number;
  stockAtual: number;
  localizacao?: string;
  dataValidade?: string;
  ativo: boolean;
  variantes?: VarianteProduto[];
  imagens?: string[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface VarianteProduto {
  id: string;
  nome: string;
  valor: string;
  precoAdicional: number;
  stockAtual: number;
}

export interface Categoria {
  id: string;
  tenantId: string;
  nome: string;
  descricao?: string;
  cor: string;
  icone?: string;
  ativo: boolean;
}

export interface MovimentacaoStock {
  id: string;
  tenantId: string;
  produtoId: string;
  tipo: 'entrada' | 'saida' | 'ajuste' | 'transferencia';
  quantidade: number;
  quantidadeAnterior: number;
  quantidadeNova: number;
  motivo: string;
  observacoes?: string;
  usuarioId: string;
  dataMovimentacao: string;
  documentoReferencia?: string;
}
