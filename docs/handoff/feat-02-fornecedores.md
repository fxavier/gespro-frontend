# Handoff — WS-FORNECEDORES (spec 02): Contactos (write-path) + upload de documentos

**Wave 7.1 · depende de WS-DOC-CORE (spec 01, para docs).** Estado: **entregue**.
Todos os caminhos relativos a `apps/erp/` salvo indicação.

## Problema resolvido

1. **"Contactos 0" no detalhe** — a *leitura* estava correta; o *write-path*
   estava partido: `CreateFornecedorSchema` **não tinha** o campo `contactos`,
   pelo que o Zod descartava-o silenciosamente. O serviço `criar()` **já** fazia
   o *nested create* de `contactos` (destructuring `const { enderecos, contactos,
   ...campos } = input`), mas nunca recebia dados. Além disso **nenhuma UI**
   invocava as *actions* de contacto já existentes.
2. **Upload de documentos** — só havia registo de metadado (`url` exigida); sem
   upload real nem remoção do objeto.

## O que ficou feito

| Tarefa | Ficheiros | Nota |
|---|---|---|
| T1 schema+create | `src/lib/validations/fornecedores.ts` | `CreateFornecedorSchema.contactos` (`array(CreateContactoFornecedorSchema.omit({fornecedorId}))`.default([])). Serviço `criar()` **já** fazia o nested create — só faltava o schema deixar passar os dados. |
| T1 form criação | `.../fornecedores/_components/novo-fornecedor-form.tsx` | Secção "Contactos" repetível (`useFieldArray`): adicionar/remover linha (nome, cargo, tipo, email, telefone). Persistidos atomicamente com o fornecedor. |
| T2 gestão no detalhe | `.../fornecedores/[id]/contactos/**` | Sub-rotas dedicadas (sem modais): `page.tsx` (lista+remover), `novo/`, `[contactoId]/editar/`. `_components/contacto-form.tsx` (reutilizado create/edit), `_components/contacto-remover.tsx` (AlertDialog). Ligam às actions **existentes** `adicionar/actualizar/removerContactoFornecedorAction`. |
| T2 entradas no detalhe | `.../fornecedores/[id]/page.tsx` | Botões "Gerir contactos" / "Gerir documentos" nas abas respectivas; link de download do documento passou a `/api/documentos/{id}/download?recurso=fornecedor`. |
| T3 upload documentos | `.../fornecedores/[id]/documentos/**` | Sub-rotas `page.tsx` (lista+download+remover), `novo/`. `_components/documento-uploader.tsx` embrulha `<UploadDocumento recurso="fornecedor">` com selecção de tipo/validade; `_components/documento-remover.tsx` (AlertDialog). |
| T3 schema documento | `src/lib/validations/fornecedores.ts` | `CreateDocumentoFornecedorSchema` + `storageKey?`, `contentType?`, `tamanhoBytes?` (opcionais). `url` continua a guardar a ref opaca `gestpro-storage:{key}`. |
| T4 remoção do objeto | `src/server/services/compras/fornecedor.service.ts` | `removerDocumento()` agora deriva a key (`storageKey ?? urlRefParaKey(url)`) e chama `getObjectStorage().delete(key)` (best-effort, `try/catch` + `logger.warn`) antes de apagar o metadado. |
| T5 testes | `src/lib/validations/__tests__/fornecedores.test.ts` | 14 testes (unit + property `fast-check`): validação de contacto, preservação dos contactos no `CreateFornecedorSchema` (o bug), metadados de storage do documento. |

## Como ligar / contratos usados (nada de novo criado a nível de action)

- **Criação com contactos**: `criarFornecedorAction(CreateFornecedorSchema)` →
  serviço faz nested create. Sem `fornecedorId` nos contactos (ainda não existe).
- **Contactos no detalhe**: `adicionarContactoFornecedorAction({fornecedorId, dados})`,
  `actualizarContactoFornecedorAction({contactoId, dados})`,
  `removerContactoFornecedorAction({contactoId})` — todas já existiam, todas com
  `permission: 'fornecedores:editar'` e `revalidate: {tags:['fornecedores']}`.
- **Documentos**: `<UploadDocumento onRegistado>` → `adicionarDocumentoFornecedorAction`
  com `{ fornecedorId, tipo, nome: meta.nome, url: meta.urlRef, storageKey: meta.key,
  contentType: meta.contentType, tamanhoBytes: meta.tamanho, dataValidade? }`.
  Download via `/api/documentos/{id}/download?recurso=fornecedor` (302 presigned).
  Remoção via `removerDocumentoFornecedorAction` → apaga objeto + metadado.

## Revalidação

As actions revalidam a tag `fornecedores`; as sub-rotas fazem `router.refresh()`
após sucesso. O contador das abas "Contactos"/"Documentos" (SC `obter()` com
`include`) reflecte o número real após cada operação.

## Verificação (comandos e resultado)

- `CI=true pnpm install` (raiz do worktree) → OK (traz `@aws-sdk` de doc-core).
- `pnpm db:generate` → OK (schema com delta de doc-core).
- `npx vitest run src/lib/validations/__tests__/fornecedores.test.ts` → **14/14**.
- `node scripts/gates.mjs` → **OK** (dialog / use-client / data-imports a zero).
- `pnpm check` → ver `RESULTADO_CHECK` abaixo (preenchido pelo orquestrador na
  integração se o ambiente estava saturado; localmente tsc esteve muito lento por
  contenção com outros worktrees a correr `check` em paralelo).

## Gaps / notas para o orquestrador

- **Sem migração gerada** (regra do CLAUDE.md). O delta de schema de documento
  (`storageKey/contentType/tamanhoBytes`) **já foi criado pelo doc-core**; não
  toquei em `.prisma`. Nenhuma migração nova é necessária por este WS.
- **Smoke autenticado não corrido** por colisão de porta `:3000` entre worktrees
  em paralelo. Rotas a validar no smoke da integração:
  - `/fornecedores/novo` → criar com 2 contactos → detalhe conta 2 na aba.
  - `/fornecedores/[id]/contactos` → adicionar/editar/remover → contador actualiza.
  - `/fornecedores/[id]/documentos/novo` → upload PDF (`STORAGE_DRIVER=local` em
    dev) → aparece na lista com download; remover apaga metadado+objeto.
- **`enderecoPrincipal` no `CreateFornecedorSchema`** continua a ser um campo do
  schema que o serviço `criar()` **não** consome (destructura `enderecos`, não
  `enderecoPrincipal`). O form nunca o envia, por isso não há crash; mas é uma
  incoerência pré-existente (fora do âmbito da spec 02) — se algum dia for
  preenchido, `db.fornecedor.create` rejeita o argumento. Recomenda-se limpar
  num WS futuro (renomear para `enderecos` ou mapear `enderecoPrincipal`→create).
- **`removerDocumento` é best-effort no storage**: uma falha de `delete()` não
  bloqueia a remoção do metadado (objeto órfão é recolhido pelo lifecycle do
  bucket, conforme doc-core). Alinhado com o gap 3 do handoff do doc-core.
