/**
 * Moldura partilhada dos ecrãs de autenticação — login, primeiro acesso e
 * recusa (ADR-0029, ADR-0030, ADR-0011).
 *
 * São a mesma jornada: quem erra as credenciais vai parar ao erro, quem entra
 * pela primeira vez vai parar à mudança de palavra-passe. Tinham três
 * centragens copiadas; passam a ter uma.
 *
 * Cobre só `/auth/*` — `/contactos`, que vive no mesmo grupo de rotas, é uma
 * página de suporte e continua com a moldura dela.
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logotipo } from '@/components/layout/Logotipo';
// Acessor canónico da base pública do site (é ele que já serve o canónico de
// /registo). Reutilizado aqui para não inventar uma segunda variável para o
// mesmo endereço.
import { urlSite } from '@/server/analytics/plausible';
import { PainelInstitucional } from './_components/painel-institucional';

export default function AutenticacaoLayout({ children }: { children: React.ReactNode }) {
  const site = urlSite();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="px-4 py-5 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logotipo />
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold tracking-wider text-primary uppercase">
              B2B
            </span>
          </div>
          <a
            href={site}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Voltar à página inicial
          </a>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-6 md:px-8">
        <div className="grid w-full max-w-6xl grid-cols-1 overflow-hidden rounded-xl bg-card shadow-md lg:grid-cols-12">
          <div className="flex flex-col justify-center p-6 sm:p-10 lg:col-span-7">
            <div className="mx-auto w-full max-w-md">{children}</div>
          </div>
          <PainelInstitucional />
        </div>
      </main>

      <footer className="px-4 py-5 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} GestPro — gestão empresarial para Moçambique.</p>
          <div className="flex items-center gap-4">
            <a href={`${site}/privacidade`} className="transition-colors hover:text-foreground">
              Privacidade
            </a>
            <a href={`${site}/termos`} className="transition-colors hover:text-foreground">
              Termos
            </a>
            <Link href="/contactos" className="transition-colors hover:text-foreground">
              Suporte
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
