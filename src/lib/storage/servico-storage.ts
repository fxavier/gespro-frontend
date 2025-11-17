
import { 
  Servico, 
  CategoriaServico, 
  AgendamentoServico, 
  TecnicoServico,
  AvaliacaoServico,
  RelatorioServico,
  PacoteServico,
  ContratoServico,
  DashboardServicos
} from '@/types/servico';

const STORAGE_KEYS = {
  SERVICOS: 'erp_servicos',
  CATEGORIAS: 'erp_categorias_servicos',
  AGENDAMENTOS: 'erp_agendamentos_servicos',
  TECNICOS: 'erp_tecnicos_servicos',
  AVALIACOES: 'erp_avaliacoes_servicos',
  RELATORIOS: 'erp_relatorios_servicos',
  PACOTES: 'erp_pacotes_servicos',
  CONTRATOS: 'erp_contratos_servicos'
};

export class ServicoStorage {
  static getServicos(): Servico[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.SERVICOS);
    return data ? JSON.parse(data) : this.getServicosIniciais();
  }

  static saveServicos(servicos: Servico[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.SERVICOS, JSON.stringify(servicos));
  }

  static addServico(servico: Servico): Servico {
    const servicos = this.getServicos();
    servicos.push(servico);
    this.saveServicos(servicos);
    return servico;
  }

  static updateServico(id: string, updates: Partial<Servico>): Servico | null {
    const servicos = this.getServicos();
    const index = servicos.findIndex(s => s.id === id);
    if (index === -1) return null;

    servicos[index] = {
      ...servicos[index],
      ...updates,
      dataAtualizacao: new Date().toISOString()
    };
    this.saveServicos(servicos);
    return servicos[index];
  }

  static deleteServico(id: string): boolean {
    const servicos = this.getServicos();
    const filtered = servicos.filter(s => s.id !== id);
    if (filtered.length === servicos.length) return false;

    this.saveServicos(filtered);
    return true;
  }

  static getServicoById(id: string): Servico | null {
    const servicos = this.getServicos();
    return servicos.find(s => s.id === id) || null;
  }

  static getProximoCodigo(): string {
    const servicos = this.getServicos();
    if (servicos.length === 0) return 'SRV-0001';

    const codigos = servicos
      .map(s => parseInt(s.codigo.split('-')[1]))
      .filter(n => !isNaN(n));

    const maiorCodigo = Math.max(...codigos, 0);
    return `SRV-${(maiorCodigo + 1).toString().padStart(4, '0')}`;
  }

  static getServicosFiltrados(filtros: {
    termo?: string;
    categoria?: string;
    status?: string;
    tipo?: string;
  }): Servico[] {
    let servicos = this.getServicos();

    if (filtros.termo) {
      const termo = filtros.termo.toLowerCase();
      servicos = servicos.filter(s =>
        s.nome.toLowerCase().includes(termo) ||
        s.codigo.includes(termo) ||
        s.descricao?.toLowerCase().includes(termo)
      );
    }

    if (filtros.categoria && filtros.categoria !== 'todas') {
      servicos = servicos.filter(s => s.categoria === filtros.categoria);
    }

    if (filtros.status && filtros.status !== 'todos') {
      servicos = servicos.filter(s => s.ativo === (filtros.status === 'ativo'));
    }

    if (filtros.tipo && filtros.tipo !== 'todos') {
      servicos = servicos.filter(s => s.tipoServico === filtros.tipo);
    }

    return servicos;
  }

  static getServicosPorCategoria(categoria: string): Servico[] {
    const servicos = this.getServicos();
    return servicos.filter(s => s.categoria === categoria && s.ativo);
  }

  static getServicosAtivos(): Servico[] {
    const servicos = this.getServicos();
    return servicos.filter(s => s.ativo);
  }

  private static getServicosIniciais(): Servico[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        tenantId: 'default',
        codigo: 'SRV-0001',
        nome: 'Instalação de Ar Condicionado',
        descricao: 'Serviço completo de instalação de ar condicionado residencial ou comercial',
        categoria: 'Instalação',
        subcategoria: 'Climatização',
        preco: 2500.00,
        precoMinimo: 2000.00,
        precoMaximo: 3500.00,
        duracaoEstimada: 180,
        unidadeMedida: 'Serviço',
        taxaIva: 17,
        ativo: true,
        tipoServico: 'instalacao',
        incluiMaterial: true,
        materialIncluido: 'Tubagens, conectores e refrigerante',
        requerAgendamento: true,
        requerTecnico: true,
        nivelTecnicoRequerido: 'avancado',
        disponivel: true,
        diasDisponibilidade: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        horaInicio: '08:00',
        horaFim: '17:00',
        totalVendas: 15,
        faturamentoTotal: 37500.00,
        ultimaVenda: '2024-01-15',
        avaliacaoMedia: 4.8,
        numeroAvaliacoes: 12,
        observacoes: 'Inclui material de fixação e garantia de 1 ano',
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '2',
        tenantId: 'default',
        codigo: 'SRV-0002',
        nome: 'Manutenção Preventiva de Veículos',
        descricao: 'Revisão completa do veículo incluindo troca de óleo e filtros',
        categoria: 'Manutenção',
        subcategoria: 'Automóvel',
        preco: 1800.00,
        precoMinimo: 1500.00,
        precoMaximo: 2200.00,
        duracaoEstimada: 120,
        unidadeMedida: 'Serviço',
        taxaIva: 17,
        ativo: true,
        tipoServico: 'manutencao',
        incluiMaterial: false,
        requerAgendamento: true,
        requerTecnico: true,
        nivelTecnicoRequerido: 'intermediario',
        disponivel: true,
        diasDisponibilidade: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        horaInicio: '07:00',
        horaFim: '18:00',
        totalVendas: 42,
        faturamentoTotal: 75600.00,
        ultimaVenda: '2024-01-14',
        avaliacaoMedia: 4.6,
        numeroAvaliacoes: 38,
        observacoes: 'Não inclui peças. Peças cobradas à parte',
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '3',
        tenantId: 'default',
        codigo: 'SRV-0003',
        nome: 'Consultoria Empresarial',
        descricao: 'Consultoria especializada em gestão empresarial e processos',
        categoria: 'Consultoria',
        subcategoria: 'Gestão',
        preco: 5000.00,
        precoMinimo: 4000.00,
        precoMaximo: 7000.00,
        duracaoEstimada: 240,
        unidadeMedida: 'Hora',
        taxaIva: 17,
        ativo: true,
        tipoServico: 'consultoria',
        incluiMaterial: false,
        requerAgendamento: true,
        requerTecnico: true,
        nivelTecnicoRequerido: 'avancado',
        disponivel: true,
        diasDisponibilidade: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        horaInicio: '09:00',
        horaFim: '17:00',
        totalVendas: 8,
        faturamentoTotal: 40000.00,
        ultimaVenda: '2024-01-13',
        avaliacaoMedia: 4.9,
        numeroAvaliacoes: 7,
        observacoes: 'Preço por hora. Mínimo 4 horas',
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '4',
        tenantId: 'default',
        codigo: 'SRV-0004',
        nome: 'Limpeza Residencial Completa',
        descricao: 'Serviço de limpeza profunda de residências',
        categoria: 'Limpeza',
        subcategoria: 'Residencial',
        preco: 800.00,
        precoMinimo: 600.00,
        precoMaximo: 1200.00,
        duracaoEstimada: 240,
        unidadeMedida: 'Serviço',
        taxaIva: 17,
        ativo: true,
        tipoServico: 'limpeza',
        incluiMaterial: true,
        materialIncluido: 'Produtos de limpeza profissionais',
        requerAgendamento: true,
        requerTecnico: false,
        disponivel: true,
        diasDisponibilidade: ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'],
        horaInicio: '08:00',
        horaFim: '18:00',
        totalVendas: 28,
        faturamentoTotal: 22400.00,
        ultimaVenda: '2024-01-12',
        avaliacaoMedia: 4.7,
        numeroAvaliacoes: 25,
        observacoes: 'Produtos de limpeza incluídos no preço',
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '5',
        tenantId: 'default',
        codigo: 'SRV-0005',
        nome: 'Reparação de Eletrodomésticos',
        descricao: 'Diagnóstico e reparação de eletrodomésticos diversos',
        categoria: 'Reparação',
        subcategoria: 'Eletrodomésticos',
        preco: 500.00,
        precoMinimo: 300.00,
        precoMaximo: 1000.00,
        duracaoEstimada: 90,
        unidadeMedida: 'Serviço',
        taxaIva: 17,
        ativo: true,
        tipoServico: 'reparacao',
        incluiMaterial: false,
        requerAgendamento: true,
        requerTecnico: true,
        nivelTecnicoRequerido: 'intermediario',
        disponivel: true,
        diasDisponibilidade: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        horaInicio: '08:00',
        horaFim: '17:00',
        totalVendas: 35,
        faturamentoTotal: 17500.00,
        ultimaVenda: '2024-01-11',
        avaliacaoMedia: 4.5,
        numeroAvaliacoes: 32,
        observacoes: 'Peças cobradas à parte. Diagnóstico gratuito',
        dataCriacao: now,
        dataAtualizacao: now
      }
    ];
  }
}

