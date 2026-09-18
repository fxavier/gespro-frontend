/**
 * /auth/mudar-palavra-passe — primeiro acesso (ADR-0030 §4).
 *
 * Chega-se aqui do `/auth/login` quando o Keycloak recusa uma conta com
 * mudança de palavra-passe pendente. Mesmo molde do login: Server Component
 * com a interactividade na folha.
 */

import { Suspense } from 'react';
import { Logotipo } from '@/components/layout/Logotipo';
import { MudarPalavraPasseForm } from './mudar-palavra-passe-form';

export const metadata = {
  title: 'Definir palavra-passe · GestPro',
};

export default function MudarPalavraPassePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logotipo className="[&>svg]:size-10 [&>span]:text-2xl" />
          <p className="text-sm text-muted-foreground">Sistema de gestão empresarial</p>
        </div>

        <div className="rounded-xl border border-transparent bg-card p-6 shadow-md dark:border-border">
          <h1 className="mb-2 text-xl font-semibold tracking-tight">Defina a sua palavra-passe</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            A palavra-passe que recebeu é provisória. Escolha uma que só você conheça para
            continuar.
          </p>
          <Suspense fallback={null}>
            <MudarPalavraPasseForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
