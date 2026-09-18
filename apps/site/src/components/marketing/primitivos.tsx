import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Link } from "@/i18n/navigation";

/**
 * Primitivos visuais do site.
 *
 * NÃO reutilizam `apps/erp/src/components/patterns/*` por desenho: o ERP e o
 * site têm bibliotecas de UI distintas (Requisito 3.4) — só a marca é
 * partilhada, via `packages/brand`. Um dashboard denso e uma página de
 * marketing têm restrições opostas de densidade, tipografia e movimento.
 */

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-conteudo px-4 md:px-8", className)}>
      {children}
    </div>
  );
}

export function Seccao({
  children,
  className,
  id,
  ariaLabelledby,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  ariaLabelledby?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={cn("py-20 lg:py-28", className)}
    >
      {children}
    </section>
  );
}

/** Etiqueta de secção: legenda em maiúsculas pequenas, a azul, sem caixa. */
export function Etiqueta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-legenda font-bold tracking-wider text-primary uppercase",
        className
      )}
    >
      {children}
    </span>
  );
}

export function TituloSeccao({
  etiqueta,
  titulo,
  subtitulo,
  id,
  alinhamento = "centro",
  className,
  nivel = 2,
}: {
  etiqueta?: string;
  titulo: string;
  subtitulo?: string;
  id?: string;
  alinhamento?: "centro" | "esquerda";
  className?: string;
  /**
   * `1` quando este é o título DA PÁGINA (uma vez por página), `2` quando é o
   * título de uma secção. Sem isto as páginas interiores ficavam sem `<h1>` e a
   * hierarquia de cabeçalhos começava no nível 2.
   */
  nivel?: 1 | 2;
}) {
  const Cabecalho = nivel === 1 ? "h1" : "h2";

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        alinhamento === "centro"
          ? "mx-auto max-w-texto items-center text-center"
          : "max-w-texto items-start text-left",
        className
      )}
    >
      {etiqueta ? <Etiqueta>{etiqueta}</Etiqueta> : null}
      <Cabecalho
        id={id}
        className={nivel === 1 ? "text-titulo text-foreground" : "text-seccao text-foreground"}
      >
        {titulo}
      </Cabecalho>
      {subtitulo ? (
        <p className="text-lead text-texto-suave">{subtitulo}</p>
      ) : null}
    </div>
  );
}

// ─── Botões ────────────────────────────────────────────────────────────────

type Variante = "primario" | "secundario" | "fantasma" | "faixa";
type Tamanho = "md" | "lg";

/*
 * Botões rectangulares (8px) como no mockup: o primário é o azul de acção com
 * sombra, o secundário é um cartão branco com sombra leve. `active:scale`
 * é a única micro-interacção — o resto vive em `Gesto` (movimento.tsx).
 */
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium " +
  "transition-[background-color,color,transform] duration-[var(--duracao-rapida)] " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60";

const VARIANTES: Record<Variante, string> = {
  // `text-accao-texto` e não `text-primary-foreground`: no tema escuro o azul
  // clareia e o branco deixaria de passar AA. Ver theme.css.
  primario: "bg-azul text-accao-texto shadow-md hover:bg-primary",
  secundario:
    "border border-contorno-suave bg-card text-foreground shadow-sm hover:bg-superficie-forte",
  fantasma: "text-texto-suave hover:text-foreground",
  // Translúcido sobre a faixa final. É uma VARIANTE e não `className` extra
  // porque `cn` é um join: dois `text-` na mesma classe deixavam o resultado
  // à mercê da ordem do CSS gerado — e no tema claro ganhava o cinzento.
  faixa: "bg-faixa-texto/10 text-faixa-texto hover:bg-faixa-texto/20",
};

const TAMANHOS: Record<Tamanho, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm",
};

export function classesBotao(
  variante: Variante = "primario",
  tamanho: Tamanho = "md",
  extra?: string
): string {
  return cn(BASE, VARIANTES[variante], TAMANHOS[tamanho], extra);
}

export function BotaoLink({
  href,
  children,
  variante = "primario",
  tamanho = "md",
  className,
  externo = false,
  ...resto
}: {
  href: string;
  children: ReactNode;
  variante?: Variante;
  tamanho?: Tamanho;
  className?: string;
  externo?: boolean;
} & Omit<ComponentProps<"a">, "href" | "className" | "children">) {
  const classes = classesBotao(variante, tamanho, className);

  // Âncoras na própria página (`#seccao`) não passam pelo router de locale.
  if (externo || href.startsWith("#")) {
    return (
      <a href={href} className={classes} {...resto}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...resto}>
      {children}
    </Link>
  );
}

export function Botao({
  children,
  variante = "primario",
  tamanho = "md",
  className,
  ...resto
}: {
  children: ReactNode;
  variante?: Variante;
  tamanho?: Tamanho;
} & ComponentProps<"button">) {
  return (
    <button className={classesBotao(variante, tamanho, className)} {...resto}>
      {children}
    </button>
  );
}

/**
 * Cartão branco com sombra leve — o contentor por omissão do mockup. No tema
 * escuro a sombra desaparece no fundo, por isso ganha um contorno de fio.
 */
export function Cartao({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-transparent bg-card p-6 shadow-sm dark:border-contorno-suave",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Chapa quadrada de ícone: azul sobre a chapa suave, 40px. */
export function ChapaIcone({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg bg-destaque-suave text-primary",
        className
      )}
    >
      {children}
    </span>
  );
}
