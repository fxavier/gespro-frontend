# WS-FORNECEDORES — Correção de contactos + upload de documentos

**Wave 7.1 · depende de WS-DOC-CORE (para docs).** 1 worktree.

## Problema 1 — "Contactos 0" no detalhe apesar de haver contactos

### Diagnóstico (confirmado no código)
- **Leitura correta:** `fornecedor.service.ts::obter()` faz `findUnique({ include: { contactos: true } })` e o `page.tsx` do detalhe conta `fornecedor.contactos.length`. O seed (`prisma/seed/compras.ts`) cria `contactoFornecedor`. Logo, para fornecedores do seed, os contactos aparecem.
- **Caminho de escrita partido:** `CreateFornecedorSchema` **não tem** campo `contactos` (só `enderecoPrincipal`). O serviço `criar()` faz `const { enderecos, contactos, ...campos } = input` — mas como o Zod remove chaves desconhecidas, `contactos` é **sempre `undefined`**. `UpdateFornecedorSchema` também não tem `contactos`, e `actualizar()` faz `data: input` (sem *nested write*). Existe API completa de contactos (`adicionarContactoFornecedorAction`, `actualizar...`, `remover...`) mas **nenhuma UI a invoca** — o detalhe diz "adicione através da edição", e a edição não gere contactos.
- **Conclusão:** qualquer fornecedor **criado pela app** fica com 0 contactos, porque o formulário (se recolhe contactos) vê-os descartados e não há forma de os adicionar depois. É um bug de *write-path* + UI em falta, não de leitura.

### Requisitos
- **RF1** Poder adicionar/editar/remover contactos de um fornecedor a partir do **detalhe** (sub-rota dedicada, sem modais), usando as *actions* já existentes.
- **RF2** Poder capturar contactos no **momento da criação** do fornecedor (persistidos atomicamente com o fornecedor).
- **RF3** O contador da aba "Contactos" reflete o número real após qualquer operação (revalidação).

### Design
- **Criação:** estender `CreateFornecedorSchema` com `contactos: z.array(CreateContactoFornecedorSchema.omit({ fornecedorId: true })).default([])`. Em `criar()`, persistir `contactos` via *nested create* (`{ create: contactos.map(c => ({...c, tenantId})) }`) — o padrão já usado para `enderecos`. Atualizar `novo-fornecedor-form.tsx` para submeter o array (repetível, adicionar/remover linha).
- **Gestão no detalhe:** nova sub-rota `fornecedores/[id]/contactos/` (lista + `novo` + `[contactoId]/editar`), Server Component + formulários `react-hook-form` + `useActionState` ligados às *actions* existentes. Aba "Contactos" do detalhe passa a ter ação "Gerir contactos". Garantir que o painel/interceptor devolve `null` (não `notFound()`) para o segmento `novo` (bug conhecido do golden standard).
- **Revalidação:** as *actions* já fazem `revalidate: { tags: ['fornecedores'] }`; confirmar que o detalhe usa esse tag (ou adicionar `revalidatePath('/fornecedores/[id]')`).
- **Verificação do formulário atual:** confirmar se `novo-fornecedor-form.tsx` já tem campos de contacto (então só falta ligar schema+serviço) ou não (então adicionar UI).

### Riscos
- `actualizar()` com `data: input` rebenta se algum dia `contactos` chegar ao *update* — manter contactos **fora** do update do fornecedor; geri-los só pelas *actions* dedicadas.

## Problema 2 — Upload de documentos de fornecedor

### O que já existe
- `DocumentoFornecedor` (campo `url`, `tipo`, `nome`, `dataValidade`), `adicionarDocumentoFornecedorAction` / `removerDocumentoFornecedorAction`, `CreateDocumentoFornecedorSchema` (exige `url`). A aba "Documentos" do detalhe já lista documentos e liga `doc.url`.

### Requisitos
- **RF4** Fazer upload real de um ficheiro na aba/sub-rota de documentos do fornecedor (usar `<UploadDocumento>` de WS-DOC-CORE), com tipo e validade opcional.
- **RF5** Download por presigned GET; remover apaga metadado + objeto.

### Design
- Sub-rota `fornecedores/[id]/documentos/novo` (ou secção inline na aba) com `<UploadDocumento recurso="fornecedor" recursoId={id}>`; no callback, chama `adicionarDocumentoFornecedorAction` com `{ fornecedorId, tipo, nome, dataValidade, url: key }`.
- Ajustar `CreateDocumentoFornecedorSchema`: aceitar `url` **ou** `storageKey` (a partir do presign); alinhar com o delta de schema de WS-DOC-CORE (`storageKey`, `contentType`, `tamanhoBytes`). O link de download passa a `/api/documentos/{documentoId}/download`.
- `removerDocumentoFornecedorAction` passa a chamar `objectStorage.delete(storageKey)` além de apagar o metadado (fazer no serviço `removerDocumento`).

## Ficheiros afetados
`validations/fornecedores.ts`, `services/compras/fornecedor.service.ts`, `actions/fornecedores.actions.ts`, `app/(dashboard)/fornecedores/[id]/**`, `app/(dashboard)/fornecedores/_components/novo-fornecedor-form.tsx`.

## Tarefas
1. `T1` Estender `CreateFornecedorSchema` (contactos) + `criar()` nested create + form de criação.
2. `T2` Sub-rotas de gestão de contactos no detalhe (lista/novo/editar) ligadas às actions existentes.
3. `T3` Upload de documentos (integra `<UploadDocumento>`) + ajuste de `CreateDocumentoFornecedorSchema` e do link de download.
4. `T4` `removerDocumento` apaga objeto no storage.
5. `T5` Testes: criar fornecedor com 2 contactos → detalhe conta 2; adicionar/remover contacto atualiza contador; upload+download+remover de documento.

## Critérios de aceitação
- Criar fornecedor pela app com contactos → aba "Contactos" mostra o nº correto (≠0).
- Upload de PDF no detalhe → aparece na aba "Documentos" com download funcional; remover apaga objeto.
- `pnpm check` + smoke autenticado das rotas novas verdes.
