
export interface Fornecedor {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  tipo: 'pessoa_fisica' | 'pessoa_juridica';
  nuit: string;
  bi?: string;
  email: string;
  telefone: string;
  telefoneSec?: string;
  endereco: EnderecoFornecedor;
  enderecos?: EnderecoFornecedor[];
  dataCadastro: string;
  dataAtualizacao: string;
  status: 'ativo' | 'inativo' | 'suspenso';
  classificacao: 'preferencial' | 'regular' | 'novo';
  rating: number; // 1-5
  diasPagamento: number;
  formasPagamento: string[];
  condicoesComerciaisDesconto?: number;
  observacoes?: string;
  representante?: {
    nome: string;
    email: string;
    telefone: string;
  };
  tags?: string[];
}

export interface EnderecoFornecedor {
  id: string;
  tipo: 'sede' | 'entrega' | 'outro';
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  provincia: string;
  codigoPostal?: string;
  referencia?: string;
  principal: boolean;
}

export interface ContactoFornecedor {
  id: string;
  fornecedorId: string;
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  telefoneSec?: string;
  tipo: 'principal' | 'secundario' | 'tecnico' | 'financeiro';
  ativo: boolean;
  dataCriacao: string;
}

export interface ProdutoFornecedor {
  id: string;
  fornecedorId: string;
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
  precoUnitarioMT: number;
  quantidadeMinima: number;
  tempoEntregaDias: number;
  ativo: boolean;
  dataAtualizacao: string;
}

export interface OrcamentoFornecedor {
  id: string;
  fornecedorId: string;
  numero: string;
  dataOrcamento: string;
  dataValidade: string;
  itens: ItemOrcamento[];
  valorTotalMT: number;
  desconto?: number;
  status: 'pendente' | 'aceito' | 'rejeitado' | 'expirado';
  observacoes?: string;
}

export interface ItemOrcamento {
  id: string;
  produtoId: string;
  descricao: string;
  quantidade: number;
  precoUnitarioMT: number;
  subtotalMT: number;
}

export interface PedidoFornecedor {
  id: string;
  fornecedorId: string;
  numero: string;
  dataPedido: string;
  dataEntregaPrevista: string;
  dataEntregaReal?: string;
  itens: ItemPedido[];
  valorTotalMT: number;
  status: 'pendente' | 'confirmado' | 'enviado' | 'entregue' | 'cancelado';
  observacoes?: string;
}

export interface ItemPedido {
  id: string;
  produtoId: string;
  descricao: string;
  quantidade: number;
  precoUnitarioMT: number;
  subtotalMT: number;
  quantidadeRecebida?: number;
}

export interface PagamentoFornecedor {
  id: string;
  fornecedorId: string;
  pedidoId: string;
  numero: string;
  dataPagamento: string;
  valorMT: number;
  formaPagamento: string;
  referencia: string;
  status: 'pendente' | 'processando' | 'concluido' | 'cancelado';
  observacoes?: string;
}

export interface AvaliacaoFornecedor {
  id: string;
  fornecedorId: string;
  dataAvaliacao: string;
  qualidade: number; // 1-5
  prazo: number; // 1-5
  preco: number; // 1-5
  comunicacao: number; // 1-5
  observacoes?: string;
  usuario: string;
}

export interface DocumentoFornecedor {
  id: string;
  fornecedorId: string;
  tipo: 'contrato' | 'nuit' | 'certificacao' | 'outro';
  nome: string;
  dataUpload: string;
  dataValidade?: string;
  url: string;
  observacoes?: string;
}

export interface RelatorioFornecedor {
  periodo: {
    inicio: string;
    fim: string;
  };
  totalFornecedores: number;
  fornecedoresAtivos: number;
  fornecedoresInativos: number;
  fornecedoresNovos: number;
  totalCompras: number;
  valorTotalComprasMT: number;
  fornecedoresMaisCompras: FornecedorCompras[];
  distribuicaoPorClassificacao: DistribuicaoClassificacao[];
  distribuicaoPorRegiao: DistribuicaoRegiao[];
  ratingMedio: number;
}

export interface FornecedorCompras {
  fornecedorId: string;
  nome: string;
  totalCompras: number;
  valorTotalMT: number;
  numeroTransacoes: number;
  ultimaCompra: string;
}

export interface DistribuicaoClassificacao {
  classificacao: string;
  total: number;
  percentual: number;
}

export interface DistribuicaoRegiao {
  regiao: string;
  total: number;
  valorMT: number;
}

export interface DashboardFornecedores {
  totalFornecedores: number;
  fornecedoresAtivos: number;
  fornecedoresInativos: number;
  fornecedoresNovos: number;
  totalComprasMes: number;
  valorTotalComprasMesMT: number;
  pedidosPendentes: number;
  pagamentosPendentes: number;
  fornecedoresMaisCompras: FornecedorCompras[];
  ultimosPedidos: PedidoFornecedor[];
  distribuicaoPorClassificacao: DistribuicaoClassificacao[];
  distribuicaoPorRegiao: DistribuicaoRegiao[];
}
