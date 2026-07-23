"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Container, BotaoLink, classesBotao } from "./primitivos";
import { Logotipo } from "./logotipo";
import { SelectorTema } from "./tema";
import { URL_LOGIN } from "@/lib/env";

const LIGACOES = [
  { href: "/funcionalidades", chave: "funcionalidades" },
  { href: "/precos", chave: "precos" },
  { href: "/recursos", chave: "recursos" },
  { href: "/sobre", chave: "sobre" },
  { href: "/contacto", chave: "contacto" },
] as const;

/**
 * Cabeçalho fixo.
 *
 * O menu móvel é um painel expansível controlado por `aria-expanded`/`aria-controls`
 * — não um modal. Fica dentro do fluxo do documento, fecha com `Escape` e não
 * prende o foco, o que evita a classe inteira de problemas de acessibilidade
 * dos diálogos e dispensa gestão de foco.
 */
export function Cabecalho() {
  const t = useTranslations("nav");
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const [caminhoDoMenu, setCaminhoDoMenu] = useState(caminho);

  // Fecha ao navegar (o painel sobreviveria à transição de rota). Ajuste de
  // estado durante o render — e não num efeito — porque deriva directamente de
  // uma prop que mudou: um efeito provocaria um render extra com o menu ainda
  // aberto na rota nova.
  if (caminho !== caminhoDoMenu) {
    setCaminhoDoMenu(caminho);
    setAberto(false);
  }

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <header className="sticky top-0 z-50 border-b border-contorno-suave/70 bg-background/85 backdrop-blur-lg">
      <Container>
        <div className="flex h-16 items-center justify-between gap-6">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-2"
            aria-label={t("inicio")}
          >
            <Logotipo />
          </Link>

          <nav
            aria-label={t("menuPrincipal")}
            className="hidden items-center gap-1 lg:flex"
          >
            {LIGACOES.map((ligacao) => {
              const activo = caminho.startsWith(ligacao.href);
              return (
                <Link
                  key={ligacao.href}
                  href={ligacao.href}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-sm transition-colors",
                    activo
                      ? "text-foreground font-medium"
                      : "text-texto-suave hover:text-foreground"
                  )}
                >
                  {t(ligacao.chave)}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <SelectorTema />
            <a
              href={URL_LOGIN}
              className={classesBotao("fantasma", "md", "px-4")}
            >
              {t("entrar")}
            </a>
            <BotaoLink href="/comecar">{t("comecar")}</BotaoLink>
          </div>

          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-contorno-suave lg:hidden"
            aria-expanded={aberto}
            aria-controls="menu-movel"
            aria-label={aberto ? t("fecharMenu") : t("abrirMenu")}
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </Container>

      <div
        id="menu-movel"
        hidden={!aberto}
        className="border-t border-contorno-suave bg-background lg:hidden"
      >
        <Container>
          <nav aria-label={t("menuPrincipal")} className="flex flex-col py-4">
            {LIGACOES.map((ligacao) => (
              <Link
                key={ligacao.href}
                href={ligacao.href}
                className="rounded-lg px-2 py-3 text-base text-foreground hover:bg-superficie"
              >
                {t(ligacao.chave)}
              </Link>
            ))}
            <div className="mt-4 flex flex-col gap-3 border-t border-contorno-suave pt-4">
              <a href={URL_LOGIN} className={classesBotao("secundario", "md")}>
                {t("entrar")}
              </a>
              <BotaoLink href="/comecar">{t("comecar")}</BotaoLink>
              <div className="pt-2">
                <SelectorTema />
              </div>
            </div>
          </nav>
        </Container>
      </div>
    </header>
  );
}
