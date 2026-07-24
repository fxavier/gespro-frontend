# Handoff — WS-ATIVOS (spec 03): Editar categorias + Upload de documentos de activo

**Wave 7.1 · consome WS-DOC-CORE (spec 01).** Estado: **entregue**.
Todos os caminhos relativos a `apps/erp/` salvo indicação.

## Contexto (ADR-0003 — auditar antes de escrever)

Backend já existia; a spec era só ligar UI + storage. **Nada foi reimplementado.**
Reutilizado tal-e-qual:
- `actualizarCategoriaAtivoAction`, `ativosService.actualizarCategoria`, `ativosService.obterCategoria`,
  `CategoriaAtivoUpdateSchema` — já presentes.
- `adicionarDocumentoAtivoAction`, `removerDocumentoAtivoAction`, `ativosService.adicionarDocumento`,
  `ativosService.removerDocumento` — já presentes.
- `<UploadDocumento>` (`@/components/patterns`) — contrato de WS-DOC-CORE.

## Problema 1 — "Editar categorias" (era 404)

A tabela ligava a `/inventario/categorias/{id}/editar` mas a rota não existia.

| Ficheiro | Estado |
|---|---|
| `src/app/(dashboard)/inventario/categorias/[id]/editar/page.tsx` | novo (Server Component) |
| `src/app/(dashboard)/inventario/categorias/_components/editar-categoria-form.tsx` | novo (`'use client'`) |

- `page.tsx`: `auth()` → `obterCategoria(id)` dentro de `runWithTenantContext` → `notFound()` em erro
  (cross-tenant devolve `NotFoundError` no serviço). Server Component, sem `'use client'`.
- Form espelha `nova-categoria-form.tsx` mas usa **o MESMO** `CategoriaAtivoUpdateSchema`
  (`.partial().omit({codigo})`) via `zodResolver`; submete `actualizarCategoriaAtivoAction({ id, data })`
  por `useActionState`. `código` é read-only (imutável). `UnsavedChangesGuard` + footer sticky.
- **Sem parallel route** (`@panel`/interceptor) nesta listagem → o bug do `(.)[id]` a capturar `novo`
  não se aplica aqui.

## Problema 2 — Upload real de documentos de activo

Aba "Documentos" do detalhe do activo passou de "listar + Ver (URL crua)" para
**upload real + download seguro + remoção**.

| Ficheiro | Alteração |
|---|---|
| `src/app/(dashboard)/inventario/ativos/[id]/_components/documentos-ativo.tsx` | novo (`'use client'`) |
| `src/app/(dashboard)/inventario/ativos/[id]/page.tsx` | aba Documentos → `<DocumentosAtivo>`; removidos imports mortos (`Table*`, `FileText`, `History`) |
| `src/lib/validations/inventario-ativos.ts` | `DocumentoAtivoCreateSchema` + `storageKey?/contentType?/tamanhoBytes?` |
| `src/server/services/inventario/ativos.service.ts` | persiste o delta; `removerDocumento` apaga o objeto no storage |

### Como o upload foi ligado
`<UploadDocumento recurso="ativo" recursoId={ativoId}>` + um `Select` de **tipo**
(`TipoDocumentoAtivoEnum`) mantido em estado no wrapper. `onRegistado(meta)` mapeia:
```ts
adicionarDocumentoAtivoAction({
  ativoId, tipo,                 // tipo escolhido no Select
  nome: meta.nome,
  url: meta.urlRef,             // gestpro-storage:{key} — passa z.string().url()
  storageKey: meta.key,
  contentType: meta.contentType,
  tamanhoBytes: meta.tamanho,
});
```
- **Download**: `GET /api/documentos/{doc.id}/download?recurso=ativo` (302 → presigned GET, 300s).
- **Remoção** (AlertDialog — única excepção sem-modais): `removerDocumentoAtivoAction({documentoId})`.
  O serviço resolve a key (`storageKey`; fallback `urlRefParaKey(url)`) e chama
  `getObjectStorage().delete(key)` **antes** de apagar o metadado — **fecha o gap 3 do doc-core**.
  O delete do objeto é best-effort (try/catch) para não bloquear a remoção do metadado.

