/**
 * Barra de acções da nota de crédito (#148). Só ligações: as duas acções
 * recolhem dados (forma, motivo), por isso são rotas e não botões que correm
 * aqui. Quem decide o que aparece é a página — transição permitida E permissão.
 */

import Link from 'next/link';
import { ArrowLeft, Ban, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  id: string;
  podeLiquidar: boolean;
  podeCancelar: boolean;
}

export function AcoesNotaCredito({ id, podeLiquidar, podeCancelar }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href="/faturacao/nota-credito">
          <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Voltar
        </Link>
      </Button>

      {podeCancelar && (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/faturacao/nota-credito/${id}/cancelar`}>
            <Ban className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Cancelar
          </Link>
        </Button>
      )}

      {podeLiquidar && (
        <Button size="sm" asChild>
          <Link href={`/faturacao/nota-credito/${id}/liquidar`}>
            <CheckCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Liquidar
          </Link>
        </Button>
      )}
    </div>
  );
}
