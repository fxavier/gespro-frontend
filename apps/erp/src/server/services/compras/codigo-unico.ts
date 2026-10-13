/**
 * Códigos manuais (#116) — fornecedor, serviço e contrato gravam o `codigo` que o formulário
 * envia; a unicidade é a do `@@unique([tenantId, codigo])` do schema. Um código repetido no
 * mesmo tenant chega ao utilizador como regra de negócio (409), nunca como o P2002 cru que o
 * pipeline traduz em «Erro interno».
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors';

/** P2002 na unicidade do `codigo` (e não noutra, ex.: o NUIT do fornecedor). */
function violaCodigo(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  // Com o driver-adapter os campos vêm em `meta.driverAdapterError`; sem ele, em `meta.target`.
  return /\bcodigo\b/.test(JSON.stringify(e.meta ?? {}));
}

export async function comCodigoUnico<T>(entidade: string, codigo: string, criar: () => Promise<T>): Promise<T> {
  try {
    return await criar();
  } catch (e) {
    if (violaCodigo(e)) {
      throw new BusinessRuleError('CODIGO_DUPLICADO', `Já existe ${entidade} com o código «${codigo}».`);
    }
    throw e;
  }
}
