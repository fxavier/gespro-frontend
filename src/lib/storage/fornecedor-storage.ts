
import { 
  Fornecedor, 
  ContactoFornecedor, 
  ProdutoFornecedor, 
  OrcamentoFornecedor,
  PedidoFornecedor,
  PagamentoFornecedor,
  AvaliacaoFornecedor,
  DocumentoFornecedor
} from '@/types/fornecedor';

const STORAGE_KEYS = {
  FORNECEDORES: 'erp_fornecedores',
  CONTACTOS: 'erp_contactos_fornecedores',
  PRODUTOS: 'erp_produtos_fornecedores',
  ORCAMENTOS: 'erp_orcamentos_fornecedores',
  PEDIDOS: 'erp_pedidos_fornecedores',
  PAGAMENTOS: 'erp_pagamentos_fornecedores',
  AVALIACOES: 'erp_avaliacoes_fornecedores',
  DOCUMENTOS: 'erp_documentos_fornecedores'
};

export class FornecedorStorage {
  static getFornecedores(): Fornecedor[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.FORNECEDORES);
    return data ? JSON.parse(data) : this.getFornecedoresIniciais();
  }

  static saveFornecedores(fornecedores: Fornecedor[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.FORNECEDORES, JSON.stringify(fornecedores));
  }

  static addFornecedor(fornecedor: Fornecedor): Fornecedor {
    const fornecedores = this.getFornecedores();
    fornecedores.push(fornecedor);
    this.saveFornecedores(fornecedores);
    return fornecedor;
  }

  static updateFornecedor(id: string, updates: Partial<Fornecedor>): Fornecedor | null {
    const fornecedores = this.getFornecedores();
    const index = fornecedores.findIndex(f => f.id === id);
    if (index === -1) return null;

    fornecedores[index] = {
      ...fornecedores[index],
      ...updates,
      dataAtualizacao: new Date().toISOString()
    };
    this.saveFornecedores(fornecedores);
    return fornecedores[index];
  }

  static deleteFornecedor(id: string): boolean {
    const fornecedores = this.getFornecedores();
    const filtered = fornecedores.filter(f => f.id !== id);
    if (filtered.length === fornecedores.length) return false;

    this.saveFornecedores(filtered);
    return true;
  }

  static getFornecedorById(id: string): Fornecedor | null {
    const fornecedores = this.getFornecedores();
    return fornecedores.find(f => f.id === id) || null;
  }

  static getProximoCodigo(): string {
    const fornecedores = this.getFornecedores();
    if (fornecedores.length === 0) return 'FOR-0001';

    const codigos = fornecedores
      .map(f => parseInt(f.codigo.split('-')[1]))
      .filter(n => !isNaN(n));

    const maiorCodigo = Math.max(...codigos, 0);
    return `FOR-${(maiorCodigo + 1).toString().padStart(4, '0')}`;
  }

  static getFornecedoresFiltrados(filtros: {
    termo?: string;
    tipo?: string;
    status?: string;
    classificacao?: string;
  }): Fornecedor[] {
    let fornecedores = this.getFornecedores();

    if (filtros.termo) {
      const termo = filtros.termo.toLowerCase();
      fornecedores = fornecedores.filter(f =>
        f.nome.toLowerCase().includes(termo) ||
        f.nuit.includes(termo) ||
        f.email.toLowerCase().includes(termo) ||
        f.codigo.includes(termo)
      );
    }

    if (filtros.tipo && filtros.tipo !== 'todos') {
      fornecedores = fornecedores.filter(f => f.tipo === filtros.tipo);
    }

    if (filtros.status && filtros.status !== 'todos') {
      fornecedores = fornecedores.filter(f => f.status === filtros.status);
    }

    if (filtros.classificacao && filtros.classificacao !== 'todos') {
      fornecedores = fornecedores.filter(f => f.classificacao === filtros.classificacao);
    }

    return fornecedores;
  }

  private static getFornecedoresIniciais(): Fornecedor[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        tenantId: 'default',
        codigo: 'FOR-0001',
        nome: 'Distribuidora ABC Moçambique',
        tipo: 'pessoa_juridica',
        nuit: '123456789',
        email: 'vendas@distribuidoraabc.co.mz',
        telefone: '+258 21 123 456',
        endereco: {
          id: '1',
          tipo: 'sede',
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
        classificacao: 'preferencial',
        rating: 4.5,
        diasPagamento: 30,
        formasPagamento: ['Transferência Bancária', 'Cheque'],
        condicoesComerciaisDesconto: 5,
        observacoes: 'Fornecedor preferencial com excelente histórico'
      },
      {
        id: '2',
        tenantId: 'default',
        codigo: 'FOR-0002',
        nome: 'Importadora XYZ Lda',
        tipo: 'pessoa_juridica',
        nuit: '987654321',
        email: 'contato@importadoraxyz.co.mz',
        telefone: '+258 84 321 654',
        endereco: {
          id: '2',
          tipo: 'sede',
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
        classificacao: 'regular',
        rating: 4,
        diasPagamento: 45,
        formasPagamento: ['Transferência Bancária'],
        condicoesComerciaisDesconto: 3,
        observacoes: 'Fornecedor regular com bom atendimento'
      },
      {
        id: '3',
        tenantId: 'default',
        codigo: 'FOR-0003',
        nome: 'Fornecedor Local Maputo',
        tipo: 'pessoa_fisica',
        nuit: '456789123',
        email: 'fornecedor@local.co.mz',
        telefone: '+258 87 987 654',
        endereco: {
          id: '3',
          tipo: 'sede',
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
        classificacao: 'novo',
        rating: 3.5,
        diasPagamento: 15,
        formasPagamento: ['Dinheiro', 'Transferência Bancária'],
        condicoesComerciaisDesconto: 0,
        observacoes: 'Fornecedor novo - Entrega rápida'
      },
      {
        id: '4',
        tenantId: 'default',
        codigo: 'FOR-0004',
        nome: 'Empresa de Logística Beira',
        tipo: 'pessoa_juridica',
        nuit: '789123456',
        email: 'logistica@beira.co.mz',
        telefone: '+258 82 456 789',
        endereco: {
          id: '4',
          tipo: 'sede',
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
        classificacao: 'regular',
        rating: 2.5,
        diasPagamento: 30,
        formasPagamento: ['Transferência Bancária'],
        condicoesComerciaisDesconto: 2,
        observacoes: 'Fornecedor inativo - Problemas de entrega'
      },
      {
        id: '5',
        tenantId: 'default',
        codigo: 'FOR-0005',
        nome: 'Distribuidor Nampula',
        tipo: 'pessoa_juridica',
        nuit: '321654987',
        email: 'vendas@distribuidor-nampula.co.mz',
        telefone: '+258 84 321 654',
        endereco: {
          id: '5',
          tipo: 'sede',
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
        classificacao: 'preferencial',
        rating: 4.8,
        diasPagamento: 60,
        formasPagamento: ['Transferência Bancária', 'Cheque'],
        condicoesComerciaisDesconto: 8,
        observacoes: 'Fornecedor preferencial - Melhor rating'
      }
    ];
  }
}

export class ContactoFornecedorStorage {
  static getContactos(): ContactoFornecedor[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.CONTACTOS);
    return data ? JSON.parse(data) : this.getContactosIniciais();
  }

  static saveContactos(contactos: ContactoFornecedor[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.CONTACTOS, JSON.stringify(contactos));
  }

  static addContacto(contacto: ContactoFornecedor): ContactoFornecedor {
    const contactos = this.getContactos();
    contactos.push(contacto);
    this.saveContactos(contactos);
    return contacto;
  }

  static updateContacto(id: string, updates: Partial<ContactoFornecedor>): ContactoFornecedor | null {
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

  static getContactosByFornecedorId(fornecedorId: string): ContactoFornecedor[] {
    const contactos = this.getContactos();
    return contactos.filter(c => c.fornecedorId === fornecedorId);
  }

  private static getContactosIniciais(): ContactoFornecedor[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        fornecedorId: '1',
        nome: 'Pedro Neves',
        cargo: 'Gerente de Vendas',
        email: 'pedro.neves@distribuidoraabc.co.mz',
        telefone: '+258 84 111 2222',
        tipo: 'principal',
        ativo: true,
        dataCriacao: now
      },
      {
        id: '2',
        fornecedorId: '1',
        nome: 'Ana Costa',
        cargo: 'Responsável Financeiro',
        email: 'ana.costa@distribuidoraabc.co.mz',
        telefone: '+258 84 333 4444',
        tipo: 'financeiro',
        ativo: true,
        dataCriacao: now
      }
    ];
  }
}