## Delta de schema / DB — AÇÃO DO ORQUESTRADOR

O modelo `DocumentoAtivo` (schema) já tinha `storageKey/contentType/tamanhoBytes` (delta doc-core),
mas **as colunas ainda NÃO existem na DB partilhada** (a migração é do orquestrador).
Como o `removerDocumento` passou a fazer `select` de `storageKey` e o `adicionarDocumento` a escrevê-lo,
a app **exige** a migração aplicada em runtime.
- `pnpm check` (vitest sem DB) **não** depende disto — fica verde na mesma.
- Para o meu smoke local apliquei `ALTER TABLE "DocumentoAtivo" ADD COLUMN IF NOT EXISTS ...`
  **diretamente na DB de dev** (não commitei migração — regra do CLAUDE.md).
- **O orquestrador tem de correr `migrate diff` + `migrate deploy`** do delta antes do smoke/deploy.

## Verificação

- `prisma validate` → OK
- `tsc --noEmit` → OK (exit 0)
- `eslint` (ficheiros tocados) → OK (0 erros)
- `vitest run` — novo `src/lib/validations/inventario-ativos.test.ts` (7 testes) passa;
  suite global verde (ver relatório de entrega)
- `pnpm gates` → OK (dialog / use-client / data-imports)
- **Smoke autenticado**: não corrido no worktree (colisão de porta :3000 + contenção com worktrees
  irmãos). Fica para a integração. `STORAGE_DRIVER` não definido em `.env` → default `local`
  (upload/download funcionam sem AWS).

## Segurança — isolamento multi-tenant (B1, corrigido)

**Vetor** (mesmo do B1 do doc-core, aqui em documentos de activo): a `meta.key`/`urlRef`
é derivada server-side no presign mas **volta ao cliente** e é reenviada por
`adicionarDocumentoAtivoAction` (`storageKey`/`url`). Um utilizador do tenant A podia registar
um doc com `storageKey:"tenant/{B}/…"` (ou `url:"gestpro-storage:tenant/{B}/…"`, que passa
`z.string().url()`): a linha ficava scoped a A, mas ao remover, `getObjectStorage().delete(key)`
apagaria o objeto de storage do tenant B (e a mesma key alimentava o `presignGet` no download).

**Correção (fechada na ESCRITA + defesa em profundidade):**
- `adicionarDocumento`: resolve a key candidata (`storageKey ?? urlRefParaKey(url)`) e, se ela
  **não** `startsWith(prefixoTenant(ctx.tenantId))`, lança `BusinessRuleError('KEY_FORA_DO_TENANT')`
  — uma key forjada nunca entra na BD.
- `removerDocumento`: só chama `.delete(key)` se `key.startsWith(prefixoTenant(ctx.tenantId))`;
  falha do delete é logada (`logger.warn`) sem bloquear a remoção do metadado.

**Follow-up (M1, pré-existente — NÃO feito aqui):** `adicionarDocumento` não valida a **posse do
`ativoId`** no tenant antes de anexar (o `ativoId` vem do cliente). A escrita fica scoped a A pela
extensão, mas convém validar explicitamente que o ativo existe no tenant. A registar por quem detém
o contrato de documentos.

## Dívida / gaps

- **Validade opcional do documento (RF2)**: não implementada — não há campo `validade`/`dataValidade`
  em `DocumentoAtivo` nem no schema, e criar um exigiria migração (fora do meu âmbito). O tipo é
  capturado; a validade fica como melhoria (precisa de delta de schema + migração).
- **Limite de 10 MB no PUT** herda a dívida do doc-core (não hard-enforced na presigned PUT S3).
- **Mapper de leitura** (`ATIVO_SEL.documentos`) continua a expor só `{id,ativoId,nome,tipo,url,dataUpload}`
  — suficiente para lista/download/remoção (a key é resolvida server-side). Não expus
  `contentType/tamanhoBytes` na UI; estender o `select` se for preciso mostrá-los.
