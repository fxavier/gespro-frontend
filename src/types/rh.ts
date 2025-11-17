
export interface Colaborador {
  id: string;
  tenantId: string;
  codigo: string;
  
  // Dados Pessoais
  nome: string;
  dataNascimento: string;
  genero: 'masculino' | 'feminino' | 'outro';
  estadoCivil: 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'uniao_facto';
  nacionalidade: string;
  naturalidade: {
    provincia: string;
    distrito: string;
  };
  
  // Documentos de Identificação (Moçambique)
  bi: string; // Bilhete de Identidade ou DIRE
  nuit: string; // Número Único de Identificação Tributária
  niss: string; // Número de Identificação da Segurança Social (INSS)
  
  // Contactos
  email: string;
  telefone: string;
  telefoneAlternativo?: string;
  endereco: {
    rua: string;
    numero: string;
    bairro: string;
    cidade: string;
    provincia: string;
    codigoPostal?: string;
  };
  
  // Contacto de Emergência
  contactoEmergencia: {
    nome: string;
    parentesco: string;
    telefone: string;
  };
  
  // Foto
  foto?: string;
  
  // Dados Profissionais
  departamento: string;
  cargo: string;
  dataAdmissao: string;
  dataDemissao?: string;
  status: 'activo' | 'inactivo' | 'ferias' | 'afastado' | 'periodo_experimental';
  tipoContrato: 'efectivo' | 'termo_certo' | 'estagio' | 'temporario' | 'prestacao_servicos';
  regimeTrabalho: 'tempo_integral' | 'tempo_parcial';
  horarioTrabalho?: string;
  salarioBase: number;
  subsidios: {
    alimentacao?: number;
    transporte?: number;
    habitacao?: number;
    outros?: number;
  };
  supervisor?: string;
  localizacao?: string;
  
  // Dados Bancários
  dadosBancarios?: {
    banco: string;
    nib: string; // Número de Identificação Bancária
    titular: string;
  };
  
  // Formação Académica
  formacaoAcademica: FormacaoAcademica[];
  
  // Experiência Profissional
  experienciaProfissional: ExperienciaProfissional[];
  
  // Documentos
  documentos: DocumentoColaborador[];
  
  // Benefícios
  beneficios: string[];
  
  // Acesso ao Sistema
  nivelAcesso: 'usuario' | 'supervisor' | 'gerente' | 'admin';
  
  // Observações
  observacoes?: string;
  
