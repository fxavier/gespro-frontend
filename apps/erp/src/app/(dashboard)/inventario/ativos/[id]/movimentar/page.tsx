/**
 * Movimentar Ativo (transferência de localização/responsável, #118) — Server Component.
 * Recolher dados é formulário, logo é rota própria (sem modais).
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { ativosService } from '@/server/services/inventario/ativos.service';
import { PageHeader } from '@/components/patterns';
import { MovimentarAtivoForm } from './_components/movimentar-ativo-form';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MovimentarAtivoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  let ativo;
  try {
    ativo = await runWithTenantContext({ tenantId, userId }, () => ativosService.obterAtivo(id, ctx));
  } catch {
    notFound();
  }
  if (!ativo) notFound();
  if (ativo.estado === 'BAIXADO') redirect(`/inventario/ativos/${id}`);

  const [localizacoes, responsaveis] = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      ativosService.procurarLocalizacoesDestino('', ctx),
      ativosService.procurarResponsaveis('', ctx),
    ]),
  );

  // Localização/responsável actuais (para mostrar a origem), fora da primeira página se for o caso.
  const nomeLocalizacaoActual = localizacoes.find((l) => l.id === ativo.localizacaoId)?.nome ?? null;
  const nomeResponsavelActual = ativo.responsavelId
    ? (responsaveis.find((u) => u.id === ativo.responsavelId)?.nome ?? null)
    : null;

  return (
    <div className="space-y-2">
      <div className="px-6 pt-6">
        <PageHeader
          title={`Movimentar ${ativo.nome}`}
          description="Transferir o ativo para outra localização ou outro responsável"
          breadcrumbs={[
            { label: 'Inventário', href: '/inventario' },
            { label: 'Ativos', href: '/inventario/ativos' },
            { label: ativo.codigoInterno, href: `/inventario/ativos/${id}` },
            { label: 'Movimentar' },
          ]}
        />
      </div>

      <MovimentarAtivoForm
        ativoId={ativo.id}
        localizacaoActual={nomeLocalizacaoActual}
        responsavelActual={nomeResponsavelActual}
        localizacoesIniciais={localizacoes.map((l) => ({ value: l.id, label: l.detalhe ? `${l.nome} (${l.detalhe})` : l.nome }))}
        responsaveisIniciais={responsaveis.map((u) => ({ value: u.id, label: u.detalhe ? `${u.nome} (${u.detalhe})` : u.nome }))}
      />
    </div>
  );
}
