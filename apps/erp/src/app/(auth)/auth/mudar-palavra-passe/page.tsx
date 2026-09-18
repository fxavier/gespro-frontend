/**
 * /auth/mudar-palavra-passe — primeiro acesso (ADR-0030 §4).
 *
 * Chega-se aqui do `/auth/login` quando o Keycloak recusa uma conta com
 * mudança de palavra-passe pendente. Mesmo molde do login: Server Component
 * com a interactividade na folha, e a moldura em `(auth)/auth/layout.tsx`.
 */

import { Suspense } from 'react';
import { MudarPalavraPasseForm } from './mudar-palavra-passe-form';

export const metadata = {
  title: 'Definir palavra-passe · GestPro',
};

export default function MudarPalavraPassePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Defina a sua palavra-passe</h1>
        <p className="text-sm text-muted-foreground">
          A palavra-passe que recebeu é provisória. Escolha uma que só você conheça para continuar.
        </p>
      </div>

      <Suspense fallback={null}>
        <MudarPalavraPasseForm />
      </Suspense>
    </div>
  );
}
