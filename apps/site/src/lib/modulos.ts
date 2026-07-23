/**
 * Módulos do ERP apresentados no site.
 *
 * Só identificadores e metadados de apresentação — **todo o texto** vive em
 * `messages/pt.json` sob `modulos.<slug>` (Requisito 6.2). Este ficheiro é a
 * fonte da ordem canónica e das rotas `/funcionalidades/[modulo]`.
 */

export const MODULOS = [
  "vendas",
  "stock",
  "compras",
  "financas",
  "rh",
  "operacoes",
  "pos",
] as const;

export type ModuloSlug = (typeof MODULOS)[number];

export function eModuloValido(valor: string): valor is ModuloSlug {
  return (MODULOS as readonly string[]).includes(valor);
}

/**
 * Nome do ícone lucide por módulo. Mantido como string (e não como componente)
 * para este módulo continuar importável a partir de código de servidor sem
 * arrastar React para o grafo.
 */
export const ICONE_MODULO: Record<ModuloSlug, string> = {
  vendas: "Receipt",
  stock: "Boxes",
  compras: "ShoppingCart",
  financas: "Landmark",
  rh: "Users",
  operacoes: "HardHat",
  pos: "ScanBarcode",
};

/**
 * Token de cor de acento por módulo — nomes de tokens `@theme`, nunca valores.
 * Resolvidos em `theme.css`; ver `components/marketing/modulo-card.tsx`.
 */
export const ACENTO_MODULO: Record<ModuloSlug, string> = {
  vendas: "modulo-vendas",
  stock: "modulo-stock",
  compras: "modulo-compras",
  financas: "modulo-financas",
  rh: "modulo-rh",
  operacoes: "modulo-operacoes",
  pos: "modulo-pos",
};
