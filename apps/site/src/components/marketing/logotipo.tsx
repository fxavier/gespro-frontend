import { cn } from "@/lib/cn";

/**
 * Logótipo em SVG inline.
 *
 * Inline (e não `next/image`) por três razões: zero pedidos de rede no LCP,
 * herda a cor do contexto via `currentColor` — o que resolve claro/escuro sem
 * duplicar ficheiros — e permite `aria-hidden` no símbolo quando o nome já é
 * texto. As variantes de ficheiro (`packages/brand/logo/*.svg`) existem para
 * uso externo: OG, favicon, imprensa.
 */
export function Simbolo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-8", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1.5"
        y="1.5"
        width="45"
        height="45"
        rx="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.9"
      />
      <rect x="12" y="27" width="6" height="10" rx="2" fill="currentColor" opacity="0.55" />
      <rect x="21" y="20" width="6" height="17" rx="2" fill="currentColor" opacity="0.78" />
      <rect x="30" y="11" width="6" height="26" rx="2" fill="currentColor" />
    </svg>
  );
}

export function Logotipo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Simbolo className="size-7 text-primary" />
      <span className="text-lg font-semibold tracking-tight">
        Gest<span className="text-primary">Pro</span>
      </span>
    </span>
  );
}
