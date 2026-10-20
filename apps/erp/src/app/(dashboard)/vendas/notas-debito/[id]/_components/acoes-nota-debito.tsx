/**
 * Barra de acções da nota de débito (#565). Só ligações: as duas acções recolhem
 * dados (motivo, meio de pagamento), por isso são rotas. Quem decide o que aparece
 * é a página — transição permitida E permissão.
 */

import Link from 'next/link';
import { ArrowLeft, Ban, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  id: string;
  podeLiquidar: boolean;
  podeCancelar: boolean;
}

export function AcoesNotaDebito({ id, podeLiquidar, podeCancelar }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href="/vendas/notas-debito">
          <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Voltar
        </Link>
      </Button>

      {podeCancelar && (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/vendas/notas-debito/${id}/cancelar`}>
            <Ban className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Cancelar
          </Link>
        </Button>
      )}

      {podeLiquidar && (
        <Button size="sm" asChild>
          <Link href={`/vendas/notas-debito/${id}/liquidar`}>
            <CheckCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Liquidar
          </Link>
        </Button>
      )}
    </div>
  );
}