export class CategoriaServicoStorage {
  static getCategorias(): CategoriaServico[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CATEGORIAS);
    return data ? JSON.parse(data) : this.getCategoriasIniciais();
  }

  static saveCategorias(categorias: CategoriaServico[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.CATEGORIAS, JSON.stringify(categorias));
  }

  static addCategoria(categoria: CategoriaServico): CategoriaServico {
    const categorias = this.getCategorias();
    categorias.push(categoria);
    this.saveCategorias(categorias);
    return categoria;
  }

  static updateCategoria(id: string, updates: Partial<CategoriaServico>): CategoriaServico | null {
    const categorias = this.getCategorias();
    const index = categorias.findIndex(c => c.id === id);
    if (index === -1) return null;

    categorias[index] = {
      ...categorias[index],
      ...updates,
      dataAtualizacao: new Date().toISOString()
    };
    this.saveCategorias(categorias);
    return categorias[index];
  }

  static deleteCategoria(id: string): boolean {
    const categorias = this.getCategorias();
    const filtered = categorias.filter(c => c.id !== id);
    if (filtered.length === categorias.length) return false;

    this.saveCategorias(filtered);
    return true;
  }

  private static getCategoriasIniciais(): CategoriaServico[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        tenantId: 'default',
        nome: 'Instalação',
        descricao: 'Serviços de instalação de equipamentos e sistemas',
        cor: '#3b82f6',
        icone: 'Wrench',
        ativo: true,
        ordem: 1,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '2',
        tenantId: 'default',
        nome: 'Manutenção',
        descricao: 'Serviços de manutenção preventiva e corretiva',
        cor: '#10b981',
        icone: 'Hammer',
        ativo: true,
        ordem: 2,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '3',
        tenantId: 'default',
        nome: 'Reparação',
        descricao: 'Serviços de reparação de equipamentos',
        cor: '#f59e0b',
        icone: 'Wrench',
        ativo: true,
        ordem: 3,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '4',
        tenantId: 'default',
        nome: 'Consultoria',
        descricao: 'Serviços de consultoria e assessoria',
        cor: '#8b5cf6',
        icone: 'Briefcase',
        ativo: true,
        ordem: 4,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '5',
        tenantId: 'default',
        nome: 'Limpeza',
        descricao: 'Serviços de limpeza e higienização',
        cor: '#06b6d4',
        icone: 'Sparkles',
        ativo: true,
        ordem: 5,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '6',
        tenantId: 'default',
        nome: 'Transporte',
        descricao: 'Serviços de transporte e logística',
        cor: '#ec4899',
        icone: 'Truck',
        ativo: true,
        ordem: 6,
        dataCriacao: now,
        dataAtualizacao: now
      }
    ];
  }
}

