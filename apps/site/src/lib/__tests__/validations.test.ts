import { describe, expect, it } from "vitest";
import {
  contactoSchema,
  registoSchema,
  paraPayloadRegisto,
} from "../validations";

/**
 * Registo válido de base: SEM adminSenha (ADR-0013 §5 + ADR-0016), COM
 * captchaToken obrigatório (ADR-0016 Camada 3).
 */
const registoValido = {
  empresaNome: "Comercial Zambeze, Lda.",
  empresaNuit: "400123456",
  provincia: "Maputo Cidade",
  adminNome: "Ana Macuácua",
  adminEmail: "ana@zambeze.co.mz",
  planoId: "PROFISSIONAL",
  captchaToken: "tok-turnstile-test",
};

describe("registoSchema", () => {
  it("aceita um registo completo e válido", () => {
    expect(registoSchema.safeParse(registoValido).success).toBe(true);
  });

  it("rejeita NUIT que não tenha exactamente nove dígitos", () => {
    for (const nuit of ["12345678", "1234567890", "40012345a", "400 123 456"]) {
      const resultado = registoSchema.safeParse({
        ...registoValido,
        empresaNuit: nuit,
      });
      expect(resultado.success, nuit).toBe(false);
    }
  });

  it("rejeita províncias que não são de Moçambique", () => {
    expect(
      registoSchema.safeParse({ ...registoValido, provincia: "Lisboa" }).success
    ).toBe(false);
  });

  it("rejeita planos fora do catálogo do spec 19", () => {
    expect(
      registoSchema.safeParse({ ...registoValido, planoId: "OURO" }).success
    ).toBe(false);
  });

  it("rejeita captchaToken vazio (ADR-0016: widget Turnstile obrigatório)", () => {
    expect(
      registoSchema.safeParse({ ...registoValido, captchaToken: "" }).success
    ).toBe(false);
  });

  it("não aceita campo adminSenha — a palavra-passe é definida no Keycloak (ADR-0013 §5)", () => {
    // O schema não tem adminSenha; mesmo que venha no objecto, é descartado pelo Zod.
    // O que testamos aqui é que um registo sem a chave continua a ser válido.
    const semSenha = { ...registoValido };
    expect(registoSchema.safeParse(semSenha).success).toBe(true);
  });
});

describe("paraPayloadRegisto", () => {
  it("produz exactamente a forma do contrato de POST /api/publico/registo", () => {
    const dados = registoSchema.parse(registoValido);
    const payload = paraPayloadRegisto(dados);

    expect(payload).toEqual({
      empresa: { nome: "Comercial Zambeze, Lda.", nuit: "400123456" },
      admin: {
        nome: "Ana Macuácua",
        email: "ana@zambeze.co.mz",
      },
      planoId: "PROFISSIONAL",
      provincia: "Maputo Cidade",
      captchaToken: "tok-turnstile-test",
    });
  });

  it("não inclui senha no payload (ADR-0013 §5)", () => {
    const dados = registoSchema.parse(registoValido);
    const payload = paraPayloadRegisto(dados);
    expect("senha" in (payload.admin as object)).toBe(false);
    expect("adminSenha" in payload).toBe(false);
  });

  it("inclui captchaToken no payload (ADR-0016)", () => {
    const dados = registoSchema.parse(registoValido);
    const payload = paraPayloadRegisto(dados);
    expect(payload.captchaToken).toBe("tok-turnstile-test");
  });
});

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
