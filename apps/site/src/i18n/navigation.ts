import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Wrappers de navegação com consciência de locale. Usar SEMPRE estes em vez de
 * `next/link` / `next/navigation` dentro do site — só assim o prefixo de locale
 * é preservado ao navegar.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