export class AgendamentoServicoStorage {
  static getAgendamentos(): AgendamentoServico[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.AGENDAMENTOS);
    return data ? JSON.parse(data) : [];
  }

  static saveAgendamentos(agendamentos: AgendamentoServico[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.AGENDAMENTOS, JSON.stringify(agendamentos));
  }

  static addAgendamento(agendamento: AgendamentoServico): AgendamentoServico {
    const agendamentos = this.getAgendamentos();
    agendamentos.push(agendamento);
    this.saveAgendamentos(agendamentos);
    return agendamento;
  }

  static updateAgendamento(id: string, updates: Partial<AgendamentoServico>): AgendamentoServico | null {
    const agendamentos = this.getAgendamentos();
    const index = agendamentos.findIndex(a => a.id === id);
    if (index === -1) return null;

    agendamentos[index] = {
      ...agendamentos[index],
      ...updates,
      dataAtualizacao: new Date().toISOString()
    };
    this.saveAgendamentos(agendamentos);
    return agendamentos[index];
  }

  static deleteAgendamento(id: string): boolean {
    const agendamentos = this.getAgendamentos();
    const filtered = agendamentos.filter(a => a.id !== id);
    if (filtered.length === agendamentos.length) return false;

    this.saveAgendamentos(filtered);
    return true;
  }

  static getAgendamentoById(id: string): AgendamentoServico | null {
    const agendamentos = this.getAgendamentos();
    return agendamentos.find(a => a.id === id) || null;
  }

  static getProximoCodigo(): string {
    const agendamentos = this.getAgendamentos();
    if (agendamentos.length === 0) return 'AGD-0001';

    const codigos = agendamentos
      .map(a => parseInt(a.codigo.split('-')[1]))
      .filter(n => !isNaN(n));

    const maiorCodigo = Math.max(...codigos, 0);
    return `AGD-${(maiorCodigo + 1).toString().padStart(4, '0')}`;
  }

  static getAgendamentosPorData(data: string): AgendamentoServico[] {
    const agendamentos = this.getAgendamentos();
    return agendamentos.filter(a => a.dataAgendamento === data);
  }

  static getAgendamentosPorCliente(clienteId: string): AgendamentoServico[] {
    const agendamentos = this.getAgendamentos();
    return agendamentos.filter(a => a.clienteId === clienteId);
  }

  static getAgendamentosPorTecnico(tecnicoId: string): AgendamentoServico[] {
    const agendamentos = this.getAgendamentos();
    return agendamentos.filter(a => a.tecnicoId === tecnicoId);
  }

  static getAgendamentosProximos(dias: number = 7): AgendamentoServico[] {
    const agendamentos = this.getAgendamentos();
    const hoje = new Date();
    const dataLimite = new Date(hoje.getTime() + dias * 24 * 60 * 60 * 1000);

    return agendamentos.filter(a => {
      const dataAgd = new Date(a.dataAgendamento);
      return dataAgd >= hoje && dataAgd <= dataLimite && a.status !== 'cancelado';
    });
  }

  static getAgendamentosPendentes(): AgendamentoServico[] {
    const agendamentos = this.getAgendamentos();
    return agendamentos.filter(a => a.status === 'pendente');
  }
}

