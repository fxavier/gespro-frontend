'use client';

/**
 * Sai de uma intercepção que apanhou um segmento estático.
 *
 * O interceptor `@panel/(.)[id]` também casa com `/compras/requisicoes/novo`
 * (`novo` é um valor válido para `[id]`). Numa navegação client-side a partir
 * da listagem, o slot `children` fica com a listagem e só o `@panel` muda — o
 * formulário nunca aparece, nem que o painel devolva `null`. Não há forma de
 * dizer ao router «este não»; uma navegação completa para o mesmo URL não é
 * interceptada e renderiza a rota real (`novo/page.tsx`).
 */

import { useEffect } from 'react';

/** `href`: o URL que o interceptor apanhou (ex.: `/compras/requisicoes/novo`). */
export function AbrirRotaReal({ href }: { href: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return null;
}
