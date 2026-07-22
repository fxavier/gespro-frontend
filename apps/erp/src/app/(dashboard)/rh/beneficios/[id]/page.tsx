/**
 * Detalhe de Benefício — Server Component (NUNCA 'use client').
 * Exibe metadados + atribuições activas do benefício.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Edit2, Users, UserPlus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { BeneficioService } from '@/server/services/pessoas-projetos/beneficios.service';
import { NotFoundError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { AtribuicoesList } from './_components/atribuicoes-list';
import type { AtribuicaoRow } from './_components/atribuicoes-list';

const TIPO_LABELS: Record<string, string> = {
  SEGURO_SAUDE: 'Seguro de Saúde',
  SEGURO_VIDA: 'Seguro de Vida',
  SUBSIDIO_ALIMENTACAO: 'Subsídio Alimentação',
  SUBSIDIO_TRANSPORTE: 'Subsídio Transporte',
  SUBSIDIO_HABITACAO: 'Subsídio Habitação',
  SUBSIDIO_COMUNICACOES: 'Subsídio Comunicações',
  PLANO_PENSOES: 'Plano de Pensões',
  OUTRO: 'Outro',
};

const PERIODICIDADE_LABELS: Record<string, string> = {
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
  PONTUAL: 'Pontual',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BeneficioDetalhePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const { id } = await params;

  const ctx = { tenantId, userId };

  let beneficio: Awaited<ReturnType<typeof BeneficioService.obter>>;
  try {
    beneficio = await runWithTenantContext(ctx, () => BeneficioService.obter(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const b = beneficio as {
    id: string;
    nome: string;
    tipo: string;
    descricao: string | null;
    fornecedor: string | null;
    custoTotal: { toString(): string };
    comparticipacaoEmpresa: { toString(): string };
    descontoColaborador: { toString(): string };
    periodicidade: string;
    tributavel: boolean;
    ativo: boolean;
    atribuicoes: {
      id: string;
      colaboradorId: string;
      dataInicio: Date;
      dataFim: Date | null;
      comparticipacaoEmpresa: { toString(): string };
      descontoColaborador: { toString(): string };
      status: string;
    }[];
  };

  const atribuicoes: AtribuicaoRow[] = b.atribuicoes.map((at) => ({
    id: at.id,
    colaboradorId: at.colaboradorId,
    dataInicio: at.dataInicio.toISOString(),
    dataFim: at.dataFim?.toISOString() ?? null,
    comparticipacaoEmpresa: at.comparticipacaoEmpresa.toString(),
    descontoColaborador: at.descontoColaborador.toString(),
    status: at.status,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={b.nome}
        description={TIPO_LABELS[b.tipo] ?? b.tipo}
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Benefícios', href: '/rh/beneficios' },
          { label: b.nome },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/rh/beneficios/atribuir?beneficioId=${b.id}`}>
                <UserPlus className="h-4 w-4 mr-2" />
                Atribuir
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/rh/beneficios/${b.id}/editar`}>
                <Edit2 className="h-4 w-4 mr-2" />
                Editar
              </Link>
            </Button>
          </div>
        }
      />

      {/* Metadados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Detalhes do Benefício
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Estado</dt>
              <dd><StatusBadge status={b.ativo ? 'ACTIVO' : 'INACTIVO'} /></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tipo</dt>
              <dd>{TIPO_LABELS[b.tipo] ?? b.tipo}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Periodicidade</dt>
              <dd>{PERIODICIDADE_LABELS[b.periodicidade] ?? b.periodicidade}</dd>
            </div>
            {b.fornecedor && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Fornecedor</dt>
                <dd>{b.fornecedor}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tributável (IRPS)</dt>
              <dd>{b.tributavel ? 'Sim' : 'Não'}</dd>
            </div>
          </dl>
          {b.descricao && (
            <p className="text-sm text-muted-foreground border-t pt-3">{b.descricao}</p>
          )}
        </div>

        <div className="rounded-lg border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Valores (MZN)
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Custo Total</dt>
              <dd className="tabular-nums font-medium">
                {Number(b.custoTotal.toString()).toLocaleString('pt-PT', {
                  minimumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Comparticipação Empresa</dt>
              <dd className="tabular-nums">
                {Number(b.comparticipacaoEmpresa.toString()).toLocaleString('pt-PT', {
                  minimumFractionDigits: 2,
                })}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Desconto Colaborador</dt>
              <dd className="tabular-nums">
                {Number(b.descontoColaborador.toString()).toLocaleString('pt-PT', {
                  minimumFractionDigits: 2,
                })}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Atribuições */}
      <div className="rounded-lg border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <Users className="h-4 w-4" />
            Colaboradores Atribuídos ({atribuicoes.length})
          </h2>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/rh/beneficios/atribuir?beneficioId=${b.id}`}>
              <UserPlus className="h-4 w-4 mr-2" />
              Atribuir
            </Link>
          </Button>
        </div>
        <AtribuicoesList atribuicoes={atribuicoes} beneficioId={b.id} />
      </div>
    </div>
  );
}