export class TecnicoServicoStorage {
  static getTecnicos(): TecnicoServico[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.TECNICOS);
    return data ? JSON.parse(data) : [];
  }

  static saveTecnicos(tecnicos: TecnicoServico[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.TECNICOS, JSON.stringify(tecnicos));
  }

  static addTecnico(tecnico: TecnicoServico): TecnicoServico {
    const tecnicos = this.getTecnicos();
    tecnicos.push(tecnico);
    this.saveTecnicos(tecnicos);
    return tecnico;
  }

  static updateTecnico(id: string, updates: Partial<TecnicoServico>): TecnicoServico | null {
    const tecnicos = this.getTecnicos();
    const index = tecnicos.findIndex(t => t.id === id);
    if (index === -1) return null;

    tecnicos[index] = {
      ...tecnicos[index],
      ...updates,
      dataAtualizacao: new Date().toISOString()
    };
    this.saveTecnicos(tecnicos);
    return tecnicos[index];
  }

  static getTecnicosDisponiveis(): TecnicoServico[] {
    const tecnicos = this.getTecnicos();
    return tecnicos.filter(t => t.disponivel);
  }

  static getTecnicosPorEspecialidade(especialidade: string): TecnicoServico[] {
    const tecnicos = this.getTecnicos();
    return tecnicos.filter(t => t.especialidades.includes(especialidade));
  }
}

