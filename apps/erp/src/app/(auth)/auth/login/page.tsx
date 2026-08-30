'use client';

/**
 * /auth/login — desde o ADR-0012 §8 deixou de ser um ecrã nosso: a porta de
 * entrada do produto é o Keycloak (tema `gespro`, PT, claro/escuro). Esta
 * página só dispara o arranque do fluxo OIDC (Authorization Code + PKCE) e
 * mostra um estado de transição acessível enquanto o browser salta.
 *
 * Porquê um Client Component: o `signIn` grava os cookies de `state`/PKCE, e
 * cookies não se escrevem num Server Component — o POST ao endpoint do
 * Auth.js tem de partir do cliente.
 */

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ShieldCheck } from 'lucide-react';

function RedireccionamentoLogin() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';
  const disparado = useRef(false);

  useEffect(() => {
    if (disparado.current) return;
    disparado.current = true;
    void signIn('keycloak', { callbackUrl });
  }, [callbackUrl]);

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground"
      aria-busy="true"
    >
      <div className="p-3 rounded-full bg-primary/10 text-primary">
        <ShieldCheck className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-medium">A encaminhar para o início de sessão…</h1>
      <p className="text-sm text-muted-foreground" role="status">
        Vai iniciar sessão no serviço de identidade do GestPro.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <RedireccionamentoLogin />
    </Suspense>
  );
}
