import { notFound } from "next/navigation";

/**
 * Catch-all que força o 404 a renderizar DENTRO do layout do locale.
 *
 * Sem isto, um caminho inexistente não corresponde a nenhum segmento, o Next
 * cai na sua página 404 interna (em inglês, sem `lang`, sem `<title>`, sem o
 * design do site) e o `[locale]/not-found.tsx` nunca chega a ser usado.
 * Um `app/not-found.tsx` de raiz também não serve: como o layout de raiz é
 * `[locale]/layout.tsx`, o Next envolveria essa página num `<html>` implícito
 * e o resultado seria HTML com dois `<html>`.
 *
 * Padrão recomendado pelo next-intl para App Router.
 */
export default function CapturarDesconhecido() {
  notFound();
}
