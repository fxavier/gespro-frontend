import {
  Bell,
  BellRing,
  Boxes,
  Building2,
  HardHat,
  Landmark,
  LayoutDashboard,
  ScanBarcode,
  Search,
  ShoppingCart,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Representação do painel do ERP — a moldura de browser do mockup.
 *
 * Desenhada em HTML/CSS, não em imagem: é o elemento visual mais pesado do
 * hero e uma captura de ecrã real custaria ~200 kB no caminho do LCP, ficaria
 * ilegível em telemóvel e teria de ser refeita a cada mudança de UI do ERP.
 *
 * É decorativa e leva `aria-hidden` — a descrição do produto está no texto do
 * hero. Por isso os rótulos e números vivem aqui e não em `messages/`: são
 * ilustração, não conteúdo (e o teste do catálogo proíbe, com razão, valores
 * monetários nas mensagens — os únicos preços do site vêm da API). Em MT,
 * como tudo o que o produto mostra.
 */
const MENU: { rotulo: string; Icone: LucideIcon; activo?: boolean; etiqueta?: string }[] = [
  { rotulo: "Visão geral", Icone: LayoutDashboard, activo: true },
  { rotulo: "Vendas & POS", Icone: ScanBarcode, etiqueta: "Activo" },
  { rotulo: "Stock & Inventário", Icone: Boxes },
  { rotulo: "Compras", Icone: ShoppingCart },
  { rotulo: "Finanças & Caixa", Icone: Landmark },
  { rotulo: "Recursos Humanos", Icone: Users },
  { rotulo: "Operações & Projectos", Icone: HardHat },
];

const METRICAS = [
  { rotulo: "Facturação mensal", valor: "4.825.000 MT", nota: "+18,4% vs mês anterior", tom: "subir" },
  { rotulo: "Stock em alerta", valor: "3 artigos", nota: "Precisam de reposição", tom: "alerta" },
  { rotulo: "Encomendas pendentes", valor: "24", nota: "8 com entrega hoje", tom: "neutro" },
  { rotulo: "Eficácia operacional", valor: "96,8%", nota: "Metas semanais atingidas", tom: "azul" },
] as const;

const CAPACIDADE = [
  { rotulo: "Armazém central (Matola)", valor: 82, cor: "bg-azul" },
  { rotulo: "Facturação emitida / meta", valor: 94, cor: "bg-destaque" },
  { rotulo: "Viaturas em rota", valor: 65, cor: "bg-texto-suave" },
];

export function PainelProduto({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative w-full", className)}>
      {/* Pastilhas flutuantes (só em ecrãs largos) */}
      <Pastilha className="-top-4 left-6">
        <span className="size-2.5 rounded-full bg-azul" />
        <span className="font-semibold">+18,4% vendas</span>
        <TrendingUp className="size-4 text-primary" />
      </Pastilha>
      <Pastilha className="top-24 -left-6">
        <Boxes className="size-4 text-destaque" />
        <span>Stock controlado</span>
        <span className="rounded-full bg-superficie-forte px-1.5 py-0.5 text-legenda text-foreground">
          3.820 refs
        </span>
      </Pastilha>
      <Pastilha className="-top-2 right-8">
        <BellRing className="size-4 text-primary" />
        <span>24 encomendas pendentes</span>
        <span className="size-2 rounded-full bg-destructive" />
      </Pastilha>
      <Pastilha className="top-36 -right-6">
        <span>Facturação:</span>
        <span className="text-sm font-semibold text-primary">4.825.000 MT</span>
      </Pastilha>

      {/* Moldura do browser */}
      <div className="w-full overflow-hidden rounded-2xl border border-transparent bg-card text-left shadow-2xl dark:border-contorno-suave">
        <div className="flex items-center justify-between gap-4 bg-superficie-forte px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-destructive/75" />
            <span className="size-3 rounded-full bg-contorno-suave" />
            <span className="size-3 rounded-full bg-destaque/70" />
          </div>
          <div className="flex w-full max-w-md items-center justify-center gap-4">
            <div className="hidden items-center gap-1.5 rounded bg-destaque-suave px-2 py-1 text-xs text-foreground sm:flex">
              <Building2 className="size-4 text-primary" />
              <span className="font-semibold">Comercial Zambeze, Lda.</span>
              <span className="text-legenda text-texto-suave">• Sede</span>
            </div>
            <div className="flex w-48 items-center justify-between rounded-md bg-superficie px-2 py-1 text-legenda text-texto-suave sm:w-64">
              <span className="flex items-center gap-1">
                <Search className="size-3.5" />
                Procurar módulos, documentos…
              </span>
              <kbd className="rounded bg-superficie-forte px-1.5 py-0.5 text-[10px] text-foreground">
                ⌘K
              </kbd>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="relative">
              <Bell className="size-5 text-texto-suave" />
              <span className="absolute -top-1 -right-1 size-2 rounded-full bg-destructive" />
            </span>
            <span className="grid size-7 place-items-center rounded-full bg-azul text-[11px] font-bold text-accao-texto">
              CZ
            </span>
          </div>
        </div>

        <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-12">
          {/* Barra lateral */}
          <aside className="hidden flex-col justify-between p-4 lg:col-span-3 lg:flex">
            <div className="flex flex-col gap-2">
              <span className="px-1 text-legenda tracking-wider text-texto-suave uppercase">
                Módulos
              </span>
              <nav className="flex flex-col gap-1">
                {MENU.map(({ rotulo, Icone, activo, etiqueta }) => (
                  <span
                    key={rotulo}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2 py-2 text-sm",
                      activo
                        ? "bg-destaque-suave font-medium text-primary"
                        : "text-texto-suave"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icone className="size-[18px]" />
                      {rotulo}
                    </span>
                    {activo ? (
                      <span className="size-1.5 rounded-full bg-azul" />
                    ) : null}
                    {etiqueta ? (
                      <span className="rounded bg-superficie-forte px-1.5 py-0.5 text-legenda text-foreground">
                        {etiqueta}
                      </span>
                    ) : null}
                  </span>
                ))}
              </nav>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-superficie-forte p-2">
              <span className="flex items-center gap-2 text-legenda text-texto-suave">
                <span className="size-2 animate-pulse rounded-full bg-azul" />
                Ligado ao GestPro
              </span>
              <span className="text-legenda font-semibold text-primary">v2.4</span>
            </div>
          </aside>

          {/* Conteúdo */}
          <section className="flex flex-col gap-6 bg-superficie p-4 sm:p-6 lg:col-span-9">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {METRICAS.map((m) => (
                <div
                  key={m.rotulo}
                  className="flex flex-col gap-1 rounded-xl bg-card p-4 shadow-sm"
                >
                  <span className="text-legenda tracking-wider text-texto-suave uppercase">
                    {m.rotulo}
                  </span>
                  <span
                    className={cn(
                      "text-xl font-semibold tabular-nums",
                      m.tom === "alerta" && "text-destructive",
                      m.tom === "azul" && "text-primary",
                      (m.tom === "subir" || m.tom === "neutro") && "text-foreground"
                    )}
                  >
                    {m.valor}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-legenda",
                      m.tom === "subir" ? "text-primary" : "text-texto-suave"
                    )}
                  >
                    {m.tom === "subir" ? <TrendingUp className="size-3.5" /> : null}
                    {m.nota}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="flex flex-col justify-between rounded-xl bg-card p-4 shadow-sm md:col-span-8">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-foreground">
                      Evolução de fluxo e receitas
                    </p>
                    <p className="text-legenda text-texto-suave">
                      Facturação consolidada (trimestre corrente)
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                    <span className="size-2 rounded-full bg-azul" />
                    Realizado
                  </span>
                </div>
                <div className="h-44 w-full text-primary sm:h-52">
                  <svg
                    className="size-full"
                    fill="none"
                    preserveAspectRatio="none"
                    viewBox="0 0 500 180"
                  >
                    <defs>
                      <linearGradient id="painel-receitas" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,150 Q60,135 120,110 T240,80 T360,40 T500,20 L500,180 L0,180 Z"
                      fill="url(#painel-receitas)"
                    />
                    <path
                      d="M0,150 Q60,135 120,110 T240,80 T360,40 T500,20"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="3"
                    />
                    {[120, 240, 360].map((x, i) => (
                      <circle key={x} cx={x} cy={[110, 80, 40][i]} r="4" fill="currentColor" />
                    ))}
                    <circle cx="500" cy="20" r="5" fill="currentColor" />
                  </svg>
                </div>
                <div className="flex items-center justify-between pt-1 text-legenda text-texto-suave">
                  <span>Semana 01</span>
                  <span>Semana 02</span>
                  <span>Semana 03</span>
                  <span>Semana 04 (actual)</span>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl bg-card p-4 shadow-sm md:col-span-4">
                <div>
                  <p className="text-base font-semibold text-foreground">Capacidade por sector</p>
                  <p className="text-legenda text-texto-suave">Utilização em tempo real</p>
                </div>
                <div className="my-3 flex flex-col gap-3">
                  {CAPACIDADE.map((c) => (
                    <div key={c.rotulo}>
                      <div className="mb-1 flex justify-between text-legenda text-foreground">
                        <span>{c.rotulo}</span>
                        <span className="font-semibold text-primary">{c.valor}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-destaque-suave">
                        <div
                          className={cn("h-1.5 rounded-full", c.cor)}
                          style={{ width: `${c.valor}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1 text-legenda text-texto-suave">
                  <span>Actualizado há 2 min</span>
                  <span className="font-medium text-primary">Ver relatório →</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Pastilha({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute z-20 hidden items-center gap-2 rounded-full bg-card px-4 py-1.5 text-xs text-foreground shadow-xl md:flex",
        className
      )}
    >
      {children}
    </div>
  );
}
