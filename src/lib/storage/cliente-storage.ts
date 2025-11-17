
import { Cliente, ContactoCliente, HistoricoTransacao, SegmentacaoCliente } from '@/types/cliente';

const STORAGE_KEYS = {
  CLIENTES: 'erp_clientes',
  CONTACTOS: 'erp_contactos_clientes',
  HISTORICO: 'erp_historico_transacoes',
  SEGMENTACAO: 'erp_segmentacao_clientes'
};

export class ClienteStorage {
  static getClientes(): Cliente[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CLIENTES);
    return data ? JSON.parse(data) : this.getClientesIniciais();
  }

  static saveClientes(clientes: Cliente[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.CLIENTES, JSON.stringify(clientes));
  }

  static addCliente(cliente: Cliente): Cliente {
    const clientes = this.getClientes();
    clientes.push(cliente);
    this.saveClientes(clientes);
    return cliente;
  }

  static updateCliente(id: string, updates: Partial<Cliente>): Cliente | null {
    const clientes = this.getClientes();
    const index = clientes.findIndex(c => c.id === id);
    if (index === -1) return null;

    clientes[index] = {
      ...clientes[index],
      ...updates,
      dataAtualizacao: new Date().toISOString()
    };
    this.saveClientes(clientes);
    return clientes[index];
  }

  static deleteCliente(id: string): boolean {
    const clientes = this.getClientes();
    const filtered = clientes.filter(c => c.id !== id);
    if (filtered.length === clientes.length) return false;

    this.saveClientes(filtered);
    return true;
  }

  static getClienteById(id: string): Cliente | null {
    const clientes = this.getClientes();
    return clientes.find(c => c.id === id) || null;
  }

  static getProximoCodigo(): string {
    const clientes = this.getClientes();
    if (clientes.length === 0) return 'CLI-0001';

    const codigos = clientes
      .map(c => parseInt(c.codigo.split('-')[1]))
      .filter(n => !isNaN(n));

    const maiorCodigo = Math.max(...codigos, 0);
    return `CLI-${(maiorCodigo + 1).toString().padStart(4, '0')}`;
  }

  static getClientesFiltrados(filtros: {
    termo?: string;
    tipo?: string;
    status?: string;
    categoria?: string;
  }): Cliente[] {
    let clientes = this.getClientes();

    if (filtros.termo) {
      const termo = filtros.termo.toLowerCase();
      clientes = clientes.filter(c =>
        c.nome.toLowerCase().includes(termo) ||
        c.nuit.includes(termo) ||
        c.email.toLowerCase().includes(termo) ||
        c.codigo.includes(termo)
      );
    }

    if (filtros.tipo && filtros.tipo !== 'todos') {
      clientes = clientes.filter(c => c.tipo === filtros.tipo);
    }

    if (filtros.status && filtros.status !== 'todos') {
      clientes = clientes.filter(c => c.status === filtros.status);
    }

    if (filtros.categoria && filtros.categoria !== 'todos') {
      clientes = clientes.filter(c => c.categoria === filtros.categoria);
    }

    return clientes;
  }

  private static getClientesIniciais(): Cliente[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        tenantId: 'default',
        codigo: 'CLI-0001',
        nome: 'João Silva',
        tipo: 'fisica',
        nuit: '123456789',
        email: 'joao.silva@email.com',
        telefone: '+258 84 123 4567',
        endereco: {
          id: '1',
          tipo: 'facturacao',
          rua: 'Avenida Julius Nyerere',
          numero: '123',
          bairro: 'Sommerschield',
          cidade: 'Maputo',
          provincia: 'Maputo',
          principal: true
        },
        dataCadastro: '2023-06-15',
        dataAtualizacao: now,
        status: 'ativo',
        categoria: 'regular',
        limiteCreditoMT: 100000,
        creditoUtilizadoMT: 25000,
        diasPagamento: 30,
        observacoes: 'Cliente regular com bom histórico de pagamento'
      },
      {
        id: '2',
        tenantId: 'default',
        codigo: 'CLI-0002',
        nome: 'Empresa ABC Lda',
        tipo: 'juridica',
        nuit: '987654321',
        email: 'contato@empresaabc.co.mz',
        telefone: '+258 21 123 456',
        endereco: {
          id: '2',
          tipo: 'facturacao',
          rua: 'Avenida 24 de Julho',
          numero: '456',
          bairro: 'Polana',
          cidade: 'Maputo',
          provincia: 'Maputo',
          principal: true
        },
        dataCadastro: '2023-03-10',
        dataAtualizacao: now,
        status: 'ativo',
        categoria: 'vip',
        limiteCreditoMT: 500000,
        creditoUtilizadoMT: 150000,
        diasPagamento: 60,
        observacoes: 'Cliente VIP - Empresa de grande porte'
      },
      {
        id: '3',
        tenantId: 'default',
        codigo: 'CLI-0003',
        nome: 'Maria Santos',
        tipo: 'fisica',
        nuit: '456789123',
        email: 'maria.santos@email.com',
        telefone: '+258 87 987 6543',
        endereco: {
          id: '3',
          tipo: 'facturacao',
          rua: 'Rua da Resistência',
          numero: '789',
          bairro: 'Matola',
          cidade: 'Matola',
          provincia: 'Maputo',
          principal: true
        },
        dataCadastro: '2023-08-22',
        dataAtualizacao: now,
        status: 'ativo',
        categoria: 'novo',
        limiteCreditoMT: 50000,
        creditoUtilizadoMT: 10000,
        diasPagamento: 15,
        observacoes: 'Cliente novo - Primeira compra em janeiro'
      },
      {
        id: '4',
        tenantId: 'default',
        codigo: 'CLI-0004',
        nome: 'Carlos Mendes',
        tipo: 'fisica',
        nuit: '789123456',
        email: 'carlos.mendes@email.com',
        telefone: '+258 82 456 7890',
        endereco: {
          id: '4',
          tipo: 'facturacao',
          rua: 'Avenida Eduardo Mondlane',
          numero: '321',
          bairro: 'Centro',
          cidade: 'Beira',
          provincia: 'Sofala',
          principal: true
        },
        dataCadastro: '2023-01-05',
        dataAtualizacao: now,
        status: 'inativo',
        categoria: 'inativo',
        limiteCreditoMT: 30000,
        creditoUtilizadoMT: 0,
        diasPagamento: 30,
        observacoes: 'Cliente inativo - Última compra em novembro'
      },
      {
        id: '5',
        tenantId: 'default',
        codigo: 'CLI-0005',
        nome: 'Revendedor XYZ',
        tipo: 'revendedor',
        nuit: '321654987',
        email: 'vendas@revendedorxyz.co.mz',
        telefone: '+258 84 321 6549',
        endereco: {
          id: '5',
          tipo: 'facturacao',
          rua: 'Avenida Samora Machel',
          numero: '654',
          bairro: 'Centro',
          cidade: 'Nampula',
          provincia: 'Nampula',
          principal: true
        },
        dataCadastro: '2023-05-18',
        dataAtualizacao: now,
        status: 'ativo',
        categoria: 'vip',
        limiteCreditoMT: 300000,
        creditoUtilizadoMT: 120000,
        diasPagamento: 45,
        observacoes: 'Revendedor com bom volume de vendas'
      }
    ];
  }
}

