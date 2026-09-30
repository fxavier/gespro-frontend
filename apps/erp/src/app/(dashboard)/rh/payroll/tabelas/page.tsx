/**
 * Tabelas INSS/IRPS — listagem por vigência.
 * Server Component: lê directamente o serviço dentro de runWithTenantContext.
 * D5: sem editar/apagar vigências (append-only).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { PageHeader } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { formatarDataUtcDia } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { fraccaoParaPercentagem } from '@/lib/payroll-vigencia';

export default async function TabelasPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [tabelasINSS, escaloesIRPS] = await runWithTenantContext(ctx, () =>
    Promise.all([
      PayrollService.listarTabelasINSS(ctx),
      PayrollService.listarEscaloesIRPS(ctx),
    ]),
  );

  // Agrupa escalões IRPS por vigência (já ordenados por vigenciaInicio desc, ordem asc)
  type GrupoIRPS = {
    vigenciaInicio: Date;
    vigenciaFim: Date | null;
    escaloes: typeof escaloesIRPS;
  };
  const gruposIRPS: GrupoIRPS[] = [];
  for (const e of escaloesIRPS) {
    const chave = e.vigenciaInicio.toISOString();
    const grupo = gruposIRPS.find((g) => g.vigenciaInicio.toISOString() === chave);
    if (grupo) {
      grupo.escaloes.push(e);
    } else {
      gruposIRPS.push({
        vigenciaInicio: e.vigenciaInicio,
        vigenciaFim: e.vigenciaFim,
        escaloes: [e],
      });
    }
  }

  function fmtPct(v: { toString(): string }): string {
    const n = fraccaoParaPercentagem(Number(v.toString()));
    // Ex.: 3,5 % ou 3 %
    return (
      n.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 4 }) + ' %'
    );
  }

  function fmtTeto(v: { toString(): string } | null): string {
    if (!v) return '—';
    return formatMZN(v.toString());
  }

  return (
    <div className="p-6 space-y-8">
      <PageHeader
        title="Tabelas INSS/IRPS"
        description="Taxas e escalões versionados por vigência — append-only"
        breadcrumbs={[
          { label: 'RH', href: '/rh/colaboradores' },
          { label: 'Salários', href: '/rh/payroll' },
          { label: 'Tabelas INSS/IRPS' },
        ]}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/rh/payroll/tabelas/inss/nova">
                <Plus className="h-4 w-4 mr-1.5" />
                Nova vigência INSS
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/rh/payroll/tabelas/irps/nova">
                <Plus className="h-4 w-4 mr-1.5" />
                Nova vigência IRPS
              </Link>
            </Button>
          </div>
        }
      />

      {/* ── INSS ─────────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">INSS</h2>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Início</th>
                <th className="px-4 py-2 text-left font-medium">Fim</th>
                <th className="px-4 py-2 text-right font-medium">Trabalhador</th>
                <th className="px-4 py-2 text-right font-medium">Entidade</th>
                <th className="px-4 py-2 text-right font-medium">Teto</th>
                <th className="px-4 py-2 text-left font-medium">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tabelasINSS.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">{formatarDataUtcDia(t.vigenciaInicio)}</td>
                  <td className="px-4 py-2">
                    {t.vigenciaFim ? formatarDataUtcDia(t.vigenciaFim) : (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Em vigor
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{fmtPct(t.taxaTrabalhador)}</td>
                  <td className="px-4 py-2 text-right">{fmtPct(t.taxaEntidade)}</td>
                  <td className="px-4 py-2 text-right">{fmtTeto(t.tetoIncidencia)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.descricao ?? '—'}</td>
                </tr>
              ))}
              {tabelasINSS.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Sem tabelas INSS registadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── IRPS ─────────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">IRPS</h2>
        {gruposIRPS.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem escalões IRPS registados.</p>
        )}
        {gruposIRPS.map((grupo) => {
          const vigente = grupo.vigenciaFim === null;
          return (
            <div key={grupo.vigenciaInicio.toISOString()} className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  A partir de {formatarDataUtcDia(grupo.vigenciaInicio)}
                </span>
                {vigente ? (
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Em vigor
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    até {formatarDataUtcDia(grupo.vigenciaFim ?? undefined)}
                  </span>
                )}
              </div>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-right font-medium">Escalão</th>
                      <th className="px-4 py-2 text-right font-medium">De</th>
                      <th className="px-4 py-2 text-right font-medium">Até</th>
                      <th className="px-4 py-2 text-right font-medium">Taxa %</th>
                      <th className="px-4 py-2 text-right font-medium">Parcela a abater</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {grupo.escaloes.map((e) => (
                      <tr
                        key={e.id}
                        {...(vigente ? { 'data-vigente': '' } : {})}
                      >
                        <td className="px-4 py-2 text-right">{e.ordem}</td>
                        <td className="px-4 py-2 text-right">
                          {formatMZN(e.limiteInferior.toString())}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {e.limiteSuperior ? formatMZN(e.limiteSuperior.toString()) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right">{fmtPct(e.taxa)}</td>
                        <td className="px-4 py-2 text-right">
                          {formatMZN(e.parcelaAbater.toString())}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
