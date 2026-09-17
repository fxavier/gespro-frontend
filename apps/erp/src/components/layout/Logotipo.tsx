import { cn } from '@/lib/utils';

/**
 * Logótipo em SVG inline — o mesmo desenho do site (apps/site/.../logotipo.tsx).
 *
 * Inline por três razões: zero pedidos de rede, as cores vêm dos tokens (o
 * símbolo acompanha o tema sem duplicar ficheiros) e permite `aria-hidden` no
 * símbolo quando o nome já é texto. Os SVG em `packages/brand/logo` existem
 * para uso externo: OG, favicon, imprensa.
 */
interface Props {
  className?: string;
  /** Sobre a barra lateral azul: quadrado branco, «G» azul, nome a branco. */
  invertido?: boolean;
}

export function Simbolo({ className, invertido = false }: Props) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn('size-8 shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="2"
        y="2"
        width="36"
        height="36"
        rx="10"
        className={invertido ? 'fill-sidebar-accent' : 'fill-primary'}
      />
      <path
        d="M8 20C8 13.37 13.37 8 20 8c4.2 0 7.8 2.16 9.9 5.5L25.6 16c-1.3-2.1-3.3-3.5-5.6-3.5-4.14 0-7.5 3.36-7.5 7.5s3.36 7.5 7.5 7.5c3.2 0 5.9-2 7-5h-8V18h12.5v2c0 6.63-5.37 12-12 12S8 26.63 8 20Z"
        className={invertido ? 'fill-sidebar-accent-foreground' : 'fill-primary-foreground'}
      />
      <circle
        cx="28"
        cy="12"
        r="3"
        className={cn(
          'opacity-60',
          invertido ? 'fill-sidebar-accent-foreground' : 'fill-primary-foreground'
        )}
      />
    </svg>
  );
}

export function Logotipo({ className, invertido = false }: Props) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Simbolo invertido={invertido} />
      <span
        className={cn(
          'text-lg font-extrabold tracking-tight',
          invertido ? 'text-sidebar-primary' : 'text-foreground'
        )}
      >
        Gest<span className={invertido ? 'text-sidebar-foreground/80' : 'text-primary'}>Pro</span>
      </span>
    </span>
  );
}
