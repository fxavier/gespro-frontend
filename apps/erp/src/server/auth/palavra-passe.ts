import 'server-only';
import { randomInt } from 'node:crypto';

/**
 * Geração da palavra-passe inicial (ADR-0030 §2).
 *
 * `randomInt` e não `Math.random`: é a diferença entre uma palavra-passe e um
 * número decorativo. O alfabeto deixa de fora os caracteres que se confundem
 * ao ser lidos em voz alta ou copiados à mão de um ecrã para um papel —
 * `0/O`, `1/l/I` —, porque é exactamente assim que esta palavra-passe viaja
 * do administrador para o colega do lado.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const SEPARADOR = '-';
const GRUPOS = 3;
const POR_GRUPO = 4;

/** Ex.: `Kf7p-Rm2x-Tq9w` — 12 caracteres do alfabeto, em grupos legíveis. */
export function gerarPalavraPasseInicial(): string {
  const grupo = () =>
    Array.from({ length: POR_GRUPO }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return Array.from({ length: GRUPOS }, grupo).join(SEPARADOR);
}

/** Comprimento mínimo da palavra-passe escolhida pela pessoa (ADR-0030). */
export const MINIMO_PALAVRA_PASSE = 10;
