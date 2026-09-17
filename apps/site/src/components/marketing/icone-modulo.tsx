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
import { ChapaIcone } from "./primitivos";

/**
 * Mapa slug→ícone. Fica separado de `lib/modulos.ts` (que é dados puros e é
 * importado por código de servidor) para que o grafo de servidor não arraste
 * componentes React de ícones.
 *
 * Um só azul para todos os módulos, como no mockup — a paleta por módulo que
 * existia saiu com ela.
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

export function IconeModulo({
  modulo,
  className,
}: {
  modulo: ModuloSlug;
  className?: string;
}) {
  const Icone = ICONES[modulo];
  return (
    <ChapaIcone className={className}>
      <Icone className="size-5" aria-hidden="true" />
    </ChapaIcone>
  );
}
