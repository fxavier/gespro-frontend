import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { RegistoCallbackClient } from './registo-callback-client';

/**
 * /auth/registo-callback?token=… — handoff SSO site→app (spec 19, Requisito 7).
 *
 * O site de marketing (spec 18) redirecciona para aqui com o token opaco
 * devolvido por `POST /api/publico/registo`. Esta página é Server Component; a
 * folha cliente lê o token e troca-o por sessão.
 *
 * O `<Suspense>` é obrigatório: a folha usa `useSearchParams()` e sem boundary o
 * build de produção (`output: 'standalone'`) falha o prerender desta rota.
 */
export const metadata = {
  title: 'A preparar a sua conta — GestPro',
  robots: { index: false, follow: false },
};

function Aguarde() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">A carregar</span>
    </div>
  );
}

export default function RegistoCallbackPage() {
  return (
    <Suspense fallback={<Aguarde />}>
      <RegistoCallbackClient />
    </Suspense>
  );
}
