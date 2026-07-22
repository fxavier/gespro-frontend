
import { 
  Ticket, 
  CategoriaTicket, 
  EquipeSuporte, 
  BaseConhecimento,
  ConfiguracaoTickets 
} from '@/types/ticket';

const STORAGE_KEYS = {
  TICKETS: 'erp_tickets',
  CATEGORIAS: 'erp_categorias_ticket',
  EQUIPES_SUPORTE: 'erp_equipes_suporte',
  BASE_CONHECIMENTO: 'erp_base_conhecimento',
  CONFIGURACOES: 'erp_configuracoes_tickets'
};

export class TicketStorage {
  static getTickets(): Ticket[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.TICKETS);
    return data ? JSON.parse(data) : [];
  }

  static saveTickets(tickets: Ticket[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
  }

  static addTicket(ticket: Ticket): Ticket {
    const tickets = this.getTickets();
    tickets.push(ticket);
    this.saveTickets(tickets);
    return ticket;
  }

  static updateTicket(id: string, updates: Partial<Ticket>): Ticket | null {
    const tickets = this.getTickets();
    const index = tickets.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    tickets[index] = { 
      ...tickets[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveTickets(tickets);
    return tickets[index];
  }

  static deleteTicket(id: string): boolean {
    const tickets = this.getTickets();
    const filtered = tickets.filter(t => t.id !== id);
    if (filtered.length === tickets.length) return false;
    
    this.saveTickets(filtered);
    return true;
  }

  static getTicketById(id: string): Ticket | null {
    const tickets = this.getTickets();
    return tickets.find(t => t.id === id) || null;
  }

  static getTicketByNumero(numero: string): Ticket | null {
    const tickets = this.getTickets();
    return tickets.find(t => t.numero === numero) || null;
  }

  static getProximoNumero(): string {
    const tickets = this.getTickets();
    const config = ConfiguracaoStorage.getConfiguracoes();
    const prefixo = config?.prefixoNumero || 'TKT';
    
    if (tickets.length === 0) {
      return `${prefixo}-0001`;
    }
    
    const numeros = tickets
      .map(t => parseInt(t.numero.split('-')[1]))
      .filter(n => !isNaN(n));
    
    const maiorNumero = Math.max(...numeros, 0);
    const proximoNumero = (maiorNumero + 1).toString().padStart(4, '0');
    
    return `${prefixo}-${proximoNumero}`;
  }
}

export class CategoriaTicketStorage {
  static getCategorias(): CategoriaTicket[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CATEGORIAS);
    return data ? JSON.parse(data) : this.getCategoriasIniciais();
  }

  static saveCategorias(categorias: CategoriaTicket[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.CATEGORIAS, JSON.stringify(categorias));
  }

  static addCategoria(categoria: CategoriaTicket): CategoriaTicket {
    const categorias = this.getCategorias();
    categorias.push(categoria);
    this.saveCategorias(categorias);
    return categoria;
  }

  static updateCategoria(id: string, updates: Partial<CategoriaTicket>): CategoriaTicket | null {
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

  private static getCategoriasIniciais(): CategoriaTicket[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        tenantId: 'default',
        nome: 'Hardware',
        descricao: 'Problemas com equipamentos físicos',
        icone: 'Monitor',
        cor: '#3b82f6',
        subcategorias: ['Computador', 'Impressora', 'Periféricos'],
        sla: { tempoResposta: 2, tempoResolucao: 24 },
        ativa: true,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '2',
        tenantId: 'default',
        nome: 'Software',
        descricao: 'Problemas com aplicativos e sistemas',
        icone: 'Code',
        cor: '#10b981',
        subcategorias: ['Sistema Operacional', 'Aplicativos', 'Licenças'],
        sla: { tempoResposta: 4, tempoResolucao: 48 },
        ativa: true,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '3',
        tenantId: 'default',
        nome: 'Rede',
        descricao: 'Problemas de conectividade e rede',
        icone: 'Wifi',
        cor: '#f59e0b',
        subcategorias: ['Internet', 'Wi-Fi', 'VPN'],
        sla: { tempoResposta: 1, tempoResolucao: 8 },
        ativa: true,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '4',
        tenantId: 'default',
        nome: 'Acesso',
        descricao: 'Solicitações de acesso e permissões',
        icone: 'Key',
        cor: '#8b5cf6',
        subcategorias: ['Novo Usuário', 'Redefinição de Senha', 'Permissões'],
        sla: { tempoResposta: 2, tempoResolucao: 24 },
        ativa: true,
        dataCriacao: now,
        dataAtualizacao: now
      }
    ];
  }
}

