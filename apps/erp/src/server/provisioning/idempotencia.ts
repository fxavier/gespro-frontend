import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
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

/**
 * Ao fim deste tempo, um `EM_CURSO` é considerado abandonado.
 *
 * Sem isto, um processo que morra entre `reservarChave` e `concluirChave`
 * (deploy a meio, OOM, timeout) deixava a chave presa em `EM_CURSO` para
 * sempre — e o cliente recebia 409 permanente, sem forma de se registar com
 * aquela chave. A transacção de provisionamento é atómica, portanto uma
 * tentativa interrompida não deixou tenant nenhum: repetir é seguro.
 *
 * O valor é folgado face ao tempo real do provisionamento (~2 s) para nunca
 * apanhar um pedido ainda a decorrer.
 */
const MINUTOS_ABANDONO = 10;

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
    select: {
      endpoint: true,
      fingerprint: true,
      estado: true,
      respostaJson: true,
      updatedAt: true,
    },
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
    return reabrir(chave, 'FALHADA');
  }

  // EM_CURSO. Se está parado há tempo de mais, o processo que o reservou morreu
  // sem concluir nem falhar — reabrir, senão a chave fica presa para sempre.
  const limite = new Date(Date.now() - MINUTOS_ABANDONO * 60 * 1000);
  if (existente.updatedAt < limite) {
    return reabrir(chave, 'EM_CURSO', limite);
  }

  return { tipo: 'EM_CURSO' };
}

/**
 * Reabre a chave com um `UPDATE` condicional: quem afectar a linha ganha o
 * direito de repetir; os restantes vêem `EM_CURSO`. Mesmo padrão do consumo do
 * `jti` de handoff — nunca `findUnique` + `update` separados.
 */
async function reabrir(
  chave: string,
  estadoEsperado: EstadoChave,
  updatedAtAnteriorA?: Date,
): Promise<ResultadoReserva> {
  const { count } = await prismaBase.chaveIdempotencia.updateMany({
    where: {
      chave,
      estado: estadoEsperado,
      ...(updatedAtAnteriorA ? { updatedAt: { lt: updatedAtAnteriorA } } : {}),
    },
    data: { estado: 'EM_CURSO', respostaJson: Prisma.DbNull },
  });
  return count === 1 ? { tipo: 'RETOMAVEL' } : { tipo: 'EM_CURSO' };
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
