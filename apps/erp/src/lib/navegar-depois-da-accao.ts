/**
 * Navegar depois de uma Server Action que revalida, sem descartar a acção.
 *
 * Defeito (nó `fecho` do grafo `dfc`, achado 1 do `e2e-v`): com
 * `await accao(); router.push(destino); router.refresh()`, cerca de 1 gravação
 * da edição de rubrica em 5 ficava no formulário para sempre, com o toast de
 * sucesso e o botão em «A guardar…» (medido: 6/20 no `e2e-v`, 4/18 aqui; 0/40 depois).
 *
 * Mecanismo — inferido da leitura do Next 16.0.10 (`app-router-instance.js`,
 * `server-action-reducer.js`) e confirmado só pelo efeito da correcção:
 * - o redutor da Server Action resolve a promessa que o componente espera
 *   (`resolve(actionResult)`) ANTES de a acção sair da fila do router: o
 *   `handleResult` que a retira corre umas microtarefas depois;
 * - se o `router.push` chega nesse intervalo, a navegação «tem prioridade»,
 *   marca a acção pendente como `discarded`, e uma acção descartada nunca
 *   resolve a promessa de estado que já tinha entregue ao React;
 * - essa actualização fica entrelaçada com a da navegação (mesma fila de
 *   estado, transições entrelaçadas), e a transição inteira fica suspensa: o
 *   URL não muda e o `isPending` não volta a `false`.
 *
 * Esperar uma macrotarefa deixa correr as microtarefas pendentes: a acção sai
 * da fila já aplicada, e o `push` segue sozinho. A acção já revalidou
 * (`revalidate` do `createSafeAction` ⇒ o router invalida a cache inteira),
 * por isso o `router.refresh()` que vinha a seguir era redundante e saiu.
 *
 * NÃO cobre um segundo defeito, que é da própria action e não da navegação: a
 * validação da versão (`validarVersaoAction`, em `/rubricas/validar`) pendura
 * da mesma maneira em ~1 de cada 10 submissões MESMO SEM `push` nenhum, e
 * também com `redirect()` no servidor. Está no handoff do nó `fecho`.
 *
 * Chama-se DENTRO do `startTransition(async …)`, com `await`: o `isPending`
 * mantém o botão desactivado até a navegação ter sido pedida.
 */
interface RouterComPush {
  push(href: string): void;
}

export async function navegarDepoisDaAccao(router: RouterComPush, destino: string): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  router.push(destino);
}
