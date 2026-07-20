// ============================================================
// Tipos actualizados — Módulo de Transportes e Logística
// Refatoração: entidade Atividade como unidade central
// ============================================================

// ------------------------------------------------------------
// Documento de Viatura
// ------------------------------------------------------------

export interface DocumentoViatura {
  id: string;
  viaturaId: string;
  tipo: 'livrete' | 'inspecao' | 'seguro' | 'licenca' | 'manifesto' | 'taxa_radio' | 'outro';
  numero: string;
  dataEmissao: Date;
  dataValidade: Date;
  entidadeEmissora: string;
  estado: 'valido' | 'proximo_expirar' | 'expirado';
  anexo?: string;
  observacoes?: string;
  prazoAlertaDias: number; // default: 30
}

// ------------------------------------------------------------
// Viatura (substitui Veiculo)
// ------------------------------------------------------------

export interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  tipoViatura: 'ligeiro_passageiros' | 'ligeiro_mercadorias' | 'pesado_mercadorias' | 'pesado_passageiros' | 'motociclo' | 'outro';
  capacidade: number;
  unidadeCapacidade: 'kg' | 'ton' | 'm3' | 'passageiros';
  localActividade: string;
  dataInicioActividade: Date;
  motoristaResponsavelId?: string;
  motoristaResponsavelNome?: string;
  estado: 'disponivel' | 'em_actividade' | 'em_manutencao' | 'inactiva' | 'abatida';
  observacoes?: string;
  documentos: DocumentoViatura[];
  criadoEm: Date;
  actualizadoEm: Date;
}

// ------------------------------------------------------------
// Manutenção de Viatura (expandida)
// ------------------------------------------------------------

export interface ManutencaoViatura {
  id: string;
  viaturaId: string;
  tipo: 'preventiva' | 'correctiva';
  data: Date;
  quilometragem?: number;
  criterio?: string;
  descricao: string;
  fornecedor?: string;
  custo?: number;
  pecasSubstituidas?: string;
  responsavel: string;
  proximaManutencaoPrevista?: {
    data?: Date;
    quilometragem?: number;
    criterio?: string;
  };
  criadoEm: Date;
}

// ------------------------------------------------------------
// Checklist de Viatura
// ------------------------------------------------------------

export interface ItemChecklist {
  id: string;
  nome: string;
  categoria: 'componente' | 'sobressalente' | 'acessorio';
  estado: 'ok' | 'avaria' | 'falta';
  observacoes?: string;
}

export interface ChecklistViatura {
  id: string;
  viaturaId: string;
  tipoViatura: string;
  itens: ItemChecklist[];
  responsavel: string;
  dataInspeccao: Date;
  observacoes?: string;
}

// ------------------------------------------------------------
// Documento de Motorista
// ------------------------------------------------------------

export interface DocumentoMotorista {
  id: string;
  motoristaId: string;
  tipo: 'carta_conducao' | 'bi' | 'outro';
  numero: string;
  dataEmissao: Date;
  dataValidade: Date;
  entidadeEmissora: string;
  estado: 'valido' | 'proximo_expirar' | 'expirado';
  anexo?: string;
  observacoes?: string;
}

// ------------------------------------------------------------
// Disponibilidade de Motorista
// ------------------------------------------------------------

export interface DisponibilidadeMotorista {
  disponivel: boolean;
  motivo?: 'ferias' | 'ausencia' | 'suspensao' | 'manual' | 'conflito_agenda';
  dataInicio?: Date;
  dataFim?: Date;
  fonte: 'sistema' | 'rh_api' | 'manual';
}

// ------------------------------------------------------------
// Motorista (actualizado — sem métricas de entregas)
// ------------------------------------------------------------

export interface Motorista {
  id: string;
  nomeCompleto: string;
  contacto: string;
  morada?: string;
  numeroBI?: string;
  numeroCarta: string;
  categoriaCarta: string[];
  dataEmissaoCarta: Date;
  validadeCarta: Date;
  localActividade?: string;
  estadoOperacional: 'activo' | 'inactivo' | 'suspenso';
  observacoes?: string;
  documentos: DocumentoMotorista[];
  disponibilidade: DisponibilidadeMotorista;
  criadoEm: Date;
  actualizadoEm: Date;
}

// ------------------------------------------------------------
// Evento de Atividade (histórico imutável)
// ------------------------------------------------------------

export interface EventoAtividade {
  id: string;
  data: Date;
  estadoAnterior?: string;
  estadoNovo: string;
  utilizador: string;
  descricao: string;
}

// ------------------------------------------------------------
// Atividade (entidade central)
// ------------------------------------------------------------

export interface Atividade {
  id: string;
  codigo: string; // gerado automaticamente: AT-YYYY-NNNN
  titulo: string;
  descricao?: string;
  tipoActividade: 'deslocacao' | 'missao_servico' | 'transporte_mercadorias' | 'transporte_pessoal' | 'manutencao_campo' | 'outro';
  localActividade: string;
  dataInicioPrevista: Date;
  dataConclusaoPrevista?: Date;
  motoristaResponsavelId?: string;
  motoristaResponsavelNome?: string;
  viaturaId?: string;
  viaturaMatricula?: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  estado: 'planeada' | 'em_curso' | 'suspensa' | 'concluida' | 'cancelada';
  observacoes?: string;
  anexos?: string[];
  historico: EventoAtividade[];
  criadoEm: Date;
  criadoPor: string;
}

// ============================================================
// Tipos existentes mantidos sem alterações
// (compatibilidade com páginas de rotas e combustível)
// ============================================================

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