export class ProdutoFornecedorStorage {
  static getProdutos(): ProdutoFornecedor[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.PRODUTOS);
    return data ? JSON.parse(data) : this.getProdutosIniciais();
  }

  static saveProdutos(produtos: ProdutoFornecedor[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.PRODUTOS, JSON.stringify(produtos));
  }

  static getProdutosByFornecedorId(fornecedorId: string): ProdutoFornecedor[] {
    const produtos = this.getProdutos();
    return produtos.filter(p => p.fornecedorId === fornecedorId);
  }

  private static getProdutosIniciais(): ProdutoFornecedor[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        fornecedorId: '1',
        codigo: 'PROD-001',
        nome: 'Papel A4 (Resma)',
        descricao: 'Papel branco A4 80g/m²',
        categoria: 'Papelaria',
        precoUnitarioMT: 450,
        quantidadeMinima: 10,
        tempoEntregaDias: 2,
        ativo: true,
        dataAtualizacao: now
      },
      {
        id: '2',
        fornecedorId: '1',
        codigo: 'PROD-002',
        nome: 'Toner Preto',
        descricao: 'Toner compatível para impressoras',
        categoria: 'Consumíveis',
        precoUnitarioMT: 1200,
        quantidadeMinima: 5,
        tempoEntregaDias: 3,
        ativo: true,
        dataAtualizacao: now
      }
    ];
  }
}

