import 'server-only';

export interface PageArgs {
  cursor?: string;
  take?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Paginação por cursor (nunca `skip` grande). `findMany` deve devolver os
 * registos ordenados de forma estável; pedimos `take + 1` para saber se há
 * página seguinte.
 */
export async function paginate<T extends { id: string }>(
  findMany: (a: { take: number; cursor?: { id: string }; skip?: number }) => Promise<T[]>,
  { cursor, take = 20 }: PageArgs = {},
): Promise<Page<T>> {
  const rows = await findMany({
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, take);
  const nextCursor = rows.length > take ? items[items.length - 1].id : null;
  return { items, nextCursor };
}
