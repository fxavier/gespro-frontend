import { ValidacaoStock } from '@/types/pedido';

export interface ProdutoStock {
  id: string;
  nome: string;
  stockAtual: number;
  stockMinimo: number;
  stockReservado: number;
  stockDisponivel: number;
}

export class StockValidationService {
  private static instance: StockValidationService;

  private constructor() {}

  static getInstance(): StockValidationService {
    if (!StockValidationService.instance) {
      StockValidationService.instance = new StockValidationService();
    }
    return StockValidationService.instance;
  }

  async verificarDisponibilidade(
    produtoId: string, 
    quantidade: number
  ): Promise<ValidacaoStock> {
    try {
      // Em produção, isso faria uma chamada à API do módulo de inventário
      const produto = await this.obterStockProduto(produtoId);
      
      if (!produto) {
        return {
          produtoId,
          quantidadeSolicitada: quantidade,
          quantidadeDisponivel: 0,
          disponivel: false,
          mensagem: 'Produto não encontrado'
        };
      }

      const disponivel = produto.stockDisponivel >= quantidade;
      
      return {
        produtoId,
        quantidadeSolicitada: quantidade,
        quantidadeDisponivel: produto.stockDisponivel,
        disponivel,
        mensagem: disponivel 
          ? 'Stock disponível' 
          : `Stock insuficiente. Disponível: ${produto.stockDisponivel}`
      };
    } catch (error) {
      console.error('Erro ao verificar disponibilidade:', error);
      return {
        produtoId,
        quantidadeSolicitada: quantidade,
        quantidadeDisponivel: 0,
        disponivel: false,
        mensagem: 'Erro ao verificar stock'
      };
    }
  }

  async verificarMultiplosItens(
    itens: Array<{ produtoId: string; quantidade: number }>
  ): Promise<ValidacaoStock[]> {
    const validacoes = await Promise.all(
      itens.map(item => 
        this.verificarDisponibilidade(item.produtoId, item.quantidade)
      )
    );
    return validacoes;
  }

  async reservarStock(
    produtoId: string, 
    quantidade: number, 
    pedidoId: string
  ): Promise<boolean> {
    try {
      // Em produção, isso faria uma chamada à API para reservar o stock
      const validacao = await this.verificarDisponibilidade(produtoId, quantidade);
      
      if (!validacao.disponivel) {
        return false;
      }

      // Simular reserva de stock
      console.log(`Stock reservado: ${quantidade} unidades do produto ${produtoId} para o pedido ${pedidoId}`);
      return true;
    } catch (error) {
      console.error('Erro ao reservar stock:', error);
      return false;
    }
  }

  async liberarStock(
    produtoId: string, 
    quantidade: number, 
    pedidoId: string
  ): Promise<boolean> {
    try {
      // Em produção, isso faria uma chamada à API para liberar o stock reservado
      console.log(`Stock liberado: ${quantidade} unidades do produto ${produtoId} do pedido ${pedidoId}`);
      return true;
    } catch (error) {
      console.error('Erro ao liberar stock:', error);
      return false;
    }
  }

  async confirmarConsumoStock(
    produtoId: string, 
    quantidade: number, 
    pedidoId: string
  ): Promise<boolean> {
    try {
      // Em produção, isso faria uma chamada à API para confirmar o consumo do stock
      console.log(`Consumo confirmado: ${quantidade} unidades do produto ${produtoId} para o pedido ${pedidoId}`);
      return true;
    } catch (error) {
      console.error('Erro ao confirmar consumo de stock:', error);
      return false;
    }
  }

  private async obterStockProduto(produtoId: string): Promise<ProdutoStock | null> {
    // Simular busca de stock - em produção seria uma chamada à API
    const produtosSimulados: ProdutoStock[] = [
      {
        id: '1',
        nome: 'Arroz 25kg',
        stockAtual: 50,
        stockMinimo: 10,
        stockReservado: 5,
        stockDisponivel: 45
      },
      {
        id: '2',
        nome: 'Óleo 1L',
        stockAtual: 100,
        stockMinimo: 20,
        stockReservado: 10,
        stockDisponivel: 90
      },
      {
        id: '3',
        nome: 'Açúcar 1kg',
        stockAtual: 15,
        stockMinimo: 50,
        stockReservado: 0,
        stockDisponivel: 15
      },
      {
        id: '4',
        nome: 'Farinha de Milho 1kg',
        stockAtual: 150,
        stockMinimo: 30,
        stockReservado: 20,
        stockDisponivel: 130
      },
      {
        id: '5',
        nome: 'Sal 1kg',
        stockAtual: 200,
        stockMinimo: 40,
        stockReservado: 0,
        stockDisponivel: 200
      }
    ];

    return produtosSimulados.find(p => p.id === produtoId) || null;
  }

  async obterAlertasStock(): Promise<ProdutoStock[]> {
    // Retornar produtos com stock abaixo do mínimo
    const todosProdutos = await this.obterTodosProdutos();
    return todosProdutos.filter(p => p.stockAtual < p.stockMinimo);
  }

  private async obterTodosProdutos(): Promise<ProdutoStock[]> {
    // Em produção, isso seria uma chamada à API
    return [
      {
        id: '1',
        nome: 'Arroz 25kg',
        stockAtual: 50,
        stockMinimo: 10,
        stockReservado: 5,
        stockDisponivel: 45
      },
      {
        id: '2',
        nome: 'Óleo 1L',
        stockAtual: 100,
        stockMinimo: 20,
        stockReservado: 10,
        stockDisponivel: 90
      },
      {
        id: '3',
        nome: 'Açúcar 1kg',
        stockAtual: 15,
        stockMinimo: 50,
        stockReservado: 0,
        stockDisponivel: 15
      },
      {
        id: '4',
        nome: 'Farinha de Milho 1kg',
        stockAtual: 150,
        stockMinimo: 30,
        stockReservado: 20,
        stockDisponivel: 130
      },
      {
        id: '5',
        nome: 'Sal 1kg',
        stockAtual: 200,
        stockMinimo: 40,
        stockReservado: 0,
        stockDisponivel: 200
      }
    ];
  }
}