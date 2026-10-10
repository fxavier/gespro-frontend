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
  // PDF arquivados no encerramento do exercício (ADR-0035 §8): gravados SÓ pelo servidor
  // (`ObjectStorage.put`) — o presign recusa-o (`RECURSOS_SO_SERVIDOR`).
  'encerramento',
] as const;

export type RecursoDocumento = (typeof RECURSOS_DOCUMENTO)[number];

/** Recursos cujos objectos só o servidor grava: nunca há upload directo do cliente. */
export const RECURSOS_SO_SERVIDOR: readonly RecursoDocumento[] = ['encerramento'];

/**
 * Mapa recurso → permissão de escrita do recurso (ver `prisma/seed/rbac.ts`).
 * Autoriza o upload (presign + PUT local). O download usa a de LEITURA (#193).
 */
export const PERMISSAO_ESCRITA_POR_RECURSO: Record<RecursoDocumento, string> = {
  fornecedor: 'fornecedores:editar',
  ativo: 'ativos:write',
  viatura: 'transporte:viatura:documentos',
  motorista: 'transporte:motorista:documentos',
  colaborador: 'rh:colaboradores:update',
  // Ler os PDF arquivados do encerramento é exportar mapas contabilísticos.
  encerramento: 'financas:exportar',
};

/**
 * Mapa recurso → permissão de LEITURA do recurso (#193), a mesma que as Server Actions de
 * consulta de cada recurso declaram. Autoriza o download: um documento é tão sensível como o
 * recurso que descreve, e quem consulta o recurso consulta os seus documentos.
 */
export const PERMISSAO_LEITURA_POR_RECURSO: Record<RecursoDocumento, string> = {
  fornecedor: 'fornecedores:ver',
  ativo: 'ativos:read',
  viatura: 'transporte:viatura:listar',
  motorista: 'transporte:motorista:listar',
  colaborador: 'rh:colaboradores:read',
  // Ler os PDF arquivados do encerramento é exportar mapas contabilísticos.
  encerramento: 'financas:exportar',
};

/**
 * Permissão exigida para um upload DIRECTO do cliente (presign + PUT local) para o recurso.
 * `null` quando o recurso é desconhecido ou só-servidor — nesse caso o cliente nunca escreve.
 * Fonte única da regra: o presign autoriza a assinatura e o PUT local autoriza a escrita com
 * esta mesma função (issue #194).
 */
export function permissaoUploadDirecto(recurso: string): string | null {
  if (!(RECURSOS_DOCUMENTO as readonly string[]).includes(recurso)) return null;
  const r = recurso as RecursoDocumento;
  if (RECURSOS_SO_SERVIDOR.includes(r)) return null;
  return PERMISSAO_ESCRITA_POR_RECURSO[r];
}

/** True se o content-type está na allowlist. */
export function contentTypePermitido(ct: string): ct is ContentTypePermitido {
  return (CONTENT_TYPES_PERMITIDOS as readonly string[]).includes(ct);
}
