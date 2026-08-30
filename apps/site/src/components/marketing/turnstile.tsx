"use client";

import { useEffect, useRef } from "react";

/**
 * Widget Cloudflare Turnstile (ADR-0016 Camada 3).
 *
 * Carrega o script do Turnstile de forma lazy (só quando o componente monta)
 * e renderiza o widget de forma explícita para controlo total do ciclo de vida.
 * Quando o utilizador passa o desafio, `onToken` é chamado com o token; quando
 * o token expira (300 s), `onExpirado` é chamado para limpar o valor.
 *
 * Em modo degradado (Turnstile inacessível), o servidor aceita o registo com
 * alerta (ADR-0016 §modo degradado) — o widget não bloqueia o funil.
 *
 * Chave pública: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (nunca o segredo — o segredo
 * fica só no ERP, no Secrets Manager em produção).
 *
 * Chaves de teste Cloudflare:
 *   site key `1x00000000000000000000AA` — sempre passa (dev sem Cloudflare)
 *   site key `2x00000000000000000000AB` — sempre bloqueia (teste de recusa)
 *   secret   `1x0000000000000000000000000000000AA` — par do site key de teste
 */

// Declaração mínima da API pública do widget Turnstile.
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "compact";
        }
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export interface WidgetTurnstileProps {
  siteKey: string;
  /** Chamado com o token quando o utilizador passa o desafio. */
  onToken: (token: string) => void;
  /** Chamado quando o token expira — deve limpar o token no componente pai. */
  onExpirado?: () => void;
  /** Chamado em caso de erro de rede ou rejeição do widget. */
  onErro?: () => void;
}

/**
 * Widget Turnstile com renderização explícita.
 *
 * Uso:
 * ```tsx
 * const [captchaToken, setCaptchaToken] = useState("");
 * <WidgetTurnstile
 *   siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
 *   onToken={setCaptchaToken}
 *   onExpirado={() => setCaptchaToken("")}
 * />
 * <input type="hidden" name="captchaToken" value={captchaToken} />
 * ```
 */
export function WidgetTurnstile({
  siteKey,
  onToken,
  onExpirado,
  onErro,
}: WidgetTurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const SCRIPT_ID = "cf-turnstile-api";

    function renderizar() {
      if (!containerRef.current || !window.turnstile) return;
      // Evitar renderização dupla se o efeito correr duas vezes (StrictMode).
      if (widgetIdRef.current !== undefined) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onToken,
        "error-callback": onErro,
        "expired-callback": onExpirado,
        theme: "auto",
      });
    }

    // Se o script já carregou (e.g., navegação SPA), renderiza imediatamente.
    if (window.turnstile) {
      renderizar();
      return;
    }

    // Carrega o script uma única vez (pode haver vários widgets na página).
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", renderizar);

    return () => {
      script?.removeEventListener("load", renderizar);
      if (widgetIdRef.current !== undefined && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    };
  }, [siteKey, onToken, onExpirado, onErro]);

  return (
    <div
      ref={containerRef}
      aria-label="Verificação anti-robô Cloudflare Turnstile"
    />
  );
}