  // Metadados
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface FormacaoAcademica {
  id: string;
  nivel: 'basico' | 'medio' | 'tecnico' | 'licenciatura' | 'mestrado' | 'doutoramento';
  instituicao: string;
  curso: string;
  anoConclusao: string;
  certificado?: string;
}

export interface ExperienciaProfissional {
  id: string;
  empresa: string;
  cargo: string;
  dataInicio: string;
  dataFim?: string;
  responsabilidades?: string;
  actual: boolean;
}

export interface DocumentoColaborador {
  id: string;
  tipo: 'foto' | 'bi_frente' | 'bi_verso' | 'certificado_habilitacoes' | 'curriculum' | 'certificado_criminal' | 'atestado_medico' | 'comprovativo_residencia' | 'certificado_inss' | 'declaracao_nuit' | 'contrato_trabalho' | 'carta_conducao' | 'certificado_profissional' | 'outro';
  nome: string;
  url: string;
  tamanho?: number;
  dataUpload: string;
}

export interface Payroll {
  id: string;
  tenantId: string;
  colaboradorId: string;
  mesReferencia: string;
  anoReferencia: number;
  salarioBruto: number;
  descontos: {
    inss: number;
    irps: number; // Imposto sobre Rendimento de Pessoas Singulares (Moçambique)
    outros: number;
  };
  proventos: {
    horasExtras: number;
    subsidioAlimentacao: number;
    subsidioTransporte: number;
    subsidioHabitacao: number;
    comissoes: number;
    bonus: number;
    outros: number;
  };
  salarioLiquido: number;
  status: 'pendente' | 'processado' | 'pago' | 'cancelado';
  dataPagamento?: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Ferias {
  id: string;
  tenantId: string;
  colaboradorId: string;
  periodoAquisitivo: {
    inicio: string;
    fim: string;
  };
  diasDisponiveis: number;
  diasUsados: number;
  diasPendentes: number;
  solicitacoes: SolicitacaoFerias[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface SolicitacaoFerias {
  id: string;
  feriasId: string;
  dataInicio: string;
  dataFim: string;
  diasSolicitados: number;
  tipo: 'integral' | 'fracionada' | 'abono_pecuniario';
  status: 'pendente' | 'aprovada' | 'rejeitada' | 'cancelada';
  aprovadoPor?: string;
  dataAprovacao?: string;
  motivoRejeicao?: string;
  observacoes?: string;
  dataSolicitacao: string;
}

export interface Ausencia {
  id: string;
  tenantId: string;
  colaboradorId: string;
  tipo: 'falta' | 'atestado_medico' | 'licenca_maternidade' | 'licenca_paternidade' | 'licenca_sem_vencimento' | 'licenca_nojo' | 'licenca_casamento' | 'outro';
  dataInicio: string;
  dataFim: string;
  diasAusencia: number;
  justificada: boolean;
  justificativa?: string;
  anexos: string[];
  status: 'pendente' | 'aprovada' | 'rejeitada';
  aprovadoPor?: string;
  dataAprovacao?: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface RegistroAssiduidade {
  id: string;
  tenantId: string;
  colaboradorId: string;
  data: string;
  entrada: string;
  saidaAlmoco?: string;
  retornoAlmoco?: string;
  saida: string;
  horasTrabalhadas: number;
  horasExtras: number;
  atrasos: number;
  tipo: 'normal' | 'feriado' | 'fim_semana' | 'ferias' | 'ausencia';
  observacoes?: string;
  dataCriacao: string;
}

export interface Avaliacao {
  id: string;
  tenantId: string;
  colaboradorId: string;
  avaliadorId: string;
  periodo: string;
  tipo: 'desempenho' | 'competencias' | '360' | 'probatorio';
  status: 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
  criterios: CriterioAvaliacao[];
  notaFinal: number;
  pontosFortres: string[];
  pontosDesenvolvimento: string[];
  planoAcao: string[];
  comentarios?: string;
  dataInicio: string;
  dataConclusao?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface CriterioAvaliacao {
  id: string;
  nome: string;
  descricao: string;
  peso: number;
  nota: number;
  comentario?: string;
}

export interface Formacao {
  id: string;
  tenantId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  instrutor: string;
  cargaHoraria: number;
  dataInicio: string;
  dataFim: string;
  local: string;
  modalidade: 'presencial' | 'online' | 'hibrido';
  vagasDisponiveis: number;
  vagasOcupadas: number;
  status: 'planejada' | 'em_andamento' | 'concluida' | 'cancelada';
  participantes: ParticipanteFormacao[];
  custoTotal: number;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ParticipanteFormacao {
  colaboradorId: string;
  status: 'inscrito' | 'confirmado' | 'presente' | 'ausente' | 'aprovado' | 'reprovado';
  notaFinal?: number;
  certificado?: string;
  dataInscricao: string;
}

export interface Beneficio {
  id: string;
  tenantId: string;
  nome: string;
  descricao: string;
  tipo: 'subsidio_alimentacao' | 'subsidio_transporte' | 'subsidio_habitacao' | 'seguro_saude' | 'seguro_vida' | 'outro';
  valor: number;
  periodicidade: 'mensal' | 'anual' | 'unico';
  obrigatorio: boolean;
  elegibilidade: string[];
  ativo: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface VagaEmprego {
  id: string;
  tenantId: string;
  titulo: string;
  descricao: string;
  departamento: string;
  cargo: string;
  tipoContrato: 'efectivo' | 'termo_certo' | 'estagio' | 'temporario';
  faixaSalarial: {
    minimo: number;
    maximo: number;
  };
  requisitos: string[];
  beneficios: string[];
  numeroVagas: number;
  status: 'aberta' | 'em_andamento' | 'fechada' | 'cancelada';
  candidaturas: Candidatura[];
  dataAbertura: string;
  dataFechamento?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Candidatura {
  id: string;
  vagaId: string;
  nome: string;
  email: string;
  telefone: string;
  curriculo: string;
  cartaApresentacao?: string;
  status: 'nova' | 'triagem' | 'entrevista' | 'teste' | 'aprovada' | 'reprovada' | 'contratada';
  etapaAtual: string;
  avaliacoes: AvaliacaoCandidato[];
  dataAplicacao: string;
  dataAtualizacao: string;
}

export interface AvaliacaoCandidato {
  avaliadorId: string;
  etapa: string;
  nota: number;
  comentarios: string;
  dataAvaliacao: string;
}

export interface DashboardRH {
  totalColaboradores: number;
  colaboradoresActivos: number;
  colaboradoresInactivos: number;
  colaboradoresPeriodoExperimental: number;
  aniversariantesMes: Colaborador[];
  feriasPendentes: number;
  ausenciasHoje: number;
  custoFolhaMensal: number;
  taxaRotatividade: number;
  avaliacoesPendentes: number;
  formacoesMes: number;
  contratosExpirando: number;
  vagasAbertas: number;
  distribuicaoDepartamento: { departamento: string; total: number }[];
  distribuicaoCargo: { cargo: string; total: number }[];
  mediaAssiduidade: number;
}
