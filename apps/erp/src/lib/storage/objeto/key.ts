/**
 * Derivação e sanitização de keys de objeto — FUNÇÃO PURA (property-tested).
 *
 * Invariante de segurança: a key resultante começa SEMPRE por
 * `tenant/{tenantId}/` e nunca contém `..` nem `//` (path traversal),
 * independentemente do `nome` fornecido pelo cliente (unicode, espaços,
 * `../`, separadores). O `tenantId`/`recursoId` vêm do contexto do servidor
 * (nunca do cliente) mas são também sanitizados por defesa em profundidade.
 *
 * Sem `import 'server-only'`: é uma função pura importável pelos testes.
 * `randomUUID` vem de `node:crypto` (só usado server-side, no presign).
 */
import { randomUUID } from 'node:crypto';
import type { RecursoDocumento } from '@/lib/storage/documento-config';

/** Esquema de URL-ref usado para guardar a key no campo `url` (compat). */
export const ESQUEMA_REF = 'gestpro-storage';

/**
 * Sanitiza um segmento de caminho para conter apenas `[a-z0-9._-]`, sem
 * sequências `..`, sem separadores e sem pontos/traços nas extremidades.
 * Idempotente: `sanitizar(sanitizar(x)) === sanitizar(x)`.
 */
export function sanitizarSegmento(valor: string, fallback = 'ficheiro'): string {
  const slug = valor
    .normalize('NFKD')
    // remove diacríticos combinados (U+0300–U+036F)
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // qualquer caractere fora da allowlist (incl. `/`, espaços, `\`) → '-'
    .replace(/[^a-z0-9._-]+/g, '-')
    // colapsa sequências de pontos (elimina `..` → traversal)
    .replace(/\.{2,}/g, '.')
    // colapsa traços repetidos
    .replace(/-{2,}/g, '-')
    // remove pontos/traços das extremidades
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .slice(0, 120);
  return slug.length > 0 ? slug : fallback;
}

export interface DerivarKeyInput {
  tenantId: string;
  recurso: RecursoDocumento;
  recursoId: string;
  nome: string;
}

/**
 * Deriva a key do objeto:
 *   `tenant/{tenantId}/{recurso}/{recursoId}/{uuid}-{slugNome}`
 * O uuid garante unicidade; o slug preserva a extensão para legibilidade.
 */
export function derivarKey(input: DerivarKeyInput): string {
  const tenantId = sanitizarSegmento(input.tenantId, 'tenant');
  const recurso = sanitizarSegmento(input.recurso, 'recurso');
  const recursoId = sanitizarSegmento(input.recursoId, 'recurso');
  const nome = sanitizarSegmento(input.nome, 'documento');
  return `tenant/${tenantId}/${recurso}/${recursoId}/${randomUUID()}-${nome}`;
}

/** Prefixo do tenant — usado para asserts e verificações. */
export function prefixoTenant(tenantId: string): string {
  return `tenant/${sanitizarSegmento(tenantId, 'tenant')}/`;
}

/**
 * Converte uma key numa URL-ref opaca (`gestpro-storage:{key}`) que passa
 * a validação `z.string().url()` das actions de registo existentes, mantendo
 * a key recuperável no download. Ver ADR do WS-DOC-CORE / handoff.
 */
export function keyParaUrlRef(key: string): string {
  return `${ESQUEMA_REF}:${key}`;
}

/**
 * Recupera a key a partir do que estiver guardado em `url`:
 *   - `gestpro-storage:{key}` → key
 *   - URL http(s) legada/externa → null (o download redirige diretamente)
 *   - key crua (sem esquema) → a própria string
 */
export function urlRefParaKey(url: string): string | null {
  if (url.startsWith(`${ESQUEMA_REF}:`)) {
    return url.slice(ESQUEMA_REF.length + 1);
  }
  if (/^https?:\/\//i.test(url)) return null;
  return url;
}
