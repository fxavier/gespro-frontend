'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

/**
 * Widget Cloudflare Turnstile do ERP (ADR-0016 Camada 3, ADR-0031 §Decisão).
 *
 * O site de marketing tinha um componente equivalente, e tinha com ele dois
 * defeitos conhecidos (issues #43 e #44). A lane L2 apaga esses ficheiros; este
 * nasce com os dois fechados, e é por isso que o ciclo de vida abaixo está
 * escrito como está:
 *
 * **#43 — o widget remontava-se a cada tecla.** O efeito que monta o widget
 * declarava nas dependências as funções de retorno, e o formulário passava-as
 * como funções anónimas escritas no local. Cada render criava funções novas, o
 * efeito via dependências mudadas, limpava — o que REMOVE o widget — e montava
 * outro. Como receber um token provoca um render, o ciclo alimentava-se a si
 * próprio, e o token submetido podia pertencer a um widget já removido.
 * Fecho: o efeito de montagem depende **só de `siteKey`**; as funções de
 * retorno vivem numa `ref` actualizada por um efeito sem dependências, e o
 * widget chama sempre a versão corrente sem nunca ser remontado por causa dela.
 *
 * **#44 — sem chave, o formulário recusava-se a submeter.** Não é problema
 * deste componente (ele só renderiza quando há chave), mas a outra metade está
 * em `registo-form.tsx`: a obrigatoriedade do token segue a presença da chave.
 *
 * `repor()` (pela `ref`) volta a pôr o desafio de pé sem desmontar nada — é o
 * que o formulário precisa depois de uma submissão recusada, porque o token do
 * Turnstile é de uso único. Imperativo de propósito: um contador em estado
 * obrigaria a um `setState` dentro de um efeito, que é cascata de renders
 * (e que o lint deste repositório recusa).
 *
 * Chaves de teste da Cloudflare (dev, sem conta):
 *   site key `1x00000000000000000000AA` — passa sempre
 *   site key `2x00000000000000000000AB` — bloqueia sempre
 *   secret   `1x0000000000000000000000000000000AA`
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'auto' | 'light' | 'dark';
          size?: 'normal' | 'compact';
          language?: string;
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const ID_SCRIPT = 'cf-turnstile-api';
const SRC_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Comandos imperativos do widget, expostos pela `ref`. */
export interface ManipuladorTurnstile {
  /** Repõe o desafio (o token é de uso único). Sem desmontar o widget. */
  repor: () => void;
}

export interface WidgetTurnstileProps {
  siteKey: string;
  /** Chamado com o token quando o desafio é resolvido. */
  onToken: (token: string) => void;
  /** Chamado quando o token expira (300 s) — limpar o valor no pai. */
  onExpirado?: () => void;
  /** Chamado em erro de rede ou rejeição do widget. */
  onErro?: () => void;
  ref?: Ref<ManipuladorTurnstile>;
}

export function WidgetTurnstile({
  siteKey,
  onToken,
  onExpirado,
  onErro,
  ref,
}: WidgetTurnstileProps) {
  const contentorRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  // As funções de retorno mais recentes, sem entrarem nas dependências de
  // nenhum efeito. É este indirecto que fecha a #43.
  const retornosRef = useRef({ onToken, onExpirado, onErro });
  useEffect(() => {
    retornosRef.current = { onToken, onExpirado, onErro };
  });

  useEffect(() => {
    let cancelado = false;

    function limpar() {
      if (widgetIdRef.current !== undefined && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = undefined;
    }

    function renderizar() {
      if (cancelado) return;
      if (!contentorRef.current || !window.turnstile) return;
      // StrictMode corre o efeito duas vezes em dev: não renderizar dois.
      if (widgetIdRef.current !== undefined) return;
      widgetIdRef.current = window.turnstile.render(contentorRef.current, {
        sitekey: siteKey,
        callback: (token) => retornosRef.current.onToken(token),
        'expired-callback': () => retornosRef.current.onExpirado?.(),
        'error-callback': () => retornosRef.current.onErro?.(),
        theme: 'auto',
        language: 'pt',
      });
    }

    if (window.turnstile) {
      renderizar();
      return () => {
        cancelado = true;
        limpar();
      };
    }

    let script = document.getElementById(ID_SCRIPT) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = ID_SCRIPT;
      script.src = SRC_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', renderizar);

    return () => {
      cancelado = true;
      script?.removeEventListener('load', renderizar);
      limpar();
    };
    // Só `siteKey`. Ver #43 no cabeçalho — acrescentar aqui uma função de
    // retorno repõe exactamente o defeito que este ficheiro existe para não ter.
  }, [siteKey]);

  useImperativeHandle(
    ref,
    () => ({
      repor() {
        if (widgetIdRef.current === undefined || !window.turnstile) return;
        window.turnstile.reset(widgetIdRef.current);
      },
    }),
    [],
  );

  return (
    <div
      ref={contentorRef}
      data-testid="turnstile"
      aria-label="Verificação anti-robô Cloudflare Turnstile"
    />
  );
}
