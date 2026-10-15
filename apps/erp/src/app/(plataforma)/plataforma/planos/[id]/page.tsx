import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { exigirPlataformaAdmin } from '@/server/auth/plataforma-admin';
import { obterPlanoAdmin } from '@/server/services/plataforma/plano-admin.service';
import { formatarDataHora } from '@/lib/format-date';
import { PlanoAcoes } from '../_components/plano-acoes';
import { formatarLimite, formatarUsd, serializarPlano } from '../_components/plano-serializado';

export const metadata = { title: 'Plano — Plataforma — GestPro' };

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Detalhe de um plano (#526): valores, n.º de assinaturas e as acções. */
export default async function PlanoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPlataformaAdmin();
  const { id } = await params;
  const encontrado = await obterPlanoAdmin(id);
  if (!encontrado) notFound();
  const p = serializarPlano(encontrado);

  return (
    <div className="space-y-6">
      <Link
        href="/plataforma/planos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Planos
      </Link>
      <PageHeader
        title={p.nome}
        description={p.descricao}
        badge={<StatusBadge status={p.arquivadoEm ? 'ARQUIVADO' : 'ATIVO'} />}
        actions={
          <PlanoAcoes id={p.id} codigo={p.codigo} arquivado={!!p.arquivadoEm} assinaturas={p.assinaturas} />
        }
      />

      <section className="rounded-lg border border-border bg-card p-6">
        <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Campo rotulo="Código">
            <span className="font-mono">{p.codigo}</span>
          </Campo>
          <Campo rotulo="Assinaturas">{p.assinaturas}</Campo>
          <Campo rotulo="Ordem">
            {p.ordem}
            {p.destaque ? ' · em destaque' : ''}
          </Campo>
          <Campo rotulo="Preço mensal">{formatarUsd(p.precoMensalUsd)}</Campo>
          <Campo rotulo="Preço anual">{formatarUsd(p.precoAnualUsd)}</Campo>
          <Campo rotulo="Suporte">{p.suporte}</Campo>
          <Campo rotulo="Price ID mensal">
            <span className="font-mono break-all">{p.stripePriceIdMensal ?? '—'}</span>
          </Campo>
          <Campo rotulo="Price ID anual">
            <span className="font-mono break-all">{p.stripePriceIdAnual ?? '—'}</span>
          </Campo>
          <Campo rotulo="Fora do catálogo desde">{p.arquivadoEm ? formatarDataHora(p.arquivadoEm) : '—'}</Campo>
          <Campo rotulo="Limite de utilizadores">{formatarLimite(p.limiteUtilizadores)}</Campo>
          <Campo rotulo="Limite de armazéns">{formatarLimite(p.limiteArmazens)}</Campo>
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 text-base font-semibold">Funcionalidades</h2>
        {p.funcionalidades.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem funcionalidades.</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {p.funcionalidades.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
