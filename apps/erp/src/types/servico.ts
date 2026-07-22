
export interface Servico {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  descricao?: string;
  categoria: string;
  subcategoria?: string;
  preco: number;
  precoMinimo?: number;
  precoMaximo?: number;
  duracaoEstimada: number; // em minutos
  unidadeMedida: string;
  taxaIva: number;
  ativo: boolean;
  observacoes?: string;
  
  // Detalhes do Serviço
  tipoServico: 'instalacao' | 'manutencao' | 'reparacao' | 'consultoria' | 'limpeza' | 'transporte' | 'outro';
  incluiMaterial: boolean;
  materialIncluido?: string;
  requerAgendamento: boolean;
  requerTecnico: boolean;
  nivelTecnicoRequerido?: 'basico' | 'intermediario' | 'avancado';
  
  // Disponibilidade
  disponivel: boolean;
  diasDisponibilidade: string[]; // ['segunda', 'terca', ...]
  horaInicio?: string;
  horaFim?: string;
  
  // Estatísticas
  totalVendas: number;
  faturamentoTotal: number;
  ultimaVenda?: string;
  avaliacaoMedia?: number;
  numeroAvaliacoes?: number;
  
  // Imagem/Foto
  imagem?: string;
  
  // Metadados
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface CategoriaServico {
  id: string;
  tenantId: string;
  nome: string;
  descricao?: string;
  cor: string;
  icone?: string;
  ativo: boolean;
  ordem?: number;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ServicoVenda {
  id: string;
  servicoId: string;
  vendaId: string;
  servicoNome: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  taxaIva: number;
  subtotal: number;
  ivaItem: number;
  total: number;
  observacoes?: string;
  dataCriacao: string;
}

export interface AgendamentoServico {
  id: string;
  tenantId: string;
  codigo: string;
  servicoId: string;
  servicoNome: string;
  clienteId: string;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone: string;
  
  // Agendamento
  dataAgendamento: string;
  horaInicio: string;
  horaFim: string;
  duracaoEstimada: number;
  
  // Local
  local: string;
  endereco: string;
  cidade: string;
  provincia: string;
  
  // Técnico
  tecnicoId?: string;
  tecnicoNome?: string;
  
  // Status
  status: 'pendente' | 'confirmado' | 'em_andamento' | 'concluido' | 'cancelado' | 'nao_compareceu';
  
  // Valores
  precoServico: number;
  desconto?: number;
  taxaIva: number;
  total: number;
  
  // Observações
  observacoes?: string;
  notasConclusao?: string;
  
  // Metadados
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface TecnicoServico {
  id: string;
  tenantId: string;
  colaboradorId: string;
  nome: string;
  email: string;
  telefone: string;
  especialidades: string[];
  nivelTecnico: 'basico' | 'intermediario' | 'avancado';
  disponivel: boolean;
  agendamentosAtivos: number;
  avaliacaoMedia?: number;
  numeroAvaliacoes?: number;
  custoHora: number;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface AvaliacaoServico {
  id: string;
  tenantId: string;
  agendamentoId: string;
  servicoId: string;
  clienteId: string;
  clienteNome: string;
  nota: number; // 1-5
  comentario?: string;
  aspectosPositivos?: string[];
  aspectosNegativos?: string[];
  recomendaria: boolean;
  dataCriacao: string;
}

export interface RelatorioServico {
  id: string;
  tenantId: string;
  agendamentoId: string;
  servicoId: string;
  tecnicoId: string;
  clienteId: string;
  
  // Informações do Serviço
  dataServico: string;
  horaInicio: string;
  horaFim: string;
  duracaoReal: number;
  
  // Descrição do Trabalho
  descricaoTrabalho: string;
  problemasEncontrados?: string;
  solucaoAplicada?: string;
  
  // Materiais Utilizados
  materiaisUtilizados: MaterialUtilizado[];
  
  // Observações
  observacoes?: string;
  
  // Assinatura
  assinadoPorCliente: boolean;
  dataAssinatura?: string;
  
  // Metadados
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface MaterialUtilizado {
  id: string;
  nome: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
  custoTotal: number;
}

export interface PacoteServico {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  descricao?: string;
  servicos: ServicoNoPacote[];
  precoTotal: number;
  precoComDesconto?: number;
  percentualDesconto?: number;
  ativo: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ServicoNoPacote {
  servicoId: string;
  servicoNome: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
}

export interface ContratoServico {
  id: string;
  tenantId: string;
  codigo: string;
  clienteId: string;
  clienteNome: string;
  servicos: string[]; // IDs dos serviços
  dataInicio: string;
  dataFim: string;
  renovacaoAutomatica: boolean;
  periodicidade: 'mensal' | 'trimestral' | 'semestral' | 'anual';
  valorMensal: number;
  status: 'ativo' | 'pausado' | 'encerrado' | 'cancelado';
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface DashboardServicos {
  totalServicos: number;
  servicosAtivos: number;
  servicosInativos: number;
  
  // Agendamentos
  agendamentosHoje: number;
  agendamentosProximos7Dias: number;
  agendamentosPendentes: number;
  agendamentosConfirmados: number;
  
  // Faturamento
  faturamentoMesAtual: number;
  faturamentoMesAnterior: number;
  faturamentoAnoAtual: number;
  faturamentoMedio: number;
  
  // Desempenho
  taxaConclusao: number;
  taxaCancelamento: number;
  avaliacaoMedia: number;
  
  // Técnicos
  totalTecnicos: number;
  tecnicosDisponiveis: number;
  
  // Top Serviços
  topServicosVendas: ServicoTop[];
  topServicosFaturamento: ServicoTop[];
  
  // Categorias
  distribuicaoCategoria: CategoriaDistribuicao[];
}

export interface ServicoTop {
  id: string;
  nome: string;
  vendas: number;
  faturamento: number;
  avaliacaoMedia?: number;
}

export interface CategoriaDistribuicao {
  categoria: string;
  total: number;
  percentual: number;
  faturamento: number;
}
