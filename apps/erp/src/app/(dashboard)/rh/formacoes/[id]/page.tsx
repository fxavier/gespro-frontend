/**
 * Detalhe de Formação — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { prisma } from '@/server/db/client';
import { FormacaoService } from '@/server/services/pessoas-projetos/rh.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell, EmptyState } from '@/components/patterns';
import { FormacaoAcoes } from '../_components/formacao-acoes';
import { InscreverColaborador } from '../_components/inscrever-colaborador';

const MODALIDADE_LABEL: Record<string, string> = {
  PRESENCIAL: 'Presencial',
  ONLINE: 'Online',
  HIBRIDO: 'Híbrido',
};

const dataFmt = (d: Date) =>
  new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FormacaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let formacao;
  try {
    formacao = await runWithTenantContext(ctx, () => FormacaoService.obter(id, ctx));
  } catch {
    notFound();
  }
  if (!formacao) notFound();

  const inscritos = formacao.participantes.length;
  const vagasLivres = formacao.vagasDisponiveis - inscritos;
  const aceitaInscricoes =
    (formacao.status === 'PLANEADA' || formacao.status === 'EM_ANDAMENTO') && vagasLivres > 0;

  const idsInscritos = new Set(formacao.participantes.map((p) => p.colaboradorId));
  const colaboradoresActivos = aceitaInscricoes
    ? await runWithTenantContext(ctx, () =>
        prisma.colaborador.findMany({
          where: { tenantId, status: 'ACTIVO' },
          select: { id: true, nome: true, codigo: true },
          orderBy: { nome: 'asc' },
        }),
      )
    : [];
  const colaboradoresDisponiveis = colaboradoresActivos.filter((c) => !idsInscritos.has(c.id));

  const metadata = [
    { label: 'Estado', value: <StatusBadge status={formacao.status} /> },
    { label: 'Modalidade', value: MODALIDADE_LABEL[formacao.modalidade] ?? formacao.modalidade },
    { label: 'Categoria', value: formacao.categoria },
    { label: 'Instrutor', value: formacao.instrutor },
    { label: 'Local', value: formacao.local },
    { label: 'Carga Horária', value: `${formacao.cargaHoraria} h` },
    { label: 'Início', value: dataFmt(formacao.dataInicio) },
    { label: 'Fim', value: dataFmt(formacao.dataFim) },
    {
      label: 'Vagas',
      value: (
        <span className="tabular-nums">
          {inscritos}/{formacao.vagasDisponiveis}
        </span>
      ),
    },
    {
      label: 'Custo Total',
      value: (
        <span className="tabular-nums">
          {Number(formacao.custoTotal).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} MZN
        </span>
      ),
    },
  ];

  const tabInformacoes = (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-1.5">Descrição</h4>
        <p className="text-sm text-muted-foreground whitespace-pre-line">{formacao.descricao}</p>
      </div>
      {formacao.observacoes && (
        <div>
          <h4 className="text-sm font-semibold mb-1.5">Observações</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{formacao.observacoes}</p>
        </div>
      )}
    </div>
  );

  const tabParticipantes = (
    <div className="space-y-4">
      {aceitaInscricoes && (
        <InscreverColaborador
          formacaoId={formacao.id}
          colaboradores={colaboradoresDisponiveis}
        />
      )}

      {formacao.participantes.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Sem participantes"
          description="Ainda não há colaboradores inscritos nesta formação."
        />
      ) : (
        <div className="border rounded-lg divide-y">
          {formacao.participantes.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{p.colaborador.nome}</span>
                <span className="text-muted-foreground ml-2">{p.colaborador.codigo}</span>
              </div>
              <StatusBadge status={p.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={formacao.titulo}
            description={`${MODALIDADE_LABEL[formacao.modalidade] ?? formacao.modalidade} · ${formacao.categoria}`}
            breadcrumbs={[
              { label: 'RH', href: '/rh/colaboradores' },
              { label: 'Formações', href: '/rh/formacoes' },
              { label: formacao.titulo },
            ]}
            badge={<StatusBadge status={formacao.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/rh/formacoes">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                <FormacaoAcoes id={formacao.id} status={formacao.status} />
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'informacoes',
            label: 'Informações',
            content: tabInformacoes,
          },
          {
            key: 'participantes',
            label: 'Participantes',
            count: formacao.participantes.length,
            content: tabParticipantes,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