export class AvaliacaoServicoStorage {
  static getAvaliacoes(): AvaliacaoServico[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.AVALIACOES);
    return data ? JSON.parse(data) : [];
  }

  static saveAvaliacoes(avaliacoes: AvaliacaoServico[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.AVALIACOES, JSON.stringify(avaliacoes));
  }

  static addAvaliacao(avaliacao: AvaliacaoServico): AvaliacaoServico {
    const avaliacoes = this.getAvaliacoes();
    avaliacoes.push(avaliacao);
    this.saveAvaliacoes(avaliacoes);
    return avaliacao;
  }

  static getAvaliacoesPorServico(servicoId: string): AvaliacaoServico[] {
    const avaliacoes = this.getAvaliacoes();
    return avaliacoes.filter(a => a.servicoId === servicoId);
  }

  static getMediaAvaliacoes(servicoId: string): number {
    const avaliacoes = this.getAvaliacoesPorServico(servicoId);
    if (avaliacoes.length === 0) return 0;
    const soma = avaliacoes.reduce((acc, a) => acc + a.nota, 0);
    return soma / avaliacoes.length;
  }
}

export class RelatorioServicoStorage {
  static getRelatorios(): RelatorioServico[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.RELATORIOS);
    return data ? JSON.parse(data) : [];
  }

  static saveRelatorios(relatorios: RelatorioServico[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.RELATORIOS, JSON.stringify(relatorios));
  }

  static addRelatorio(relatorio: RelatorioServico): RelatorioServico {
    const relatorios = this.getRelatorios();
    relatorios.push(relatorio);
    this.saveRelatorios(relatorios);
    return relatorio;
  }

  static getRelatoriosPorAgendamento(agendamentoId: string): RelatorioServico[] {
    const relatorios = this.getRelatorios();
    return relatorios.filter(r => r.agendamentoId === agendamentoId);
  }
}

export class PacoteServicoStorage {
  static getPacotes(): PacoteServico[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.PACOTES);
    return data ? JSON.parse(data) : [];
  }

  static savePacotes(pacotes: PacoteServico[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.PACOTES, JSON.stringify(pacotes));
  }

  static addPacote(pacote: PacoteServico): PacoteServico {
    const pacotes = this.getPacotes();
    pacotes.push(pacote);
    this.savePacotes(pacotes);
    return pacote;
  }

  static getPacotesAtivos(): PacoteServico[] {
    const pacotes = this.getPacotes();
    return pacotes.filter(p => p.ativo);
  }
}

export class ContratoServicoStorage {
  static getContratos(): ContratoServico[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CONTRATOS);
    return data ? JSON.parse(data) : [];
  }

  static saveContratos(contratos: ContratoServico[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.CONTRATOS, JSON.stringify(contratos));
  }

  static addContrato(contrato: ContratoServico): ContratoServico {
    const contratos = this.getContratos();
    contratos.push(contrato);
    this.saveContratos(contratos);
    return contrato;
  }

  static getContratosPorCliente(clienteId: string): ContratoServico[] {
    const contratos = this.getContratos();
    return contratos.filter(c => c.clienteId === clienteId);
  }

  static getContratosAtivos(): ContratoServico[] {
    const contratos = this.getContratos();
    return contratos.filter(c => c.status === 'ativo');
  }
}
