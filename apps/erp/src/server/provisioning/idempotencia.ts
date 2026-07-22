import 'server-only';
import { createHash } from 'node:crypto';
import { prismaBase } from '@/server/db/client';

/**
 * Idempotência de endpoints públicos por `Idempotency-Key` (spec 19, Req. 1.2).
 *
 * O registo cria um tenant inteiro: um retry do cliente (rede instável, duplo
 * clique, retry automático do site) NÃO pode provisionar uma segunda empresa.
 * A garantia é o índice `@unique` em `ChaveIdempotencia.chave`: quem consegue
 * inserir ganha o direito de provisionar; quem colide lê o resultado do
 * primeiro. Nunca `findFirst` + `create` (dois pedidos simultâneos passariam
 * ambos pelo `findFirst`).
 *
 * O `fingerprint` (SHA-256 do corpo) impede reutilizar a mesma chave com dados
 * diferentes — isso seria um pedido novo disfarçado de retry.
 */

export type EstadoChave = 'EM_CURSO' | 'CONCLUIDA' | 'FALHADA';

export type ResultadoReserva =
  | { tipo: 'NOVA' }
  /** Pedido idêntico já concluído: devolver a MESMA resposta. */
  | { tipo: 'REPETIDA'; resposta: unknown }
  /** Pedido idêntico ainda a correr noutro processo. */
  | { tipo: 'EM_CURSO' }
  /** Mesma chave, corpo diferente. */
  | { tipo: 'CONFLITO' }
  /** Tentativa anterior falhou: pode repetir-se. */
  | { tipo: 'RETOMAVEL' };

export function fingerprintDe(corpo: unknown): string {
  return createHash('sha256').update(JSON.stringify(corpo)).digest('hex');
}

export async function reservarChave(
  chave: string,
  endpoint: string,
  fingerprint: string,
): Promise<ResultadoReserva> {
  try {
    await prismaBase.chaveIdempotencia.create({
      data: { chave, endpoint, fingerprint, estado: 'EM_CURSO' },
    });
    return { tipo: 'NOVA' };
  } catch (e) {
    if ((e as { code?: string })?.code !== 'P2002') throw e;
  }

  const existente = await prismaBase.chaveIdempotencia.findUnique({
    where: { chave },
    select: { endpoint: true, fingerprint: true, estado: true, respostaJson: true },
  });
  if (!existente) return { tipo: 'NOVA' }; // apagada entretanto — tratar como nova

  if (existente.endpoint !== endpoint || existente.fingerprint !== fingerprint) {
    return { tipo: 'CONFLITO' };
  }

  if (existente.estado === 'CONCLUIDA') {
    return { tipo: 'REPETIDA', resposta: existente.respostaJson };
  }
  if (existente.estado === 'FALHADA') {
    // Reabre para nova tentativa: a anterior não deixou tenant nenhum (a
    // transacção de provisionamento é atómica).
    const { count } = await prismaBase.chaveIdempotencia.updateMany({
      where: { chave, estado: 'FALHADA' },
      data: { estado: 'EM_CURSO' },
    });
    return count === 1 ? { tipo: 'RETOMAVEL' } : { tipo: 'EM_CURSO' };
  }

  return { tipo: 'EM_CURSO' };
}

export async function concluirChave(
  chave: string,
  resposta: unknown,
  tenantId?: string,
): Promise<void> {
  await prismaBase.chaveIdempotencia.updateMany({
    where: { chave },
    data: {
      estado: 'CONCLUIDA',
      respostaJson: resposta as never,
      ...(tenantId ? { tenantId } : {}),
    },
  });
}

export async function falharChave(chave: string): Promise<void> {
  await prismaBase.chaveIdempotencia.updateMany({
    where: { chave },
    data: { estado: 'FALHADA' },
  });
}
