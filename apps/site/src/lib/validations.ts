import { z } from "zod";

/**
 * Schemas partilhados cliente↔servidor.
 *
 * O MESMO schema valida no formulário e no handler/action — nunca há duas
 * definições de "válido". As mensagens são chaves de tradução resolvidas na UI
 * (`contacto.erros.*`), para o conteúdo ficar em `messages/pt.json`
 * (Requisito 6.2).
 *
 * O registo saiu daqui com o ADR-0031 §4: o formulário passou a ser do ERP,
 * e com ele o schema, o NUIT e a tradução para o payload público. Um schema de
 * registo que sobrevivesse neste lado seria uma segunda definição de «válido»
 * — exactamente o que este ficheiro existe para não haver.
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
