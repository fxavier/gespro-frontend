# ADR-0007 — Biblioteca de animação do site de marketing

- **Estado**: Aceite
- **Data**: 2026-07-21 (proposto) · 2026-07-22 (aceite, implementado no spec 18 §3)
- **Contexto**: Spec 18 (Website de Marketing), Requisito 3
- **Skills**: `ui-conventions`, `engineering:architecture`

## Contexto

O site de marketing (`apps/site`) exige animação de entrada, scroll-linked (parallax leve) e
micro-interacções de gesto, com **acessibilidade primeiro** (`prefers-reduced-motion`) e sem
comprometer os Core Web Vitals (LCP < 2.5s, INP < 200ms). É preciso escolher a abordagem de
animação.

A decisão tem duas partes: **que biblioteca** e — mais importante — **que regra** impede que o
movimento se torne uma barreira de acessibilidade.

## Decisão

### 1. Biblioteca

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

### 2. Divisão de trabalho: CSS primeiro, JS só quando há estado a coordenar

- **CSS puro** (`apps/site/src/app/globals.css`): hover de ligação (`.sublinhado-animado`),
  elevação de cartão (`.subir-hover`), rotação do chevron do FAQ, transições de cor. Zero JS.
- **Motion**: só onde há coordenação (cascata), dependência do scroll (`whileInView`, parallax)
  ou gesto com física (`whileHover`/`whileTap` nos CTAs).

Tudo o que é Motion está encapsulado em `apps/site/src/components/marketing/movimento.tsx`
(`Revelar`, `Cascata`, `ItemCascata`, `Paralaxe`, `Gesto`). Nenhuma página importa `motion/react`
directamente — trocar de biblioteca é reescrever um ficheiro.

### 3. Regra inviolável: o conteúdo nunca depende de uma animação para ser visível

Três camadas, deliberadamente redundantes, porque este é o modo de falha que transforma uma
animação bonita numa página vazia:

1. **`useReducedMotion()` nas variantes** — com `prefers-reduced-motion: reduce`, a variante
   `escondido` colapsa para `{ opacity: 1 }`. Não é "animação mais rápida": é ausência de estado
   inicial escondido.
2. **Rede de segurança em CSS** — os elementos animados levam `data-revelar`; dentro de
   `@media (prefers-reduced-motion: reduce)` uma regra força `opacity`/`transform`/`filter` ao
   estado final com `!important`, anulando o estilo inline que o Motion escreve no HTML servido.
   Protege mesmo que um componente novo se esqueça do hook.
3. **`<noscript>`** — a mesma regra é injectada no `<head>` do layout de raiz. Sem ela, todo o
   conteúdo abaixo da dobra ficaria a `opacity: 0` para quem navega sem JavaScript, porque o
   observador de viewport nunca correria.

Verificado por `apps/site/e2e/reduzido.movimento.ts` (projecto `movimento-reduzido` do Playwright,
com a media feature emulada): percorre as rotas principais e falha se algum `section`/`h2`/`li`
do `main` ficar abaixo de `opacity: 0.99`.

Amplitudes: parallax de ±18 px no hero, não mais. Parallax agressivo é a causa mais comum de
desconforto vestibular e a primeira queixa de acessibilidade em sites de marketing.

### 4. View Transitions — nativas, sem JavaScript

Avaliadas conforme Requisito 3.3. Decisão: **`@view-transition { navigation: auto }`** em CSS,
mais `view-transition-name` no ícone do módulo em `/funcionalidades/[modulo]`.

Racional: é *progressive enhancement* puro — browsers sem suporte ignoram a regra e navegam
normalmente, pelo que não existe fallback a manter nem detecção de features a escrever. A
alternativa (`<ViewTransition>` do React / `experimental.viewTransition` do Next) continua
experimental nas duas camadas ao mesmo tempo e traria risco de instabilidade a um site cuja
função é estar sempre de pé. Com movimento reduzido, a transição é desligada
(`navigation: none`).

## Consequências

- Animações vivem em componentes `'use client'` de `apps/site/src/components/marketing/*`
  (nunca nos `patterns/*` do ERP). As páginas mantêm-se Server Components e compõem os
  primitivos animados como folhas — o HTML crítico (títulos, texto) é sempre servido pelo
  servidor e é o candidato a LCP.
- Micro-interacções em CSS não adicionam JS ao caminho crítico.
- Em revisão de código: um elemento animado sem `data-revelar` escapa à camada 2 e é observação
  obrigatória.
- Se o orçamento de performance apertar, o ponto de corte natural é o `Paralaxe` do hero — único
  uso de `useScroll` e o de menor valor comunicacional.
- Efeito colateral nos testes: o axe media contraste contra o estado transitório `opacity: 0` e
  produz falsos positivos em cascata. O projecto `a11y-site` do Playwright corre por isso com
  movimento reduzido — mede o estado final, que é o que o utilizador lê; o contrato do movimento
  reduzido em si é verificado pelo projecto dedicado.

## Alternativa futura registada

Se o volume de conteúdo crescer ao ponto de haver autores não-técnicos, a camada MDX file-based
(`apps/site/src/lib/content.ts`) é o ponto de troca para um CMS headless (Sanity ou
Contentlayer): as páginas só conhecem `listar()`/`obter()`. Não é feito agora — o conteúdo é
escrito pela equipa e beneficia de revisão em PR como o resto do código.
