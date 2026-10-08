/**
 * Registar contagem de um activo (#117) — Server Component (NUNCA 'use client').
 *
 * Rota própria (recolhe dados → formulário, sem modais). Só com o inventário EM_ANDAMENTO;
 * noutro estado volta ao detalhe (o serviço recusa na mesma, com INVENTARIO_NAO_EM_ANDAMENTO).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { inventarioFisicoService } from '@/server/services/inventario/inventario-fisico.service';
import { PageHeader } from '@/components/patterns';
import { Card, CardContent } from '@/components/ui/card';
import { EstadoAtivoEnum, ROTULOS_ESTADO_ATIVO } from '@/lib/validations/inventario-ativos';
import { RegistarContagemForm } from './_components/registar-contagem-form';

interface Props {
  params: Promise<{ id: string; contagemId: string }>;
}

export default async function RegistarContagemPage({ params }: Props) {
  const { id, contagemId } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const dados = await runWithTenantContext(ctx, async () => {
    try {
      const [inv, contagem] = await Promise.all([
        inventarioFisicoService.obterInventario(id, ctx),
        inventarioFisicoService.obterContagem(id, contagemId, ctx),
      ]);
      return { inv, contagem };
    } catch {
      return null;
    }
  });
  if (!dados) notFound();

  const { inv, contagem } = dados;
  const detalhe = `/inventario/fisico/${id}`;
  if (inv.status !== 'EM_ANDAMENTO') redirect(detalhe);

  const estado = (v: string | null) => {
    const r = EstadoAtivoEnum.safeParse(v);
    return r.success ? r.data : undefined;
  };
  const estadoEsperado = estado(contagem.estadoEsperado);
  const jaContado = contagem.dataContagem !== null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Registar contagem"
        description={`${contagem.ativo?.codigoInterno ?? ''} — ${contagem.ativo?.nome ?? ''}`}
        breadcrumbs={[
          { label: 'Inventário', href: '/inventario' },
          { label: 'Inventário Físico', href: '/inventario/fisico' },
          { label: inv.codigo, href: detalhe },
          { label: 'Registar contagem' },
        ]}
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Código interno</p>
            <p className="text-sm font-medium font-mono">{contagem.ativo?.codigoInterno}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Activo</p>
            <p className="text-sm font-medium">{contagem.ativo?.nome}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Estado esperado</p>
            <p className="text-sm font-medium">
              {estadoEsperado ? ROTULOS_ESTADO_ATIVO[estadoEsperado] : contagem.estadoEsperado}
            </p>
          </div>
        </CardContent>
      </Card>

      <RegistarContagemForm
        inventarioId={id}
        contagemId={contagem.id}
        encontrado={jaContado ? contagem.encontrado : true}
        estadoEncontrado={jaContado ? estado(contagem.estadoEncontrado) : estadoEsperado}
        observacoesContagem={contagem.observacoesContagem ?? ''}
      />
    </div>
  );
}
