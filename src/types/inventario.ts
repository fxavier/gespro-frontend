// Tipos para Gestão de Inventário e Equipamento Empresarial

export type EstadoAtivo = 'novo' | 'em_uso' | 'em_manutencao' | 'obsoleto' | 'baixado' | 'em_transferencia';
export type TipoMovimentacao = 'entrada' | 'saida' | 'transferencia' | 'emprestimo' | 'devolucao' | 'baixa' | 'ajuste';
export type TipoManutencao = 'preventiva' | 'corretiva' | 'inspecao' | 'calibracao';
export type StatusManutencao = 'agendada' | 'em_curso' | 'concluida' | 'cancelada';
export type MetodoAmortizacao = 'linear' | 'digitos_anos' | 'unidades_producao' | 'saldos_decrescentes';

// Localização e Armazéns
export interface Localizacao {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'armazem' | 'escritorio' | 'departamento' | 'filial' | 'prateleira' | 'sala' | 'andar' | 'area_tecnica';
  endereco?: string;
  descricao?: string;
  capacidade?: number;
  responsavel?: string;
  ativa: boolean;
  localizacaoPai?: string; // Para hierarquia (ex: prateleira dentro de armazém)
  coordenadas?: {
    latitude: number;
    longitude: number;
  };
  mapeamento?: {
    andar: string;
    ala: string;
    sala: string;
    prateleira: string;
  };
  criadoEm: Date;
  atualizadoEm?: Date;
}

// Categorias de Ativos
export interface CategoriaAtivo {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  categoriaPai?: string; // Para hierarquia
  regrasAmortizacao: {
    metodo: MetodoAmortizacao;
    vidaUtil: number; // em anos
    valorResidual: number; // percentual
  };
  regrasManutencao?: {
    intervaloPreventiva?: number; // em dias
    alertaManutencao?: number; // dias antes do vencimento
  };
  ativa: boolean;
  criadoEm: Date;
  atualizadoEm?: Date;
}

// Ativo/Equipamento Principal
export interface Ativo {
  id: string;
  codigoInterno: string;
  nome: string;
  descricao?: string;
  categoriaId: string;
  categoriaNome: string;
  
  // Identificação
  numeroSerie?: string;
  modelo?: string;
  marca?: string;
  fornecedorId?: string;
  fornecedorNome?: string;
  
  // Valores e Datas
  dataAquisicao: Date;
  valorCompra: number;
  valorResidual?: number;
  vidaUtil: number; // em anos
  dataSubstituicao?: Date;
  
  // Estado e Localização
  estado: EstadoAtivo;
  localizacaoId: string;
  localizacaoNome: string;
  
  // Atribuição
  responsavelId?: string;
  responsavelNome?: string;
  departamentoId?: string;
  departamentoNome?: string;
  projetoId?: string;
  projetoNome?: string;
  
  // Amortização e Contabilidade
  amortizacao: {
    metodo: MetodoAmortizacao;
    valorAmortizadoAcumulado: number;
    valorLiquidoContabilistico: number;
    percentualAmortizado: number;
  };
  
  // Arquivos e Documentos
  imagens?: string[];
  documentos?: {
    id: string;
    nome: string;
    tipo: 'manual' | 'certificado' | 'garantia' | 'nota_fiscal' | 'outro';
    url: string;
    dataUpload: Date;
  }[];
  
  // Códigos de Identificação
  qrCode?: string;
  codigoBarras?: string;
  rfidTag?: string;
  
  // Metadados
  observacoes?: string;
  garantia?: {
    dataInicio: Date;
    dataFim: Date;
    fornecedor: string;
    termos?: string;
  };
  
  criadoEm: Date;
  criadoPor: string;
  atualizadoEm?: Date;
  atualizadoPor?: string;
}

// Movimentação de Ativos
export interface MovimentacaoAtivo {
  id: string;
  ativoId: string;
  ativoNome: string;
  tipo: TipoMovimentacao;
  
  // Localização
  localizacaoOrigem?: string;
  localizacaoOrigemNome?: string;
  localizacaoDestino?: string;
  localizacaoDestinoNome?: string;
  
  // Responsabilidade
  responsavelOrigem?: string;
  responsavelOrigemNome?: string;
  responsavelDestino?: string;
  responsavelDestinoNome?: string;
  
  // Detalhes da Movimentação
  dataMovimentacao: Date;
  dataPrevisaoDevolucao?: Date;
  motivo: string;
  observacoes?: string;
  
  // Documentação
  guiaMovimentacao?: string;
  assinaturaDigital?: string;
  termoResponsabilidade?: string;
  
  // Status
  confirmada: boolean;
  dataConfirmacao?: Date;
  confirmdadaPor?: string;
  
  criadoEm: Date;
  criadoPor: string;
}

// Manutenção
export interface ManutencaoAtivo {
  id: string;
  ativoId: string;
  ativoNome: string;
  tipo: TipoManutencao;
  status: StatusManutencao;
  
