/**
 * Detalhe de Colaborador — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft, Mail, Phone } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ColaboradorService } from '@/server/services/pessoas-projetos/rh.service';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { ColaboradorAcoes } from '../_components/colaborador-acoes';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ColaboradorDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let colaborador;
  try {
    colaborador = await runWithTenantContext(ctx, () =>
      ColaboradorService.obter(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!colaborador) notFound();

  const podeEditar = colaborador.status !== 'INACTIVO';

  const metadata = [
    { label: 'Código', value: <span className="font-medium tabular-nums">{colaborador.codigo}</span> },
    { label: 'Email', value: <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{colaborador.email}</span> },
    ...(colaborador.telefone ? [{ label: 'Telefone', value: <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{colaborador.telefone}</span> }] : []),
    { label: 'Estado', value: <StatusBadge status={colaborador.status} /> },
    {
      label: 'Admissão',
      value: new Date(colaborador.dataAdmissao).toLocaleDateString('pt-MZ', {
        day: '2-digit', month: 'long', year: 'numeric',
      }),
    },
    ...(colaborador.departamento ? [{ label: 'Departamento', value: colaborador.departamento.nome }] : []),
    ...(colaborador.cargo ? [{ label: 'Cargo', value: colaborador.cargo.nome }] : []),
    { label: 'Tipo Contrato', value: colaborador.tipoContrato.replace(/_/g, ' ') },
    { label: 'Regime', value: colaborador.regimeTrabalho.replace(/_/g, ' ') },
    {
      label: 'Salário Base',
      value: <span className="font-semibold tabular-nums">MT {Number(colaborador.salarioBase).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}</span>,
    },
  ];

  // Tab: Formação Académica
  const tabFormacao = (
    <div className="space-y-3">
      {colaborador.formacaoAcademica.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Sem registos de formação académica.</p>
      ) : (
        colaborador.formacaoAcademica.map((fa) => (
          <div key={fa.id} className="flex items-start gap-3 rounded-lg border p-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{fa.nivel}</p>
              <p className="text-xs text-muted-foreground">{fa.instituicao} — {fa.curso}</p>
              {fa.anoConclusao && (
                <p className="text-xs text-muted-foreground tabular-nums mt-1">Conclusão: {fa.anoConclusao}</p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={colaborador.nome}
            description={colaborador.email}
            breadcrumbs={[
              { label: 'RH', href: '/rh/colaboradores' },
              { label: 'Colaboradores', href: '/rh/colaboradores' },
              { label: colaborador.codigo },
            ]}
            badge={<StatusBadge status={colaborador.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/rh/colaboradores">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                {podeEditar && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/rh/colaboradores/${colaborador.id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
                <ColaboradorAcoes id={colaborador.id} status={colaborador.status} />
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'formacao',
            label: 'Formação',
            count: colaborador.formacaoAcademica.length,
            content: tabFormacao,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
