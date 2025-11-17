
export interface Projeto {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  descricao?: string;
  clienteId?: string;
  clienteNome?: string;
  tipo: 'interno' | 'externo' | 'pesquisa' | 'desenvolvimento';
  status: 'planejamento' | 'em_andamento' | 'pausado' | 'concluido' | 'cancelado' | 'arquivado';
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  dataInicio: string;
  dataFimPrevista: string;
  dataFimReal?: string;
  progresso: number;
  orcamento: {
    planejado: number;
    utilizado: number;
    restante: number;
  };
  horas: {
    estimadas: number;
    trabalhadas: number;
    restantes: number;
  };
  gerenteId: string;
  gerenteNome: string;
  equipeIds: string[];
  tags?: string[];
  cor?: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Tarefa {
  id: string;
  tenantId: string;
  projetoId: string;
  projetoNome: string;
  codigo: string;
  titulo: string;
  descricao?: string;
  tipo: 'tarefa' | 'bug' | 'melhoria' | 'documentacao' | 'teste';
  status: 'a_fazer' | 'em_progresso' | 'em_revisao' | 'bloqueada' | 'concluida' | 'cancelada';
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  dataInicio?: string;
  dataFimPrevista: string;
  dataFimReal?: string;
  horasEstimadas: number;
  horasTrabalhadas: number;
  progresso: number;
  responsavelId?: string;
  responsavelNome?: string;
  criadoPorId: string;
  criadoPorNome: string;
  tarefaPaiId?: string;
  subtarefas?: string[];
  dependencias?: string[];
  tags?: string[];
  anexos?: AnexoTarefa[];
  comentarios?: ComentarioTarefa[];
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface AnexoTarefa {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  url: string;
  uploadPorId: string;
  uploadPorNome: string;
  dataUpload: string;
}

export interface ComentarioTarefa {
  id: string;
  texto: string;
  autorId: string;
  autorNome: string;
  dataCriacao: string;
  editado?: boolean;
  dataEdicao?: string;
}

export interface Equipe {
  id: string;
  tenantId: string;
  nome: string;
  descricao?: string;
  liderIds: string[];
  membros: MembroEquipe[];
  projetosAtivos: number;
  tarefasAbertas: number;
  status: 'ativa' | 'inativa';
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface MembroEquipe {
  id: string;
  usuarioId: string;
  nome: string;
  email: string;
  cargo: string;
  papel: 'gerente' | 'lider' | 'desenvolvedor' | 'designer' | 'analista' | 'tester' | 'outro';
  custoHora: number;
  horasSemanais: number;
  dataEntrada: string;
  dataSaida?: string;
  status: 'ativo' | 'inativo' | 'ferias' | 'licenca';
}

export interface RegistroTempo {
  id: string;
  tenantId: string;
  projetoId: string;
  projetoNome: string;
  tarefaId?: string;
  tarefaTitulo?: string;
  usuarioId: string;
  usuarioNome: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  duracaoHoras: number;
  descricao?: string;
  tipo: 'desenvolvimento' | 'reuniao' | 'documentacao' | 'teste' | 'suporte' | 'outro';
  faturavel: boolean;
  aprovado: boolean;
  aprovadoPorId?: string;
  aprovadoPorNome?: string;
  dataAprovacao?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Milestone {
  id: string;
  projetoId: string;
  nome: string;
  descricao?: string;
  dataPrevista: string;
  dataReal?: string;
  status: 'pendente' | 'em_andamento' | 'concluido' | 'atrasado';
  tarefasIds: string[];
  progresso: number;
}

export interface OrcamentoProjeto {
  id: string;
  tenantId: string;
  projetoId: string;
  projetoNome: string;
  versao: number;
  status: 'rascunho' | 'aprovado' | 'rejeitado' | 'revisao';
  categorias: CategoriaOrcamento[];
  totalPlanejado: number;
  totalUtilizado: number;
  totalRestante: number;
  aprovadoPorId?: string;
  aprovadoPorNome?: string;
  dataAprovacao?: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface CategoriaOrcamento {
  id: string;
  nome: string;
  tipo: 'mao_obra' | 'material' | 'equipamento' | 'servico' | 'outro';
  valorPlanejado: number;
  valorUtilizado: number;
  valorRestante: number;
  itens: ItemOrcamento[];
}

export interface ItemOrcamento {
  id: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  fornecedor?: string;
  dataCompra?: string;
  observacoes?: string;
}

export interface DocumentoProjeto {
  id: string;
  tenantId: string;
  projetoId: string;
  projetoNome: string;
  nome: string;
  descricao?: string;
  tipo: 'contrato' | 'proposta' | 'especificacao' | 'manual' | 'relatorio' | 'outro';
  categoria?: string;
  arquivo: {
    nome: string;
    tipo: string;
    tamanho: number;
    url: string;
  };
  versao: number;
  status: 'rascunho' | 'revisao' | 'aprovado' | 'arquivado';
  uploadPorId: string;
  uploadPorNome: string;
  tags?: string[];
  dataUpload: string;
  dataAtualizacao: string;
}

export interface RelatorioProjeto {
  periodo: {
    inicio: string;
    fim: string;
  };
  projetos: {
    total: number;
    ativos: number;
    concluidos: number;
    atrasados: number;
    noPrazo: number;
  };
  tarefas: {
    total: number;
    concluidas: number;
    emProgresso: number;
    bloqueadas: number;
    taxaConclusao: number;
  };
  equipe: {
    totalMembros: number;
    horasTrabalhadas: number;
    horasEstimadas: number;
    produtividade: number;
  };
  financeiro: {
    orcamentoTotal: number;
    gastoTotal: number;
    saldoRestante: number;
    percentualGasto: number;
  };
  desempenho: {
    projetosNoPrazo: number;
    projetosAtrasados: number;
    taxaSucesso: number;
    tempoMedioConclusao: number;
  };
}
