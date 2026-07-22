# ADR-0007 — Biblioteca de animação do site de marketing

- **Estado**: Proposto
- **Data**: 2026-07-21
- **Contexto**: Spec 18 (Website de Marketing)
- **Skills**: `ui-conventions`, `engineering:architecture`

> Stub para ratificação.

## Contexto

O site de marketing (`apps/site`) exige animação de entrada, scroll-linked (parallax leve) e
micro-interacções de gesto, com **acessibilidade primeiro** (`prefers-reduced-motion`) e sem
comprometer os Core Web Vitals (LCP < 2.5s, INP < 200ms). É preciso escolher a abordagem de
animação.

## Decisão

Usar **Motion** (`motion/react`, sucessor do Framer Motion) para animação declarativa de
componentes/scroll/gesto, e **CSS/`@keyframes` puro** para micro-interacções simples
(hover/opacidade/cor) que não justificam JS.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Motion + CSS** ✅ | API declarativa (`whileHover`, `useScroll`, `useReducedMotion`); tree-shakeable; ecossistema React maduro; CSS puro onde chega | Componentes animados são `'use client'`; disciplina para não animar tudo em JS |
| Só CSS/`@keyframes` | Zero JS, mais leve | Scroll-linked/orquestração de entrada em cascata difícil e frágil |
| GSAP | Muito poderoso (timelines) | Licenciamento de plugins; imperativo; excessivo para uma landing |
| Framer Motion (versão antiga) | Familiar | Descontinuado a favor do Motion — evitar dívida imediata |

Racional: Motion cobre o storytelling de produto (entrada em cascata, parallax de secções) com
`useReducedMotion()` de primeira classe, mantendo o CSS puro para o que é trivial — o melhor
compromisso entre expressividade e orçamento de performance.

## Consequências

- Animações vivem em componentes `'use client'` de `apps/site/src/components/marketing/*`
  (nunca nos `patterns/*` do ERP).
- Toda a configuração de variantes passa por `useReducedMotion()`; com
  `prefers-reduced-motion: reduce`, entrada colapsa para opacidade instantânea — nunca esconde
  conteúdo atrás de animação (critério de aceitação do spec 18).
- Micro-interacções em CSS não adicionam JS ao caminho crítico.
- Avaliação separada (POC) da View Transitions API nativa para transições entre páginas, com
  fallback silencioso.
