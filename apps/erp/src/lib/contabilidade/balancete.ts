import { Balancete, LancamentoContabil, PlanoContas } from '@/types/contabilidade';

interface GerarBalanceteOptions {
  dataInicio: string;
  dataFim: string;
  incluirZeradas?: boolean;
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Erro ao ler ${key}`, error);
    return fallback;
  }
}

export function gerarBalancetePeriodo({
  dataInicio,
  dataFim,
  incluirZeradas = false
}: GerarBalanceteOptions): Balancete {
  const lancamentos = readStorage<LancamentoContabil[]>('lancamentos_contabeis', []);
  const contas = readStorage<PlanoContas[]>('plano_contas', []);

  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);

  const lancamentosFiltrados = lancamentos.filter((lancamento) => {
    const dataLanc = new Date(lancamento.data);
    return dataLanc >= inicio && dataLanc <= fim;
  });

  const movimentacoes = new Map<string, { debitos: number; creditos: number }>();

  lancamentosFiltrados.forEach((lancamento) => {
    lancamento.partidas.forEach((partida) => {
      const atual = movimentacoes.get(partida.contaId) || { debitos: 0, creditos: 0 };
      if (partida.tipo === 'debito') {
        atual.debitos += partida.valor;
      } else {
        atual.creditos += partida.valor;
      }
      movimentacoes.set(partida.contaId, atual);
    });
  });

  const contasBalancete = contas
    .filter((conta) => conta.aceitaLancamento)
    .map((conta) => {
      const mov = movimentacoes.get(conta.id) || { debitos: 0, creditos: 0 };
      const saldoAnterior = 0;
      const saldoAtual =
        conta.natureza === 'devedora'
          ? saldoAnterior + mov.debitos - mov.creditos
          : saldoAnterior + mov.creditos - mov.debitos;

      return {
        codigo: conta.codigo,
        nome: conta.nome,
        tipo: conta.tipo,
        saldoAnterior,
        debitos: mov.debitos,
        creditos: mov.creditos,
        saldoAtual
      };
    })
    .filter((conta) => (incluirZeradas ? true : conta.debitos > 0 || conta.creditos > 0 || conta.saldoAtual !== 0));

  const totalDebitos = contasBalancete.reduce((acc, conta) => acc + conta.debitos, 0);
  const totalCreditos = contasBalancete.reduce((acc, conta) => acc + conta.creditos, 0);

  return {
    periodo: `${inicio.toLocaleDateString('pt-PT')} - ${fim.toLocaleDateString('pt-PT')}`,
    dataInicio,
    dataFim,
    contas: contasBalancete,
    totalDebitos,
    totalCreditos
  };
}
