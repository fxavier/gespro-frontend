import { cn } from "@/lib/cn";

/**
 * Logótipo em SVG inline.
 *
 * Inline (e não `next/image`) por três razões: zero pedidos de rede no LCP,
 * as cores vêm de tokens — o que resolve claro/escuro sem duplicar ficheiros —
 * e permite `aria-hidden` no símbolo quando o nome já é texto. As variantes de
 * ficheiro (`packages/brand/logo/*.svg`) existem para uso externo: OG,
 * favicon, imprensa — e não foram substituídas por decisão explícita.
 *
 * Símbolo: «G» branco num quadrado azul de cantos redondos, com um ponto claro
 * no canto superior direito. O texto do ficheiro original era `<text>` dentro
 * do SVG; aqui é HTML, para herdar o tipo de letra da página.
 */
export function Simbolo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("size-8", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="36" height="36" rx="10" className="fill-primary" />
      <path
        d="M12 20C12 13.37 17.37 8 24 8c4.2 0 7.8 2.16 9.9 5.5L29.6 16c-1.3-2.1-3.3-3.5-5.6-3.5-4.14 0-7.5 3.36-7.5 7.5s3.36 7.5 7.5 7.5c3.2 0 5.9-2 7-5h-8v-4.5h12.5V20c0 6.63-5.37 12-12 12S12 26.63 12 20Z"
        className="fill-primary-foreground"
        transform="translate(-4 0)"
      />
      <circle cx="28" cy="12" r="3" className="fill-primary-foreground opacity-60" />
    </svg>
  );
}

export function Logotipo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Simbolo />
      <span className="text-lg font-extrabold tracking-tight text-foreground">
        Gest<span className="text-primary">Pro</span>
      </span>
    </span>
  );
}
