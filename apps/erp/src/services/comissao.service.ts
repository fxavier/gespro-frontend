import { ComissaoVendedor } from '@/types/pedido';

export interface Vendedor {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  comissaoPercentualPadrao: number;
  ativo: boolean;
  lojaId?: string;
  meta?: {
    mensal: number;
    trimestral: number;
    anual: number;
  };
}

export interface RegraComissao {
  id: string;
  nome: string;
  tipo: 'fixa' | 'escalonada' | 'por_categoria' | 'por_meta' | 'por_periodo';
  vendedorId?: string;
  categoriaId?: string;
  percentualBase: number;
  condicoes?: {
    valorMinimo?: number;
    valorMaximo?: number;
    quantidadeMinima?: number;
    metaAtingida?: number;
    categoriaId?: string;
    categoriaNome?: string;
    dataInicio?: string;
    dataFim?: string;
  };
  percentualBonus?: number;
  prioridade: number;
  descricao: string;
  ativa: boolean;
}

export interface CalculoComissao {
  vendedorId: string;
  pedidoId: string;
  valorBase: number;
  percentualAplicado: number;
  valorComissao: number;
  regrasAplicadas: string[];
  detalhes: string;
}

export class ComissaoService {
  private static instance: ComissaoService;
  private regrasCache: Map<string, RegraComissao[]> = new Map();

  private constructor() {}

  static getInstance(): ComissaoService {
    if (!ComissaoService.instance) {
      ComissaoService.instance = new ComissaoService();
    }
    return ComissaoService.instance;
  }

  async atribuirVendedorAutomatico(
    lojaId: string,
    clienteId?: string
  ): Promise<Vendedor | null> {
    try {
      // Em produção, isso buscaria o vendedor baseado em regras de negócio
      // Por exemplo: vendedor da loja, vendedor que atendeu o cliente anteriormente, etc.
      
      const vendedoresDisponiveis = await this.obterVendedoresDisponiveis(lojaId);
      
      if (vendedoresDisponiveis.length === 0) {
        return null;
      }

      // Lógica de atribuição automática
      // 1. Verificar se o cliente tem vendedor preferencial
      if (clienteId) {
        const vendedorPreferencial = await this.obterVendedorPreferencial(clienteId);
        if (vendedorPreferencial && vendedorPreferencial.ativo) {
          return vendedorPreferencial;
        }
      }

      // 2. Distribuir por rotatividade ou carga de trabalho
      const vendedorComMenorCarga = await this.obterVendedorComMenorCarga(vendedoresDisponiveis);
      return vendedorComMenorCarga;
    } catch (error) {
      console.error('Erro ao atribuir vendedor automático:', error);
      return null;
    }
  }

  async calcularComissao(
    vendedorId: string,
    pedidoId: string,
    valorPedido: number,
    itens?: Array<{ categoriaId: string; valor: number }>
  ): Promise<CalculoComissao> {
    try {
      const vendedor = await this.obterVendedor(vendedorId);
      if (!vendedor) {
        throw new Error('Vendedor não encontrado');
      }

      // Obter regras de comissão aplicáveis
      const regras = await this.obterRegrasComissao(vendedorId);
      
      let percentualFinal = vendedor.comissaoPercentualPadrao;
      let valorComissao = 0;
      const regrasAplicadas: string[] = [];
      const detalhes: string[] = [];

      // Aplicar regra base
      valorComissao = (valorPedido * percentualFinal) / 100;
      regrasAplicadas.push('Comissão Base');
      detalhes.push(`Comissão base: ${percentualFinal}% de MT ${valorPedido.toFixed(2)}`);

      // Verificar regras especiais
      for (const regra of regras) {
        if (this.regraSeAplica(regra, valorPedido, itens)) {
          if (regra.tipo === 'escalonada' && regra.condicoes?.valorMinimo && valorPedido >= regra.condicoes.valorMinimo) {
            percentualFinal = regra.percentualBase;
            valorComissao = (valorPedido * percentualFinal) / 100;
            regrasAplicadas.push(regra.nome);
            detalhes.push(`${regra.nome}: ${percentualFinal}% por venda acima de MT ${regra.condicoes.valorMinimo}`);
          } else if (regra.tipo === 'por_meta' && regra.percentualBonus) {
            const bonus = (valorPedido * regra.percentualBonus) / 100;
            valorComissao += bonus;
            percentualFinal += regra.percentualBonus;
            regrasAplicadas.push(regra.nome);
            detalhes.push(`Bônus por meta: +${regra.percentualBonus}% = MT ${bonus.toFixed(2)}`);
          }
        }
      }

      // Verificar meta mensal
      const metaAtingida = await this.verificarMetaMensal(vendedorId);
      if (metaAtingida >= 100) {
        const bonusMeta = valorComissao * 0.1; // 10% de bônus por atingir meta
        valorComissao += bonusMeta;
        regrasAplicadas.push('Bônus Meta Mensal');
        detalhes.push(`Bônus por atingir ${metaAtingida.toFixed(0)}% da meta: +MT ${bonusMeta.toFixed(2)}`);
      }

      return {
        vendedorId,
        pedidoId,
        valorBase: valorPedido,
        percentualAplicado: percentualFinal,
        valorComissao,
        regrasAplicadas,
        detalhes: detalhes.join('\n')
      };
    } catch (error) {
      console.error('Erro ao calcular comissão:', error);
      return {
        vendedorId,
        pedidoId,
        valorBase: valorPedido,
        percentualAplicado: 0,
        valorComissao: 0,
        regrasAplicadas: ['Erro no cálculo'],
        detalhes: 'Erro ao calcular comissão'
      };
    }
  }

