import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Tira os zeros à esquerda de um valor numérico escrito à mão: `05` → `5`,
 * `-007` → `-7`. Preserva o zero que é parte do número (`0`, `0.5`, `-0.25`).
 *
 * Existe porque os formulários nascem com `0` nos campos numéricos e um
 * `<input type="number">` deixa o utilizador escrever a seguir ao zero —
 * ficava `05` até alguém o apagar.
 */
export function semZerosAEsquerda(valor: string): string {
  return valor.replace(/^(-?)0+(?=\d)/, "$1")
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, onChange, onBlur, ...props }, ref) => {
    const numerico = type === "number"

    return (
      <input
        type={type}
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input flex h-10 w-full min-w-0 rounded-md border bg-card px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/20 focus-visible:ring-[2px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          className
        )}
        ref={ref}
        // Ao focar, o conteúdo fica seleccionado: o primeiro dígito substitui o 0.
        onFocus={(e) => {
          if (numerico) e.target.select()
          onFocus?.(e)
        }}
        // Enquanto se escreve, `05` passa a `5` antes de o formulário ler o valor.
        onChange={(e) => {
          if (numerico) {
            const limpo = semZerosAEsquerda(e.target.value)
            if (limpo !== e.target.value) e.target.value = limpo
          }
          onChange?.(e)
        }}
        // Vazio ao sair volta a 0 — zero é um valor legítimo (desconto, IVA,
        // rascunho) e evita o «Expected number» de um NaN no schema.
        onBlur={(e) => {
          if (numerico && e.target.value === "") {
            e.target.value = "0"
            onChange?.(e as unknown as React.ChangeEvent<HTMLInputElement>)
          }
          onBlur?.(e)
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
