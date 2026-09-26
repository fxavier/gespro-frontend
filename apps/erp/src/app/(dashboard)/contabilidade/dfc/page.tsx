/**
 * Demonstração de Fluxos de Caixa (método indirecto) — Server Component.
 * Spec 22 · WS-2 · ADR-0037 (com a Emenda 2026-09-25); nó `fatia` do grafo
 * `dfc`, ticket 6.3.
 *
 * Como o balancete e a DRE: lê o serviço directamente dentro de
 * `runWithTenantContext` — nunca faz fetch à própria API — e chama SÓ
 * `gerarDFC` (MINOR-4), que já traz as contas não mapeadas quando há
 * impedimentos; chamar também `contasNaoMapeadas` duplicaria as agregações.
 *
 * Intervalo: a URL leva datas (`dataInicio`, `dataFim`, `aaaa-mm-dd`), como no
 * balancete e na DRE, e o `SeletorPeriodo` partilhado fica intacto. As datas
 * resolvem-se aqui para os períodos contabilísticos que as contêm
 * (`resolverIntervaloDFC`), porque a DFC é de períodos COMPLETOS (ADR-0037 §6,
 * E3) e o `FiltroDFC` recebe ids de período. Um dia a meio do mês alarga ao
 * mês, e a página di-lo. Sem datas: do 1.º período do exercício corrente ao
 * período de hoje.
 *
 * Erros de regra do serviço (`DFC_ENTRE_EXERCICIOS`, `DFC_INTERVALO_INVERTIDO`,
 * `DFC_NAO_ARTICULA`) mostram-se com o código e, no caso da articulação, com o
 * delta: um mapa que não articula não sai, e a página não o esconde. Qualquer
 * outro erro propaga para o `error.tsx` (≠ 200), como no balancete e na DRE.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Settings2, TriangleAlert } from 'lucide-react';
import { auth } from '@/lib/auth';
import { BusinessRuleError } from '@/lib/errors';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarPeriodos } from '@/server/services/financas/contabilidade.service';
import { gerarDFC } from '@/server/services/financas/dfc.service';
import { ERROS_DFC, temImpedimentos } from '@/server/services/financas/dfc.interface';
import { resolverIntervaloDFC } from '@/lib/dfc-intervalo';
import { formatMZN } from '@/lib/format-currency';
import { PageHeader, TableSkeleton } from '@/components/patterns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SeletorPeriodo } from '../_components/seletor-periodo';
import { MapaDFC } from './_components/mapa-dfc';
import { ImpedimentosPainel } from './_components/impedimentos-painel';

const PERMISSAO = 'financas:fluxo-caixa:leitura';
const PERMISSAO_CONFIGURAR = 'financas:fluxo-caixa:configurar';
const PERMISSAO_EXPORTAR = 'financas:exportar';

const CABECALHO = {
  title: 'Demonstração de Fluxos de Caixa',
  description: 'Método indirecto — actividades operacionais, de investimento e de financiamento',
  breadcrumbs: [{ label: 'Contabilidade', href: '/contabilidade' }, { label: 'Fluxos de Caixa' }],
};

const CODIGOS_MOSTRAVEIS = new Set<string>([
  ERROS_DFC.DFC_ENTRE_EXERCICIOS,
  ERROS_DFC.DFC_INTERVALO_INVERTIDO,
  ERROS_DFC.DFC_NAO_ARTICULA,
]);

function Recusa({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Alert variant="destructive" data-testid="dfc-erro">
      <TriangleAlert className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

async function SeccaoDFC({
  periodoInicioId,
  periodoFimId,
  tenantId,
  userId,
  podeConfigurar,
  podeExportar,
  voltar,
}: {
  periodoInicioId: string;
  periodoFimId: string;
  tenantId: string;
  userId: string;
  podeConfigurar: boolean;
  podeExportar: boolean;
  /** Esta DFC com o mesmo intervalo — o `voltar` do «Mapear». */
  voltar: string;
}) {
  const ctx = { tenantId, userId };
  let resultado;
  try {
    resultado = await runWithTenantContext(ctx, () => gerarDFC({ periodoInicioId, periodoFimId }, ctx));
  } catch (e) {
    if (e instanceof BusinessRuleError && CODIGOS_MOSTRAVEIS.has(e.code)) {
      const delta =
        e.code === ERROS_DFC.DFC_NAO_ARTICULA && e.details && typeof e.details === 'object' && 'delta' in e.details
          ? formatMZN(String((e.details as { delta: unknown }).delta))
          : null;
      return (
        <Recusa titulo={e.code === ERROS_DFC.DFC_NAO_ARTICULA ? 'A DFC não articula' : 'Intervalo recusado'}>
          <p>{e.message}</p>
          {delta && (
            <p className="mt-1">
              Diferença: <span className="tabular-nums">{delta}</span>. É um defeito de mapeamento ou de dados — o
              mapa não é mostrado.
            </p>
          )}
          <p className="mt-1 text-xs">Código: {e.code}</p>
        </Recusa>
      );
    }
    throw e;
  }

  if (temImpedimentos(resultado)) {
    return <ImpedimentosPainel resultado={resultado} podeConfigurar={podeConfigurar} voltar={voltar} />;
  }
  return <MapaDFC dfc={resultado} podeExportar={podeExportar} />;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DfcPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;

  if (!permissions.includes(PERMISSAO)) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader {...CABECALHO} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm" data-testid="dfc-sem-permissao">
          <p className="font-medium text-destructive">Sem permissão</p>
          <p className="mt-1 text-muted-foreground">
            Não tem permissão para consultar a Demonstração de Fluxos de Caixa. Contacte o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  const raw = await searchParams;
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const ctx = { tenantId, userId };
  const periodos = await runWithTenantContext(ctx, () => listarPeriodos({}, ctx));
  const intervalo = resolverIntervaloDFC(periodos, { dataInicio: um(raw.dataInicio), dataFim: um(raw.dataFim) }, new Date());

  return (
    <div className="p-6 space-y-6">
      {/* Aqui já há `:leitura`, que chega para ver o painel de rubricas (só de
          leitura para quem não configura): a ligação aparece sempre, e o
          rótulo diz o que o utilizador lá pode fazer. */}
      <PageHeader
        {...CABECALHO}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/contabilidade/fluxo-caixa/rubricas" data-testid="dfc-configurar-rubricas">
              <Settings2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {permissions.includes(PERMISSAO_CONFIGURAR) ? 'Configurar rubricas' : 'Rubricas'}
            </Link>
          </Button>
        }
      />

      <Suspense fallback={null}>
        <SeletorPeriodo
          key={intervalo.ok ? `${intervalo.dataInicio}_${intervalo.dataFim}` : 'invalido'}
          rota="/contabilidade/dfc"
          dataInicio={intervalo.ok ? intervalo.dataInicio : (um(raw.dataInicio) ?? '')}
          dataFim={intervalo.ok ? intervalo.dataFim : (um(raw.dataFim) ?? '')}
        />
      </Suspense>

      {!intervalo.ok ? (
        <Recusa titulo="Intervalo inválido">{intervalo.motivo}</Recusa>
      ) : (
        <>
          {intervalo.alargado && (
            <p className="text-sm text-muted-foreground" data-testid="dfc-intervalo-alargado">
              A DFC é feita por períodos contabilísticos completos: o intervalo pedido foi alargado a{' '}
              {intervalo.inicio.codigo === intervalo.fim.codigo
                ? `${intervalo.inicio.codigo}`
                : `${intervalo.inicio.codigo} a ${intervalo.fim.codigo}`}
              .
            </p>
          )}
          <Suspense
            key={`${intervalo.inicio.id}_${intervalo.fim.id}`}
            fallback={<TableSkeleton rows={14} cols={2} />}
          >
            <SeccaoDFC
              periodoInicioId={intervalo.inicio.id}
              periodoFimId={intervalo.fim.id}
              tenantId={tenantId}
              userId={userId}
              podeConfigurar={permissions.includes(PERMISSAO_CONFIGURAR)}
              podeExportar={permissions.includes(PERMISSAO_EXPORTAR)}
              voltar={`/contabilidade/dfc?${new URLSearchParams({ dataInicio: intervalo.dataInicio, dataFim: intervalo.dataFim }).toString()}`}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
