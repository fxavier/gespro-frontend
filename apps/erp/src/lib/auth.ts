import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prismaBase } from '@/server/db/client';
import { ForbiddenError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import {
  renovarTokens,
  revogarRefreshToken,
  intervaloResolucaoSegundos,
  tectoSessaoSegundos,
} from '@/server/auth/keycloak';
import {
  estadoDeAcesso,
  type EstadoAcesso,
  type EstadoAssinatura,
} from '@/lib/state-machines';
import { autenticarPorPalavraPasse, emailVerificadoDoToken } from '@/server/auth/direct-grant';
import { loginLimiter } from '@/server/security/rate-limiter';

/**
 * Autenticação por Direct Access Grant contra o Keycloak (ADR-0029) com a
 * fronteira de autorização em Postgres (ADR-0011): o Keycloak responde
 * «quem és», a base de dados responde «o que podes».
 *
 * Até ao ADR-0029 isto era um fluxo OIDC com salto para o ecrã do Keycloak.
 * Passou a ser um formulário nosso que fala com o Keycloak pela API. O que
 * se perdeu — federação, MFA a sério, cookie de SSO — está escrito no
 * ADR-0029 §3, e não é pouco. O que NÃO mudou é tudo o resto desta
 * descrição: a fronteira de autorização é a mesma, linha por linha.
 *
 * O token do Keycloak transporta identidade (`sub`, `email`, `name`) — nunca
 * permissões nem tenant. O `tenantId` resolve-se `sub → User → tenantId`:
 * continua a não vir do cliente; vem de uma linha em Postgres alcançada a
 * partir de um token assinado e verificado no servidor.
 *
 * As três durações de sessão (ADR-0011, tabela das Consequências) são
 * parâmetros de ambiente — nenhum teste espera 15 minutos:
 *
 *  - `AUTH_SESSION_MAX_AGE` (900 s) — intervalo de RE-RESOLUÇÃO: a cada
 *    renovação, o `callbacks.jwt` relê do Postgres as permissões, o `ativo`,
 *    o `deletedAt` e o bloqueio de subscrição, e renova o token no Keycloak.
 *    É isto que fixa a garantia «retirar um papel, desactivar um utilizador
 *    ou suspender uma subscrição faz efeito em 15 minutos, no máximo».
 *    Deliberadamente NUNCA por pedido: o `jwt` corre em cada `auth()`, logo
 *    em quase cada Server Component.
 *  - *SSO Session Idle* do Keycloak (8 h) — quem expulsa por inactividade.
 *  - *SSO Session Max* (12 h) — tecto absoluto; é também o `maxAge` do cookie
 *    do Auth.js. O cookie NÃO morre aos 15 minutos: se morresse, o financeiro
 *    que abre uma factura de dezoito linhas e é interrompido meia hora perdia
 *    o formulário — o cenário que o ADR-0011 exclui expressamente. Os 15
 *    minutos vivem DENTRO do JWT (`resolverEm`), não no `exp` do cookie.
 *
 * Nota sobre a aresta conhecida do Auth.js v5 em App Router: um `auth()` num
 * Server Component não pode escrever cookies, portanto um token re-resolvido
 * aí não é persistido — é persistido na chamada seguinte de
 * `/api/auth/session` (o `SessionProvider` está montado globalmente). Entre
 * os dois momentos há re-resoluções repetidas, todas dentro do mesmo
 * intervalo; nunca menos verificação, apenas — transitoriamente — mais.
 * O Keycloak não roda tokens de renovação por omissão, pelo que repetir o
 * grant com o mesmo token é seguro. Coberto pelo cenário E2E de expiração e
 * renovação (obrigatório por ADR-0013 §6 — não verificável por inspecção).
 */

// ---------------------------------------------------------------------------
// Resolução sub → User local (a fronteira do ADR-0011)
// ---------------------------------------------------------------------------

type Resolucao =
  | {
      ok: true;
      userId: string;
      tenantId: string;
      permissions: string[];
      acesso: EstadoAcesso;
    }
  | { ok: false; motivo: 'nao-provisionado' | 'inactivo' | 'subscricao' };

/**
 * Arbitra os dois donos do acesso do tenant (ADR-0032 §4).
 *
 * O estado comercial vem da `Assinatura` — a fonte de verdade única — e a
 * decisão da GestPro vem do `Tenant`. Deixou de haver um booleano partilhado
 * (`ConfiguracaoFiscal.statusAtivo`) que os dois escreviam: quem escrevesse
 * por último ganhava, e na prática um tenant suspenso por abuso era
 * reactivado pelo pagamento seguinte.
 *
 * Regra de NEGÓCIO: fica no ERP, não migra para o Keycloak (ADR-0010) — o
 * utilizador autentica-se com sucesso e é o ERP que decide o que ele pode.
 *
 * Um tenant sem `Assinatura` (anteriores à spec 19) conta como aberto: a
 * ausência de subscrição não é uma decisão comercial, é uma lacuna de dados, e
 * fechar por lacuna seria pior do que abrir.
 */
async function acessoDoTenant(tenantId: string, tenantApagado: boolean): Promise<EstadoAcesso> {
  const assinatura = await prismaBase.assinatura.findFirst({
    where: { tenantId },
    select: { estado: true },
  });
  if (!assinatura) return tenantApagado ? 'fechado' : 'aberto';
  return estadoDeAcesso(assinatura.estado as EstadoAssinatura, tenantApagado);
}

/**
 * Resolve o `sub` do Keycloak no `User` local e expande papéis em permissões.
 *
 * Um utilizador que exista no Keycloak sem `User` local NÃO entra — recusa
 * explícita, nunca criação implícita (ADR-0011): criação implícita seria uma
 * porta aberta para qualquer identidade federada obter sessão sem passar
 * pelo provisionamento.
 */
async function resolverUtilizadorLocal(keycloakSub: string): Promise<Resolucao> {
  const user = await prismaBase.user.findUnique({
    where: { keycloakSub },
    include: {
      tenant: { select: { deletedAt: true } },
      roles: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  });

  if (!user) return { ok: false, motivo: 'nao-provisionado' };
  if (!user.ativo || user.deletedAt) return { ok: false, motivo: 'inactivo' };

  // A Leitura ABRE a sessão — é o ponto inteiro do ADR-0027 §6. Quem saiu de
  // uma subscrição activa continua a entrar para ver, exportar e pagar; o que
  // não passa é a escrita, e isso decide-se nos pipelines, não aqui. Só o
  // `fechado` recusa.
  const acesso = await acessoDoTenant(user.tenantId, user.tenant?.deletedAt != null);
  if (acesso === 'fechado') return { ok: false, motivo: 'subscricao' };

  const permissions = [
    ...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code))),
  ];

  return { ok: true, userId: user.id, tenantId: user.tenantId, permissions, acesso };
}

