/**
 * Configuração por ambiente do site.
 *
 * Regra: o site é público e estático — **nenhum segredo do ERP** vive aqui.
 * As chaves `NEXT_PUBLIC_*` acabam no bundle; as restantes só são lidas em
 * código de servidor (Route Handlers e Server Actions).
 *
 * Documentação das chaves: `apps/site/.env.example`.
 */

function limpar(valor: string | undefined): string | undefined {
  const v = valor?.trim();
  return v ? v.replace(/\/+$/, "") : undefined;
}

/** URL público do próprio site — base de canónicos, sitemap e OG. */
export const SITE_URL =
  limpar(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3100";

/** URL da aplicação ERP (destino dos CTAs de login e do handoff de registo). */
export const APP_URL =
  limpar(process.env.NEXT_PUBLIC_APP_URL) ?? "http://localhost:3000";

/**
 * Base da API pública de onboarding (spec 19). Por omissão a própria app ERP.
 * Separada de `APP_URL` para permitir apontar o site a um ambiente de testes do
 * provisionamento sem mudar o destino dos links de login.
 */
export const API_PUBLICA_URL =
  limpar(process.env.PLATAFORMA_API_URL) ?? APP_URL;

/** Endpoints consumidos do spec 19 — ver docs/handoff/site-provisionamento-consumo.md. */
export const ENDPOINT_PLANOS = `${API_PUBLICA_URL}/api/publico/planos`;
export const ENDPOINT_REGISTO = `${API_PUBLICA_URL}/api/publico/registo`;
export const URL_CALLBACK_REGISTO = `${APP_URL}/auth/registo-callback`;
export const URL_LOGIN = `${APP_URL}/auth/login`;

/** Domínio configurado no Plausible; ausente = analytics desligado (ADR-0008). */
export const PLAUSIBLE_DOMINIO = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMINIO?.trim();

/** Host self-hosted / região EU do Plausible. */
export const PLAUSIBLE_HOST =
  limpar(process.env.NEXT_PUBLIC_PLAUSIBLE_HOST) ?? "https://plausible.io";

/**
 * Exigir consentimento explícito antes de carregar o script de analytics.
 * Por omissão `false`: a configuração recomendada (Plausible, sem cookies e sem
 * dados pessoais) não obriga a consentimento prévio. Ver ADR-0008.
 */
export const CONSENTIMENTO_OBRIGATORIO =
  process.env.NEXT_PUBLIC_ANALYTICS_CONSENTIMENTO === "obrigatorio";

/** Provider de email do formulário de contacto: "smtp" | "noop". */
export const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER ?? "noop") as
  | "smtp"
  | "noop";

export const CONTACTO_DESTINO =
  process.env.CONTACTO_EMAIL_DESTINO?.trim() ?? "ola@gestpro.co.mz";
