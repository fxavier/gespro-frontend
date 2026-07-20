import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${i}` }));

describe('paginate (cursor)', () => {
  it('invariante: nextCursor existe sse e só se houver mais que `take`', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 200 }), fc.integer({ min: 1, max: 50 }), async (total, take) => {
        const all = rows(total);
        const findMany = async (a: { take: number; cursor?: { id: string }; skip?: number }) => {
          const start = a.cursor ? all.findIndex((r) => r.id === a.cursor!.id) + (a.skip ?? 0) : 0;
          return all.slice(start, start + a.take);
        };
        const page = await paginate(findMany, { take });
        expect(page.items.length).toBe(Math.min(take, total));
        const hasMore = total > take;
        expect(page.nextCursor !== null).toBe(hasMore);
        if (hasMore) expect(page.nextCursor).toBe(`id-${take - 1}`);
      }),
    );
  });

  it('percorre todas as páginas sem lacunas nem repetições', async () => {
    const all = rows(47);
    const findMany = async (a: { take: number; cursor?: { id: string }; skip?: number }) => {
      const start = a.cursor ? all.findIndex((r) => r.id === a.cursor!.id) + (a.skip ?? 0) : 0;
      return all.slice(start, start + a.take);
    };
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await paginate(findMany, { cursor, take: 10 });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(all.map((r) => r.id));
  });
});
