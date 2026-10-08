/**
 * Detalhe do Roteiro de Produção — Server Component (NUNCA 'use client').
 *
 * #165: liga as transições existentes (`transitarStatusRoteiroAction`, mapa `TRANSICOES_ROTEIRO`) —
 * «Activar» em RASCUNHO/EM_REVISAO/INATIVO, «Desactivar» em ATIVO; SUBSTITUIDO é terminal.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { TRANSICOES_ROTEIRO } from '@/server/services/pessoas-projetos/producao.interface';
import { formatMZN } from '@/lib/format-currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { ActivarDesactivar } from '../../_components/activar-desactivar';
import { alvoActivarDesactivar } from '../../_components/alvo-activar-desactivar';

interface Props {
  params: Promise<{ id: string }>;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function RoteiroDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  const roteiro = await runWithTenantContext(ctx, () =>
    prisma.roteiro.findFirst({
      where: { id, tenantId },
      include: {
        estruturaProduto: { select: { codigo: true, nome: true } },
        operacoes: {
          orderBy: { sequencia: 'asc' },
          include: { centroTrabalho: { select: { nome: true } } },
        },
      },
    }),
  );
  if (!roteiro) notFound();

  const alvo = permissions.includes('producao:roteiros:update')
    ? alvoActivarDesactivar(TRANSICOES_ROTEIRO, roteiro.status)
    : null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Roteiro ${roteiro.codigo}`}
        description={roteiro.nome}
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Roteiros', href: '/producao/roteiros' },
          { label: roteiro.codigo },
        ]}
        badge={<StatusBadge status={roteiro.status} />}
        actions={
          <div className="flex items-center gap-2">
            <ActivarDesactivar entidade="roteiro" id={roteiro.id} alvo={alvo} />
            <Button variant="outline" size="sm" asChild>
              <Link href="/producao/roteiros">
                <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Voltar
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do roteiro</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Campo rotulo="Código">{roteiro.codigo}</Campo>
            <Campo rotulo="Versão">{roteiro.versao}</Campo>
            <Campo rotulo="Estrutura (BOM)">
              {roteiro.estruturaProduto
                ? `${roteiro.estruturaProduto.codigo} — ${roteiro.estruturaProduto.nome}`
                : '—'}
            </Campo>
            <Campo rotulo="Categoria">{roteiro.categoria ?? '—'}</Campo>
          </dl>
          {roteiro.observacoes && (
            <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{roteiro.observacoes}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operações</CardTitle>
        </CardHeader>
        <CardContent>
          {roteiro.operacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este roteiro ainda não tem operações.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Seq.</th>
                  <th className="py-2 font-medium">Operação</th>
                  <th className="py-2 font-medium">Centro de trabalho</th>
                  <th className="py-2 font-medium text-right">Tempo (min)</th>
                  <th className="py-2 font-medium text-right">Custo/hora</th>
                </tr>
              </thead>
              <tbody>
                {roteiro.operacoes.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="py-2 tabular-nums">{o.sequencia}</td>
                    <td className="py-2">{o.nome}</td>
                    <td className="py-2">{o.centroTrabalho?.nome ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums">
                      {o.tempoPreparacao + o.tempoOperacao + o.tempoLimpeza}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatMZN(o.custoHora.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
