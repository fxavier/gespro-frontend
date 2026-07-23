/**
 * Corrige `lang` e o tema nas páginas que o Next renderiza FORA do layout de
 * raiz: `not-found.tsx` e `global-error.tsx`.
 *
 * No Next 16 essas fronteiras substituem o documento por um invólucro próprio
 * (`<html id="__next_error__">`) e nem o `lang` nem a classe de tema definidos
 * no layout de raiz se aplicam. Sem isto, o 404 do site falha `html-has-lang`
 * no axe e renderiza sempre em tema claro, mesmo com o sistema em escuro.
 *
 * Corre antes da pintura (script síncrono no topo do fragmento), pelo que não
 * há cintilação. Limitação conhecida: sem JavaScript, o 404 fica com o `lang`
 * do invólucro do Next — registada em `docs/handoff/feat-18-website-marketing.md`.
 */
export function ScriptTemaSistema() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          "try{var d=document.documentElement;d.lang='pt-MZ';" +
          "if(matchMedia('(prefers-color-scheme: dark)').matches)d.classList.add('dark')}catch(e){}",
      }}
    />
  );
}