  async registrarComissao(comissao: ComissaoVendedor): Promise<boolean> {
    try {
      // Em produção, isso salvaria a comissão no banco de dados
      console.log('Comissão registrada:', comissao);
      return true;
    } catch (error) {
      console.error('Erro ao registrar comissão:', error);
      return false;
    }
  }

  async obterComissoesVendedor(
    vendedorId: string,
    periodo?: { inicio: Date; fim: Date }
  ): Promise<ComissaoVendedor[]> {
    // Em produção, isso buscaria as comissões do banco de dados
    const comissoesSimuladas: ComissaoVendedor[] = [
      {
        vendedorId,
        vendedorNome: 'Maria Santos',
        percentualBase: 5,
        percentualAplicado: 5,
        valorBase: 12500,
        valorComissao: 625,
        pedidoId: '1',
        pedidoNumero: 'PED-2024-001',
        data: new Date('2024-01-20'),
        pago: false
      }
    ];

    if (periodo) {
      return comissoesSimuladas.filter(
        c => c.data >= periodo.inicio && c.data <= periodo.fim
      );
    }

    return comissoesSimuladas;
  }

  async marcarComissaoPaga(comissaoId: string): Promise<boolean> {
    try {
      // Em produção, isso atualizaria o status no banco de dados
      console.log('Comissão marcada como paga:', comissaoId);
      return true;
    } catch (error) {
      console.error('Erro ao marcar comissão como paga:', error);
      return false;
    }
  }

  private async obterVendedor(vendedorId: string): Promise<Vendedor | null> {
    // Simular busca de vendedor
    const vendedores: Vendedor[] = [
      {
        id: '1',
        nome: 'Maria Santos',
        email: 'maria@empresa.com',
        telefone: '849000001',
        comissaoPercentualPadrao: 5,
        ativo: true,
        lojaId: '1',
        meta: {
          mensal: 100000,
          trimestral: 300000,
          anual: 1200000
        }
      },
      {
        id: '2',
        nome: 'Carlos Fernandes',
        email: 'carlos@empresa.com',
        telefone: '849000002',
        comissaoPercentualPadrao: 3,
        ativo: true,
        lojaId: '2'
      },
      {
        id: '3',
        nome: 'Sofia Nunes',
        email: 'sofia@empresa.com',
        telefone: '849000003',
        comissaoPercentualPadrao: 4,
        ativo: true,
        lojaId: '1'
      }
    ];

    return vendedores.find(v => v.id === vendedorId) || null;
  }

  private async obterVendedoresDisponiveis(lojaId: string): Promise<Vendedor[]> {
    // Em produção, isso buscaria vendedores ativos da loja
    const todosVendedores = await this.obterTodosVendedores();
    return todosVendedores.filter(v => v.ativo && (!v.lojaId || v.lojaId === lojaId));
  }

  private async obterTodosVendedores(): Promise<Vendedor[]> {
    return [
      {
        id: '1',
        nome: 'Maria Santos',
        email: 'maria@empresa.com',
        telefone: '849000001',
        comissaoPercentualPadrao: 5,
        ativo: true,
        lojaId: '1',
        meta: {
          mensal: 100000,
          trimestral: 300000,
          anual: 1200000
        }
      },
      {
        id: '2',
        nome: 'Carlos Fernandes',
        email: 'carlos@empresa.com',
        telefone: '849000002',
        comissaoPercentualPadrao: 3,
        ativo: true,
        lojaId: '2'
      },
      {
        id: '3',
        nome: 'Sofia Nunes',
        email: 'sofia@empresa.com',
        telefone: '849000003',
        comissaoPercentualPadrao: 4,
        ativo: true,
        lojaId: '1'
      }
    ];
  }

