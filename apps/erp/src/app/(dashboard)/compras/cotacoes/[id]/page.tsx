/**
 * Detalhe de Cotação (RFQ) — Server Component (NUNCA 'use client').
 *
 * #109/#114: a lista liga aqui. Mostra os fornecedores convidados (pelo nome), as respostas por
 * item e as acções do ciclo de vida — enviar e cancelar no componente-folha `CotacaoAcoes`
 * (cancelar só com AlertDialog de confirmação); registar resposta e adjudicar são rotas próprias.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Award, ClipboardEdit } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader, StatusBadge, DetailShell } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { CotacaoAcoes } from '../_components/cotacao-acoes';

interface Props {
  params: Promise<{ id: string }>;
}

const ESTADOS_DE_RESPOSTA = ['ENVIADA', 'RESPONDIDA'];

export default async function CotacaoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId, permissions } = session.user;

  let cotacao;
  try {
    cotacao = await runWithTenantContext({ tenantId, userId }, () =>
      comprasService.obterCotacao(id, { tenantId, userId })
    );
  } catch {
    notFound();
  }
  if (!cotacao) notFound();

  const podeResponder =
    ESTADOS_DE_RESPOSTA.includes(cotacao.status) && permissions.includes('compras:cotacao:resposta');
  const podeAdjudicar =
    cotacao.status === 'RESPONDIDA' &&
    cotacao.totalRespostas > 0 &&
    permissions.includes('compras:cotacao:adjudicar');
  const podeEnviar = cotacao.status === 'RASCUNHO' && permissions.includes('compras:cotacao:enviar');
  const podeCancelar =
    ['RASCUNHO', 'ENVIADA', 'RESPONDIDA'].includes(cotacao.status) &&
    permissions.includes('compras:cotacao:cancelar');

  const nomePorFornecedor = new Map(cotacao.fornecedores.map((f) => [f.fornecedorId, f.fornecedorNome]));
  const vencedorNome = cotacao.vencedorFornecedorId
    ? nomePorFornecedor.get(cotacao.vencedorFornecedorId) ?? cotacao.vencedorFornecedorId
    : null;

  const tabFornecedores =
    cotacao.fornecedores.length === 0 ? (
      <p className="text-sm text-muted-foreground py-4 text-center">Nenhum fornecedor convidado.</p>
    ) : (
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Fornecedor</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Estado</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Resposta</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Prazo</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Valor total</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cotacao.fornecedores.map((f) => (
              <TableRow key={f.id} className="h-10">
                <TableCell className="font-medium">
                  {f.fornecedorNome}
                  {cotacao.vencedorFornecedorId === f.fornecedorId && (
                    <span className="ml-2 text-xs text-success">(vencedor)</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={f.status} />
                </TableCell>
                <TableCell className="tabular-nums text-sm">{formatarData(f.dataResposta)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {f.prazoEntregaDias !== null ? `${f.prazoEntregaDias} dias` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {f.valorTotal !== null ? formatMZN(f.valorTotal) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {podeResponder && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/compras/cotacoes/${cotacao.id}/resposta?fornecedorId=${f.fornecedorId}`}>
                        <ClipboardEdit className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Registar resposta
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );

  const tabItens = (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Descrição</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Qtd.</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Unidade</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Respostas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cotacao.itens.map((item) => (
            <TableRow key={item.id} className="align-top">
              <TableCell className="font-medium">{item.descricao}</TableCell>
              <TableCell className="text-right tabular-nums">{item.quantidade}</TableCell>
              <TableCell className="text-muted-foreground">{item.unidadeMedida}</TableCell>
              <TableCell>
                {item.respostas.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Sem respostas</span>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {item.respostas.map((r) => (
                      <li key={r.cotacaoFornecedorId} className="tabular-nums">
                        {nomePorFornecedor.get(r.fornecedorId) ?? r.fornecedorId}: {formatMZN(r.precoUnitario)}
                        {' '}× {item.quantidade} = {formatMZN(r.subtotal)}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const metadata = [
    { label: 'Número', value: <span className="font-medium tabular-nums">{cotacao.numero}</span> },
    { label: 'Data', value: formatarData(cotacao.data) },
    { label: 'Validade', value: formatarData(cotacao.dataValidade) },
    {
      label: 'Respostas',
      value: (
        <span className="tabular-nums">
          {cotacao.totalRespostas}/{cotacao.totalFornecedores}
        </span>
      ),
    },
    ...(vencedorNome ? [{ label: 'Vencedor', value: vencedorNome }] : []),
    ...(cotacao.observacoes ? [{ label: 'Observações', value: cotacao.observacoes }] : []),
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={`Cotação ${cotacao.numero}`}
            description="Pedido de cotação a fornecedores"
            breadcrumbs={[
              { label: 'Compras', href: '/compras' },
              { label: 'Cotações', href: '/compras/cotacoes' },
              { label: cotacao.numero },
            ]}
            badge={<StatusBadge status={cotacao.status} />}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/compras/cotacoes">
                    <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    Voltar
                  </Link>
                </Button>
                {podeAdjudicar && (
                  <Button size="sm" asChild>
                    <Link href={`/compras/cotacoes/${cotacao.id}/adjudicar`}>
                      <Award className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      Adjudicar
                    </Link>
                  </Button>
                )}
                <CotacaoAcoes
                  id={cotacao.id}
                  numero={cotacao.numero}
                  podeEnviar={podeEnviar}
                  podeCancelar={podeCancelar}
                />
              </div>
            }
          />
        }
        tabs={[
          {
            key: 'fornecedores',
            label: 'Fornecedores',
            count: cotacao.fornecedores.length,
            content: tabFornecedores,
          },
          { key: 'itens', label: 'Itens', count: cotacao.itens.length, content: tabItens },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
