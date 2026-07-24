# WS-ATIVOS — Upload de documentos de activos + corrigir "Editar categorias" (404)

**Wave 7.1 · a parte de documentos depende de WS-DOC-CORE.** 1 worktree.

## Problema 1 — "Editar categorias" devolve 404

### Diagnóstico (confirmado)
- `inventario/categorias/_components/categorias-table.tsx` liga a `/inventario/categorias/{id}/editar`.
- A árvore de rotas tem `categorias/page.tsx`, `categorias/novo/`, `categorias/_components/` — **não existe `categorias/[id]/editar/`**. Daí o 404.
- O backend está pronto: `actualizarCategoriaAtivoAction` (`inventario.actions.ts`) → `ativosService.actualizarCategoria` + `CategoriaAtivoUpdateSchema`. **Só falta a rota + o formulário.**

### Requisitos
- **RF1** `/inventario/categorias/{id}/editar` carrega os valores atuais e permite guardar via `actualizarCategoriaAtivoAction`.

### Design
- Criar `categorias/[id]/editar/page.tsx` (Server Component): resolve `params`, `auth()`, carrega a categoria por `id` dentro de `runWithTenantContext`.
  - **Verificar** se `ativosService` expõe um `obterCategoria(id, ctx)`. Se **não** existir, adicionar (leitura simples com filtro por `tenantId`; cross-tenant → `NotFoundError`). Reutilizar o DTO `CategoriaAtivoDto`.
- `editar/_components/editar-categoria-form.tsx` (`'use client'`): espelha `nova-categoria-form.tsx`, `defaultValues` da categoria, submit `useActionState` → `actualizarCategoriaAtivoAction({ id, data })`, `UnsavedChangesGuard`.
- Rota de detalhe `[id]` não é exigida (a tabela só liga a `editar`); não criar salvo se houver link para detalhe.
- Cuidado com o interceptor `@panel/(.)[id]` se existir nesta listagem — garantir `null` em vez de `notFound()`.

## Problema 2 — Upload de documentos de activo

### O que já existe
- `DocumentoAtivo` (campo `url`), `adicionarDocumentoAtivoAction` / `removerDocumentoAtivoAction`, `DocumentoAtivoCreateSchema`. `ativos/[id]/page.tsx` mostra o detalhe do activo.

### Requisitos
- **RF2** Fazer upload real de documentos na página de detalhe do activo (seguro, inspeção, fatura de compra, etc.), com tipo e validade opcional; listar/baixar/remover.

### Design
- Na página `ativos/[id]/` adicionar aba/secção "Documentos" (se ainda não existir) que lista `DocumentoAtivo` e inclui `<UploadDocumento recurso="ativo" recursoId={id}>` (de WS-DOC-CORE). Callback → `adicionarDocumentoAtivoAction({ ativoId, tipo, nome, url: key, ... })`.
- Ajustar `DocumentoAtivoCreateSchema` para aceitar `storageKey`/`contentType`/`tamanhoBytes` (alinhado com o delta de WS-DOC-CORE). Link de download → `/api/documentos/{documentoId}/download`.
- `ativosService.removerDocumento` passa a apagar o objeto no storage.
- Confirmar em `ativos.interface.ts`/`ativos.service.ts` a assinatura de `adicionarDocumento`/`removerDocumento` (já existem) — só ligar UI + storage.

## Ficheiros afetados
`app/(dashboard)/inventario/categorias/[id]/editar/**` (novo), `app/(dashboard)/inventario/ativos/[id]/**`, `validations/inventario-ativos.ts`, `services/inventario/ativos.service.ts` (obterCategoria + delete de objeto).

## Tarefas
1. `T1` Rota `categorias/[id]/editar` + form (+ `obterCategoria` se faltar).
2. `T2` Aba "Documentos" no detalhe do activo com `<UploadDocumento>`.
3. `T3` Ajuste de `DocumentoAtivoCreateSchema` + link de download + delete de objeto.
4. `T4` Testes: editar categoria persiste; upload+download+remover de documento de activo.

## Critérios de aceitação
- Clicar "Editar" numa categoria abre o formulário (sem 404) e guarda alterações.
- Upload de documento no detalhe do activo funciona ponta-a-ponta.
- `pnpm check` + `pnpm gates` + smoke verdes.
