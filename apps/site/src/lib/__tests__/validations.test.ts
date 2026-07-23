import { describe, expect, it } from "vitest";
import {
  contactoSchema,
  registoSchema,
  paraPayloadRegisto,
} from "../validations";

const registoValido = {
  empresaNome: "Comercial Zambeze, Lda.",
  empresaNuit: "400123456",
  provincia: "Maputo Cidade",
  adminNome: "Ana Macuácua",
  adminEmail: "ana@zambeze.co.mz",
  adminSenha: "senha-muito-segura",
  planoId: "PROFISSIONAL",
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

  it("rejeita senhas com menos de dez caracteres", () => {
    expect(
      registoSchema.safeParse({ ...registoValido, adminSenha: "curta123" })
        .success
    ).toBe(false);
  });

  it("rejeita planos fora do catálogo do spec 19", () => {
    expect(
      registoSchema.safeParse({ ...registoValido, planoId: "OURO" }).success
    ).toBe(false);
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
        senha: "senha-muito-segura",
      },
      planoId: "PROFISSIONAL",
      provincia: "Maputo Cidade",
      captchaToken: "",
    });
  });

  it("relaia o token de captcha quando existe", () => {
    const dados = registoSchema.parse(registoValido);
    expect(paraPayloadRegisto(dados, "tok-123").captchaToken).toBe("tok-123");
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
