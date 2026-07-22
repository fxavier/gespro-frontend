'use client';

import { useState, useTransition } from 'react';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/patterns';
import {
  abrirPortalCliente,
  cancelarSubscricao,
  iniciarCheckout,
} from '@/server/actions/onboarding.actions';
import { PLANOS, PLANO_IDS, type CicloId, type PlanoId } from '@/lib/planos';

/**
 * Folha cliente da página de subscrição.
 *
 * Sem modais para escolher plano: os planos são cartões na própria página e o
 * pagamento acontece no Stripe (redirect). O único `AlertDialog` é a confirmação
 * destrutiva do cancelamento — a excepção permitida pelas convenções de UI.
 */
export function FaturacaoAcoes({
  planoActual,
  cicloActual,
  temSubscricaoStripe,
  cancelavel,
}: {
  planoActual: PlanoId;
  cicloActual: CicloId | null;
  temSubscricaoStripe: boolean;
  cancelavel: boolean;
}) {
  const [ciclo, setCiclo] = useState<CicloId>(cicloActual ?? 'MENSAL');
  const [pendente, iniciar] = useTransition();
  const [aCarregar, setACarregar] = useState<string | null>(null);

  function subscrever(planoId: PlanoId) {
    setACarregar(planoId);
    iniciar(async () => {
      const r = await iniciarCheckout({ planoId, ciclo });
      setACarregar(null);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      window.location.href = r.data.url;
    });
  }

  function abrirPortal() {
    setACarregar('portal');
    iniciar(async () => {
      const r = await abrirPortalCliente(undefined);
      setACarregar(null);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      window.location.href = r.data.url;
    });
  }

  function cancelar() {
    iniciar(async () => {
      const r = await cancelarSubscricao({});
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(
        r.data.fimDoPeriodo
          ? 'A subscrição será cancelada no fim do período já pago.'
          : 'Subscrição cancelada.',
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Periodicidade:</span>
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Periodicidade">
          {(['MENSAL', 'ANUAL'] as CicloId[]).map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={ciclo === c ? 'default' : 'ghost'}
              aria-pressed={ciclo === c}
              onClick={() => setCiclo(c)}
            >
              {c === 'MENSAL' ? 'Mensal' : 'Anual (2 meses grátis)'}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANO_IDS.map((id) => {
          const plano = PLANOS[id];
          const preco = ciclo === 'ANUAL' ? plano.precoAnual : plano.precoMensal;
          const actual = id === planoActual;
          return (
            <Card key={id} className={actual ? 'border-primary' : undefined}>
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{plano.nome}</CardTitle>
                  {actual && <StatusBadge status="ATIVA" label="Plano actual" />}
                </div>
                <p className="text-sm text-muted-foreground">{plano.descricao}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-2xl font-semibold tabular-nums">
                  {preco.valor} {preco.moeda}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    /{ciclo === 'ANUAL' ? 'ano' : 'mês'}
                  </span>
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>
                    Utilizadores:{' '}
                    {plano.limites.utilizadores === -1 ? 'ilimitados' : plano.limites.utilizadores}
                  </li>
                  <li>
                    Armazéns: {plano.limites.armazens === -1 ? 'ilimitados' : plano.limites.armazens}
                  </li>
                  <li>
                    Documentos/mês:{' '}
                    {plano.limites.documentosMes === -1
                      ? 'ilimitados'
                      : plano.limites.documentosMes}
                  </li>
                  <li>Suporte: {plano.limites.suporte}</li>
                </ul>
                <Button
                  className="w-full"
                  disabled={pendente}
                  onClick={() => subscrever(id)}
                >
                  {aCarregar === id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {actual ? 'Renovar / mudar ciclo' : 'Subscrever'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        {temSubscricaoStripe && (
          <Button variant="outline" disabled={pendente} onClick={abrirPortal}>
            {aCarregar === 'portal' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Gerir pagamento e facturas
          </Button>
        )}

        {cancelavel && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={pendente}>
                Cancelar subscrição
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancelar a subscrição do GestPro?</AlertDialogTitle>
                <AlertDialogDescription>
                  O acesso mantém-se até ao fim do período já pago. Depois disso, os utilizadores
                  deixam de conseguir iniciar sessão até nova subscrição. Os dados não são apagados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Manter subscrição</AlertDialogCancel>
                <AlertDialogAction onClick={cancelar}>Cancelar subscrição</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
