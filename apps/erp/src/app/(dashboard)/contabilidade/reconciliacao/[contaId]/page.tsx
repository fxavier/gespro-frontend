/**
 * Workspace de reconciliação de uma conta (ADR-0038, RF §23). Organizado por
 * ESTADO: o utilizador abre nas excepções — o que o motor não reconciliou com
 * segurança — e só vai às outras vistas se precisar.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertTriangle, CalendarRange, FileUp } from 'lucide-react';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  VISTAS,
  listarMovimentos,
  listarSugestoes,
  obterContaReconciliacao,
  type Vista,
} from '@/server/services/reconciliacao/consulta.service';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { KpiCard, PageHeader } from '@/components/patterns';
import { linhaBanco, linhaContab } from '../_lib/serializar';
import type { SugestaoLinha } from '../_lib/tipos';
import type { EstadoMovimento } from '@/server/services/reconciliacao/reconciliacao.model';
import { ExecutarReconciliacao } from './_components/acoes-conta';
import { ExcecoesPainel } from './_components/excecoes-painel';
import { MovimentosPainel } from './_components/movimentos-painel';
import { SugestoesPainel } from './_components/sugestoes-painel';

const ROTULOS: Record<Vista, string> = {
  excecoes: 'Excepções',
  sugestoes: 'Sugestões',
  transito: 'Em trânsito e pendentes',
  reconciliados: 'Reconciliados',
  ignorados: 'Ignorados',
};

type SP = { vista?: string; cb?: string; cc?: string; cs?: string };

export default async function ContaReconciliacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ contaId: string }>;
  searchParams: Promise<SP>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const { contaId } = await params;
  const sp = await searchParams;
  const vista: Vista = sp.vista && sp.vista in ROTULOS ? (sp.vista as Vista) : 'excecoes';

  const conta = await runWithTenantContext(ctx, () => obterContaReconciliacao(contaId, ctx)).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  const conta2 = (estados: readonly EstadoMovimento[]) =>
    estados.reduce((a, e) => a + (conta.contagens.banco[e] ?? 0) + (conta.contagens.contabilidade[e] ?? 0), 0);
  const contagem: Record<Vista, number> = {
    excecoes: conta2(VISTAS.excecoes),
    sugestoes: conta.contagens.sugestoes,
    transito: conta2(VISTAS.transito),
    reconciliados: conta2(VISTAS.reconciliados),
    ignorados: conta2(VISTAS.ignorados),
  };

  const base = `/contabilidade/reconciliacao/${contaId}`;
  const titulo = `${conta.banco} — ${conta.numeroConta}`;

  let conteudo: React.ReactNode;
  if (vista === 'sugestoes') {
    const pagina = await runWithTenantContext(ctx, () => listarSugestoes(contaId, sp.cs, ctx));
    const linhas: SugestaoLinha[] = pagina.items.map((s) => ({
      id: s.id,
      tipo: s.tipo,
      regra: s.regra,
      confianca: s.confianca,
      diferencaValor: s.diferencaValor.toString(),
      diferencaDias: s.diferencaDias,
      exigeJustificacao: s.diferencaValor.abs().gt(conta.toleranciaValor),
      banco: s.linhasBanco.map((l) => linhaBanco(l.movimentoBancario)),
      contabilidade: s.linhasContabilidade.map((l) => linhaContab(l.movimentoContabilistico)),
    }));
    conteudo = <SugestoesPainel sugestoes={linhas} nextCursor={pagina.nextCursor} />;
  } else {
    const { bancarios, contabilisticos } = await runWithTenantContext(ctx, () =>
      listarMovimentos(contaId, vista, { banco: sp.cb, contabilidade: sp.cc }, ctx),
    );
    const props = {
      bancarios: bancarios.items.map(linhaBanco),
      contabilisticos: contabilisticos.items.map(linhaContab),
      cursorBanco: bancarios.nextCursor,
      cursorContab: contabilisticos.nextCursor,
    };
    conteudo =
      vista === 'excecoes' ? <ExcecoesPainel contaBancariaId={contaId} {...props} /> : <MovimentosPainel vista={vista} {...props} />;
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={titulo}
        description={`Conta PGC ${conta.contaContabil.codigo} ${conta.contaContabil.nome}`}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
          { label: titulo },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}/importar`}>
                <FileUp className="h-4 w-4 mr-2" /> Importar extracto
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={conta.periodoActivo ? `${base}/periodos/${conta.periodoActivo.id}` : `${base}/periodos/novo`}>
                <CalendarRange className="h-4 w-4 mr-2" />
                {conta.periodoActivo ? 'Período em curso' : 'Abrir período'}
              </Link>
            </Button>
            <ExecutarReconciliacao contaBancariaId={contaId} desactivado={conta.pgcPartilhada} />
          </div>
        }
      />

      {conta.pgcPartilhada && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Conta contabilística partilhada</AlertTitle>
          <AlertDescription>
            Há outra conta bancária activa na mesma conta PGC ({conta.contaContabil.codigo}): não é possível saber a qual pertence cada
            lançamento, por isso a reconciliação está bloqueada. Atribua a cada conta bancária a sua própria subconta do PGC.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard title="Excepções" value={contagem.excecoes} description="Precisam de decisão" />
        <KpiCard title="Sugestões" value={contagem.sugestoes} description="Por confirmar" />
        <KpiCard title="Em trânsito" value={contagem.transito} description="A aguardar o banco, ou ainda por classificar" />
        <KpiCard title="Reconciliados" value={contagem.reconciliados} />
      </div>

      <nav aria-label="Vistas da reconciliação" className="flex flex-wrap gap-1 border-b">
        {(Object.keys(ROTULOS) as Vista[]).map((v) => (
          <Link
            key={v}
            href={`${base}?vista=${v}`}
            aria-current={v === vista ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              v === vista ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {ROTULOS[v]} <span className="tabular-nums text-muted-foreground">({contagem[v]})</span>
          </Link>
        ))}
      </nav>

      {conteudo}
    </div>
  );
}
