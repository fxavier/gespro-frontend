/**
 * Opções de um filtro de enum (`FilterBar`) a partir de um mapa valor→rótulo tipado pelo enum
 * Prisma (#105). Com `Record<Enum, string>` o compilador recusa um valor que não existe no enum e
 * acusa um que falte — a lista de opções não volta a divergir do schema. Para um subconjunto
 * deliberado (ex.: tipos de sistema escondidos), tipa com `Partial<Record<Enum, string>>`.
 *
 * Client-safe: só tipos, nada de `server-only`.
 */
export function opcoesDeEnum<E extends string>(
  rotulos: Partial<Record<E, string>>,
): { label: string; value: E }[] {
  return (Object.entries(rotulos) as [E, string][]).map(([value, label]) => ({ label, value }));
}
