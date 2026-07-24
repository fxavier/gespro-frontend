/**
 * Escolha do tipo de operação de stock — Server Component.
 * Cada operação tem uma sub-rota dedicada com o seu formulário e action.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { PageHeader } from '@/components/patterns';
import { Card, CardContent } from '@/components/ui/card';

const OPERACOES = [
  {
    href: '/inventario/movimentacoes/nova/entrada',
    titulo: 'Entrada',
    descricao: 'Dar entrada de stock numa localização (recepção, produção, ajuste).',
    Icon: ArrowDownToLine,
  },
  {
    href: '/inventario/movimentacoes/nova/saida',
    titulo: 'Saída',
    descricao: 'Registar a saída de stock de uma localização (consumo, perda, venda).',
    Icon: ArrowUpFromLine,
  },
  {
    href: '/inventario/movimentacoes/nova/transferencia',
    titulo: 'Transferência',
    descricao: 'Mover stock entre duas localizações, gerando saída e entrada.',
    Icon: ArrowRightLeft,
  },
] as const;

export default async function NovaMovimentacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nova Movimentação de Stock"
        description="Escolha o tipo de operação a registar"
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Movimentações', href: '/inventario/movimentacoes' },
          { label: 'Nova' },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {OPERACOES.map(({ href, titulo, descricao, Icon }) => (
          <Link key={href} href={href} className="group focus-visible:outline-none">
            <Card className="h-full transition-colors group-hover:border-primary group-focus-visible:border-primary group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardContent className="p-6 space-y-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{titulo}</h3>
                <p className="text-sm text-muted-foreground">{descricao}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
