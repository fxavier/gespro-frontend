import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "./primitivos";
import { Logotipo } from "./logotipo";
import { MODULOS } from "@/lib/modulos";
import { URL_LOGIN } from "@/lib/env";

const PRODUTO = [
  { href: "/funcionalidades", chave: "funcionalidades" },
  { href: "/precos", chave: "precos" },
  { href: "/recursos", chave: "recursos" },
] as const;

const EMPRESA = [
  { href: "/sobre", chave: "sobre" },
  { href: "/contacto", chave: "contacto" },
] as const;

export async function Rodape() {
  const t = await getTranslations("rodape");
  const tNav = await getTranslations("nav");
  const tComum = await getTranslations("comum");
  const tModulos = await getTranslations("modulos");
  const ano = new Date().getFullYear();

  return (
    <footer className="border-t border-contorno-suave bg-superficie">
      <Container>
        <div className="grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Logotipo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-texto-suave">
              {t("descricao")}
            </p>
            <p className="mt-6 text-sm text-texto-suave">
              {tComum("cidade")}
            </p>
          </div>

          <nav aria-labelledby="rodape-produto">
            <h2
              id="rodape-produto"
              className="text-sm font-semibold text-foreground"
            >
              {t("produto")}
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              {PRODUTO.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-texto-suave hover:text-foreground"
                  >
                    {tNav(item.chave)}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={URL_LOGIN}
                  className="text-texto-suave hover:text-foreground"
                >
                  {tNav("entrar")}
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="rodape-modulos">
            <h2
              id="rodape-modulos"
              className="text-sm font-semibold text-foreground"
            >
              {tNav("funcionalidades")}
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              {MODULOS.map((modulo) => (
                <li key={modulo}>
                  <Link
                    href={`/funcionalidades/${modulo}`}
                    className="text-texto-suave hover:text-foreground"
                  >
                    {tModulos(`${modulo}.nome`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="rodape-legal">
            <h2
              id="rodape-legal"
              className="text-sm font-semibold text-foreground"
            >
              {t("legal")}
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link
                  href="/termos"
                  className="text-texto-suave hover:text-foreground"
                >
                  {t("termos")}
                </Link>
              </li>
              <li>
                <Link
                  href="/privacidade"
                  className="text-texto-suave hover:text-foreground"
                >
                  {t("privacidade")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-contorno-suave py-8 text-sm text-texto-suave sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {ano} {tComum("empresa")}. {t("direitos")}
          </p>
          <p>{t("feitoEm")}</p>
        </div>
      </Container>
    </footer>
  );
}
