/**
 * Ponto de entrada do middleware para o Next.
 *
 * Com a app em `src/app`, o `next dev` só procura o middleware em `src/`; o
 * `next build` resolve-o na raiz de `apps/erp`. Sem este ficheiro, dev, E2E e
 * smokes corriam sem middleware (sem cabeçalhos de segurança, sem o redirect
 * do `pagamento` (#99) nem o da sessão sem tenant (#525)); a imagem de
 * produção corria-o. A lógica continua na raiz (é lá que os testes a
 * importam); aqui só se liga. O `config` tem de ser literal neste ficheiro: o Next lê-o por
 * análise estática e não segue re-exportações — manter igual ao da raiz.
 */
export { middleware } from '../middleware';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
