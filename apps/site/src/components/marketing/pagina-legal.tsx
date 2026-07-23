import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { obter } from "@/lib/content";
import { Container, Seccao } from "./primitivos";
import { ConteudoMdx } from "./mdx";

/**
 * Casca das páginas legais (`/termos`, `/privacidade`).
 *
 * O texto vive em `content/legal/*.mdx` — versionado no repositório, revisto em
 * PR e com histórico de alterações no git, que é o que um documento legal
 * precisa. Não passa por CMS por essa mesma razão.
 */
export async function PaginaLegal({ slug }: { slug: string }) {
  const documento = obter("legal", slug);
  if (!documento) notFound();

  const t = await getTranslations("legal");
  const formatador = await getFormatter();

  return (
    <Seccao>
      <Container>
        <article className="max-w-texto">
          <h1 className="text-titulo text-foreground">{documento.titulo}</h1>
          <p className="mt-4 text-sm text-texto-suave">
            {t("ultimaActualizacao", {
              data: formatador.dateTime(new Date(documento.data), {
                day: "2-digit",
                month: "long",
                year: "numeric",
              }),
            })}
          </p>
          <div className="mt-8">
            <ConteudoMdx fonte={documento.corpo} />
          </div>
        </article>
      </Container>
    </Seccao>
  );
}
