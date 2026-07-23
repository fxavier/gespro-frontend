import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  identificarCliente,
  reiniciarLimites,
  verificarLimite,
} from "../rate-limit";

beforeEach(() => reiniciarLimites());
afterEach(() => vi.useRealTimers());

describe("verificarLimite", () => {
  it("permite até ao máximo e bloqueia a seguir", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(verificarLimite("a", 3, 60_000).permitido).toBe(true);
    }
    expect(verificarLimite("a", 3, 60_000).permitido).toBe(false);
  });

  it("conta cada chave de forma independente", () => {
    verificarLimite("a", 1, 60_000);
    expect(verificarLimite("a", 1, 60_000).permitido).toBe(false);
    expect(verificarLimite("b", 1, 60_000).permitido).toBe(true);
  });

  it("reabre a janela depois de expirar", () => {
    // Relógio falso: com uma janela real de milissegundos o teste passa a
    // depender do tempo de transformação do vitest e falha ao acaso.
    vi.useFakeTimers();

    expect(verificarLimite("c", 1, 60_000).permitido).toBe(true);
    expect(verificarLimite("c", 1, 60_000).permitido).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(verificarLimite("c", 1, 60_000).permitido).toBe(true);
  });
});

describe("identificarCliente", () => {
  it("usa o primeiro endereço de x-forwarded-for", () => {
    const cabecalhos = new Headers({
      "x-forwarded-for": "196.28.1.5, 10.0.0.1",
    });
    expect(identificarCliente(cabecalhos)).toBe("196.28.1.5");
  });

  it("recorre a x-real-ip quando não há cadeia de proxy", () => {
    expect(identificarCliente(new Headers({ "x-real-ip": "196.28.1.9" }))).toBe(
      "196.28.1.9"
    );
  });

  it("devolve um marcador estável quando não há cabeçalhos de origem", () => {
    expect(identificarCliente(new Headers())).toBe("desconhecido");
  });
});
