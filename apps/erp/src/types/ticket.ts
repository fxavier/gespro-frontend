
export interface Ticket {
  id: string;
  tenantId: string;
  numero: string;
  titulo: string;
  descricao: string;
  tipo: 'incidente' | 'requisicao' | 'problema' | 'mudanca' | 'consulta';
  categoria: string;
  subcategoria?: string;
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente';
  status: 'aberto' | 'em_progresso' | 'aguardando_cliente' | 'aguardando_terceiro' | 'resolvido' | 'fechado' | 'cancelado';
  solicitanteId: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  solicitanteTelefone?: string;
  atribuidoParaId?: string;
  atribuidoParaNome?: string;
  equipeId?: string;
  equipeNome?: string;
  sla: {
    tempoResposta: number;
    tempoResolucao: number;
    dataLimiteResposta: string;
    dataLimiteResolucao: string;
    emAtraso: boolean;
  };
  tempos: {
    dataAbertura: string;
    dataPrimeiraResposta?: string;
    dataResolucao?: string;
    dataFechamento?: string;
    tempoResposta?: number;
    tempoResolucao?: number;
    tempoTotal?: number;
  };
  tags?: string[];
  anexos?: AnexoTicket[];
  atividades?: AtividadeTicket[];
  avaliacao?: AvaliacaoTicket;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface AnexoTicket {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  url: string;
  uploadPorId: string;
  uploadPorNome: string;
  dataUpload: string;
}

export interface AtividadeTicket {
  id: string;
  tipo: 'comentario' | 'mudanca_status' | 'atribuicao' | 'anexo' | 'sistema';
  descricao: string;
  detalhes?: string;
  autorId: string;
  autorNome: string;
  visibilidade: 'publica' | 'interna';
  dataCriacao: string;
}

export interface AvaliacaoTicket {
  nota: 1 | 2 | 3 | 4 | 5;
  comentario?: string;
  dataAvaliacao: string;
  avaliadoPorId: string;
  avaliadoPorNome: string;
}

export interface CategoriaTicket {
  id: string;
  tenantId: string;
  nome: string;
  descricao?: string;
  icone?: string;
  cor?: string;
  subcategorias?: string[];
  sla: {
    tempoResposta: number;
    tempoResolucao: number;
  };
  ativa: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface EquipeSuporte {
  id: string;
  tenantId: string;
  nome: string;
  descricao?: string;
  liderIds: string[];
  membros: MembroEquipeSuporte[];
  categorias: string[];
  horarioAtendimento: {
    inicio: string;
    fim: string;
    diasSemana: number[];
  };
  status: 'ativa' | 'inativa';
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface MembroEquipeSuporte {
  id: string;
  usuarioId: string;
  nome: string;
  email: string;
  cargo: string;
  papel: 'lider' | 'agente' | 'supervisor';
  especialidades: string[];
  ticketsAtivos: number;
  ticketsResolvidos: number;
  avaliacaoMedia: number;
  status: 'disponivel' | 'ocupado' | 'ausente' | 'offline';
  dataEntrada: string;
}

export interface BaseConhecimento {
  id: string;
  tenantId: string;
  titulo: string;
  conteudo: string;
  resumo?: string;
  categoria: string;
  tags?: string[];
  anexos?: AnexoTicket[];
  visibilidade: 'publica' | 'interna';
  util: number;
  naoUtil: number;
  visualizacoes: number;
  autorId: string;
  autorNome: string;
  status: 'rascunho' | 'publicado' | 'arquivado';
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface RelatorioTickets {
  periodo: {
    inicio: string;
    fim: string;
  };
  tickets: {
    total: number;
    abertos: number;
    emProgresso: number;
    resolvidos: number;
    fechados: number;
    cancelados: number;
  };
  porPrioridade: {
    baixa: number;
    normal: number;
    alta: number;
    urgente: number;
  };
  porCategoria: Record<string, number>;
  porTipo: Record<string, number>;
  sla: {
    dentroSLA: number;
    foraSLA: number;
    percentualCumprimento: number;
  };
  tempos: {
    tempoMedioResposta: number;
    tempoMedioResolucao: number;
    tempoMedioFechamento: number;
  };
  satisfacao: {
    avaliacoes: number;
    notaMedia: number;
    distribuicao: Record<number, number>;
  };
  equipe: {
    totalAgentes: number;
    ticketsPorAgente: Record<string, number>;
    agentesMaisProdutivos: Array<{
      id: string;
      nome: string;
      ticketsResolvidos: number;
      avaliacaoMedia: number;
    }>;
  };
}

export interface ConfiguracaoTickets {
  tenantId: string;
  numeracaoAutomatica: boolean;
  prefixoNumero: string;
  atribuicaoAutomatica: boolean;
  notificacoes: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  slasPadrao: {
    baixa: { resposta: number; resolucao: number };
    normal: { resposta: number; resolucao: number };
    alta: { resposta: number; resolucao: number };
    urgente: { resposta: number; resolucao: number };
  };
  camposObrigatorios: string[];
  permitirAutoAtribuicao: boolean;
  permitirReabertura: boolean;
  diasReabertura: number;
  avaliacaoObrigatoria: boolean;
}
