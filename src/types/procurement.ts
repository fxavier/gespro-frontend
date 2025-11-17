
export interface RequisicaoCompra {
  id: string;
  tenantId: string;
  numero: string;
  data: string;
  solicitanteId: string;
  solicitanteNome: string;
  departamento: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  status: 'rascunho' | 'pendente' | 'em_aprovacao' | 'aprovada' | 'rejeitada' | 'cancelada' | 'convertida';
  itens: ItemRequisicao[];
  justificativa: string;
  observacoes?: string;
  valorTotal: number;
  dataEntregaDesejada?: string;
  centroCustoId?: string;
  aprovacoes: AprovacaoWorkflow[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ItemRequisicao {
  id: string;
  produtoId?: string;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  precoEstimado: number;
  subtotal: number;
  observacoes?: string;
}

export interface Cotacao {
  id: string;
  tenantId: string;
  numero: string;
  data: string;
  requisicaoCompraId?: string;
  status: 'rascunho' | 'enviada' | 'respondida' | 'vencida' | 'cancelada';
  dataValidade: string;
  fornecedores: CotacaoFornecedor[];
  itens: ItemCotacao[];
  observacoes?: string;
  vencedorId?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface CotacaoFornecedor {
  fornecedorId: string;
  fornecedorNome: string;
  dataEnvio?: string;
  dataResposta?: string;
  status: 'pendente' | 'respondida' | 'recusada';
  valorTotal?: number;
  prazoEntrega?: number;
  condicoesPagamento?: string;
  observacoes?: string;
}

export interface ItemCotacao {
  id: string;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  especificacoes?: string;
  respostas: RespostaFornecedor[];
}

export interface RespostaFornecedor {
  fornecedorId: string;
  precoUnitario: number;
  subtotal: number;
  prazoEntrega: number;
  marca?: string;
  observacoes?: string;
}

export interface PedidoCompra {
  id: string;
  tenantId: string;
  numero: string;
  data: string;
  requisicaoCompraId?: string;
  cotacaoId?: string;
  fornecedorId: string;
  fornecedorNome: string;
  status: 'rascunho' | 'enviado' | 'confirmado' | 'em_transito' | 'recebido_parcial' | 'recebido_total' | 'cancelado';
  itens: ItemPedidoCompra[];
  valorSubtotal: number;
  valorDesconto: number;
  valorIva: number;
  valorTotal: number;
  condicoesPagamento: string;
  prazoEntrega: number;
  dataEntregaPrevista: string;
  dataEntregaReal?: string;
  enderecoEntrega: string;
  observacoes?: string;
  centroCustoId?: string;
  aprovacoes: AprovacaoWorkflow[];
  recebimentos: RecebimentoCompra[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ItemPedidoCompra {
  id: string;
  produtoId?: string;
  descricao: string;
  quantidade: number;
  quantidadeRecebida: number;
  unidadeMedida: string;
  precoUnitario: number;
  desconto: number;
  taxaIva: number;
  subtotal: number;
  observacoes?: string;
}

export interface RecebimentoCompra {
  id: string;
  pedidoCompraId: string;
  data: string;
  numeroDocumento?: string;
  responsavelId: string;
  responsavelNome: string;
  itens: ItemRecebimento[];
  observacoes?: string;
  status: 'completo' | 'parcial' | 'com_divergencia';
}

export interface ItemRecebimento {
  itemPedidoId: string;
  quantidadeRecebida: number;
  quantidadeAceita: number;
  quantidadeRejeitada: number;
  motivoRejeicao?: string;
  observacoes?: string;
}

export interface AprovacaoWorkflow {
  id: string;
  nivel: number;
  aprovadorId: string;
  aprovadorNome: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  data?: string;
  observacoes?: string;
}

export interface ConfiguracaoWorkflow {
  id: string;
  tenantId: string;
  nome: string;
  tipo: 'requisicao_compra' | 'pedido_compra';
  ativo: boolean;
  niveis: NivelAprovacao[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface NivelAprovacao {
  nivel: number;
  nome: string;
  valorMinimo: number;
  valorMaximo: number;
  aprovadores: AprovadorNivel[];
  tipoAprovacao: 'qualquer_um' | 'todos' | 'maioria';
}

export interface AprovadorNivel {
  usuarioId: string;
  usuarioNome: string;
  email: string;
}

export interface Fornecedor {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  nuit: string;
  email: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  provincia?: string;
  categoria: string;
  status: 'ativo' | 'inativo' | 'suspenso';
  condicoesPagamento?: string;
  prazoMedioPagamento: number;
  limiteCredito?: number;
  saldoDevedor: number;
  totalCompras: number;
  ultimaCompra?: string;
  avaliacaoQualidade?: number;
  observacoes?: string;
  contactos: ContactoFornecedor[];
  documentos: DocumentoFornecedor[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ContactoFornecedor {
  id: string;
  nome: string;
  cargo?: string;
  email?: string;
  telefone?: string;
  principal: boolean;
}

export interface DocumentoFornecedor {
  id: string;
  tipo: string;
  nome: string;
  url: string;
  dataUpload: string;
}