export class OrcamentoFornecedorStorage {
  static getOrcamentos(): OrcamentoFornecedor[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.ORCAMENTOS);
    return data ? JSON.parse(data) : [];
  }

  static saveOrcamentos(orcamentos: OrcamentoFornecedor[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.ORCAMENTOS, JSON.stringify(orcamentos));
  }

  static getOrcamentosByFornecedorId(fornecedorId: string): OrcamentoFornecedor[] {
    const orcamentos = this.getOrcamentos();
    return orcamentos.filter(o => o.fornecedorId === fornecedorId);
  }
}

export class PedidoFornecedorStorage {
  static getPedidos(): PedidoFornecedor[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.PEDIDOS);
    return data ? JSON.parse(data) : this.getPedidosIniciais();
  }

  static savePedidos(pedidos: PedidoFornecedor[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.PEDIDOS, JSON.stringify(pedidos));
  }

  static getPedidosByFornecedorId(fornecedorId: string): PedidoFornecedor[] {
    const pedidos = this.getPedidos();
    return pedidos.filter(p => p.fornecedorId === fornecedorId);
  }

  private static getPedidosIniciais(): PedidoFornecedor[] {
    return [
      {
        id: '1',
        fornecedorId: '1',
        numero: 'PED-2024-001',
        dataPedido: '2024-01-15',
        dataEntregaPrevista: '2024-01-20',
        dataEntregaReal: '2024-01-19',
        itens: [
          {
            id: '1',
            produtoId: '1',
            descricao: 'Papel A4 (Resma)',
            quantidade: 50,
            precoUnitarioMT: 450,
            subtotalMT: 22500,
            quantidadeRecebida: 50
          }
        ],
        valorTotalMT: 22500,
        status: 'entregue',
        observacoes: 'Entrega conforme previsto'
      },
      {
        id: '2',
        fornecedorId: '1',
        numero: 'PED-2024-002',
        dataPedido: '2024-01-18',
        dataEntregaPrevista: '2024-01-25',
        itens: [
          {
            id: '2',
            produtoId: '2',
            descricao: 'Toner Preto',
            quantidade: 20,
            precoUnitarioMT: 1200,
            subtotalMT: 24000,
            quantidadeRecebida: 0
          }
        ],
        valorTotalMT: 24000,
        status: 'confirmado',
        observacoes: 'Aguardando entrega'
      }
    ];
  }
}

export class PagamentoFornecedorStorage {
  static getPagamentos(): PagamentoFornecedor[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.PAGAMENTOS);
    return data ? JSON.parse(data) : this.getPagamentosIniciais();
  }

  static savePagamentos(pagamentos: PagamentoFornecedor[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.PAGAMENTOS, JSON.stringify(pagamentos));
  }

  static getPagamentosByFornecedorId(fornecedorId: string): PagamentoFornecedor[] {
    const pagamentos = this.getPagamentos();
    return pagamentos.filter(p => p.fornecedorId === fornecedorId);
  }

  private static getPagamentosIniciais(): PagamentoFornecedor[] {
    return [
      {
        id: '1',
        fornecedorId: '1',
        pedidoId: '1',
        numero: 'PAG-2024-001',
        dataPagamento: '2024-01-20',
        valorMT: 22500,
        formaPagamento: 'Transferência Bancária',
        referencia: 'PED-2024-001',
        status: 'concluido',
        observacoes: 'Pagamento realizado'
      }
    ];
  }
}

export class AvaliacaoFornecedorStorage {
  static getAvaliacoes(): AvaliacaoFornecedor[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.AVALIACOES);
    return data ? JSON.parse(data) : this.getAvaliacoesIniciais();
  }

  static saveAvaliacoes(avaliacoes: AvaliacaoFornecedor[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.AVALIACOES, JSON.stringify(avaliacoes));
  }

  static getAvaliacoesByFornecedorId(fornecedorId: string): AvaliacaoFornecedor[] {
    const avaliacoes = this.getAvaliacoes();
    return avaliacoes.filter(a => a.fornecedorId === fornecedorId);
  }

  private static getAvaliacoesIniciais(): AvaliacaoFornecedor[] {
    return [
      {
        id: '1',
        fornecedorId: '1',
        dataAvaliacao: '2024-01-20',
        qualidade: 5,
        prazo: 4,
        preco: 4,
        comunicacao: 5,
        observacoes: 'Excelente fornecedor',
        usuario: 'João Silva'
      }
    ];
  }
}

export class DocumentoFornecedorStorage {
  static getDocumentos(): DocumentoFornecedor[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.DOCUMENTOS);
    return data ? JSON.parse(data) : [];
  }

  static saveDocumentos(documentos: DocumentoFornecedor[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.DOCUMENTOS, JSON.stringify(documentos));
  }

  static getDocumentosByFornecedorId(fornecedorId: string): DocumentoFornecedor[] {
    const documentos = this.getDocumentos();
    return documentos.filter(d => d.fornecedorId === fornecedorId);
  }
}
