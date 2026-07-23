import type { ComponentProps } from "react";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Link } from "@/i18n/navigation";

/**
 * Renderizador de MDX.
 *
 * Sem `@tailwindcss/typography`: o site tem uma escala tipográfica própria
 * (`theme.css`) e o plugin traria uma segunda, com valores literais que o gate
 * de cores não vê. Mapear os elementos à mão é mais código, mas mantém uma só
 * fonte de estilo — e são doze elementos, não cem.
 */
const componentes = {
  h2: (props: ComponentProps<"h2">) => (
    <h2
      {...props}
      className="mt-12 scroll-mt-28 text-2xl font-semibold tracking-tight text-foreground"
    />
  ),
  h3: (props: ComponentProps<"h3">) => (
    <h3
      {...props}
      className="mt-9 scroll-mt-28 text-xl font-semibold tracking-tight text-foreground"
    />
  ),
  h4: (props: ComponentProps<"h4">) => (
    <h4 {...props} className="mt-7 text-base font-semibold text-foreground" />
  ),
  p: (props: ComponentProps<"p">) => (
    <p {...props} className="mt-5 leading-relaxed text-texto-suave" />
  ),
  ul: (props: ComponentProps<"ul">) => (
    <ul {...props} className="mt-5 list-disc space-y-2 pl-6 text-texto-suave" />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol
      {...props}
      className="mt-5 list-decimal space-y-2 pl-6 text-texto-suave"
    />
  ),
  li: (props: ComponentProps<"li">) => (
    <li {...props} className="leading-relaxed" />
  ),
  strong: (props: ComponentProps<"strong">) => (
    <strong {...props} className="font-semibold text-foreground" />
  ),
  blockquote: (props: ComponentProps<"blockquote">) => (
    <blockquote
      {...props}
      className="mt-6 border-l-2 border-primary/50 pl-5 text-foreground italic"
    />
  ),
  hr: (props: ComponentProps<"hr">) => (
    <hr {...props} className="my-12 border-contorno-suave" />
  ),
  table: (props: ComponentProps<"table">) => (
    <div className="mt-6 overflow-x-auto">
      <table {...props} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: (props: ComponentProps<"th">) => (
    <th
      {...props}
      className="border-b border-contorno-suave px-3 py-2 text-left font-semibold text-foreground"
    />
  ),
  td: (props: ComponentProps<"td">) => (
    <td
      {...props}
      className="border-b border-contorno-suave px-3 py-2 text-texto-suave"
    />
  ),
  code: (props: ComponentProps<"code">) => (
    <code
      {...props}
      className="rounded-md bg-superficie-forte px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
    />
  ),
  pre: (props: ComponentProps<"pre">) => (
    <pre
      {...props}
      className="mt-6 overflow-x-auto rounded-xl border border-contorno-suave bg-superficie p-4 text-sm"
    />
  ),
  a: ({ href = "", ...props }: ComponentProps<"a">) => {
    const interno = href.startsWith("/");
    if (interno) {
      return (
        <Link
          href={href}
          {...props}
          className="sublinhado-animado font-medium text-primary"
        />
      );
    }
    return (
      <a
        href={href}
        {...props}
        rel="noopener noreferrer"
        className="sublinhado-animado font-medium text-primary"
      />
    );
  },
};

export function ConteudoMdx({ fonte }: { fonte: string }) {
  return <MDXRemote source={fonte} components={componentes} />;
}
