/**
 * Detalhe da Ordem de Produção — Server Component (NUNCA 'use client').
 *
 * #166: é aqui que vive o escritor de `qualidadeAprovada` — sem ele nenhuma ordem conclui.
 * Em EM_PRODUCAO, quem tem `producao:ordens:update` aprova (AlertDialog de confirmação) ou
 * reprova com motivo (rota própria `/reprovar-qualidade`: recolher texto é formulário).
 *
 * #164: liga as transições existentes (`transitarStatusOrdemProducaoAction`) — liberar,
 * iniciar, concluir, cancelar — com confirmação por AlertDialog, e a ligação para a rota
 * própria de registo de consumo; os consumos de material listam-se aqui.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { OrdemProducaoService } from '@/server/services/pessoas-projetos/producao.service';
import { formatarData, formatarDataHora } from '@/lib/format-date';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { QualidadeAcoes } from './_components/qualidade-acoes';
import { TransicoesOrdem } from './_components/transicoes-ordem';

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

export default async function OrdemProducaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  let ordem;
  try {
    ordem = await runWithTenantContext(ctx, () => OrdemProducaoService.obter(id, ctx));
  } catch {
    notFound();
  }

  // A sessão não traz nomes: o avaliador lê-se pelo id (FK escalar → User).
  const avaliador = ordem.qualidadeAvaliadaPorId
    ? await runWithTenantContext(ctx, () =>
        prisma.user.findFirst({
          where: { id: ordem.qualidadeAvaliadaPorId!, tenantId },
          select: { nome: true },
        }),
      )
    : null;

  const podeActualizar = permissions.includes('producao:ordens:update');
  const podeAvaliar = ordem.status === 'EM_PRODUCAO' && podeActualizar;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Ordem ${ordem.numero}`}
        description={ordem.nomeProduto}
        breadcrumbs={[
          { label: 'Produção', href: '/producao' },
          { label: 'Ordens de Produção', href: '/producao/ordens' },
          { label: ordem.numero },
        ]}
        badge={<StatusBadge status={ordem.status} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {podeActualizar && (
              <TransicoesOrdem id={ordem.id} numero={ordem.numero} status={ordem.status} />
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href="/producao/ordens">
                <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Voltar
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da ordem</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Campo rotulo="Produto">
              {ordem.codigoProduto} — {ordem.nomeProduto}
            </Campo>
            <Campo rotulo="Quantidade">
              {ordem.quantidade.toString()} {ordem.unidadeMedida}
            </Campo>
            <Campo rotulo="Prioridade">
              <StatusBadge status={ordem.prioridade} />
            </Campo>
            <Campo rotulo="Progresso">{ordem.progresso}%</Campo>
            <Campo rotulo="Início previsto">{formatarData(ordem.dataPrevisaoInicio)}</Campo>
            <Campo rotulo="Fim previsto">{formatarData(ordem.dataPrevisaoFim)}</Campo>
            <Campo rotulo="Início real">
              {ordem.dataInicioReal ? formatarDataHora(ordem.dataInicioReal) : '—'}
            </Campo>
            <Campo rotulo="Fim real">
              {ordem.dataFimReal ? formatarDataHora(ordem.dataFimReal) : '—'}
            </Campo>
          </dl>
          {ordem.observacoes && (
            <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{ordem.observacoes}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consumo de materiais</CardTitle>
        </CardHeader>
        <CardContent>
          {ordem.consumos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há consumos registados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Prevista</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordem.consumos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      {c.codigoProduto} — {c.nomeProduto}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.quantidadePrevista.toString()} {c.unidadeMedida}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.quantidadeReal.toString()} {c.unidadeMedida}
                    </TableCell>
                    <TableCell>{c.reservaId ? 'Estrutura de produto' : 'Registo manual'}</TableCell>
                    <TableCell>
                      {c.movimentoStockId
                        ? 'Baixado'
                        : ordem.status === 'CANCELADA'
                          ? 'Libertado'
                          : 'Reservado'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">Controlo de qualidade</CardTitle>
          {podeAvaliar && <QualidadeAcoes id={ordem.id} numero={ordem.numero} />}
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Campo rotulo="Avaliação">
              <StatusBadge
                status={
                  ordem.qualidadeAprovada
                    ? 'APROVADA'
                    : ordem.qualidadeAvaliadaEm
                      ? 'REPROVADA'
                      : 'PENDENTE'
                }
              />
            </Campo>
            <Campo rotulo="Avaliada por">{avaliador?.nome ?? '—'}</Campo>
            <Campo rotulo="Avaliada em">
              {ordem.qualidadeAvaliadaEm ? formatarDataHora(ordem.qualidadeAvaliadaEm) : '—'}
            </Campo>
          </dl>
          {ordem.qualidadeObservacoes && (
            <div>
              <p className="text-xs text-muted-foreground">
                {ordem.qualidadeAprovada ? 'Observações' : 'Motivo da reprovação'}
              </p>
              <p className="text-sm whitespace-pre-wrap">{ordem.qualidadeObservacoes}</p>
            </div>
          )}
          {ordem.status === 'EM_PRODUCAO' && !ordem.qualidadeAprovada && (
            <p className="text-sm text-muted-foreground">
              A ordem só pode ser concluída depois de a qualidade ser aprovada.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
