import { z } from "zod";
import { PROVINCIAS } from "./provincias";
import { IDS_PLANO } from "./planos";

/**
 * Schemas partilhados cliente↔servidor.
 *
 * O MESMO schema valida no formulário e no handler/action — nunca há duas
 * definições de "válido". As mensagens são chaves de tradução resolvidas na UI
 * (`contacto.erros.*` / `comecar.erros.*`), para o conteúdo ficar em
 * `messages/pt.json` (Requisito 6.2).
 */

export const ASSUNTOS_CONTACTO = [
  "demonstracao",
  "migracao",
  "precos",
  "apoio",
  "outro",
] as const;

export type AssuntoContacto = (typeof ASSUNTOS_CONTACTO)[number];

export const contactoSchema = z.object({
  nome: z.string().trim().min(2, "nomeCurto").max(120, "nomeCurto"),
  email: z.string().trim().email("emailInvalido").max(200),
  empresa: z.string().trim().min(2, "nomeCurto").max(160),
  telefone: z.string().trim().max(40).optional().or(z.literal("")),
  assunto: z.enum(ASSUNTOS_CONTACTO, { message: "assuntoInvalido" }),
  mensagem: z
    .string()
    .trim()
    .min(20, "mensagemCurta")
    .max(4000, "mensagemLonga"),
  /**
   * Campo-armadilha: invisível e sem foco por teclado. Se vier preenchido, o
   * pedido veio de um robô — respondemos 200 sem enviar nada (não damos sinal).
   */
  website: z.string().max(0).optional().or(z.literal("")),
});

export type DadosContacto = z.infer<typeof contactoSchema>;

/** NUIT moçambicano: exactamente 9 dígitos. */
export const nuitSchema = z
  .string()
  .trim()
  .regex(/^\d{9}$/, "nuitInvalido");

export const registoSchema = z.object({
  empresaNome: z.string().trim().min(2, "nomeCurto").max(160),
  empresaNuit: nuitSchema,
  provincia: z.enum(PROVINCIAS, { message: "provinciaInvalida" }),
  adminNome: z.string().trim().min(2, "nomeCurto").max(120),
  adminEmail: z.string().trim().email("emailInvalido").max(200),
  adminSenha: z.string().min(10, "senhaCurta").max(200),
  planoId: z.enum(IDS_PLANO, { message: "planoInvalido" }),
  website: z.string().max(0).optional().or(z.literal("")),
});

export type DadosRegisto = z.infer<typeof registoSchema>;

/**
 * Payload exacto de `POST /api/publico/registo` (contrato do spec 19).
 * A tradução acontece aqui, num só sítio, para que uma mudança do contrato
 * seja um edit local e não uma caça pelo formulário.
 */
export function paraPayloadRegisto(
  dados: DadosRegisto,
  captchaToken?: string
) {
  return {
    empresa: { nome: dados.empresaNome, nuit: dados.empresaNuit },
    admin: {
      nome: dados.adminNome,
      email: dados.adminEmail,
      senha: dados.adminSenha,
    },
    planoId: dados.planoId,
    provincia: dados.provincia,
    // O contrato prevê `captchaToken`; enquanto o spec 19 não fixar o provedor
    // de captcha, o site envia string vazia e conta com o rate-limit do lado
    // do 19. Ver gap em docs/handoff/feat-18-website-marketing.md.
    captchaToken: captchaToken ?? "",
  };
}
