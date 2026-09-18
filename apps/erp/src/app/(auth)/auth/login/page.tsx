/**
 * /auth/login — a porta de entrada do produto voltou a ser nossa (ADR-0029).
 *
 * Até ao ADR-0028 isto era um redireccionamento para o ecrã do Keycloak. O
 * ADR-0029 inverteu-o: o formulário vive aqui e fala com o Keycloak pela API.
 * O que se perdeu com isso — federação e MFA a sério — está no ADR-0029 §3, e
 * é a razão por que este ecrã não tem SSO nem passkey: um botão que não
 * autentica ninguém é pior do que botão nenhum.
 *
 * Server Component, com a interactividade na folha (`login-form.tsx`), como
 * o `CLAUDE.md` exige de qualquer página de listagem ou detalhe. A moldura —
 * cabeçalho, painel institucional e rodapé — vem de `(auth)/auth/layout.tsx`.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { TRIAL_DIAS } from '@/lib/planos';
import { LoginForm } from './login-form';
import { AvisoVerificacao } from './aviso-verificacao';

export const metadata = {
  title: 'Iniciar sessão · GestPro',
};

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h1>
        <p className="text-sm text-muted-foreground">
          Introduza as suas credenciais para aceder ao espaço de trabalho da sua empresa.
        </p>
      </div>

      {/* Desfecho da ligação de confirmação de e-mail (ADR-0031 §5). A
          rota pública redirige para aqui quem confirma SEM sessão — abrir a
          ligação noutro dispositivo é o caso normal —, e sem isto o ecrã não
          dizia se tinha resultado. Suspense próprio: o componente lê
          `useSearchParams` e sem fronteira o prerender do build parte. */}
      <Suspense fallback={null}>
        <AvisoVerificacao />
      </Suspense>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <div className="rounded-lg bg-accent/60 p-4 text-center text-sm text-muted-foreground">
        Ainda não tem conta na GestPro?{' '}
        <Link href="/registo" className="font-semibold text-primary hover:underline">
          Começar teste gratuito de {TRIAL_DIAS} dias
        </Link>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Problemas a entrar?{' '}
        <Link href="/contactos" className="underline underline-offset-4 hover:text-foreground">
          Contactar o suporte
        </Link>
      </p>
    </div>
  );
}
