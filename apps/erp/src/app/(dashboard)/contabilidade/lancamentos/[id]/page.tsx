/**
 * Detalhe de um lançamento contabilístico — Server Component.
 *
 * A listagem oferecia «Ver detalhe» e linhas clicáveis para esta rota, que não
 * existia. Mostra o lançamento, as partidas com o seu equilíbrio (débitos =
 * créditos, que é a própria definição de partidas dobradas) e as duas pontas
 * do estorno.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Undo2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { formatarData, formatarDataExtensa } from '@/lib/format-date';
import { ConfirmarLancamento } from '../_components/confirmar-lancamento';
import { OrigemDocumento } from '../_components/origem-documento';

const ORIGEM_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  VENDA: 'Venda',
  COMPRA: 'Compra',
  PAGAMENTO: 'Pagamento',
  RECEBIMENTO: 'Recebimento',
  CAIXA: 'Caixa',
  PAYROLL: 'Processamento salarial',
  AJUSTE: 'Ajuste',
  ESTORNO: 'Estorno',
};

export default async function LancamentoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const { id } = await params;
  const ctx = { tenantId, userId };

  const detalhe = await runWithTenantContext(ctx, () =>
    contabilidadeService.obterLancamentoDetalhe(id, ctx)
  );
  if (!detalhe) notFound();

  const { lancamento, original, estorno } = detalhe;

  // Decimal → string na fronteira; a soma é feita aqui, em cêntimos inteiros,
  // para não reintroduzir o float que o Decimal existe para evitar.
  const partidas = lancamento.partidas.map((p) => ({
    id: p.id,
    conta: p.conta,
    centroCusto: p.centroCusto,
    tipo: p.tipo,
    historico: p.historico,
    valor: p.valor.toString(),
  }));

  const somaCentimos = (lado: 'DEBITO' | 'CREDITO') =>
    partidas
      .filter((p) => p.tipo === lado)
      .reduce((acc, p) => acc + Math.round(parseFloat(p.valor) * 100), 0);

  const debitos = somaCentimos('DEBITO');
  const creditos = somaCentimos('CREDITO');
  const equilibrado = debitos === creditos;

  const meta: { label: string; value: React.ReactNode }[] = [
    { label: 'Data', value: formatarData(lancamento.data) },
    {
      label: 'Diário',
      value: lancamento.diario ? (
        <Link
          href={`/contabilidade/diarios/${lancamento.diario.id}`}
          className="underline underline-offset-4 hover:text-primary"
        >
          {lancamento.diario.codigo} — {lancamento.diario.nome}
        </Link>
      ) : (
        '—'
      ),
    },
    { label: 'Origem', value: ORIGEM_LABEL[lancamento.origem] ?? lancamento.origem },
    { label: 'Período fiscal', value: lancamento.periodoFiscal },
    {
      label: 'Documento de origem',
      value: (
        <OrigemDocumento
          tipo={lancamento.documentoOrigemTipo ?? null}
          documentoId={lancamento.documentoOrigemId ?? null}
        />
      ),
    },
    { label: 'Registado em', value: formatarDataExtensa(lancamento.createdAt) },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Lançamento ${lancamento.numero}`}
        description={lancamento.historico}
        breadcrumbs={[
          { label: 'Contabilidade', href: '/contabilidade' },
          { label: 'Lançamentos', href: '/contabilidade/lancamentos' },
          { label: lancamento.numero },
        ]}
        badge={<StatusBadge status={lancamento.status} />}
        actions={
          <>
            {lancamento.status === 'RASCUNHO' && (
              <ConfirmarLancamento id={lancamento.id} numero={lancamento.numero} />
            )}
            {lancamento.status === 'LANCADO' && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/contabilidade/lancamentos/${lancamento.id}/estornar`}>
                  <Undo2 className="h-4 w-4 mr-1.5" />
                  Estornar
                </Link>
              </Button>
            )}
          </>
        }
      />

      {(original || estorno) && (
        <div className="rounded-lg border border-info/30 bg-info/10 p-4 text-sm">
          {original && (
            <p>
              Este é o estorno de{' '}
              <Link
                href={`/contabilidade/lancamentos/${original.id}`}
                className="font-medium underline underline-offset-4"
              >
                {original.numero}
              </Link>{' '}
              ({formatarData(original.data)}).
            </p>
          )}
          {estorno && (
            <p>
              Estornado por{' '}
              <Link
                href={`/contabilidade/lancamentos/${estorno.id}`}
                className="font-medium underline underline-offset-4"
              >
                {estorno.numero}
              </Link>{' '}
              ({formatarData(estorno.data)}). O original mantém-se — a correcção é o
              contra-lançamento, não uma alteração.
            </p>
          )}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            {meta.map((campo) => (
              <div key={campo.label} className="space-y-1">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {campo.label}
                </dt>
                <dd className="text-sm font-medium">{campo.value}</dd>
              </div>
            ))}
          </dl>

          {lancamento.observacoes && (
            <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">
              {lancamento.observacoes}
            </p>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Partidas <span className="text-muted-foreground">({partidas.length})</span>
        </h2>

        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Conta</TableHead>
                <TableHead>Histórico</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead className="text-right">Débito</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partidas.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.conta ? (
                      <Link
                        href={`/contabilidade/plano-contas/${p.conta.id}`}
                        className="hover:underline"
                      >
                        <span className="font-mono text-primary">{p.conta.codigo}</span>{' '}
                        {p.conta.nome}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.historico ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.centroCusto ? `${p.centroCusto.codigo} — ${p.centroCusto.nome}` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.tipo === 'DEBITO' ? formatMZN(p.valor) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.tipo === 'CREDITO' ? formatMZN(p.valor) : '—'}
                  </TableCell>
                </TableRow>
              ))}

              <TableRow className="border-t-2 font-semibold hover:bg-transparent">
                <TableCell colSpan={3}>Totais</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMZN(debitos / 100)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMZN(creditos / 100)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {!equilibrado && (
          <p role="alert" className="text-sm text-destructive">
            Débitos e créditos não coincidem — este lançamento está desequilibrado, o que nunca
            devia acontecer em partidas dobradas. Comunique ao suporte antes de o confirmar.
          </p>
        )}
      </section>
    </div>
  );
}
