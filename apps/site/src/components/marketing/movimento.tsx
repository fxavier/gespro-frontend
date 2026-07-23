"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "motion/react";

/**
 * Primitivas de movimento do site (ADR-0007).
 *
 * Regra única e não negociável: **o conteúdo nunca depende de uma animação
 * para ficar visível**. Com `prefers-reduced-motion: reduce`, as variantes
 * colapsam para `opacity: 1` sem deslocamento — o elemento está montado e
 * legível mesmo que a animação nunca corra (Requisito 3.2 / WCAG 2.3.3).
 *
 * Micro-interacções puramente visuais (hover de link, sublinhado, elevação de
 * cartão) vivem em CSS (`globals.css`, camada `utilities`), não aqui: não
 * justificam custo de JS.
 *
 * Os elementos animados levam `data-revelar`. Duas regras em `globals.css`
 * usam-no como rede de segurança: com movimento reduzido e sem JavaScript, o
 * `opacity: 0` inline é anulado por CSS — o conteúdo aparece mesmo que a
 * animação nunca chegue a correr.
 */

const DESLOCAMENTO = 18;

export function useVariantesEntrada(): Variants {
  const reduzido = useReducedMotion();

  return {
    escondido: reduzido
      ? { opacity: 1 }
      : { opacity: 0, y: DESLOCAMENTO, filter: "blur(4px)" },
    visivel: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: reduzido
        ? { duration: 0 }
        : { duration: 0.62, ease: [0.16, 1, 0.3, 1] },
    },
  };
}

interface RevelarProps {
  children: ReactNode;
  /** Atraso em segundos; ignorado com movimento reduzido. */
  atraso?: number;
  className?: string;
  /** Elemento renderizado (mantém a semântica correcta do HTML). */
  como?: "div" | "section" | "li" | "article" | "header" | "figure";
}

/** Revela um bloco quando entra na viewport. Anima uma única vez. */
export function Revelar({
  children,
  atraso = 0,
  className,
  como = "div",
}: RevelarProps) {
  const reduzido = useReducedMotion();
  const variantes = useVariantesEntrada();
  const Componente = motion[como];

  return (
    <Componente
      className={className}
      data-revelar=""
      variants={variantes}
      initial="escondido"
      whileInView="visivel"
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -80px 0px" }}
      transition={reduzido ? { duration: 0 } : { delay: atraso }}
    >
      {children}
    </Componente>
  );
}

/** Contentor que escalona a entrada dos filhos (`ItemCascata`). */
export function Cascata({
  children,
  className,
  intervalo = 0.08,
  como = "div",
}: {
  children: ReactNode;
  className?: string;
  intervalo?: number;
  como?: "div" | "ul" | "section";
}) {
  const reduzido = useReducedMotion();
  const Componente = motion[como];

  return (
    <Componente
      className={className}
      initial="escondido"
      whileInView="visivel"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        escondido: {},
        visivel: {
          transition: {
            staggerChildren: reduzido ? 0 : intervalo,
            delayChildren: reduzido ? 0 : 0.05,
          },
        },
      }}
    >
      {children}
    </Componente>
  );
}

export function ItemCascata({
  children,
  className,
  como = "div",
}: {
  children: ReactNode;
  className?: string;
  como?: "div" | "li" | "article";
}) {
  const variantes = useVariantesEntrada();
  const Componente = motion[como];

  return (
    <Componente className={className} data-revelar="" variants={variantes}>
      {children}
    </Componente>
  );
}

/**
 * Parallax ligado ao scroll (`useScroll` + `useTransform`).
 * Amplitude pequena por desenho: parallax agressivo provoca desconforto
 * vestibular e é o primeiro suspeito em queixas de acessibilidade.
 */
export function Paralaxe({
  children,
  amplitude = 40,
  className,
}: {
  children: ReactNode;
  amplitude?: number;
  className?: string;
}) {
  const reduzido = useReducedMotion();
  const referencia = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: referencia,
    offset: ["start end", "end start"],
  });
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    reduzido ? [0, 0] : [amplitude, -amplitude]
  );

  return (
    <div ref={referencia} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}

/**
 * Envolve um CTA com micro-interacção de gesto (`whileHover`/`whileTap`).
 * Usa `display: contents` para não introduzir uma caixa extra no fluxo.
 */
export function Gesto({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduzido = useReducedMotion();

  return (
    <motion.span
      className={className}
      style={{ display: "inline-flex" }}
      whileHover={reduzido ? undefined : { scale: 1.02 }}
      whileTap={reduzido ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      {children}
    </motion.span>
  );
}

export { motion, useReducedMotion };