  private async obterVendedorPreferencial(clienteId: string): Promise<Vendedor | null> {
    // Em produção, isso verificaria o histórico de vendas do cliente
    // Por agora, retornar null
    return null;
  }

  private async obterVendedorComMenorCarga(vendedores: Vendedor[]): Promise<Vendedor | null> {
    // Em produção, isso calcularia a carga de trabalho atual de cada vendedor
    // Por agora, retornar o primeiro disponível
    return vendedores[0] || null;
  }

  private async obterRegrasComissao(vendedorId: string): Promise<RegraComissao[]> {
    // Verificar cache
    if (this.regrasCache.has(vendedorId)) {
      return this.regrasCache.get(vendedorId)!;
    }

    // Em produção, isso buscaria as regras do banco de dados
    const regras: RegraComissao[] = [
      {
        id: '1',
        nome: 'Comissão Escalonada - Vendas Altas',
        tipo: 'escalonada',
        vendedorId,
        percentualBase: 7,
        condicoes: {
          valorMinimo: 50000
        },
        prioridade: 1,
        descricao: 'Aplicada a vendas de alto valor',
        ativa: true
      },
      {
        id: '2',
        nome: 'Bônus Meta Mensal',
        tipo: 'por_meta',
        vendedorId,
        percentualBase: 5,
        percentualBonus: 2,
        condicoes: {
          metaAtingida: 100
        },
        prioridade: 2,
        descricao: 'Bônus vinculado ao alcance da meta mensal',
        ativa: true
      }
    ];

    // Guardar em cache
    this.regrasCache.set(vendedorId, regras);
    
    return regras;
  }

  private regraSeAplica(
    regra: RegraComissao,
    valorPedido: number,
    itens?: Array<{ categoriaId: string; valor: number }>
  ): boolean {
    if (!regra.ativa) return false;

    if (regra.condicoes) {
      if (regra.condicoes.valorMinimo && valorPedido < regra.condicoes.valorMinimo) {
        return false;
      }
      if (regra.condicoes.valorMaximo && valorPedido > regra.condicoes.valorMaximo) {
        return false;
      }
    }

    return true;
  }

  private async verificarMetaMensal(vendedorId: string): Promise<number> {
    // Em produção, isso calcularia o percentual de meta atingida
    // Simular 80% de meta atingida
    return 80;
  }

  async obterDashboardComissoes(vendedorId?: string): Promise<{
    totalMes: number;
    totalPendente: number;
    totalPago: number;
    percentualMeta: number;
    ranking: number;
  }> {
    // Em produção, isso agregaria dados reais
    return {
      totalMes: 15750,
      totalPendente: 8500,
      totalPago: 7250,
      percentualMeta: 85,
      ranking: 2
    };
  }

  // Métodos para gerenciar regras de comissão
  async obterRegrasVendedor(vendedorId: string): Promise<RegraComissao[]> {
    try {
      // Em produção, buscaria do banco de dados
      const regrasSimuladas: RegraComissao[] = [
        {
          id: '1',
          nome: 'Comissão Base',
          tipo: 'fixa',
          vendedorId,
          percentualBase: 5,
          ativa: true,
          condicoes: {},
          prioridade: 1,
          descricao: 'Comissão padrão aplicada a todas as vendas'
        },
        {
          id: '2',
          nome: 'Bônus Vendas Altas',
          tipo: 'escalonada',
          vendedorId,
          percentualBase: 7,
          ativa: true,
          condicoes: {
            valorMinimo: 50000
          },
          prioridade: 2,
          descricao: 'Comissão aumentada para vendas acima de MT 50.000'
        }
      ];

      return regrasSimuladas;
    } catch (error) {
      console.error('Erro ao obter regras do vendedor:', error);
      return [];
    }
  }

  async criarRegraComissao(regra: Omit<RegraComissao, 'id'>): Promise<RegraComissao> {
    try {
      // Em produção, salvaria no banco de dados
      const novaRegra: RegraComissao = {
        id: `regra-${Date.now()}`,
        ...regra
      };

      console.log('Regra de comissão criada:', novaRegra);
      return novaRegra;
    } catch (error) {
      console.error('Erro ao criar regra de comissão:', error);
      throw error;
    }
  }

