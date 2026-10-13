import 'server-only';
import type { Plano } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError } from '@/lib/errors';
import { MOEDA_FATURACAO, type PlanoPublico } from '@/lib/planos';

/**
 * Leitura do catálogo de planos (ADR-0049 §1, issue #524).
 *
 * O `Plano` é GLOBAL (sem `tenantId`): lê-se pelo `prismaBase`, sem contexto de tenant — o
 * registo público, o endpoint público, o webhook e os limites do plano chamam-no assim.
 */

export type { Plano };

/** O plano pelo código (exacto, sensível a maiúsculas), arquivado ou não; `null` se não existe. */
export async function obterPlano(codigo: string): Promise<Plano | null> {
  return prismaBase.plano.findUnique({ where: { codigo } });
}

/**
 * O plano, se puder ser escolhido agora (existe e não está arquivado). Quem já tem um plano
 * arquivado mantém-no (ADR-0049 §3); só não se entra nele de novo.
 */
export async function exigirPlanoDisponivel(codigo: string): Promise<Plano> {
  const plano = await obterPlano(codigo);
  if (!plano || plano.arquivadoEm) {
    throw new BusinessRuleError(
      'PLANO_INDISPONIVEL',
      'O plano escolhido não está disponível. Escolha outro plano.',
    );
  }
  return plano;
}

/** Todos os planos (arquivados incluídos), por `ordem`. */
export async function listarPlanos(): Promise<Plano[]> {
  return prismaBase.plano.findMany({ orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }] });
}

/** Forma pública de um plano — sem Price IDs nem nomes de env vars. */
export function paraPublico(p: Plano): PlanoPublico {
  return {
    id: p.codigo,
    nome: p.nome,
    descricao: p.descricao,
    limites: {
      utilizadores: p.limiteUtilizadores,
      armazens: p.limiteArmazens,
      suporte: p.suporte,
    },
    precoMensal: { valor: Number(p.precoMensalUsd.toString()), moeda: MOEDA_FATURACAO },
    precoAnual: { valor: Number(p.precoAnualUsd.toString()), moeda: MOEDA_FATURACAO },
    destaque: p.destaque,
    funcionalidades: [...(p.funcionalidades ?? [])],
  };
}

/** Catálogo público: só os planos não arquivados, por `ordem`. */
export async function listarPlanosPublicos(): Promise<PlanoPublico[]> {
  const planos = await prismaBase.plano.findMany({
    where: { arquivadoEm: null },
    orderBy: [{ ordem: 'asc' }, { codigo: 'asc' }],
  });
  return planos.map(paraPublico);
}

export const planoService = {
  obterPlano,
  exigirPlanoDisponivel,
  listarPlanos,
  listarPlanosPublicos,
};
