/**
 * O documento que originou o lançamento.
 *
 * A FK é polimórfica (`documentoOrigemId` + `documentoOrigemTipo`, escalares —
 * é assim que os domínios se ligam sem se importarem uns aos outros). Só há
 * ligação para os tipos que têm mesmo ecrã de detalhe; os outros mostram-se
 * como texto, em vez de prometer um link que dá 404.
 *
 * Server Component: não tem interactividade nenhuma.
 */

import Link from 'next/link';

const ROTAS: Record<string, (id: string) => string> = {
  Fatura: (id) => `/faturacao/${id}`,
  Venda: (id) => `/vendas/${id}`,
  Devolucao: (id) => `/vendas/devolucoes/${id}`,
  Lancamento: (id) => `/contabilidade/lancamentos/${id}`,
};

const ROTULOS: Record<string, string> = {
  Fatura: 'Factura',
  NotaCredito: 'Nota de crédito',
  FolhaPagamento: 'Folha de pagamento',
  Pagamento: 'Pagamento',
  Devolucao: 'Devolução',
  Troca: 'Troca',
  Venda: 'Venda',
  Lancamento: 'Lançamento',
};

export function OrigemDocumento({
  tipo,
  documentoId,
}: {
  tipo: string | null;
  documentoId: string | null;
}) {
  if (!tipo || !documentoId) {
    return <span className="text-muted-foreground">Sem documento associado</span>;
  }

  const rotulo = ROTULOS[tipo] ?? tipo;
  const rota = ROTAS[tipo]?.(documentoId);

  if (!rota) {
    return (
      <span>
        {rotulo} <span className="font-mono text-xs text-muted-foreground">{documentoId}</span>
      </span>
    );
  }

  return (
    <Link href={rota} className="underline underline-offset-4 hover:text-primary">
      {rotulo} <span className="font-mono text-xs">{documentoId.slice(-8)}</span>
    </Link>
  );
}
