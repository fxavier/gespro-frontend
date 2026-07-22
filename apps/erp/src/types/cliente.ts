
export interface Cliente {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  tipo: 'fisica' | 'juridica' | 'revendedor';
  nuit: string;
  bi?: string;
  email: string;
  telefone: string;
  telefoneSec?: string;
  endereco: EnderecoCliente;
  enderecos?: EnderecoCliente[];
  contactoEmergencia?: {
    nome: string;
    telefone: string;
    relacao: string;
  };
  dataCadastro: string;
  dataAtualizacao: string;
  status: 'ativo' | 'inativo' | 'suspenso';
  categoria: 'vip' | 'regular' | 'novo' | 'inativo';
  limiteCreditoMT: number;
  creditoUtilizadoMT: number;
  diasPagamento: number;
  observacoes?: string;
  representante?: {
    nome: string;
    email: string;
    telefone: string;
  };
  tags?: string[];
}

export interface EnderecoCliente {
  id: string;
  tipo: 'facturacao' | 'entrega' | 'outro';
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  provincia: string;
  codigoPostal?: string;
  referencia?: string;
  principal: boolean;
}

export interface ContactoCliente {
  id: string;
  clienteId: string;
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  telefoneSec?: string;
  tipo: 'principal' | 'secundario' | 'tecnico' | 'financeiro';
  ativo: boolean;
  dataCriacao: string;
}

export interface HistoricoTransacao {
  id: string;
  clienteId: string;
  tipo: 'venda' | 'devolucao' | 'pagamento' | 'ajuste' | 'nota_credito';
  referencia: string;
  descricao: string;
  valorMT: number;
  dataTransacao: string;
  status: 'concluido' | 'pendente' | 'cancelado';
  usuario: string;
}

export interface SegmentacaoCliente {
  id: string;
  clienteId: string;
  segmento: 'varejo' | 'grossista' | 'distribuidor' | 'corporativo' | 'governo';
  industria?: string;
  tamanhoEmpresa?: 'micro' | 'pequena' | 'media' | 'grande';
  potencialVendas: 'alto' | 'medio' | 'baixo';
  frequenciaCompra: 'diaria' | 'semanal' | 'mensal' | 'trimestral' | 'anual';
  ticketMedio: number;
  dataAtualizacao: string;
}

export interface RelatorioCliente {
  periodo: {
    inicio: string;
    fim: string;
  };
  totalClientes: number;
  clientesAtivos: number;
  clientesInativos: number;
  clientesNovos: number;
  faturamentoTotal: number;
  ticketMedio: number;
  clientesMaisVendas: ClienteVendas[];
  distribuicaoPorCategoria: DistribuicaoCategoria[];
  distribuicaoPorRegiao: DistribuicaoRegiao[];
  taxaRetencao: number;
  taxaChurn: number;
}

export interface ClienteVendas {
  clienteId: string;
  nome: string;
  totalVendas: number;
  numeroTransacoes: number;
  ultimaCompra: string;
}

export interface DistribuicaoCategoria {
  categoria: string;
  total: number;
  percentual: number;
}

export interface DistribuicaoRegiao {
  regiao: string;
  total: number;
  faturamento: number;
}

export interface DashboardClientes {
  totalClientes: number;
  clientesAtivos: number;
  clientesInativos: number;
  clientesNovos: number;
  faturamentoMes: number;
  ticketMedio: number;
  creditoTotalDisponivel: number;
  creditoTotalUtilizado: number;
  clientesMaisVendas: ClienteVendas[];
  ultimasTransacoes: HistoricoTransacao[];
  distribuicaoPorCategoria: DistribuicaoCategoria[];
  distribuicaoPorRegiao: DistribuicaoRegiao[];
}
