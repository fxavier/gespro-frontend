import { describe, expect, it } from "vitest";
import { contactoSchema } from "../validations";

/**
 * Só o contacto: o registo saiu do site com o ADR-0031 §4 e os seus testes
 * foram com ele. O que substitui esta cobertura vive em `apps/erp` — no schema
 * e na fronteira pública partilhada —, que é onde o registo passou a ser
 * validado.
 */

describe("contactoSchema", () => {
  const valido = {
    nome: "João Sitoe",
    email: "joao@empresa.co.mz",
    empresa: "Empresa, Lda.",
    assunto: "demonstracao",
    mensagem: "Gostaríamos de agendar uma demonstração para a nossa equipa.",
  };

  it("aceita uma mensagem completa", () => {
    expect(contactoSchema.safeParse(valido).success).toBe(true);
  });

  it("exige uma mensagem com substância mínima", () => {
    const resultado = contactoSchema.safeParse({ ...valido, mensagem: "olá" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]!.message).toBe("mensagemCurta");
    }
  });

  it("devolve chaves de tradução como mensagens, não texto literal", () => {
    const resultado = contactoSchema.safeParse({ ...valido, email: "x" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]!.message).toBe("emailInvalido");
    }
  });

  it("rejeita o campo-armadilha preenchido", () => {
    expect(
      contactoSchema.safeParse({ ...valido, website: "http://spam" }).success
    ).toBe(false);
  });
});