export class ContactoClienteStorage {
  static getContactos(): ContactoCliente[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CONTACTOS);
    return data ? JSON.parse(data) : this.getContactosIniciais();
  }

  static saveContactos(contactos: ContactoCliente[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.CONTACTOS, JSON.stringify(contactos));
  }

  static addContacto(contacto: ContactoCliente): ContactoCliente {
    const contactos = this.getContactos();
    contactos.push(contacto);
    this.saveContactos(contactos);
    return contacto;
  }

  static updateContacto(id: string, updates: Partial<ContactoCliente>): ContactoCliente | null {
    const contactos = this.getContactos();
    const index = contactos.findIndex(c => c.id === id);
    if (index === -1) return null;

    contactos[index] = { ...contactos[index], ...updates };
    this.saveContactos(contactos);
    return contactos[index];
  }

  static deleteContacto(id: string): boolean {
    const contactos = this.getContactos();
    const filtered = contactos.filter(c => c.id !== id);
    if (filtered.length === contactos.length) return false;

    this.saveContactos(filtered);
    return true;
  }

  static getContactosByClienteId(clienteId: string): ContactoCliente[] {
    const contactos = this.getContactos();
    return contactos.filter(c => c.clienteId === clienteId);
  }

  private static getContactosIniciais(): ContactoCliente[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        clienteId: '2',
        nome: 'Pedro Neves',
        cargo: 'Gerente de Vendas',
        email: 'pedro.neves@empresaabc.co.mz',
        telefone: '+258 84 111 2222',
        tipo: 'principal',
        ativo: true,
        dataCriacao: now
      },
      {
        id: '2',
        clienteId: '2',
        nome: 'Ana Costa',
        cargo: 'Responsável Financeiro',
        email: 'ana.costa@empresaabc.co.mz',
        telefone: '+258 84 333 4444',
        tipo: 'financeiro',
        ativo: true,
        dataCriacao: now
      }
    ];
  }
}

