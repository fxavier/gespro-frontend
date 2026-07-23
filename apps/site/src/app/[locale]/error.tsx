"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Botao, BotaoLink, Container } from "@/components/marketing/primitivos";

/**
 * 500 dentro do locale (Requisito 5.5).
 *
 * Mostra apenas o `digest` — identificador opaco gerado pelo Next para
 * correlacionar com o log do servidor. Nunca a mensagem nem o stack: são
 * detalhe interno e podem conter caminhos ou dados de configuração.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("erros.erroServidor");

  useEffect(() => {
    console.error(
      JSON.stringify({
        nivel: "error",
        evento: "site.erro_render",
        digest: error.digest,
      })
    );
  }, [error]);

  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="text-titulo text-primary tabular-nums" aria-hidden="true">
        {t("codigo")}
      </p>
      <h1 className="mt-4 text-seccao text-foreground">{t("titulo")}</h1>
      <p className="mt-3 max-w-md text-texto-suave">{t("descricao")}</p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Botao onClick={reset}>{t("acao")}</Botao>
        <BotaoLink href="/" variante="secundario">
          {t("acaoSecundaria")}
        </BotaoLink>
      </div>
      {error.digest ? (
        <p className="mt-8 font-mono text-xs text-texto-suave">
          {t("referencia", { id: error.digest })}
        </p>
      ) : null}
    </Container>
  );
}
