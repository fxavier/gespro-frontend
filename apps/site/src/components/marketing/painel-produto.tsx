import { cn } from "@/lib/cn";

/**
 * Representação abstracta do painel do ERP.
 *
 * Desenhado em CSS, não em imagem: é o elemento visual mais pesado do hero e
 * uma captura de ecrã real custaria ~200 kB no caminho do LCP, ficaria
 * ilegível em telemóvel e teria de ser refeita a cada mudança de UI do ERP.
 * Sendo decorativo, leva `aria-hidden` — a descrição do produto está no texto.
 */
export function PainelProduto({ className }: { className?: string }) {
  const barras = [38, 62, 45, 78, 56, 92, 70];

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-3xl border border-contorno-suave bg-card shadow-md",
        className
      )}
    >
      {/* Barra de janela */}
      <div className="flex items-center gap-2 border-b border-contorno-suave bg-superficie px-4 py-3">
        <span className="size-2.5 rounded-full bg-destructive/60" />
        <span className="size-2.5 rounded-full bg-warning/60" />
        <span className="size-2.5 rounded-full bg-success/60" />
        <span className="ml-3 h-2 w-28 rounded-full bg-muted" />
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-0">
        {/* Barra lateral */}
        <div className="hidden w-40 flex-col gap-2 border-r border-contorno-suave p-4 sm:flex">
          {Array.from({ length: 7 }).map((_, indice) => (
            <div key={indice} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "size-4 rounded-md",
                  indice === 1 ? "bg-primary" : "bg-muted"
                )}
              />
              <span
                className="h-2 rounded-full bg-muted"
                style={{ width: `${52 + ((indice * 13) % 34)}%` }}
              />
            </div>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-3">
            {["bg-modulo-financas", "bg-modulo-vendas", "bg-modulo-stock"].map(
              (cor, indice) => (
                <div
                  key={cor}
                  className="rounded-xl border border-contorno-suave bg-superficie p-3"
                >
                  <span className={cn("block size-2 rounded-full", cor)} />
                  <span className="mt-3 block h-2.5 w-14 rounded-full bg-foreground/20" />
                  <span
                    className="mt-2 block h-2 rounded-full bg-muted"
                    style={{ width: `${40 + indice * 12}%` }}
                  />
                </div>
              )
            )}
          </div>

          <div className="rounded-xl border border-contorno-suave p-4">
            <div className="flex h-28 items-end gap-2 sm:h-32">
              {barras.map((altura, indice) => (
                <span
                  key={indice}
                  className={cn(
                    "flex-1 rounded-t-md",
                    indice === 5 ? "bg-primary" : "bg-primary/25"
                  )}
                  style={{ height: `${altura}%` }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, indice) => (
              <div
                key={indice}
                className="flex items-center justify-between rounded-lg border border-contorno-suave px-3 py-2.5"
              >
                <span
                  className="h-2 rounded-full bg-muted"
                  style={{ width: `${30 + indice * 9}%` }}
                />
                <span className="h-2 w-12 rounded-full bg-success/50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
