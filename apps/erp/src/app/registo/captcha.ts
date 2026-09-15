/**
 * A regra da issue #44, num sítio onde se pode testar.
 *
 * O defeito que o site tinha: o componente só renderizava o widget quando a
 * chave pública estava configurada, mas o schema exigia o token sempre. Sem
 * chave não havia widget, sem widget não havia token, e o formulário era
 * recusado pelo PRÓPRIO cliente — um botão que não avança e nada a dizer
 * porquê. **A obrigatoriedade do desafio tem de seguir a presença da chave.**
 *
 * Aqui, com o schema partilhado (`RegistoTenantSchema`) a exigir
 * `captchaToken` não vazio e sem esta lane o poder alterar, a forma de cumprir
 * a regra é submeter uma sentinela conhecida quando não há chave. Não é uma
 * porta das traseiras: quem decide se o registo passa continua a ser o
 * servidor, em `verificarCaptcha` —
 *   · `CAPTCHA_PROVIDER=none` (recusado em produção) aceita qualquer coisa;
 *   · com provedor configurado, a sentinela é verificada na Cloudflare como
 *     qualquer outro token, e falha.
 * O resultado é *fail-closed* em produção e submissível em desenvolvimento,
 * que é exactamente o que o critério de aceitação da #44 pede.
 *
 * Módulo sem React e sem `server-only`: é importado pela folha cliente e pelo
 * teste que guarda a regra.
 */

export const TOKEN_SEM_CAPTCHA = 'sem-captcha-configurado';

/** Há desafio a resolver? A mesma condição que decide se o widget aparece. */
export function captchaConfigurado(siteKey: string | undefined | null): boolean {
  return (siteKey ?? '').trim().length > 0;
}

/**
 * Valor inicial de `captchaToken` no formulário.
 *
 * Com chave: vazio — o campo só se preenche quando o desafio é resolvido, e um
 * `submit` antes disso acende o erro do campo (a outra metade da #44).
 * Sem chave: a sentinela, para o schema partilhado não trancar a submissão.
 */
export function valorInicialCaptcha(siteKey: string | undefined | null): string {
  return captchaConfigurado(siteKey) ? '' : TOKEN_SEM_CAPTCHA;
}
