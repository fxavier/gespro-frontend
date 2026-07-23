import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Middleware do SITE — negociação de locale apenas.
 *
 * Deliberadamente separado do `middleware.ts` do ERP (`apps/erp`), que é dono da
 * autenticação, dos `PUBLIC_PATHS` e dos headers de segurança/CSP com nonce
 * (spec 17). O site é 100% público: não há sessão a proteger, e os headers
 * estáticos vivem em `next.config.ts`. É este isolamento que ADR-0006 compra.
 */
export default createMiddleware(routing);

export const config = {
  // Tudo excepto ficheiros estáticos, rotas de API e artefactos internos do Next.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
