
export interface Veiculo {
  id: string;
  tenantId: string;
  matricula: string;
  marca: string;
  modelo: string;
  ano: number;
  cor?: string;
  tipo: 'carro' | 'caminhao' | 'moto' | 'van';
  capacidadeCarga: number;
  unidadeCapacidade: 'kg' | 'ton' | 'm3';
  consumoMedio: number;
  status: 'disponivel' | 'em_rota' | 'manutencao' | 'inativo';
  kmAtual: number;
  ultimaManutencao?: string;
  proximaManutencao?: string;
  seguro: {
    seguradora: string;
    numeroApolice: string;
    dataValidade: string;
    valorCobertura: number;
  };
  inspecao: {
    dataUltimaInspecao?: string;
    dataProximaInspecao: string;
    status: 'valida' | 'vencida' | 'proxima_vencer';
  };
  licenca: {
    numeroLicenca: string;
    dataValidade: string;
    status: 'valida' | 'vencida' | 'proxima_vencer';
  };
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Motorista {
  id: string;
  tenantId: string;
  nome: string;
  email?: string;
  telefone: string;
  nuit?: string;
  endereco?: string;
  dataNascimento: string;
  cartaConducao: {
    numero: string;
    categoria: string[];
    dataEmissao: string;
    dataValidade: string;
    status: 'valida' | 'vencida' | 'proxima_vencer';
  };
  status: 'ativo' | 'inativo' | 'ferias' | 'licenca';
  avaliacaoMedia: number;
  totalEntregas: number;
  entregasNoTempo: number;
  entregasAtrasadas: number;
  entregasFalhadas: number;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Rota {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  descricao?: string;
  veiculoId: string;
  motoristaId: string;
  dataInicio: string;
  dataFim?: string;
  status: 'planejada' | 'em_andamento' | 'concluida' | 'cancelada';
  pontosEntrega: PontoEntrega[];
  distanciaTotal: number;
  tempoEstimado: number;
  tempoReal?: number;
  custoEstimado: number;
  custoReal?: number;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface PontoEntrega {
  id: string;
  ordem: number;
  clienteId: string;
  clienteNome: string;
  endereco: string;
  cidade: string;
  coordenadas?: {
    latitude: number;
    longitude: number;
  };
  horaEstimada: string;
  horaChegada?: string;
  horaSaida?: string;
  status: 'pendente' | 'em_transito' | 'entregue' | 'falhada';
  entregaId: string;
  observacoes?: string;
}

export interface Entrega {
  id: string;
  tenantId: string;
  numero: string;
  vendaId?: string;
  clienteId: string;
  clienteNome: string;
  clienteTelefone: string;
  enderecoEntrega: string;
  cidade: string;
  rotaId?: string;
  veiculoId?: string;
  motoristaId?: string;
  dataAgendada: string;
  dataEntrega?: string;
  status: 'pendente' | 'agendada' | 'em_transito' | 'entregue' | 'falhada' | 'cancelada';
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente';
  itens: ItemEntrega[];
  pesoTotal: number;
  volumeTotal: number;
  valorTotal: number;
  taxaEntrega: number;
  comprovante?: {
    tipo: 'assinatura' | 'foto' | 'codigo';
    dados: string;
    dataHora: string;
    recebidoPor: string;
  };
  motivoFalha?: string;
  tentativasEntrega: number;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ItemEntrega {
  id: string;
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  peso: number;
  volume: number;
  valor: number;
}

export interface Manutencao {
  id: string;
  tenantId: string;
  veiculoId: string;
  tipo: 'preventiva' | 'corretiva' | 'inspecao' | 'revisao';
  descricao: string;
  dataAgendada: string;
  dataRealizacao?: string;
  status: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
  kmVeiculo: number;
  oficina?: string;
  responsavel?: string;
  servicos: ServicoManutencao[];
  custoTotal: number;
  proximaManutencao?: {
    tipo: string;
    kmEstimado: number;
    dataEstimada: string;
  };
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ServicoManutencao {
  id: string;
  descricao: string;
  tipo: 'troca_oleo' | 'troca_pneu' | 'alinhamento' | 'balanceamento' | 'freios' | 'suspensao' | 'eletrica' | 'outro';
  custo: number;
  pecasUtilizadas?: PecaManutencao[];
}

export interface PecaManutencao {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface Abastecimento {
  id: string;
  tenantId: string;
  veiculoId: string;
  motoristaId: string;
  data: string;
  kmVeiculo: number;
  tipoCombustivel: 'gasolina' | 'diesel' | 'etanol' | 'gnv';
  litros: number;
  valorLitro: number;
  valorTotal: number;
  posto?: string;
  notaFiscal?: string;
  kmPercorrido?: number;
  consumoMedio?: number;
  observacoes?: string;
  dataCriacao: string;
}

export interface RelatorioTransporte {
  periodo: {
    inicio: string;
    fim: string;
  };
  veiculos: {
    total: number;
    disponiveis: number;
    emRota: number;
    manutencao: number;
  };
  entregas: {
    total: number;
    entregues: number;
    pendentes: number;
    falhadas: number;
    taxaSucesso: number;
  };
  custos: {
    combustivel: number;
    manutencao: number;
    total: number;
  };
  desempenho: {
    kmPercorridos: number;
    horasOperacao: number;
    consumoMedioCombustivel: number;
    custoKm: number;
  };
}
