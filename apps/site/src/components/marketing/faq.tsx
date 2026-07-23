import { ChevronDown } from "lucide-react";

export interface ItemFaq {
  pergunta: string;
  resposta: string;
}

/**
 * FAQ em `<details>`/`<summary>` nativos.
 *
 * Zero JavaScript e zero `aria-*` a manter: o browser trata expansão, estado
 * anunciado e teclado. Um acordeão em React aqui seria mais código para
 * reproduzir — pior — o que a plataforma já faz.
 */
export function Faq({ itens }: { itens: ItemFaq[] }) {
  return (
    <div className="mx-auto max-w-texto divide-y divide-contorno-suave rounded-2xl border border-contorno-suave bg-card">
      {itens.map((item) => (
        <details key={item.pergunta} className="group px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium text-foreground marker:content-none">
            {item.pergunta}
            <ChevronDown
              className="size-5 shrink-0 text-texto-suave transition-transform duration-[var(--duracao-rapida)] group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="pb-5 text-sm leading-relaxed text-texto-suave">
            {item.resposta}
          </p>
        </details>
      ))}
    </div>
  );
}
