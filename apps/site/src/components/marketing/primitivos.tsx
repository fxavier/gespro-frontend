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
    <div className={cn("mx-auto w-full max-w-conteudo px-5 sm:px-8", className)}>
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
      className={cn("py-20 sm:py-28", className)}
    >
      {children}
    </section>
  );
}

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
        "inline-flex items-center gap-2 rounded-full border border-contorno-suave bg-superficie px-3.5 py-1.5",
        "text-xs font-medium tracking-wide text-texto-suave uppercase",
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
        "flex flex-col gap-4",
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

type Variante = "primario" | "secundario" | "fantasma";
type Tamanho = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium " +
  "transition-colors duration-[var(--duracao-rapida)] " +
  "disabled:pointer-events-none disabled:opacity-60";

const VARIANTES: Record<Variante, string> = {
  // `text-accao-texto` e não `text-primary-foreground`: no tema escuro o
  // primário clareia e o branco deixaria de passar AA. Ver theme.css.
  primario: "bg-primary text-accao-texto hover:bg-primary/90 shadow-sm",
  secundario:
    "border border-contorno-suave bg-background text-foreground hover:bg-superficie",
  fantasma: "text-foreground hover:bg-superficie",
};

const TAMANHOS: Record<Tamanho, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
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

  if (externo) {
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
        "rounded-2xl border border-contorno-suave bg-card p-6 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}