export class HistoricoTransacaoStorage {
  static getHistorico(): HistoricoTransacao[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.HISTORICO);
    return data ? JSON.parse(data) : this.getHistoricoInicial();
  }

  static saveHistorico(historico: HistoricoTransacao[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.HISTORICO, JSON.stringify(historico));
  }

  static addTransacao(transacao: HistoricoTransacao): HistoricoTransacao {
    const historico = this.getHistorico();
    historico.push(transacao);
    this.saveHistorico(historico);
    return transacao;
  }

  static getHistoricoByClienteId(clienteId: string): HistoricoTransacao[] {
    const historico = this.getHistorico();
    return historico.filter(h => h.clienteId === clienteId).sort((a, b) =>
      new Date(b.dataTransacao).getTime() - new Date(a.dataTransacao).getTime()
    );
  }

  private static getHistoricoInicial(): HistoricoTransacao[] {
    return [
      {
        id: '1',
        clienteId: '1',
        tipo: 'venda',
        referencia: 'FAT-2024-001',
        descricao: 'Venda de produtos diversos',
        valorMT: 45000,
        dataTransacao: '2024-01-20',
        status: 'concluido',
        usuario: 'João Silva'
      },
      {
        id: '2',
        clienteId: '2',
        tipo: 'venda',
        referencia: 'FAT-2024-002',
        descricao: 'Venda de equipamentos',
        valorMT: 150000,
        dataTransacao: '2024-01-19',
        status: 'concluido',
        usuario: 'Maria Santos'
      },
      {
        id: '3',
        clienteId: '2',
        tipo: 'pagamento',
        referencia: 'PAG-2024-001',
        descricao: 'Pagamento parcial',
        valorMT: 75000,
        dataTransacao: '2024-01-18',
        status: 'concluido',
        usuario: 'Sistema'
      }
    ];
  }
}

export class SegmentacaoClienteStorage {
  static getSegmentacoes(): SegmentacaoCliente[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.SEGMENTACAO);
    return data ? JSON.parse(data) : this.getSegmentacoesIniciais();
  }

  static saveSegmentacoes(segmentacoes: SegmentacaoCliente[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.SEGMENTACAO, JSON.stringify(segmentacoes));
  }

  static updateSegmentacao(id: string, updates: Partial<SegmentacaoCliente>): SegmentacaoCliente | null {
    const segmentacoes = this.getSegmentacoes();
    const index = segmentacoes.findIndex(s => s.id === id);
    if (index === -1) return null;

    segmentacoes[index] = {
      ...segmentacoes[index],
      ...updates,
      dataAtualizacao: new Date().toISOString()
    };
    this.saveSegmentacoes(segmentacoes);
    return segmentacoes[index];
  }

  static getSegmentacaoByClienteId(clienteId: string): SegmentacaoCliente | null {
    const segmentacoes = this.getSegmentacoes();
    return segmentacoes.find(s => s.clienteId === clienteId) || null;
  }

  private static getSegmentacoesIniciais(): SegmentacaoCliente[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        clienteId: '1',
        segmento: 'varejo',
        industria: 'Comércio',
        tamanhoEmpresa: 'pequena',
        potencialVendas: 'medio',
        frequenciaCompra: 'mensal',
        ticketMedio: 45000,
        dataAtualizacao: now
      },
      {
        id: '2',
        clienteId: '2',
        segmento: 'corporativo',
        industria: 'Tecnologia',
        tamanhoEmpresa: 'grande',
        potencialVendas: 'alto',
        frequenciaCompra: 'semanal',
        ticketMedio: 150000,
        dataAtualizacao: now
      }
    ];
  }
}
