import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarSeries } from '@/server/services/financas/faturacao.service';
import type { SerieDocumento } from '@/server/services/financas/faturacao.interface';
import { TipoSerieDocumentoEnum } from '@/lib/validations/faturacao';
import type { TipoSerieGerivel } from '@/lib/series-documento';

export const PERM_LEITURA = 'faturacao:leitura';
export const PERM_ESCRITA = 'faturacao:series:escrita';

export interface AcessoSeries {
  ctx: { tenantId: string; userId: string };
  podeLer: boolean;
  podeEscrever: boolean;
}

/** Sessão + as duas permissões das séries (#149). Sem sessão, vai para o login. */
export async function acessoSeries(): Promise<AcessoSeries> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  const tem = (p: string) => permissions.includes(p);
  return {
    ctx: { tenantId, userId },
    podeLer: tem(PERM_LEITURA),
    podeEscrever: tem(PERM_ESCRITA),
  };
}

export type SerieGerivel = SerieDocumento & { tipo: TipoSerieGerivel };

const eGerivel = (s: SerieDocumento): s is SerieGerivel => TipoSerieDocumentoEnum.safeParse(s.tipo).success;

/**
 * As séries que o ecrã gere: `listarSeries` devolve também as operacionais
 * (VENDA, ENCOMENDA…), que não entram aqui — são numeradas pelo sistema.
 */
export async function listarSeriesGeriveis(ctx: AcessoSeries['ctx']): Promise<SerieGerivel[]> {
  const todas = await runWithTenantContext(ctx, () => listarSeries(ctx));
  return todas.filter(eGerivel);
}

export function SemPermissao({ mensagem }: { mensagem: string }) {
  return (
    <div
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm"
      data-testid="series-sem-permissao"
    >
      <p className="font-medium text-destructive">Sem permissão</p>
      <p className="mt-1 text-muted-foreground">{mensagem}</p>
    </div>
  );
}
