'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Send, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  enviarPedidoCompraAction,
  confirmarPedidoCompraAction,
  marcarPedidoCompraEmTransitoAction,
} from '@/server/actions/compras.actions';

interface Props {
  id: string;
  status: string;
}

/**
 * Avanço do pedido de compra (#110): RASCUNHO → ENVIADO → CONFIRMADO → EM_TRANSITO, um botão
 * por estado. Nenhum é destrutivo, por isso não pedem confirmação; cancelar é rota própria.
 */
export function PedidoAcoes({ id, status }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  const passo =
    status === 'RASCUNHO'
      ? { rotulo: 'Enviar pedido', aCorrer: 'A enviar…', sucesso: 'Pedido enviado ao fornecedor.', icone: Send, action: enviarPedidoCompraAction }
      : status === 'ENVIADO'
        ? { rotulo: 'Confirmar pedido', aCorrer: 'A confirmar…', sucesso: 'Pedido confirmado pelo fornecedor.', icone: CheckCircle, action: confirmarPedidoCompraAction }
        : status === 'CONFIRMADO'
          ? { rotulo: 'Marcar em trânsito', aCorrer: 'A marcar…', sucesso: 'Pedido marcado em trânsito.', icone: Truck, action: marcarPedidoCompraEmTransitoAction }
          : null;

  if (!passo) return null;
  const Icone = passo.icone;

  const avancar = () => {
    iniciar(async () => {
      const r = await passo.action({ id });
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível actualizar o pedido.');
        return;
      }
      toast.success(passo.sucesso);
      router.refresh();
    });
  };

  return (
    <Button size="sm" onClick={avancar} disabled={aCorrer}>
      <Icone className="h-4 w-4 mr-1.5" aria-hidden="true" />
      {aCorrer ? passo.aCorrer : passo.rotulo}
    </Button>
  );
}
