/**
 * Configuração partilhada de upload de documentos (client-safe).
 *
 * Este módulo NÃO importa `server-only`: é consumido tanto pelo componente
 * `<UploadDocumento>` (client) como pela rota de presign (server), garantindo
 * uma única fonte de verdade para a allowlist de content-type e o limite de
 * tamanho. Sem funções não puras — apenas constantes.
 */

/** Limite máximo por ficheiro: 10 MB. */
export const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;

/**
 * Allowlist de content-type aceites no upload. Aplicada na assinatura
 * (server) e revalidada no cliente por UX. Office = OpenXML (docx/xlsx/pptx).
 */
export const CONTENT_TYPES_PERMITIDOS = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
] as const;

export type ContentTypePermitido = (typeof CONTENT_TYPES_PERMITIDOS)[number];

/** Extensões sugeridas para o atributo `accept` do <input type=file>. */
export const ACCEPT_DOCUMENTOS =
  '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt,' + CONTENT_TYPES_PERMITIDOS.join(',');

/** Recursos aos quais um documento pode ser associado. */
export const RECURSOS_DOCUMENTO = [
  'fornecedor',
  'ativo',
  'viatura',
  'motorista',
  'colaborador',
] as const;

export type RecursoDocumento = (typeof RECURSOS_DOCUMENTO)[number];

/**
 * Mapa recurso → permissão de escrita do recurso (ver `prisma/seed/rbac.ts`).
 * Usada tanto no presign (autorizar o upload) como no download (autorizar o
 * acesso ao ficheiro) — um documento é tão sensível como o recurso que descreve.
 */
export const PERMISSAO_ESCRITA_POR_RECURSO: Record<RecursoDocumento, string> = {
  fornecedor: 'fornecedores:editar',
  ativo: 'ativos:write',
  viatura: 'transporte:viatura:documentos',
  motorista: 'transporte:motorista:documentos',
  colaborador: 'rh:colaboradores:update',
};

/** True se o content-type está na allowlist. */
export function contentTypePermitido(ct: string): ct is ContentTypePermitido {
  return (CONTENT_TYPES_PERMITIDOS as readonly string[]).includes(ct);
}
