import { requisicoesComprasMock } from '@/data/requisicoes-compras';
import type { RequisicaoCompra } from '@/types/procurement';

const STORAGE_KEY = 'requisicoes';

function mapMockToRequisicoes(): RequisicaoCompra[] {
  return requisicoesComprasMock.map((req) => ({
    id: req.id,
    tenantId: 'tenant-mock',
    numero: req.numero,
    data: req.data,
    solicitanteId: req.solicitante.toLowerCase().replace(/\s+/g, '-'),
    solicitanteNome: req.solicitante,
    departamento: req.departamento,
    prioridade: req.prioridade,
    status: req.status,
    itens: req.itensDetalhados.map((item) => ({
      id: item.id,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidadeMedida: item.unidade,
      precoEstimado: item.precoEstimado,
      subtotal: item.subtotal,
      observacoes: item.observacoes
    })),
    justificativa: req.justificativa,
    observacoes: req.observacoes,
    valorTotal: req.valorTotal,
    dataEntregaDesejada: req.dataEntregaDesejada,
    centroCustoId: req.centroCusto,
    aprovacoes: req.aprovacoes.map((aprovacao) => ({
      id: aprovacao.id,
      nivel: aprovacao.nivel,
      aprovadorId: aprovacao.aprovador,
      aprovadorNome: aprovacao.aprovador,
      status: aprovacao.status,
      data: aprovacao.data,
      observacoes: aprovacao.observacoes
    })),
    dataCriacao: req.data,
    dataAtualizacao: req.data
  }));
}

export function loadRequisicoes(): RequisicaoCompra[] {
  if (typeof window === 'undefined') {
    return mapMockToRequisicoes();
  }

  try {
    const data = window.localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed as RequisicaoCompra[];
      }
    }
  } catch (error) {
    console.error('Erro ao carregar requisições do storage', error);
  }

  const mockData = mapMockToRequisicoes();

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mockData));
  } catch (error) {
    console.error('Erro ao salvar requisições mock no storage', error);
  }

  return mockData;
}

export function saveRequisicoes(requisicoes: RequisicaoCompra[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requisicoes));
  } catch (error) {
    console.error('Erro ao salvar requisições no storage', error);
  }
}
