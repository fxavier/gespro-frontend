import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { assinaturaService } from '@/server/services/plataforma/assinatura.service';
import { prismaBase } from '@/server/db/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/patterns';

/**
 * Checklist de primeiros passos, mostrada no dashboard após o handoff de
 * registo (spec 19, task 8.2). Server Component — os passos são derivados de
 * dados reais, não de estado local: um passo já feito nunca reaparece.
 *
 * Só aparece enquanto a subscrição estiver em TRIAL (ou logo após o handoff,
 * via `?onboarding=1`); num tenant maduro seria só ruído.
 */
export async function ChecklistOnboarding({
  tenantId,
  userId,
  forcar = false,
}: {
  tenantId: string;
  userId: string;
  forcar?: boolean;
}) {
  const assinatura = await runWithTenantContext({ tenantId, userId }, () =>
    assinaturaService.obterOuNulo({ tenantId, userId }),
  );

  if (!assinatura) return null;
  if (!forcar && assinatura.estado !== 'TRIAL') return null;

  const [clientes, produtos, faturas, utilizadores, utilizador] = await Promise.all([
    prismaBase.cliente.count({ where: { tenantId } }),
    prismaBase.produto.count({ where: { tenantId } }),
    prismaBase.fatura.count({ where: { tenantId } }),
    prismaBase.user.count({ where: { tenantId, deletedAt: null } }),
    prismaBase.user.findFirst({
      where: { id: userId, tenantId },
      select: { emailVerificado: true },
    }),
  ]);

  const passos = [
    {
      feito: Boolean(utilizador?.emailVerificado),
      titulo: 'Confirmar o endereço de email',
      descricao: 'Sem confirmação, não é possível iniciar sessão de novo.',
      href: null as string | null,
      accao: null as string | null,
    },
    {
      feito: clientes > 0,
      titulo: 'Registar o primeiro cliente',
      descricao: 'Necessário para emitir facturas.',
      href: '/clientes/novo',
      accao: 'Criar cliente',
    },
    {
      feito: produtos > 0,
      titulo: 'Adicionar produtos ou serviços',
      descricao: 'Base do inventário e das linhas de factura.',
      href: '/produtos/novo',
      accao: 'Criar produto',
    },
    {
      feito: faturas > 0,
      titulo: 'Emitir a primeira factura',
      descricao: 'Numeração fiscal e contabilidade PGC-NIRF já configuradas.',
      href: '/faturacao',
      accao: 'Ir para faturação',
    },
    {
      feito: utilizadores > 1,
      titulo: 'Convidar a equipa',
      descricao: 'Cada pessoa com o seu perfil de acesso.',
      href: '/core-tenancy/utilizadores',
      accao: 'Convidar',
    },
  ];

  const concluidos = passos.filter((p) => p.feito).length;
  if (concluidos === passos.length) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>Primeiros passos</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {concluidos}/{passos.length}
          </span>
          <StatusBadge status={assinatura.estado} />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {passos.map((passo) => (
            <li key={passo.titulo} className="flex items-start gap-3">
              {passo.feito ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={
                    passo.feito
                      ? 'text-sm font-medium text-muted-foreground line-through'
                      : 'text-sm font-medium'
                  }
                >
                  {passo.titulo}
                </p>
                <p className="text-xs text-muted-foreground">{passo.descricao}</p>
              </div>
              {!passo.feito && passo.href && passo.accao && (
                <Button asChild size="sm" variant="outline">
                  <Link href={passo.href}>{passo.accao}</Link>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