  async atualizarRegraComissao(regraId: string, dadosAtualizados: Partial<RegraComissao>): Promise<RegraComissao> {
    try {
      // Em produção, atualizaria no banco de dados
      console.log('Regra de comissão atualizada:', regraId, dadosAtualizados);
      
      return {
        id: regraId,
        ...dadosAtualizados
      } as RegraComissao;
    } catch (error) {
      console.error('Erro ao atualizar regra de comissão:', error);
      throw error;
    }
  }

  async removerRegraComissao(regraId: string): Promise<boolean> {
    try {
      // Em produção, removeria do banco de dados
      console.log('Regra de comissão removida:', regraId);
      return true;
    } catch (error) {
      console.error('Erro ao remover regra de comissão:', error);
      return false;
    }
  }

  async ativarDesativarRegra(regraId: string, ativa: boolean): Promise<boolean> {
    try {
      // Em produção, atualizaria no banco de dados
      console.log('Status da regra alterado:', regraId, ativa ? 'ativada' : 'desativada');
      return true;
    } catch (error) {
      console.error('Erro ao alterar status da regra:', error);
      return false;
    }
  }

  async simularComissao(
    vendedorId: string,
    valorVenda: number,
    categoriaId?: string
  ): Promise<{
    percentualFinal: number;
    valorComissao: number;
    regrasAplicadas: string[];
    detalhamento: string[];
  }> {
    try {
      const vendedor = await this.obterVendedor(vendedorId);
      const regras = await this.obterRegrasVendedor(vendedorId);

      if (!vendedor) {
        throw new Error('Vendedor não encontrado');
      }

      let percentualFinal = vendedor.comissaoPercentualPadrao;
      const regrasAplicadas: string[] = ['Comissão Base'];
      const detalhamento: string[] = [`Base: ${percentualFinal}%`];

      // Aplicar regras ativas ordenadas por prioridade
      const regrasAtivas = regras
        .filter(r => r.ativa)
        .sort((a, b) => a.prioridade - b.prioridade);

      for (const regra of regrasAtivas) {
        let aplicar = false;

        switch (regra.tipo) {
          case 'escalonada':
            if (regra.condicoes?.valorMinimo && valorVenda >= regra.condicoes.valorMinimo) {
              percentualFinal = regra.percentualBase;
              aplicar = true;
            }
            break;
          
          case 'por_categoria':
            if (categoriaId && regra.condicoes?.categoriaId === categoriaId) {
              percentualFinal = regra.percentualBase;
              aplicar = true;
            }
            break;
          
          case 'por_meta':
            // Simular verificação de meta (seria calculado em produção)
            const metaAtingida = 85; // Exemplo
            if (regra.condicoes?.metaAtingida && metaAtingida >= regra.condicoes.metaAtingida) {
              if (regra.percentualBonus) {
                percentualFinal += regra.percentualBonus;
              }
              aplicar = true;
            }
            break;
          
          case 'por_periodo':
            // Verificar se está no período (seria implementado com datas reais)
            const hoje = new Date();
            if (regra.condicoes?.dataInicio && regra.condicoes?.dataFim) {
              const inicio = new Date(regra.condicoes.dataInicio);
              const fim = new Date(regra.condicoes.dataFim);
              if (hoje >= inicio && hoje <= fim) {
                percentualFinal = regra.percentualBase;
                aplicar = true;
              }
            }
            break;
        }

        if (aplicar) {
          regrasAplicadas.push(regra.nome);
          detalhamento.push(`${regra.nome}: ${regra.percentualBase}%${regra.percentualBonus ? ` (+${regra.percentualBonus}%)` : ''}`);
        }
      }

      const valorComissao = (valorVenda * percentualFinal) / 100;

      return {
        percentualFinal,
        valorComissao,
        regrasAplicadas,
        detalhamento
      };
    } catch (error) {
      console.error('Erro ao simular comissão:', error);
      throw error;
    }
  }

  async obterEstatisticasVendedor(vendedorId: string, periodo?: { inicio: Date; fim: Date }): Promise<{
    totalVendas: number;
    totalComissoes: number;
    numeroVendas: number;
    ticketMedio: number;
    metaAtingida: number;
    ranking: number;
  }> {
    try {
      // Em produção, calcularia com dados reais
      return {
        totalVendas: 125000,
        totalComissoes: 6250,
        numeroVendas: 45,
        ticketMedio: 2777.78,
        metaAtingida: 125,
        ranking: 1
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas do vendedor:', error);
      throw error;
    }
  }
}
