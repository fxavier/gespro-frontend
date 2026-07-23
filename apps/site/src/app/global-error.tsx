"use client";

import mensagens from "../../messages/pt.json";
import { ScriptTemaSistema } from "@/components/marketing/tema-sistema";
import "./globals.css";

/**
 * Erro global — substitui o layout de raiz, logo tem de trazer `<html>`/`<body>`
 * e não pode contar com o `NextIntlClientProvider` (está acima dele na árvore).
 * As strings são lidas directamente do catálogo PT-PT para o conteúdo continuar
 * a viver num só sítio (Requisito 6.2).
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = mensagens.erros.erroServidor;

  return (
    <html lang="pt-MZ">
      <head>
        <ScriptTemaSistema />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <main className="mx-auto flex min-h-dvh max-w-texto flex-col items-center justify-center px-6 text-center">
          <p className="text-titulo text-primary tabular-nums" aria-hidden="true">
            {t.codigo}
          </p>
          <h1 className="mt-4 text-seccao text-foreground">{t.titulo}</h1>
          <p className="mt-3 text-texto-suave">{t.descricao}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-accao-texto"
            >
              {t.acao}
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                O erro global substitui o layout de raiz: o router do App Router
                pode estar em estado inconsistente, e só uma navegação completa
                garante recuperação. */}
            <a
              href="/"
              className="inline-flex h-11 items-center rounded-full border border-contorno-suave px-5 text-sm font-medium text-foreground"
            >
              {t.acaoSecundaria}
            </a>
          </div>
          {error.digest ? (
            <p className="mt-8 font-mono text-xs text-texto-suave">
              {t.referencia.replace("{id}", error.digest)}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
