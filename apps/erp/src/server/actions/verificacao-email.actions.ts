'use server';
/**
 * Server Actions — confirmação de endereço de e-mail (ADR-0031 §5).
 *
 * Uma só action: reenviar a ligação. A confirmação em si é um Route Handler
 * (`GET /api/publico/verificar-email`), porque é aberta a partir de um cliente
 * de e-mail e não tem sessão nem contexto de tenant.
 *
 * **Sem `permission`**, de propósito: confirmar o próprio endereço não é uma
 * capacidade que se atribua a um papel — é de quem quer que esteja autenticado,
 * e o alvo é sempre a própria identidade da sessão. O catálogo de RBAC
 * (`prisma/seed/rbac.ts`) não ganha entrada nenhuma com isto.
 */
import { createSafeAction } from '@/server/safe-action';
import { prismaBase } from '@/server/db/client';
import { reenvioVerificacaoLimiter } from '@/server/security/rate-limiter';
import { enviarEmailVerificacao } from '@/server/auth/keycloak';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

/**
 * Reenvia a ligação de confirmação para o endereço do utilizador da sessão.
 *
 * O `sub` e o endereço vêm de Postgres pelo `userId` da sessão — nunca do
 * cliente. Sem isto, um corpo de pedido escolheria para quem o servidor manda
 * correio, que é o mesmo vector de amplificação que o registo público fecha
 * com captcha.
 */
export const reenviarVerificacaoEmail = createSafeAction({
  permiteEmLeitura: true,
  handler: async (_input, ctx) => {
    const utilizador = await prismaBase.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId, deletedAt: null },
      select: { keycloakSub: true, email: true },
    });

    // Cross-tenant e inexistente respondem igual (404) — regra da casa.
    if (!utilizador?.keycloakSub || !utilizador.email) throw new NotFoundError();

    const rl = await reenvioVerificacaoLimiter.consume(`${utilizador.keycloakSub}::reenvio-verificacao`);
    if (rl.limited) {
      throw new BusinessRuleError(
        'REENVIO_LIMITADO',
        `Já foram enviadas demasiadas mensagens. Tente novamente dentro de ${Math.ceil(rl.retryAfterSec / 60)} minutos.`,
      );
    }

    const enviado = await enviarEmailVerificacao(utilizador.keycloakSub, utilizador.email);
    if (!enviado) {
      throw new BusinessRuleError(
        'ENVIO_FALHOU',
        'Não foi possível enviar a mensagem neste momento. Tente novamente dentro de alguns minutos.',
      );
    }

    return { enviado: true };
  },
});