export class EquipeSuporteStorage {
  static getEquipes(): EquipeSuporte[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.EQUIPES_SUPORTE);
    return data ? JSON.parse(data) : [];
  }

  static saveEquipes(equipes: EquipeSuporte[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.EQUIPES_SUPORTE, JSON.stringify(equipes));
  }

  static addEquipe(equipe: EquipeSuporte): EquipeSuporte {
    const equipes = this.getEquipes();
    equipes.push(equipe);
    this.saveEquipes(equipes);
    return equipe;
  }

  static updateEquipe(id: string, updates: Partial<EquipeSuporte>): EquipeSuporte | null {
    const equipes = this.getEquipes();
    const index = equipes.findIndex(e => e.id === id);
    if (index === -1) return null;
    
    equipes[index] = { 
      ...equipes[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveEquipes(equipes);
    return equipes[index];
  }

  static deleteEquipe(id: string): boolean {
    const equipes = this.getEquipes();
    const filtered = equipes.filter(e => e.id !== id);
    if (filtered.length === equipes.length) return false;
    
    this.saveEquipes(filtered);
    return true;
  }
}

export class BaseConhecimentoStorage {
  static getArtigos(): BaseConhecimento[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.BASE_CONHECIMENTO);
    return data ? JSON.parse(data) : [];
  }

  static saveArtigos(artigos: BaseConhecimento[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.BASE_CONHECIMENTO, JSON.stringify(artigos));
  }

  static addArtigo(artigo: BaseConhecimento): BaseConhecimento {
    const artigos = this.getArtigos();
    artigos.push(artigo);
    this.saveArtigos(artigos);
    return artigo;
  }

  static updateArtigo(id: string, updates: Partial<BaseConhecimento>): BaseConhecimento | null {
    const artigos = this.getArtigos();
    const index = artigos.findIndex(a => a.id === id);
    if (index === -1) return null;
    
    artigos[index] = { 
      ...artigos[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveArtigos(artigos);
    return artigos[index];
  }

  static deleteArtigo(id: string): boolean {
    const artigos = this.getArtigos();
    const filtered = artigos.filter(a => a.id !== id);
    if (filtered.length === artigos.length) return false;
    
    this.saveArtigos(filtered);
    return true;
  }
}

export class ConfiguracaoStorage {
  static getConfiguracoes(): ConfiguracaoTickets | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem(STORAGE_KEYS.CONFIGURACOES);
    return data ? JSON.parse(data) : this.getConfiguracoesIniciais();
  }

  static saveConfiguracoes(config: ConfiguracaoTickets): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.CONFIGURACOES, JSON.stringify(config));
  }

  private static getConfiguracoesIniciais(): ConfiguracaoTickets {
    return {
      tenantId: 'default',
      numeracaoAutomatica: true,
      prefixoNumero: 'TKT',
      atribuicaoAutomatica: false,
      notificacoes: {
        email: true,
        sms: false,
        push: true
      },
      slasPadrao: {
        baixa: { resposta: 8, resolucao: 72 },
        normal: { resposta: 4, resolucao: 48 },
        alta: { resposta: 2, resolucao: 24 },
        urgente: { resposta: 1, resolucao: 8 }
      },
      camposObrigatorios: ['titulo', 'descricao', 'categoria', 'prioridade'],
      permitirAutoAtribuicao: true,
      permitirReabertura: true,
      diasReabertura: 7,
      avaliacaoObrigatoria: false
    };
  }
}
