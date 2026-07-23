/**
 * Concatenação de classes. Sem `tailwind-merge`: o site compõe classes de forma
 * declarativa (variantes fechadas), não precisa de resolver conflitos entre
 * utilitários — e evita um pacote no bundle público.
 */
export function cn(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(" ");
}
