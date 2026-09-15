/**
 * `/registo` — o formulário público passou a ser servido pelo ERP (ADR-0031).
 *
 * Porquê aqui e não no site: o requisito «a sessão tem de existir no fim da
 * submissão» colide com «o cookie pertence a app.gestpro.co.mz». Servir o
 * formulário na origem que emite o cookie elimina o problema; qualquer das
 * alternativas (fetch cross-origin com `SameSite=None`, ou ressuscitar o
 * handoff do ADR-0013 §5) protegia-o com aparato novo. Ver ADR-0031.
 *
 * Server Component, com a interactividade na folha (`registo-form.tsx`) — o
 * mesmo molde de `/auth/login` e `/auth/mudar-palavra-passe`.
 *
 * `noindex` + canónico para `https://gestpro.co.mz/comecar` (Requisito 2.4):
 * a entrada pública do funil é a do site; esta rota é o destino dela, não uma
 * segunda morada a indexar. A tensão entre as duas directivas está registada
 * em `docs/handoff/s21-l3-ecra-registo.md`.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { PLANOS, PLANO_IDS, TRIAL_DIAS, type PlanoId } from '@/lib/planos';
import { getProvincias } from '@/lib/provincias-mocambique';
import { normalizarUtm, urlSite } from '@/server/analytics/plausible';
import { RegistoForm } from './registo-form';

type Parametros = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Criar conta · GestPro',
    description: `Comece a usar o GestPro com ${TRIAL_DIAS} dias gratuitos, sem cartão.`,
    // Lido em runtime (e não numa constante de módulo) para o canónico
    // acompanhar o ambiente em vez de ficar fixado no `next build`.
    alternates: { canonical: `${urlSite()}/comecar` },
    robots: { index: false, follow: false },
  };
}

function planoEscolhido(bruto: string | string[] | undefined): PlanoId {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  const normalizado = valor?.trim().toUpperCase();
  return (PLANO_IDS as readonly string[]).includes(normalizado ?? '')
    ? (normalizado as PlanoId)
    : 'PROFISSIONAL';
}

export default async function RegistoPage({
  searchParams,
}: {
  searchParams: Promise<Parametros>;
}) {
  const parametros = await searchParams;
  const plano = planoEscolhido(parametros.plano);

  // Os `utm_*` chegam do site no encaminhamento 307 de `/comecar` e seguem
  // para o evento de conversão. Normalizados aqui — só as cinco chaves
  // conhecidas atravessam a fronteira RSC (Requisito 7.2).
  const utm = normalizarUtm(parametros);

  const planos = PLANO_IDS.map((id) => ({
    id,
    nome: PLANOS[id].nome,
    descricao: PLANOS[id].descricao,
    preco: PLANOS[id].precoMensal,
  }));

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-12">
      <div className="mx-auto w-full max-w-xl space-y-8">
        <header className="space-y-3 text-center">
          <Link
            href={urlSite()}
            className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <svg viewBox="0 0 48 48" className="size-7 text-primary" aria-hidden="true" focusable="false">
              <rect
                x="1.5"
                y="1.5"
                width="45"
                height="45"
                rx="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                opacity="0.9"
              />
              <rect x="12" y="27" width="6" height="10" rx="2" fill="currentColor" opacity="0.55" />
              <rect x="21" y="20" width="6" height="17" rx="2" fill="currentColor" opacity="0.78" />
              <rect x="30" y="11" width="6" height="26" rx="2" fill="currentColor" />
            </svg>
            <span className="font-display text-2xl font-medium tracking-tight">
              Gest<span className="text-primary">Pro</span>
            </span>
          </Link>
          <h1 className="font-display text-3xl font-medium tracking-tight">
            Criar a conta da sua empresa
          </h1>
          <p className="text-sm text-muted-foreground">
            {TRIAL_DIAS} dias gratuitos, sem cartão. Entra no produto assim que submeter.
          </p>
        </header>

        <div className="rounded-lg border border-border bg-card p-6 shadow-none">
          <RegistoForm
            planos={planos}
            planoInicial={plano}
            provincias={getProvincias()}
            utm={utm}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
          />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link href="/auth/login" className="underline underline-offset-4 hover:text-foreground">
            Iniciar sessão
          </Link>
        </p>
      </div>
    </main>
  );
}
