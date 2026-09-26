/**
 * `/contabilidade/fluxo-caixa` não tem conteúdo próprio: é o segmento-pai da
 * configuração da DFC. Existe para o fio de Ariadne do topo, que liga cada
 * segmento — sem página, a ligação dava 404 e o prefetch dela ficava pendente
 * (a página de rubricas nunca chegava a `networkidle`).
 */
import { redirect } from 'next/navigation';

export default function FluxoCaixaPage() {
  redirect('/contabilidade/fluxo-caixa/rubricas');
}
