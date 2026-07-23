import { getTranslations } from "next-intl/server";
import { BotaoLink, Container } from "@/components/marketing/primitivos";
import { ScriptTemaSistema } from "@/components/marketing/tema-sistema";

/**
 * 404 do site — desenho próprio, sem herdar nada do ERP (Requisito 5.5).
 * Server Component: não precisa de JS para renderizar nem para navegar.
 */
export default async function NaoEncontrado() {
  const t = await getTranslations("erros.naoEncontrado");

  return (
    <>
      <ScriptTemaSistema />
      <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <p className="text-titulo text-primary tabular-nums" aria-hidden="true">
          {t("codigo")}
        </p>
        <h1 className="mt-4 text-seccao text-foreground">{t("titulo")}</h1>
        <p className="mt-3 max-w-md text-texto-suave">{t("descricao")}</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <BotaoLink href="/">{t("acao")}</BotaoLink>
          <BotaoLink href="/funcionalidades" variante="secundario">
            {t("acaoSecundaria")}
          </BotaoLink>
        </div>
      </Container>
    </>
  );
}
