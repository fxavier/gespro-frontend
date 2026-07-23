import {
  Boxes,
  HardHat,
  Landmark,
  Receipt,
  ScanBarcode,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ModuloSlug } from "@/lib/modulos";
import { cn } from "@/lib/cn";

/**
 * Mapa slug→ícone. Fica separado de `lib/modulos.ts` (que é dados puros e é
 * importado por código de servidor) para que o grafo de servidor não arraste
 * componentes React de ícones.
 */
const ICONES: Record<ModuloSlug, LucideIcon> = {
  vendas: Receipt,
  stock: Boxes,
  compras: ShoppingCart,
  financas: Landmark,
  rh: Users,
  operacoes: HardHat,
  pos: ScanBarcode,
};

const CORES: Record<ModuloSlug, string> = {
  vendas: "text-modulo-vendas",
  stock: "text-modulo-stock",
  compras: "text-modulo-compras",
  financas: "text-modulo-financas",
  rh: "text-modulo-rh",
  operacoes: "text-modulo-operacoes",
  pos: "text-modulo-pos",
};

export function IconeModulo({
  modulo,
  className,
}: {
  modulo: ModuloSlug;
  className?: string;
}) {
  const Icone = ICONES[modulo];
  return (
    <span
      className={cn(
        "grid size-11 place-items-center rounded-xl border border-contorno-suave bg-superficie",
        CORES[modulo],
        className
      )}
    >
      <Icone className="size-5" aria-hidden="true" />
    </span>
  );
}
