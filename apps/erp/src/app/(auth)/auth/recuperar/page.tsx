/**
 * /auth/recuperar — recuperação de palavra-passe self-service (#178).
 *
 * Mesmo molde do login: Server Component com a interactividade na folha, e a
 * moldura em `(auth)/auth/layout.tsx`. Pública pelo prefixo `/auth/` do
 * middleware.
 */

import Link from 'next/link';
import { RecuperarPalavraPasseForm } from './recuperar-palavra-passe-form';

export const metadata = {
  title: 'Recuperar palavra-passe · GestPro',
};

export default function RecuperarPalavraPassePage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar palavra-passe</h1>
        <p className="text-sm text-muted-foreground">
          Indique o e-mail da sua conta. Enviamos-lhe uma ligação para definir uma palavra-passe nova.
        </p>
      </div>

      <RecuperarPalavraPasseForm />

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/auth/login" className="underline underline-offset-4 hover:text-foreground">
          Voltar a iniciar sessão
        </Link>
      </p>
    </div>
  );
}
