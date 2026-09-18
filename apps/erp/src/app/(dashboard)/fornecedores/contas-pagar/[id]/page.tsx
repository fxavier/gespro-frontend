/**
 * Detalhe de Conta a Pagar — Server Component (NUNCA 'use client').
 *
 * Página completa, sem painel interceptável: o `@panel/(.)[id]` do molde tem
 * o bug conhecido do segmento `novo` e aqui não há lista com pré-visualização
 * que o justifique. As mutações vivem em rotas dedicadas — `/pagar` e
 * `/cancelar` — porque ambas recolhem dados (valor, motivo) e a regra da casa
 * é «um campo de texto é formulário, logo é rota».
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Ban, ExternalLink, Wallet } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { contaPagarService } from '@/server/services/compras/conta-pagar.service';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';

interface Props {
  params: Promise<{ id: string }>;
}

/** `formaPagamento` é texto livre no modelo; os valores do formulário ganham rótulo. */
const FORMAS: Record<string, string> = {
  TRANSFERENCIA_BANCARIA: 'Transferência bancária',
  CHEQUE: 'Cheque',
  'M-PESA': 'M-Pesa',
  'E-MOLA': 'e-Mola',
  NUMERARIO: 'Numerário',
};
const rotuloForma = (v: string) => FORMAS[v] ?? v.replace(/_/g, ' ');

export default async function ContaPagarDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let conta;
  try {
    conta = await runWithTenantContext(ctx, () => contaPagarService.obter(id, ctx));
  } catch {
    notFound();
  }
  if (!conta) notFound();

  const emAberto = conta.status === 'ABERTA' || conta.status === 'PARCIALMENTE_PAGA' || conta.status === 'VENCIDA';
  // Só faz sentido falar de atraso enquanto há valor por pagar.
  const atraso = emAberto && conta.diasAtraso > 0 ? conta.diasAtraso : 0;

  const tabPagamentos =
    conta.pagamentos.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Ainda não há pagamentos registados nesta conta.
      </p>
    ) : (
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Número</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Forma e referência</TableHead>
              <TableHead>Lançamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conta.pagamentos.map((p) => (
              <TableRow key={p.id} className="h-11">
                <TableCell className="font-medium tabular-nums whitespace-nowrap">{p.numero}</TableCell>
                <TableCell className="tabular-nums whitespace-nowrap">{formatarData(p.dataPagamento)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                  {formatMZN(p.valor)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {rotuloForma(p.formaPagamento)}
                  {p.referencia ? (
                    <span className="block text-xs text-muted-foreground">{p.referencia}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {p.lancamentoId ? (
                    <Link
                      href={`/contabilidade/lancamentos/${p.lancamentoId}`}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-primary hover:underline"
                    >
                      Ver lançamento
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {/* Sem coluna «Estado»: o serviço cria todos os pagamentos CONCLUIDO
                    e não há acção que os altere — seria uma coluna de valor único.
                    A referência vai por baixo da forma: a sétima coluna não cabia. */}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end gap-8 border-t bg-secondary/60 px-4 py-3 text-right">
          <div>
            <p className="text-xs text-muted-foreground">Pago</p>
            <p className="font-semibold tabular-nums">{formatMZN(conta.valorPago)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Restante</p>
            <p className="text-lg font-bold tabular-nums">{formatMZN(conta.valorRestante)}</p>
          </div>
        </div>
      </div>
    );

  const metadata = [
    { label: 'Número', value: <span className="font-medium tabular-nums">{conta.numero}</span> },
    {
      label: 'Fornecedor',
      value: (
        <Link href={`/fornecedores/${conta.fornecedorId}`} className="text-primary hover:underline">
          {conta.fornecedorNome}
        </Link>
      ),
    },
    { label: 'Emissão', value: formatarData(conta.dataEmissao) },
    {
      label: 'Vencimento',
      value: (
        <span className={atraso > 0 ? 'font-medium text-destructive' : undefined}>
          {formatarData(conta.dataVencimento)}
          {atraso > 0 ? ` · ${atraso} dias de atraso` : ''}
        </span>
      ),
    },
    { label: 'Valor original', value: <span className="tabular-nums">{formatMZN(conta.valorOriginal)}</span> },
    { label: 'Valor pago', value: <span className="tabular-nums">{formatMZN(conta.valorPago)}</span> },
    {
      label: 'Valor restante',
      value: <span className="font-semibold tabular-nums">{formatMZN(conta.valorRestante)}</span>,
    },
    conta.observacoes ? { label: 'Observações', value: conta.observacoes } : null,
  ].filter(Boolean) as Array<{ label: string; value: React.ReactNode }>;

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Conta a pagar ${conta.numero}`}
            description={conta.descricao}
            breadcrumbs={[
              { label: 'Fornecedores', href: '/fornecedores' },
              { label: 'Contas a Pagar', href: '/fornecedores/contas-pagar' },
              { label: conta.numero },
            ]}
            badge={<StatusBadge status={conta.status} />}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/fornecedores/contas-pagar">
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    Voltar
                  </Link>
                </Button>
                {emAberto && (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/fornecedores/contas-pagar/${conta.id}/cancelar`}>
                        <Ban className="mr-1.5 h-4 w-4" />
                        Cancelar conta
                      </Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href={`/fornecedores/contas-pagar/${conta.id}/pagar`}>
                        <Wallet className="mr-1.5 h-4 w-4" />
                        Registar pagamento
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'pagamentos',
            label: 'Pagamentos',
            count: conta.pagamentos.length,
            content: tabPagamentos,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
