'use client';

/**
 * Formulário de início de sessão (ADR-0029).
 *
 * As credenciais vão por Server Action (`entrarComPalavraPasse`) para o
 * `signIn` do servidor, que as passa ao `authorize` — nunca vão para um URL
 * nem para `searchParams`. Não se usa o `signIn` de `next-auth/react`: esse
 * depende de um token CSRF num cookie que os `GET /api/auth/session` do
 * `SessionProvider` também emitem, e a corrida entre eles recusava logins
 * certos com `MissingCSRF` (#657). O campo de
 * palavra-passe não tem `defaultValue` nem é controlado: o valor vive no DOM
 * até ao submit e mais nada.
 */

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { destinoSeguro } from '@/lib/destino-seguro';
import { entrarComPalavraPasse, type ResultadoEntrada } from './actions';

/** Motivos devolvidos pelo `authorize` (ver `MotivoRecusaLogin` em lib/auth). */
const MENSAGENS: Record<string, string> = {
  credenciais: 'E-mail ou palavra-passe incorrectos.',
  // 'conta-por-activar' não aparece aqui: essa recusa leva ao ecrã de mudança
  // de palavra-passe (ADR-0030 §4), que é onde ela se resolve.
  'convite-por-concluir':
    'O seu convite ainda não foi concluído. Abra a ligação do convite que recebeu por e-mail ou peça ao administrador que o reenvie.',
  'conta-desactivada': 'Esta conta está desactivada. Contacte o administrador da sua empresa.',
  'nao-provisionado':
    'A sua identidade foi reconhecida, mas ainda não existe um utilizador associado numa empresa GestPro. Contacte o administrador da sua empresa.',
  inactivo: 'Este utilizador foi desactivado. Contacte o administrador da sua empresa.',
  subscricao:
    'O acesso da sua empresa está suspenso pela GestPro. Contacte o suporte GestPro.',
  'subscricao-so-administrador':
    'A subscrição da sua empresa está fechada. Só um administrador pode entrar para regularizar o pagamento.',
  indisponivel:
    'O serviço de identidade não respondeu. Tente de novo dentro de momentos — não é problema das suas credenciais.',
};

const OMISSAO = 'Não foi possível iniciar sessão. Tente de novo.';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Nunca o valor cru: um URL absoluto levava para fora do domínio (#551).
  const callbackUrl = destinoSeguro(searchParams.get('callbackUrl'));
  // Preenchido por quem nos manda para cá a saber quem é: hoje, o ecrã de
  // registo quando o provisionamento conclui e o `signIn` não (ADR-0031,
  // design §8). Poupa à pessoa reescrever o endereço que acabou de dar — e é
  // só o endereço: a palavra-passe nunca viaja num URL.
  const identificadorInicial = searchParams.get('identificador') ?? '';
  const [erro, setErro] = useState<string | null>(null);
  const [palavraVisivel, setPalavraVisivel] = useState(false);
  const [aTransitar, iniciarTransicao] = useTransition();
  // Da submissão até o documento novo carregar: um duplo clique não envia
  // duas vezes as credenciais (cada falha conta para o limite de tentativas).
  const [ocupado, setOcupado] = useState(false);
  const aSubmeter = ocupado || aTransitar;

  async function aoSubmeter(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setOcupado(true);
    const dados = new FormData(evento.currentTarget);

    const identificador = String(dados.get('identificador') ?? '');
    let res: ResultadoEntrada;
    try {
      res = await entrarComPalavraPasse(identificador, String(dados.get('palavraPasse') ?? ''));
    } catch {
      // Rede ou erro inesperado no servidor: o botão não fica preso.
      res = { ok: false };
    }

    if (!res.ok) {
      setOcupado(false);
      // Conta com mudança de palavra-passe pendente: o Keycloak recusa o
      // token, mas a recusa só acontece com a palavra-passe CERTA. É primeiro
      // acesso, não é erro — segue para o ecrã onde se resolve (ADR-0030).
      if (res.codigo === 'conta-por-activar') {
        iniciarTransicao(() => {
          router.push(
            `/auth/mudar-palavra-passe?identificador=${encodeURIComponent(identificador)}`,
          );
        });
        return;
      }

      setErro(MENSAGENS[res.codigo ?? ''] ?? OMISSAO);
      return;
    }

    // Carregamento completo, não `router.push`: o cookie de sessão foi escrito
    // pela action e o `SessionProvider` deste documento ainda guarda a sessão
    // vazia do mount — só um documento novo o arranca com a sessão certa.
    // `callbackUrl` já passou pelo `destinoSeguro` (só caminhos internos).
    window.location.assign(callbackUrl);
  }

  return (
    <form onSubmit={aoSubmeter} className="space-y-5" noValidate>
      {erro && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{erro}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="identificador">E-mail profissional</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="identificador"
            name="identificador"
            type="email"
            autoComplete="username"
            required
            autoFocus={!identificadorInicial}
            defaultValue={identificadorInicial}
            placeholder="nome@empresa.mz"
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="palavraPasse">Palavra-passe</Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="palavraPasse"
            name="palavraPasse"
            // Alternar visibilidade troca o `type` do campo, e mais nada: o
            // valor continua a viver só no DOM até ao submit.
            type={palavraVisivel ? 'text' : 'password'}
            autoComplete="current-password"
            required
            autoFocus={Boolean(identificadorInicial)}
            className="pr-10 pl-9"
          />
          <button
            type="button"
            onClick={() => setPalavraVisivel((v) => !v)}
            aria-label={palavraVisivel ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
            aria-pressed={palavraVisivel}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {palavraVisivel ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={aSubmeter}>
        {aSubmeter ? 'A entrar…' : 'Entrar na plataforma'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
