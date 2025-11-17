
export interface PlanoContas {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  tipo: 'ativo' | 'passivo' | 'patrimonio_liquido' | 'receita' | 'despesa';
  natureza: 'devedora' | 'credora';
  nivel: number;
  contaPaiId?: string;
  aceitaLancamento: boolean;
  ativo: boolean;
  saldo: number;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface LancamentoContabil {
  id: string;
  tenantId: string;
  numero: string;
  data: string;
  tipo: 'manual' | 'automatico';
  origem: 'manual' | 'venda' | 'compra' | 'pagamento' | 'recebimento' | 'ajuste';
  documentoOrigemId?: string;
  documentoOrigemTipo?: string;
  historico: string;
  partidas: PartidaContabil[];
  valorTotal: number;
  status: 'rascunho' | 'lancado' | 'cancelado';
  centroCustoId?: string;
  usuarioId: string;
  usuarioNome: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface PartidaContabil {
  id: string;
  contaId: string;
  contaCodigo: string;
  contaNome: string;
  tipo: 'debito' | 'credito';
  valor: number;
  historico?: string;
}

export interface CentroCusto {
  id: string;
  tenantId: string;
  codigo: string;
  nome: string;
  descricao?: string;
  tipo: 'departamento' | 'projeto' | 'filial' | 'outro';
  responsavelId?: string;
  responsavelNome?: string;
  orcamento?: number;
  ativo: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ReconciliacaoBancaria {
  id: string;
  tenantId: string;
  contaBancariaId: string;
  contaBancariaNome: string;
  dataInicio: string;
  dataFim: string;
  saldoInicialBanco: number;
  saldoFinalBanco: number;
  saldoInicialContabil: number;
  saldoFinalContabil: number;
  status: 'em_andamento' | 'concluida' | 'cancelada';
  itens: ItemReconciliacao[];
  diferencaNaoConciliada: number;
  observacoes?: string;
  usuarioId: string;
  usuarioNome: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ItemReconciliacao {
  id: string;
  tipo: 'lancamento_contabil' | 'extrato_bancario';
  data: string;
  descricao: string;
  valor: number;
  tipoMovimento: 'debito' | 'credito';
  conciliado: boolean;
  lancamentoId?: string;
  extratoId?: string;
  observacoes?: string;
}

export interface ContaBancaria {
  id: string;
  tenantId: string;
  banco: string;
  agencia: string;
  numeroConta: string;
  tipoConta: 'corrente' | 'poupanca' | 'aplicacao';
  moeda: string;
  saldoAtual: number;
  contaContabilId: string;
  ativo: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface DRE {
  periodo: string;
  dataInicio: string;
  dataFim: string;
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custoProdutosVendidos: number;
  lucroBruto: number;
  despesasOperacionais: DespesasOperacionais;
  lucroOperacional: number;
  receitasFinanceiras: number;
  despesasFinanceiras: number;
  resultadoFinanceiro: number;
  lucroAntesImpostos: number;
  impostos: number;
  lucroLiquido: number;
  margemBruta: number;
  margemOperacional: number;
  margemLiquida: number;
}

export interface DespesasOperacionais {
  despesasVendas: number;
  despesasAdministrativas: number;
  despesasGerais: number;
  total: number;
}

export interface Balancete {
  periodo: string;
  dataInicio: string;
  dataFim: string;
  contas: ContaBalancete[];
  totalDebitos: number;
  totalCreditos: number;
}

export interface ContaBalancete {
  codigo: string;
  nome: string;
  tipo: string;
  saldoAnterior: number;
  debitos: number;
  creditos: number;
  saldoAtual: number;
}

export interface ConfiguracaoContabil {
  id: string;
  tenantId: string;
  regimeContabil: 'caixa' | 'competencia';
  exercicioFiscalInicio: string;
  exercicioFiscalFim: string;
  contasPadrao: ContasPadrao;
  integracaoAutomatica: IntegracaoAutomatica;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ContasPadrao {
  caixa: string;
  banco: string;
  clientesReceber: string;
  fornecedoresPagar: string;
  estoque: string;
  receitaVendas: string;
  custoVendas: string;
  descontosConcedidos: string;
  descontosObtidos: string;
  ivaReceber: string;
  ivaPagar: string;
}

export interface IntegracaoAutomatica {
  vendas: boolean;
  compras: boolean;
  pagamentos: boolean;
  recebimentos: boolean;
  estoque: boolean;
}
