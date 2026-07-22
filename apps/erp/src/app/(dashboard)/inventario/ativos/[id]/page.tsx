/**
 * Detalhe de Ativo — Server Component (NUNCA 'use client').
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Edit, ArrowLeft, FileText, History } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
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
import { AtivoAcoes } from '../_components/ativo-acoes';

const ESTADO_VARIANTES: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline'> = {
  NOVO: 'info',
  EM_USO: 'success',
  EM_MANUTENCAO: 'warning',
  EM_TRANSFERENCIA: 'warning',
  OBSOLETO: 'secondary',
  BAIXADO: 'destructive',
};

const ESTADO_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  EM_USO: 'Em Uso',
  EM_MANUTENCAO: 'Em Manutenção',
  EM_TRANSFERENCIA: 'Em Transferência',
  OBSOLETO: 'Obsoleto',
  BAIXADO: 'Baixado',
};

const METODO_LABELS: Record<string, string> = {
  LINEAR: 'Linear',
  DIGITOS_ANOS: 'Dígitos dos Anos',
  UNIDADES_PRODUCAO: 'Unidades de Produção',
  SALDOS_DECRESCENTES: 'Saldos Decrescentes',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AtivoDetalhePage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let ativo;
  try {
    ativo = await runWithTenantContext({ tenantId, userId }, () =>
      ativosService.obterAtivo(id, ctx)
    );
  } catch {
    notFound();
  }

  if (!ativo) notFound();

  const podeEditar = ativo.estado !== 'BAIXADO';

  // Aba: Informações Gerais
  const tabInformacoes = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Identificação</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-muted-foreground">Código Interno</dt>
              <dd className="font-medium tabular-nums">{ativo.codigoInterno}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Nome</dt>
              <dd className="font-medium">{ativo.nome}</dd>
            </div>
            {ativo.descricao && (
              <div>
                <dt className="text-xs text-muted-foreground">Descrição</dt>
                <dd className="text-sm">{ativo.descricao}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Categoria</dt>
              <dd>{ativo.categoria?.nome ?? <span className="text-muted-foreground">—</span>}</dd>
            </div>
          </dl>
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Especificações</h3>
          <dl className="space-y-3">
            {ativo.marca && (
              <div>
                <dt className="text-xs text-muted-foreground">Marca</dt>
                <dd className="font-medium">{ativo.marca}</dd>
              </div>
            )}
            {ativo.modelo && (
              <div>
                <dt className="text-xs text-muted-foreground">Modelo</dt>
                <dd>{ativo.modelo}</dd>
              </div>
            )}
            {ativo.numeroSerie && (
              <div>
                <dt className="text-xs text-muted-foreground">Número de Série</dt>
                <dd className="tabular-nums font-mono text-sm">{ativo.numeroSerie}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">Financeiro</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Valor de Compra</p>
            <p className="font-semibold tabular-nums">
              MT {Number(ativo.valorCompra).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
            </p>
          </div>
          {ativo.valorResidual && (
            <div>
              <p className="text-xs text-muted-foreground">Valor Residual</p>
              <p className="font-semibold tabular-nums">
                MT {Number(ativo.valorResidual).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}
          {ativo.valorLiquidoContabilistico && (
            <div>
              <p className="text-xs text-muted-foreground">Valor Líquido</p>
              <p className="font-semibold tabular-nums">
                MT {Number(ativo.valorLiquidoContabilistico).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Data de Aquisição</p>
            <p className="tabular-nums">
              {new Date(ativo.dataAquisicao).toLocaleDateString('pt-MZ')}
            </p>
          </div>
        </div>
      </div>

      {ativo.observacoes && (
        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground mb-1">Observações</p>
          <p className="text-sm">{ativo.observacoes}</p>
        </div>
      )}
    </div>
  );

  // Aba: Documentos
  const tabDocumentos = (
    <div className="space-y-3">
      {ativo.documentos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nenhum documento anexado a este ativo.
        </p>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {ativo.documentos.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{doc.nome}</p>
                  <p className="text-xs text-muted-foreground">{doc.tipo}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                  Ver
                </a>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Aba: Amortização
  const tabAmortizacao = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Método</p>
          <p className="font-medium">{METODO_LABELS[ativo.metodoAmortizacao] ?? ativo.metodoAmortizacao}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vida Útil</p>
          <p className="font-medium tabular-nums">{ativo.vidaUtilAnos} anos</p>
        </div>
        {ativo.percentualAmortizado && (
          <div>
            <p className="text-xs text-muted-foreground">% Amortizado</p>
            <p className="font-medium tabular-nums">{Number(ativo.percentualAmortizado).toFixed(1)}%</p>
          </div>
        )}
        {ativo.valorAmortizadoAcumulado && (
          <div>
            <p className="text-xs text-muted-foreground">Amortização Acumulada</p>
            <p className="font-semibold tabular-nums">
              MT {Number(ativo.valorAmortizadoAcumulado).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
        {ativo.dataSubstituicao && (
          <div>
            <p className="text-xs text-muted-foreground">Data de Substituição</p>
            <p className="tabular-nums">{new Date(ativo.dataSubstituicao).toLocaleDateString('pt-MZ')}</p>
          </div>
        )}
      </div>
    </div>
  );

  // Metadados laterais
  const metadata = [
    { label: 'Código', value: <span className="font-medium tabular-nums">{ativo.codigoInterno}</span> },
    {
      label: 'Estado',
      value: (
        <StatusBadge
          status={ativo.estado}
          variant={ESTADO_VARIANTES[ativo.estado]}
          label={ESTADO_LABELS[ativo.estado]}
        />
      ),
    },
    { label: 'Categoria', value: ativo.categoria?.nome ?? '—' },
    {
      label: 'Aquisição',
      value: new Date(ativo.dataAquisicao).toLocaleDateString('pt-MZ'),
    },
    {
      label: 'Valor',
      value: (
        <span className="font-semibold tabular-nums">
          MT {Number(ativo.valorCompra).toLocaleString('pt-MZ', { minimumFractionDigits: 0 })}
        </span>
      ),
    },
    {
      label: 'Amortização',
      value: METODO_LABELS[ativo.metodoAmortizacao] ?? ativo.metodoAmortizacao,
    },
    { label: 'Vida Útil', value: `${ativo.vidaUtilAnos} anos` },
  ];

  return (
    <div className="p-6">
      <DetailShell
        header={
          <PageHeader
            title={ativo.nome}
            description={ativo.descricao?.slice(0, 120) ?? `Código: ${ativo.codigoInterno}`}
            breadcrumbs={[
              { label: 'Inventário', href: '/inventario' },
              { label: 'Ativos', href: '/inventario/ativos' },
              { label: ativo.codigoInterno },
            ]}
            badge={
              <StatusBadge
                status={ativo.estado}
                variant={ESTADO_VARIANTES[ativo.estado]}
                label={ESTADO_LABELS[ativo.estado]}
              />
            }
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/inventario/ativos">
                    <ArrowLeft className="h-4 w-4 mr-1.5" />
                    Voltar
                  </Link>
                </Button>
                {podeEditar && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/inventario/ativos/${ativo.id}/editar`}>
                      <Edit className="h-4 w-4 mr-1.5" />
                      Editar
                    </Link>
                  </Button>
                )}
                <AtivoAcoes id={ativo.id} estado={ativo.estado} />
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
            key: 'documentos',
            label: 'Documentos',
            count: ativo.documentos.length,
            content: tabDocumentos,
          },
          {
            key: 'amortizacao',
            label: 'Amortização',
            content: tabAmortizacao,
          },
        ]}
        metadata={metadata}
      />
    </div>
  );
}
