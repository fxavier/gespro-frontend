"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useSyncExternalStore, type ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export function ProvedorTema({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

const OPCOES = [
  { valor: "light", Icone: Sun, chave: "temaClaro" },
  { valor: "dark", Icone: Moon, chave: "temaEscuro" },
  { valor: "system", Icone: Monitor, chave: "temaSistema" },
] as const;

/**
 * Selector de tema como `radiogroup` de três estados (claro/escuro/sistema).
 * Um botão de alternância binário perde a opção "seguir o sistema", que é a
 * omissão — e um utilizador que a perca não a consegue recuperar.
 *
 * Antes da hidratação o tema real é desconhecido: renderiza-se a estrutura com
 * `aria-checked={false}` para não haver desvio de layout nem anúncio errado.
 */
const semSubscricao = () => () => {};

export function SelectorTema({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const { theme, setTheme } = useTheme();
  // `false` no servidor, `true` no cliente — dá o "já hidratou?" sem um
  // `useEffect` que provoque um segundo render.
  const montado = useSyncExternalStore(
    semSubscricao,
    () => true,
    () => false
  );

  return (
    <div
      role="radiogroup"
      aria-label={t("temaAlternar")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-contorno-suave bg-superficie p-0.5",
        className
      )}
    >
      {OPCOES.map(({ valor, Icone, chave }) => {
        const activo = montado && theme === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={activo}
            aria-label={t(chave)}
            title={t(chave)}
            onClick={() => setTheme(valor)}
            className={cn(
              "grid size-8 place-items-center rounded-full transition-colors",
              activo
                ? "bg-background text-foreground shadow-sm"
                : "text-texto-suave hover:text-foreground"
            )}
          >
            <Icone className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