// ---------------------------------------------------------------------------
// NextAuth
// ---------------------------------------------------------------------------

/**
 * Códigos que o formulário de login sabe traduzir. Viajam no `code` do erro
 * `CredentialsSignin`; o ecrã mapeia-os para mensagens em PT-PT. Nunca se
 * devolve «palavra-passe errada» quando o que houve foi uma falha nossa.
 */
export type MotivoRecusaLogin =
  | 'credenciais'
  | 'conta-por-activar'
  | 'conta-desactivada'
  | 'nao-provisionado'
  | 'inactivo'
  | 'subscricao'
  | 'indisponivel';

/**
 * Tem de estender `CredentialsSignin` do Auth.js, não `Error`: um erro
 * qualquer lançado no `authorize` é convertido em `Configuration` e o motivo
 * perde-se pelo caminho. Verificado — era o que acontecia.
 */
class RecusaLogin extends CredentialsSignin {
  code: MotivoRecusaLogin;
  constructor(code: MotivoRecusaLogin) {
    super(code);
    this.code = code;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',
    // Tecto do cookie = SSO Session Max. A validade REAL é governada pela
    // renovação no Keycloak (idle de 8 h) e pela re-resolução em Postgres.
    maxAge: tectoSessaoSegundos(),
  },
  trustHost: true,
  pages: { signIn: '/auth/login', error: '/auth/erro' },
  providers: [
    /**
     * Direct Access Grant (ADR-0029). O `authorize` é a porta de entrada:
     * autentica no Keycloak e só depois resolve o `User` local. A ordem
     * importa — não se diz a um desconhecido se um e-mail existe ou não
     * antes de ele provar quem é.
     *
     * As recusas que viviam no `callbacks.signIn` estão aqui, porque é aqui
     * que passa a haver identidade: com Credentials não há `profile`.
     */
    Credentials({
      credentials: {
        identificador: { label: 'E-mail', type: 'email' },
        palavraPasse: { label: 'Palavra-passe', type: 'password' },
      },
      async authorize(raw, req) {
        const identificador = typeof raw?.identificador === 'string' ? raw.identificador.trim() : '';
        const palavraPasse = typeof raw?.palavraPasse === 'string' ? raw.palavraPasse : '';
        if (!identificador || !palavraPasse) throw new RecusaLogin('credenciais');

        // Limite antes de tocar no Keycloak (ADR-0029 §4). Duas chaves: o IP
        // trava quem varre contas, o identificador trava quem martela uma.
        //
        // `check` agora e `increment` SÓ na falha — de propósito. Contar
        // logins com êxito puniria o escritório inteiro atrás de um NAT e a
        // pessoa que entra em três dispositivos. Força bruta é sobre falhas.
        const ip =
          req?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          req?.headers?.get('x-real-ip') ||
          'desconhecido';
        const chaveIp = `${ip}::login`;
        const chaveConta = `${identificador.toLowerCase()}::login`;

        const [porIp, porConta] = await Promise.all([
          loginLimiter.check(chaveIp),
          loginLimiter.check(chaveConta),
        ]);
        if (porIp.limited || porConta.limited) {
          logger.warn(
            { ip, identificador, porIp: porIp.limited, porConta: porConta.limited },
            '[auth] tentativas de início de sessão limitadas',
          );
          // «Credenciais» de propósito: dizer «está bloqueado» confirmaria a
          // quem varre que a conta existe e que vale a pena voltar.
          throw new RecusaLogin('credenciais');
        }

        const kc = await autenticarPorPalavraPasse(identificador, palavraPasse);
        if (!kc.ok) {
          // Indisponibilidade do Keycloak não é tentativa falhada: seria o
          // produto a bloquear-se a si próprio durante uma avaria.
          if (kc.motivo !== 'indisponivel') {
            await Promise.all([
              loginLimiter.increment(chaveIp),
              loginLimiter.increment(chaveConta),
            ]);
          }
          throw new RecusaLogin(kc.motivo);
        }

        const res = await resolverUtilizadorLocal(kc.sub);
        if (!res.ok) {
          logger.warn(
            { keycloakSub: kc.sub, motivo: res.motivo },
            '[auth] sessão recusada após autenticação',
          );
          throw new RecusaLogin(res.motivo);
        }

        // «Por activar» é primeiroAcessoEm == null (ADR-0013 §5-bis): escrita
        // única, idempotente por construção (updateMany com filtro null).
        await prismaBase.user.updateMany({
          where: { keycloakSub: kc.sub, primeiroAcessoEm: null },
          data: { primeiroAcessoEm: new Date() },
        });

        // Só o que o `jwt` precisa na emissão inicial. Nunca a palavra-passe.
        return {
          id: res.userId,
          keycloakSub: kc.sub,
          kcRefreshToken: kc.refreshToken,
          emailVerificado: kc.emailVerificado,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Sem `callbacks.signIn`: com Credentials, quem recusa é o `authorize`,
     * e recusa ANTES de haver sessão. Um `signIn` aqui correria depois e
     * seria uma segunda porta para a mesma fechadura — pior, porque só a
     * primeira conhece o motivo.
     */
    async jwt({ token, user }) {
      const agora = Math.floor(Date.now() / 1000);

      // --- Emissão inicial (login acabado de acontecer) --------------------
      // `user` é o que o `authorize` devolveu; só existe neste momento.
      if (user) {
        const sub = (user as { keycloakSub?: unknown }).keycloakSub;
        const refresh = (user as { kcRefreshToken?: unknown }).kcRefreshToken;
        if (typeof sub !== 'string' || typeof refresh !== 'string') return null;

        const res = await resolverUtilizadorLocal(sub);
        // O authorize já recusou os casos !ok; isto cobre a corrida entre os dois.
        if (!res.ok) return null;

        token.uid = res.userId;
        token.tenantId = res.tenantId;
        token.permissions = res.permissions;
        token.acesso = res.acesso;
        token.keycloakSub = sub;
        token.kcRefreshToken = refresh;
        // ADR-0031 §6: o estado de verificação NÃO tem coluna local — entra
        // aqui, vindo do claim `email_verified` do access token, e é
        // reavaliado a cada re-resolução (abaixo).
        token.emailVerificado = (user as { emailVerificado?: unknown }).emailVerificado === true;
        token.resolverEm = agora + intervaloResolucaoSegundos();
        return token;
      }

      // --- Dentro do intervalo: NENHUMA consulta (ADR-0011 §3) -------------
      if (typeof token.resolverEm === 'number' && agora < token.resolverEm) {
        return token;
      }

      // --- Renovação: Keycloak primeiro, Postgres depois -------------------
      if (typeof token.kcRefreshToken !== 'string' || typeof token.keycloakSub !== 'string') {
        // Token de uma era anterior (Credentials) ou corrompido: sessão cai.
        return null;
      }

      const renovado = await renovarTokens(token.kcRefreshToken);
      if (!renovado.ok && renovado.motivo === 'recusada') {
        // Sessão SSO terminou (idle/max/logout administrativo) — cai aqui,
        // na re-resolução seguinte: 15 minutos no máximo (ADR-0010).
        return null;
      }
      if (renovado.ok && renovado.refreshToken) {
        token.kcRefreshToken = renovado.refreshToken;
      }
      if (renovado.ok) {
        // ADR-0031 §6: confirmar o e-mail escreve um booleano no Keycloak e
        // não toca em Postgres, portanto é AQUI — e só aqui — que a sessão
        // dá por isso. O atraso máximo é o intervalo do ADR-0011 (15 min),
        // que é o mesmo preço já pago por retirar um papel ou desactivar
        // alguém. Em `indisponivel` mantém-se o valor anterior: uma avaria do
        // Keycloak não deve levantar nem impor travões.
        token.emailVerificado = emailVerificadoDoToken(renovado.accessToken);
      }
      // `indisponivel`: mantém-se o token de renovação actual e segue-se para
      // a re-resolução em Postgres — é ela que impõe a revogação (ADR-0011).

      const res = await resolverUtilizadorLocal(token.keycloakSub);
      if (!res.ok) {
        logger.warn(
          { keycloakSub: token.keycloakSub, motivo: res.motivo },
          '[auth] sessão terminada na re-resolução',
        );
        return null;
      }

      token.uid = res.userId;
      token.tenantId = res.tenantId;
      token.permissions = res.permissions;
      token.acesso = res.acesso;
      token.resolverEm = agora + intervaloResolucaoSegundos();
      return token;
    },

    async session({ session, token }) {
      session.user.id = token.uid;
      session.user.tenantId = token.tenantId;
      session.user.permissions = token.permissions;
      // Ausente conta como NÃO verificado (fail-closed): um token emitido
      // antes do ADR-0031 não tem o campo, e os travões do §5 recusam até à
      // re-resolução seguinte, que é reversível por um clique.
      session.user.emailVerificado = token.emailVerificado === true;
      // Ausente conta como ABERTO, ao contrário do `emailVerificado` acima — e
      // não é incoerência. Um token emitido antes desta mudança pertence a
      // alguém que o código anterior deixou entrar, logo a um tenant com
      // acesso; fechar por ausência do campo tirava a escrita a toda a gente
      // que tivesse sessão no momento do deploy. O erro corrige-se sozinho na
      // re-resolução seguinte (≤15 min, ADR-0011).
      session.user.acesso = token.acesso ?? 'aberto';
      return session;
    },
  },
  events: {
    /**
     * Terminar sessão revoga o token de renovação (ADR-0029). Sem cookie de
     * SSO para encerrar, é isto que impede a re-resolução seguinte de trocar
     * um token de uma sessão que o utilizador julga fechada.
     *
     * Aqui — e não numa rota própria — porque cobre TODOS os caminhos de
     * saída, incluindo os que ainda não existem.
     */
    async signOut(message) {
      const token = 'token' in message ? message.token : null;
      const refresh = token?.kcRefreshToken;
      if (typeof refresh === 'string') await revogarRefreshToken(refresh);
    },
  },
});

/** RBAC: true se o utilizador autenticado tem a permissão `modulo:accao`. */
export async function can(permission: string): Promise<boolean> {
  const session = await auth();
  return !!session?.user.permissions.includes(permission);
}

export async function requirePermission(permission: string): Promise<void> {
  if (!(await can(permission))) throw new ForbiddenError();
}
