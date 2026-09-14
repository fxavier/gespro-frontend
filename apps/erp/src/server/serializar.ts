import 'server-only';
import { Prisma } from '@prisma/client';

/**
 * Decimal → string na fronteira servidor→cliente.
 *
 * O React recusa-se a passar qualquer coisa que não seja um objecto simples
 * de um Server Component (ou do retorno de uma Server Action) para um Client
 * Component — e `Prisma.Decimal` é uma classe. Sem isto, uma mutação que
 * devolva a entidade que acabou de gravar rebenta DEPOIS de a transacção ter
 * commitado: o registo existe, o utilizador vê um erro.
 *
 * String e não número: o `Decimal` existe precisamente porque o float perde
 * cêntimos (regra do CLAUDE.md — dinheiro é sempre Decimal).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => any;

export type Serializado<T> = T extends Prisma.Decimal
  ? string
  : T extends Date | Fn
    ? T
    : T extends readonly (infer U)[]
      ? Serializado<U>[]
      : T extends object
        ? { [K in keyof T]: Serializado<T[K]> }
        : T;

function ehDecimal(v: unknown): v is Prisma.Decimal {
  return v instanceof Prisma.Decimal || Prisma.Decimal.isDecimal(v);
}

export function serializarDecimais<T>(valor: T): Serializado<T> {
  if (ehDecimal(valor)) return valor.toString() as Serializado<T>;
  if (Array.isArray(valor)) return valor.map(serializarDecimais) as Serializado<T>;

  // Só objectos literais: um Date, um Buffer ou um Map passam intactos —
  // converter o que não se conhece faz mais estragos do que deixar passar.
  if (valor !== null && typeof valor === 'object') {
    const proto = Object.getPrototypeOf(valor);
    if (proto === Object.prototype || proto === null) {
      const saida: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(valor)) saida[k] = serializarDecimais(v);
      return saida as Serializado<T>;
    }
  }

  return valor as Serializado<T>;
}
