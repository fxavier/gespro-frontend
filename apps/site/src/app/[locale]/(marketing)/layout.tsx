import { getTranslations, setRequestLocale } from "next-intl/server";
import { Cabecalho } from "@/components/marketing/cabecalho";
import { Rodape } from "@/components/marketing/rodape";
import { JsonLd } from "@/components/marketing/json-ld";
import { siteJsonLd } from "@/lib/seo";

/**
 * Casca das páginas públicas: cabeçalho, conteúdo e rodapé.
 *
 * O primeiro elemento focável da página é o salto para o conteúdo (WCAG 2.4.1)
 * — sem ele, quem navega por teclado atravessa a navegação inteira em cada
 * página.
 */
export default async function LayoutMarketing({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#conteudo" className="salto-conteudo">
        {t("saltarParaConteudo")}
      </a>
      <Cabecalho />
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <Rodape />
      <JsonLd data={siteJsonLd()} />
    </div>
  );
}
