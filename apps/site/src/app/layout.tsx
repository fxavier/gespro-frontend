import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import cores from "@gespro/brand/cores.json";

import { SITE_URL } from "@/lib/env";
import { ProvedorTema } from "@/components/marketing/tema";
import { Analytics } from "@/components/marketing/analytics";
import mensagens from "../../messages/pt.json";

import "./globals.css";

/**
 * Layout de raiz — dono de `<html>`, `<body>`, tipos de letra e tema.
 *
 * Porque é AQUI e não em `app/[locale]/layout.tsx`: no Next 16 as fronteiras de
 * erro e de 404 (`notFound()`) renderizam compostas apenas até ao layout de
 * raiz. Com o `<html>` no segmento `[locale]`, essas páginas saíam num
 * invólucro `<html id="__next_error__">` sem `lang`, sem tipo de letra e sem
 * tema — 404 fora do design system e violação `html-has-lang` no axe.
 *
 * Custo assumido: `lang` é estático. PT-PT é o único idioma entregue
 * (Requisito 6.1) e é o valor correcto para todas as rotas indexadas; os
 * locales adicionais corrigem `lang` em `app/[locale]/layout.tsx`.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  // A barra do browser não resolve custom properties CSS — os literais vêm de
  // `packages/brand/cores.json`, a fonte única desses casos.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: cores.fundoClaro },
    { media: "(prefers-color-scheme: dark)", color: cores.fundoEscuro },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: mensagens.metadata.home.titulo,
    template: mensagens.metadata.modeloTitulo,
  },
  description: mensagens.comum.descricaoCurta,
  applicationName: "GestPro",
  referrer: "strict-origin-when-cross-origin",
  icons: { icon: [{ url: "/icone.svg", type: "image/svg+xml" }] },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-MZ"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        {/* Sem JavaScript, o Motion nunca corre e os blocos animados ficariam
            com o `opacity: 0` que o servidor renderizou. O conteúdo tem de ser
            legível na mesma (Requisito 3.2). */}
        <noscript>
          <style>{`[data-revelar]{opacity:1!important;transform:none!important;filter:none!important}`}</style>
        </noscript>
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <ProvedorTema>
          {children}
          <Analytics />
        </ProvedorTema>
      </body>
    </html>
  );
}
