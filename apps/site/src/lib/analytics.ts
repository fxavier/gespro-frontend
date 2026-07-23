/**
 * Analytics privacy-first (ADR-0008).
 *
 * Sem cookies, sem identificadores persistentes, sem perfis: só contagens
 * agregadas. Por isso não há "modo anónimo" a activar — é o único modo.
 *
 * Este módulo é client-safe (importado por componentes `'use client'`).
 */

export const CHAVE_CONSENTIMENTO = "gespro-analytics-consentimento";

export type Consentimento = "aceite" | "recusado" | null;

export function lerConsentimento(): Consentimento {
  if (typeof window === "undefined") return null;
  try {
    const valor = window.localStorage.getItem(CHAVE_CONSENTIMENTO);
    return valor === "aceite" || valor === "recusado" ? valor : null;
  } catch {
    // localStorage bloqueado (modo privado restrito) — tratar como sem decisão.
    return null;
  }
}

const ouvintes = new Set<() => void>();

export function guardarConsentimento(valor: Exclude<Consentimento, null>): void {
  try {
    window.localStorage.setItem(CHAVE_CONSENTIMENTO, valor);
  } catch {
    // Sem persistência disponível: a decisão vale para esta sessão apenas.
    memoria = valor;
  }
  for (const ouvinte of ouvintes) ouvinte();
}

/** Fallback em memória quando `localStorage` está bloqueado. */
let memoria: Consentimento = null;

/**
 * Fonte externa para `useSyncExternalStore` — permite ler o consentimento sem
 * `useEffect` + `setState`, evitando o render extra depois da hidratação.
 * Também reage a decisões tomadas noutro separador (evento `storage`).
 */
export function subscreverConsentimento(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

/** Snapshot no cliente. Devolve primitivos — comparação por valor, sem ciclos. */
export function snapshotConsentimento(): Consentimento {
  return lerConsentimento() ?? memoria;
}

/** Snapshot no servidor: nunca há decisão conhecida durante o SSR. */
export function snapshotConsentimentoServidor(): Consentimento {
  return null;
}

interface JanelaPlausible extends Window {
  plausible?: (
    evento: string,
    opcoes?: { props?: Record<string, string | number | boolean> }
  ) => void;
}

/** Evento de produto. Silencioso se o analytics não estiver carregado. */
export function registarEvento(
  nome: string,
  props?: Record<string, string | number | boolean>
): void {
  if (typeof window === "undefined") return;
  (window as JanelaPlausible).plausible?.(nome, props ? { props } : undefined);
}

/** Eventos usados pelo site — lista fechada para não haver nomes soltos. */
export const EVENTOS = {
  registoIniciado: "registo_iniciado",
  registoConcluido: "registo_concluido",
  registoFalhado: "registo_falhado",
  contactoEnviado: "contacto_enviado",
} as const;
