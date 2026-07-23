"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Campos de formulário acessíveis.
 *
 * O rótulo é sempre um `<label>` real ligado por `id` (não `placeholder`,
 * que desaparece ao escrever), o erro e o texto de ajuda entram em
 * `aria-describedby`, e o estado inválido é anunciado por `aria-invalid`.
 * A mensagem de erro vive num `role="alert"` para ser lida quando aparece.
 */

const CLASSES_CONTROLO =
  "w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm text-foreground " +
  "placeholder:text-texto-suave/70 transition-colors " +
  "focus-visible:border-ring disabled:opacity-60";

function Envolvente({
  id,
  rotulo,
  ajuda,
  erro,
  children,
  idAjuda,
  idErro,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  erro?: string;
  children: ReactNode;
  idAjuda: string;
  idErro: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {rotulo}
      </label>
      {children}
      {ajuda ? (
        <p id={idAjuda} className="text-xs text-texto-suave">
          {ajuda}
        </p>
      ) : null}
      {erro ? (
        <p id={idErro} role="alert" className="text-xs font-medium text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

function descrever(ajuda: string | undefined, erro: string | undefined, idAjuda: string, idErro: string) {
  return [ajuda ? idAjuda : null, erro ? idErro : null]
    .filter(Boolean)
    .join(" ") || undefined;
}

interface BaseProps {
  rotulo: string;
  ajuda?: string;
  erro?: string;
}

export function Campo({
  rotulo,
  ajuda,
  erro,
  className,
  ...resto
}: BaseProps & ComponentProps<"input">) {
  const gerado = useId();
  const id = resto.id ?? gerado;
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;

  return (
    <Envolvente
      id={id}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      idAjuda={idAjuda}
      idErro={idErro}
    >
      <input
        {...resto}
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descrever(ajuda, erro, idAjuda, idErro)}
        className={cn(
          CLASSES_CONTROLO,
          erro ? "border-destructive" : "border-input",
          className
        )}
      />
    </Envolvente>
  );
}

export function CampoTexto({
  rotulo,
  ajuda,
  erro,
  className,
  ...resto
}: BaseProps & ComponentProps<"textarea">) {
  const gerado = useId();
  const id = resto.id ?? gerado;
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;

  return (
    <Envolvente
      id={id}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      idAjuda={idAjuda}
      idErro={idErro}
    >
      <textarea
        {...resto}
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descrever(ajuda, erro, idAjuda, idErro)}
        className={cn(
          CLASSES_CONTROLO,
          "min-h-36 resize-y",
          erro ? "border-destructive" : "border-input",
          className
        )}
      />
    </Envolvente>
  );
}

export function CampoSelecao({
  rotulo,
  ajuda,
  erro,
  className,
  children,
  ...resto
}: BaseProps & ComponentProps<"select">) {
  const gerado = useId();
  const id = resto.id ?? gerado;
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;

  return (
    <Envolvente
      id={id}
      rotulo={rotulo}
      ajuda={ajuda}
      erro={erro}
      idAjuda={idAjuda}
      idErro={idErro}
    >
      {/* `<select>` nativo por decisão: teclado, pesquisa por letra e o
          selector do sistema em telemóvel vêm de graça e são melhores do que
          qualquer réplica. */}
      <select
        {...resto}
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descrever(ajuda, erro, idAjuda, idErro)}
        className={cn(
          CLASSES_CONTROLO,
          "appearance-none bg-[image:none]",
          erro ? "border-destructive" : "border-input",
          className
        )}
      >
        {children}
      </select>
    </Envolvente>
  );
}

/** Campo-armadilha para robôs: fora do ecrã, sem foco por teclado. */
export function Armadilha() {
  return (
    <div aria-hidden="true" className="sr-only">
      <label htmlFor="website">Website</label>
      <input
        id="website"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
}