  // Agendamento
  dataAgendada: Date;
  dataInicio?: Date;
  dataConclusao?: Date;
  
  // Descrição
  titulo: string;
  descricao: string;
  procedimentos?: string;
  
  // Responsáveis
  tecnicoId?: string;
  tecnicoNome?: string;
  fornecedorId?: string;
  fornecedorNome?: string;
  
  // Custos
  custoMaoObra?: number;
  custoPecas?: number;
  custoTotal?: number;
  
  // Peças e Materiais
  pecasUtilizadas?: {
    id: string;
    nome: string;
    quantidade: number;
    custoUnitario: number;
    custoTotal: number;
  }[];
  
  // Próxima Manutenção
  proximaManutencao?: Date;
  intervaloProximaManutencao?: number; // em dias
  
  // Documentação
  relatorioManutencao?: string;
  fotos?: string[];
  anexos?: string[];
  
  criadoEm: Date;
  criadoPor: string;
  atualizadoEm?: Date;
  atualizadoPor?: string;
}

// Inventário Físico
export interface InventarioFisico {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  
  // Período e Escopo
  dataInicio: Date;
  dataFim?: Date;
  status: 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';
  
  // Escopo
  localizacoesIncluidas: string[];
  categoriasIncluidas: string[];
  responsavelId: string;
  responsavelNome: string;
  
  // Equipe de Contagem
  equipeContagem: {
    userId: string;
    nome: string;
    localizacoesAtribuidas: string[];
  }[];
  
  // Resultados
  totalAtivosEsperados?: number;
  totalAtivosContados?: number;
  totalDiscrepancias?: number;
  
  // Ajustes
  ajustesRealizados: boolean;
  dataAjustes?: Date;
  observacoes?: string;
  
  criadoEm: Date;
  criadoPor: string;
  atualizadoEm?: Date;
  atualizadoPor?: string;
}

// Item de Contagem do Inventário
export interface ItemInventario {
  id: string;
  inventarioId: string;
  ativoId: string;
  ativoNome: string;
  codigoInterno: string;
  
  // Dados Esperados
  localizacaoEsperada: string;
  localizacaoEsperadaNome: string;
  responsavelEsperado?: string;
  estadoEsperado: EstadoAtivo;
  
  // Dados Encontrados
  encontrado: boolean;
  localizacaoEncontrada?: string;
  localizacaoEncontradaNome?: string;
  responsavelEncontrado?: string;
  estadoEncontrado?: EstadoAtivo;
  
  // Contagem
  dataContagem?: Date;
  contadoPor?: string;
  observacoesContagem?: string;
  fotoContagem?: string;
  
  // Discrepância
  temDiscrepancia: boolean;
  tipoDiscrepancia?: 'nao_encontrado' | 'local_diferente' | 'responsavel_diferente' | 'estado_diferente' | 'dados_incorretos';
  justificativaDiscrepancia?: string;
  
  // Ajuste
  ajusteRealizado: boolean;
  dataAjuste?: Date;
  ajustadoPor?: string;
  
  criadoEm: Date;
}

// Amortização
export interface AmortizacaoCalculo {
  id: string;
  ativoId: string;
  ano: number;
  mes: number;
  
  // Valores
  valorInicial: number;
  valorResidual: number;
  vidaUtil: number;
  valorAmortizacaoMensal: number;
  valorAmortizadoAcumulado: number;
  valorLiquidoContabilistico: number;
  
  // Método
  metodoAmortizacao: MetodoAmortizacao;
  
  // Contabilidade
  contaDebito?: string;
  contaCredito?: string;
  lancamentoContabil?: string;
  
  processadoEm: Date;
  processadoPor: string;
}

// Relatórios e Dashboards
export interface ResumoInventario {
  totalAtivos: number;
  valorTotalCompra: number;
  valorLiquidoContabilistico: number;
  percentualAmortizado: number;
  
  // Por Estado
  ativosPorEstado: {
    estado: EstadoAtivo;
    quantidade: number;
    valor: number;
  }[];
  
  // Por Categoria
  ativosPorCategoria: {
    categoriaId: string;
    categoriaNome: string;
    quantidade: number;
    valor: number;
  }[];
  
  // Por Localização
  ativosPorLocalizacao: {
    localizacaoId: string;
    localizacaoNome: string;
    quantidade: number;
    valor: number;
  }[];
  
  // Manutenções
  manutencoesVencidas: number;
  manutencoesProximas: number; // próximos 30 dias
  
  // Substituições
  ativosParaSubstituicao: number; // próximos 12 meses
  
  dataReferencia: Date;
}

// Auditoria e Log
export interface LogInventario {
  id: string;
  acao: string;
  entidade: 'ativo' | 'localizacao' | 'categoria' | 'movimentacao' | 'manutencao' | 'inventario';
  entidadeId: string;
  dadosAnteriores?: any;
  dadosNovos?: any;
  observacoes?: string;
  
  usuarioId: string;
  usuarioNome: string;
  ip?: string;
  userAgent?: string;
  
  criadoEm: Date;
}