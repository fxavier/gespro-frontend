import Link from 'next/link';
import { UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ClienteAcoesProps {
  id: string;
  status: string;
  modoCompacto?: boolean;
}

/**
 * Acções de estado de um cliente.
 *
 * Desactivar recolhe um motivo (campo de texto) — logo é rota própria
 * (`/clientes/[id]/desactivar`), não um AlertDialog (#136, regra «sem modais»).
 */
export function ClienteAcoes({ id, status, modoCompacto = false }: ClienteAcoesProps) {
  const podeDesativar = status === 'ATIVO' || status === 'SUSPENSO';
  if (!podeDesativar) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start"
      asChild
    >
      <Link href={`/clientes/${id}/desactivar`}>
        <UserX className="h-4 w-4 mr-1.5" />
        {modoCompacto ? 'Desactivar' : 'Desactivar Cliente'}
      </Link>
    </Button>
  );
}
