import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

import "./globals.css";

/**
 * Tipografia «casa financeira»: Plex Sans no corpo (numerais tabulares
 * nativos, desenho institucional), Fraunces nos títulos (serifa com peso
 * óptico, lê-se como papel timbrado e não como dashboard genérico), Plex
 * Mono para códigos e referências. Os nomes das variáveis mantêm-se para não
 * tocar no @theme.
 */
const geistSans = IBM_Plex_Sans({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

const geistMono = IBM_Plex_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "SOFT"],
});

export const metadata: Metadata = {
  title: "GestPro — Sistema de Gestão Empresarial",
  description: "Sistema completo de gestão para empresas moçambicanas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-MZ" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} antialiased`}
      >
        <Providers>
          {children}
          <Toaster />
          <SonnerToaster />
        </Providers>
      </body>
    </html>
  );
}
