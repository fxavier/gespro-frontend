import 'server-only';
import { BusinessRuleError } from '@/lib/errors';
import { PLANOS, type PlanoId } from '@/lib/planos';

/**
 * Limites do plano (ADR-0027 §2–§4, issue #98).
 *
 * Só LÊ o limite: a contagem fica com cada ponto de verificação (criar/reactivar
 * `User`, criar/passar a `Localizacao` ARMAZEM activa), como o ADR-0027 §3 pede.
 * O plano vem da `Assinatura` (§5) — nunca da `ConfiguracaoFiscal`.
 */
export type RecursoLimitado = 'utilizadores' | 'armazens';

/** O mínimo de que o helper precisa — serve ao `prismaBase`, ao `prisma` estendido e a uma tx. */
interface LeitorAssinatura {
  assinatura: {
    findUnique(args: {
      where: { tenantId: string };
      select: { planoAssinatura: true };
    }): Promise<{ planoAssinatura: string } | null>;
  };
}

/**
 * Limite do recurso no plano do tenant, ou `null` quando não há limite:
 * tenant sem Assinatura, plano desconhecido, limite ausente ou `-1`.
 * Em TRIAL valem os limites do plano escolhido.
 */
export async function limiteDoPlano(
  db: LeitorAssinatura,
  tenantId: string,
  recurso: RecursoLimitado,
): Promise<{ limite: number; planoNome: string } | null> {
  const assinatura = await db.assinatura.findUnique({
    where: { tenantId },
    select: { planoAssinatura: true },
  });
  if (!assinatura) return null;
  const plano = PLANOS[assinatura.planoAssinatura as PlanoId];
  const limite = plano?.limites[recurso];
  if (typeof limite !== 'number' || limite < 0) return null;
  return { limite, planoNome: plano.nome };
}

const CODIGO: Record<RecursoLimitado, string> = {
  utilizadores: 'LIMITE_PLANO_UTILIZADORES',
  armazens: 'LIMITE_PLANO_ARMAZENS',
};

const DESCRICAO: Record<RecursoLimitado, (n: number) => string> = {
  utilizadores: (n) => `${n} ${n === 1 ? 'utilizador activo' : 'utilizadores activos'}`,
  armazens: (n) => `${n} ${n === 1 ? 'armazém activo' : 'armazéns activos'}`,
};

/**
 * Recusa quando acrescentar mais um excede o limite. `contarActivos` só corre
 * quando há limite. Desactivar nunca passa por aqui (ADR-0027 §4).
 */
export async function exigirLugarNoPlano(
  db: LeitorAssinatura,
  tenantId: string,
  recurso: RecursoLimitado,
  contarActivos: () => Promise<number>,
): Promise<void> {
  const l = await limiteDoPlano(db, tenantId, recurso);
  if (!l) return;
  if ((await contarActivos()) < l.limite) return;
  throw new BusinessRuleError(
    CODIGO[recurso],
    `O plano ${l.planoNome} permite até ${DESCRICAO[recurso](l.limite)}, e esse limite já foi atingido. ` +
      'Para acrescentar mais, mude de plano em Definições › Subscrição (/definicoes/faturacao)' +
      (recurso === 'utilizadores' ? ' ou desactive um utilizador.' : ' ou desactive um armazém.'),
  );
}
