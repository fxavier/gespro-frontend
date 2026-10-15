import Link from 'next/link';
import { exigirPlataformaAdmin } from '@/server/auth/plataforma-admin';
import { BotaoSair } from './_components/botao-sair';

/**
 * Área do administrador geral do sistema (ADR-0011 §5, #525). Sem a barra
 * lateral do tenant e sem dados de tenant: cabeçalho com o utilizador e
 * «Sair», e o menu da área. Quem não tem o papel recebe 404
 * (`exigirPlataformaAdmin`) — a área não se revela.
 */
export default async function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const session = await exigirPlataformaAdmin();
  const identificacao = session.user.email ?? session.user.name ?? 'Administrador de plataforma';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
          <span className="text-sm font-semibold">GestPro · Plataforma</span>
          <nav aria-label="Plataforma" className="flex items-center gap-4 text-sm">
            <Link
              href="/plataforma"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Início
            </Link>
            <Link
              href="/plataforma/planos"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Planos
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden max-w-[220px] truncate text-sm text-muted-foreground sm:block">
              {identificacao}
            </span>
            <BotaoSair />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
