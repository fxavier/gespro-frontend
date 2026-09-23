/**
 * Detalhe do apuramento de IVA de um período — Server Component.
 *
 * Mostra os totais do apuramento activo (APURADO ou DECLARADO), as linhas,
 * as divergências e as ligações para acções e mapas.
 *
 * NUNCA 'use client': gate-sc.mjs recusa.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import {
  AlertTriangle,
  Download,
  RotateCcw,
  CheckCircle2,
  PercentCircle,
  Info,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { obterApuramento } from '@/server/services/financas/apuramento-iva.service';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { formatMZN } from '@/lib/format-currency';
import { formatarData } from '@/lib/format-date';
import { DetalheApuramentoSkeleton } from '../_components/iva-skeletons';
import { MarcarDeclaradoAlertDialog } from './_components/marcar-declarado-alert-dialog';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos auxiliares
// ─────────────────────────────────────────────────────────────────────────────

// Decimal chega como string depois da serialização da Server Action / RSC boundary
type DecimalLike = { toString(): string } | string | number;

function fmt(v: DecimalLike): string {
  return formatMZN(v.toString());
}

// ─────────────────────────────────────────────────────────────────────────────
// Card de KPI simples (sem dependência de KpiCard patterns — valores pré-formatados)
// ─────────────────────────────────────────────────────────────────────────────

function TotalCard({
  label,
  valor,
  destaque,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={[
        'rounded-lg border p-4 space-y-1',
        destaque ? 'border-primary/40 bg-primary/5' : 'bg-card',
      ].join(' ')}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={['text-lg font-semibold tabular-nums', destaque ? 'text-primary' : ''].join(' ')}>
        {valor}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Secção de detalhe (assíncrona)
// ─────────────────────────────────────────────────────────────────────────────

async function ApuramentoDetalheSection({
  periodoId,
  tenantId,
  userId,
}: {
  periodoId: string;
  tenantId: string;
  userId: string;
}) {
  const ctx = { tenantId, userId };

  const [periodo, apuramento] = await Promise.all([
    runWithTenantContext(ctx, () =>
      contabilidadeService.listarPeriodos({}, ctx).then((ps) =>
        ps.find((p) => p.id === periodoId) ?? null
      )
    ),
    runWithTenantContext(ctx, () => obterApuramento(periodoId, ctx)),
  ]);

  if (!periodo) notFound();

  const podeApurar = !apuramento || apuramento.estado === 'ESTORNADO';
  const podeEstornar = apuramento?.estado === 'APURADO';
  const podeDeclarar = apuramento?.estado === 'APURADO';

  return (
    <div className="space-y-6">
      {/* Cabeçalho do período */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <PercentCircle className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-semibold">Período {periodo.codigo}</p>
          <p className="text-sm text-muted-foreground">
            {formatarData(periodo.dataInicio)} – {formatarData(periodo.dataFim)}
          </p>
        </div>
        <StatusBadge status={periodo.estado} />
        {apuramento && (
          <>
            <StatusBadge status={apuramento.estado} />
            <span className="text-xs text-muted-foreground">versão {apuramento.versao}</span>
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {podeApurar && (
            <Button asChild size="sm">
              <Link href={`/contabilidade/iva/${periodoId}/apurar`}>
                <PercentCircle className="h-4 w-4 mr-1.5" />
                Apurar IVA
              </Link>
            </Button>
          )}
          {podeEstornar && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/contabilidade/iva/${periodoId}/estornar`}>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Estornar
              </Link>
            </Button>
          )}
          {podeDeclarar && apuramento && (
            <MarcarDeclaradoAlertDialog
              apuramentoId={apuramento.id}
              periodoCodigo={periodo.codigo}
            />
          )}
        </div>
      </div>

      {/* Se não há apuramento, mostrar estado vazio */}
      {!apuramento ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <PercentCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Ainda não existe apuramento para este período.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Clique em «Apurar IVA» para calcular o apuramento a partir do razão.
          </p>
          {podeApurar && (
            <div className="mt-4">
              <Button asChild>
                <Link href={`/contabilidade/iva/${periodoId}/apurar`}>
                  Apurar IVA
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Totais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <TotalCard
              label="IVA Liquidado"
              valor={fmt(apuramento.totalIvaLiquidado)}
            />
            <TotalCard
              label="IVA Dedutível"
              valor={fmt(apuramento.totalIvaDedutivel)}
            />
            <TotalCard
              label="Regularizações"
              valor={fmt(apuramento.totalRegularizacoes)}
            />
            <TotalCard
              label="Crédito Reportado"
              valor={fmt(apuramento.creditoReportado)}
            />
            <TotalCard
              label={
                Number(apuramento.saldoApuramento.toString()) >= 0
                  ? 'IVA a Pagar'
                  : 'IVA a Recuperar'
              }
              valor={fmt(
                Math.abs(Number(apuramento.saldoApuramento.toString())).toString()
              )}
              destaque
            />
          </div>

          {/* Nota sobre os nomes das contas */}
          <div className="flex items-start gap-2 rounded-lg border border-muted bg-muted/20 p-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              O nome da conta nas linhas abaixo é o que estava registado no plano
              de contas à data do apuramento, não o nome actual. É assim por
              design: um mapa emitido anos depois tem de mostrar o que foi apurado,
              não o que existe hoje.
            </p>
          </div>

          {/* Linhas do apuramento */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Linhas do apuramento</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 px-4 text-left font-medium text-muted-foreground">Conta</th>
                    <th className="py-2 px-4 text-left font-medium text-muted-foreground">Nome (à data)</th>
                    <th className="py-2 px-4 text-left font-medium text-muted-foreground">Tipo</th>
                    <th className="py-2 px-4 text-right font-medium text-muted-foreground">Base imponível</th>
                    <th className="py-2 px-4 text-right font-medium text-muted-foreground">Taxa</th>
                    <th className="py-2 px-4 text-right font-medium text-muted-foreground">Imposto</th>
                    <th className="py-2 px-4 text-left font-medium text-muted-foreground">Divergência</th>
                  </tr>
                </thead>
                <tbody>
                  {apuramento.linhas.map((linha) => {
                    const temDivergencia =
                      linha.divergenciaBase !== null &&
                      String(linha.divergenciaBase) !== '0' &&
                      String(linha.divergenciaBase) !== '0.00';
                    return (
                      <tr
                        key={linha.id}
                        className={[
                          'border-b last:border-0 transition-colors',
                          temDivergencia
                            ? 'bg-warning/10 hover:bg-warning/20'
                            : 'hover:bg-muted/40',
                        ].join(' ')}
                      >
                        <td className="py-2 px-4 font-mono font-medium text-xs">
                          {linha.contaCodigo}
                        </td>
                        <td className="py-2 px-4 text-muted-foreground max-w-xs truncate">
                          {linha.contaNome}
                        </td>
                        <td className="py-2 px-4">
                          <span
                            className={
                              linha.tipoMovimento === 'DEBITO'
                                ? 'text-destructive'
                                : 'text-success'
                            }
                          >
                            {linha.tipoMovimento === 'DEBITO' ? 'Débito' : 'Crédito'}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-right">
                          {linha.baseImponivel !== null
                            ? fmt(linha.baseImponivel)
                            : '—'}
                        </td>
                        <td className="py-2 px-4 text-right">
                          {linha.taxaAplicada !== null
                            ? `${(Number(linha.taxaAplicada.toString()) * 100).toFixed(0)} %`
                            : '—'}
                        </td>
                        <td className="py-2 px-4 text-right font-medium">
                          {fmt(linha.valorImposto)}
                        </td>
                        <td className="py-2 px-4">
                          {temDivergencia ? (
                            <span
                              className="inline-flex items-center gap-1 text-warning text-xs font-medium"
                              title="Divergência entre base×taxa e imposto do razão. Pode indicar: documento sem lançamento, lançamento manual sem documento, ou taxa incorrecta."
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {fmt(linha.divergenciaBase!)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Divergências — explicação */}
          {apuramento.linhas.some(
            (l) =>
              l.divergenciaBase !== null &&
              String(l.divergenciaBase) !== '0' &&
              String(l.divergenciaBase) !== '0.00'
          ) && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-warning">
                  Existem divergências nas linhas acima
                </p>
                <p className="text-muted-foreground">
                  Uma divergência significa que o produto de base × taxa não
                  coincide com o movimento registado no razão. As causas mais
                  comuns são: documento fiscal emitido sem o lançamento
                  contabilístico correspondente; lançamento manual que não tem
                  documento associado; ou uma taxa gravada incorrectamente.
                  Confirme a origem antes de declarar.
                </p>
              </div>
            </div>
          )}

          {/* Declaração */}
          {apuramento.estado === 'DECLARADO' && (
            <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm flex items-start gap-3">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-success shrink-0" />
              <div className="space-y-0.5">
                <p className="font-medium text-success">Declarado à AT</p>
                {apuramento.declaradoEm && (
                  <p className="text-muted-foreground">
                    Data de entrega: {formatarData(apuramento.declaradoEm)}
                  </p>
                )}
                {apuramento.referenciaEntrega && (
                  <p className="text-muted-foreground">
                    Referência: {apuramento.referenciaEntrega}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Mapas CSV */}
          <div className="rounded-lg border bg-card">
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Mapas de suporte</h3>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  tipo: 'declaracao',
                  label: 'Suporte Declaração Periódica',
                  desc: 'Modelo A — base e imposto por taxa',
                },
                {
                  tipo: 'clientes',
                  label: 'Mapa de Clientes',
                  desc: 'Por documento — NUIT e imposto liquidado',
                },
                {
                  tipo: 'fornecedores',
                  label: 'Mapa de Fornecedores',
                  desc: 'Por documento — NUIT e imposto dedutível',
                },
                {
                  tipo: 'antiguidade',
                  label: 'Antiguidade do Crédito',
                  desc: 'Crédito em 4438 por período de origem',
                },
              ].map(({ tipo, label, desc }) => (
                <a
                  key={tipo}
                  href={`/api/financas/iva/mapas/${periodo.codigo}?tipo=${tipo}`}
                  className="flex flex-col gap-1 rounded-lg border p-3 hover:bg-muted/40 transition-colors group"
                  download
                >
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">{desc}</p>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

export default async function ApuramentoDetalhe({
  params,
}: {
  params: Promise<{ periodoId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { periodoId } = await params;
  const { tenantId, id: userId } = session.user;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Apuramento de IVA"
        description="Detalhe do apuramento por período"
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Apuramento de IVA', href: '/contabilidade/iva' },
          { label: 'Detalhe' },
        ]}
      />

      <Suspense fallback={<DetalheApuramentoSkeleton />}>
        <ApuramentoDetalheSection
          periodoId={periodoId}
          tenantId={tenantId}
          userId={userId}
        />
      </Suspense>
    </div>
  );
}
