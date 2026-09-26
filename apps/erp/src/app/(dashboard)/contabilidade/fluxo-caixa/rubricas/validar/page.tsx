/**
 * Validar a versão actual do mapeamento — Server Component (ticket 7.3;
 * ADR-0037 E5: `financas:fluxo-caixa:validar`, por omissão só o ADMIN).
 * Rota própria com formulário, não `AlertDialog`: a observação é texto.
 */
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { versaoAtual } from '@/server/services/financas/dfc.service';
import { formatarDataHora } from '@/lib/format-date';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Card, CardContent } from '@/components/ui/card';
import { acessoDFC, lerVoltar, SemPermissao } from '../_components/acesso';
import { BREADCRUMBS_BASE } from '../_components/rotulos';
import { ValidarVersaoForm } from '../_components/validar-versao-form';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ValidarVersaoPage({ searchParams }: PageProps) {
  const acesso = await acessoDFC();
  const cabecalho = (
    <PageHeader
      title="Validar versão do mapeamento"
      description="O parecer sobre a classificação das contas fica associado a esta versão"
      breadcrumbs={[...BREADCRUMBS_BASE, { label: 'Validar' }]}
    />
  );
  if (!acesso.podeValidar) {
    return (
      <div className="p-6 space-y-6">
        {cabecalho}
        <SemPermissao mensagem="Validar o mapeamento da DFC exige a permissão própria de validação (por omissão, só o administrador)." />
      </div>
    );
  }
  const { ctx } = acesso;
  const voltar = lerVoltar((await searchParams).voltar);
  const versao = await runWithTenantContext(ctx, () => versaoAtual(ctx));

  return (
    <div className="p-6 space-y-6">
      {cabecalho}
      {versao && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm" data-testid="validar-versao-info">
            <span className="font-medium">Versão {versao.numero}</span>
            <StatusBadge status={versao.estado} />
            <span className="text-muted-foreground">criada em {formatarDataHora(versao.createdAt)}</span>
            <span className="text-muted-foreground">
              · {versao.instantaneo.rubricas.length} rubricas · {versao.instantaneo.mapeamentos.length} contas mapeadas
            </span>
          </CardContent>
        </Card>
      )}
      {!versao ? (
        <p className="text-sm text-muted-foreground">Mapeamento ainda não semeado neste tenant: não há versão a validar.</p>
      ) : versao.estado !== 'PENDING' ? (
        <p className="text-sm text-muted-foreground" data-testid="validar-ja-validada">
          A versão actual já está validada. Uma alteração ao mapeamento cria uma versão nova, por validar.
        </p>
      ) : (
        <ValidarVersaoForm versaoId={versao.id} numero={versao.numero} voltar={voltar} />
      )}
    </div>
  );
}
