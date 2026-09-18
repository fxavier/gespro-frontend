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
  emailVerificado = true,
}: {
  tenantId: string;
  userId: string;
  forcar?: boolean;
  /**
   * `session.user.emailVerificado` (ADR-0031 §6). Por omissão `true` para que
   * um chamador que ainda não o passe não mostre um passo por fazer a quem já
   * confirmou — a origem do valor é a sessão, e só ela.
   */
  emailVerificado?: boolean;
}) {
  const assinatura = await runWithTenantContext({ tenantId, userId }, () =>
    assinaturaService.obterOuNulo({ tenantId, userId }),
  );

  if (!assinatura) return null;
  if (!forcar && assinatura.estado !== 'TRIAL') return null;

  const [clientes, produtos, faturas, utilizadores] = await Promise.all([
    prismaBase.cliente.count({ where: { tenantId } }),
    prismaBase.produto.count({ where: { tenantId } }),
    prismaBase.fatura.count({ where: { tenantId } }),
    prismaBase.user.count({ where: { tenantId, deletedAt: null } }),
  ]);

  const passos = [
    {
      // PRIMEIRO passo desde o ADR-0031 §5 (tarefa 4.5). Até aqui o primeiro
      // passo era «activar a conta», dado por `primeiroAcessoEm`: com o e-mail
      // de acções do Keycloak, entrar IMPLICAVA ter confirmado o endereço e
      // definido a palavra-passe. Deixou de implicar — quem se regista entra
      // na mesma submissão, com o endereço por confirmar — e o passo passaria
      // a estar sempre feito, a dizer uma coisa falsa. O reenvio vive no aviso
      // do topo do painel, que é onde a pessoa já está a olhar.
      feito: emailVerificado,
      titulo: 'Confirmar o endereço de e-mail',
      descricao: 'Liberta a emissão de documentos fiscais e a criação de utilizadores.',
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
