import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * /auth/erro — recusas explícitas do `callbacks.signIn` (ADR-0011/0013).
 *
 * A distinção importa: «nao-provisionado» é o caso LEGÍTIMO de uma identidade
 * que existe no Keycloak sem `User` local — um colaborador ainda não
 * provisionado. A mensagem tem de dizer «contacte o administrador da sua
 * empresa», não «utilizador desconhecido» (ADR-0013, Consequências).
 *
 * Recebe também o `?error=` genérico do Auth.js (pages.error aponta aqui).
 */

const MENSAGENS: Record<string, { titulo: string; corpo: string }> = {
  'nao-provisionado': {
    titulo: 'Conta ainda não activada nesta empresa',
    corpo:
      'A sua identidade foi autenticada, mas ainda não existe um utilizador associado numa empresa GestPro. Contacte o administrador da sua empresa para ser adicionado.',
  },
  inactivo: {
    titulo: 'Utilizador desactivado',
    corpo:
      'Este utilizador foi desactivado. Se acha que se trata de um engano, contacte o administrador da sua empresa.',
  },
  subscricao: {
    titulo: 'Subscrição suspensa',
    corpo:
      'A subscrição da sua empresa não está activa neste momento. O administrador pode regularizar a situação na área de definições ou junto do suporte GestPro.',
  },
  'sem-identidade': {
    titulo: 'Não foi possível identificar a sua conta',
    corpo: 'A resposta do serviço de identidade veio incompleta. Tente iniciar sessão de novo.',
  },
};

const OMISSAO = {
  titulo: 'Não foi possível iniciar sessão',
  corpo: 'Ocorreu um erro durante a autenticação. Tente novamente; se persistir, contacte o suporte.',
};

export default async function ErroAutenticacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string; error?: string }>;
}) {
  const { motivo } = await searchParams;
  const msg = (motivo && MENSAGENS[motivo]) || OMISSAO;

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto w-fit rounded-full bg-destructive/10 p-3 text-destructive">
        <AlertCircle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{msg.titulo}</h1>
      <p className="text-sm text-muted-foreground">{msg.corpo}</p>
      <div className="flex items-center justify-center gap-3">
        <Button asChild>
          <Link href="/auth/login">Tentar de novo</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/contactos">Contactar suporte</Link>
        </Button>
      </div>
    </div>
  );
}
