# WS-DOC-CORE — Armazenamento de documentos (S3 + presigned URLs)

**Wave 7.0 · BLOQUEANTE para os uploads de Fornecedores, Activos (e opcionalmente Transporte/RH).**
Agente único. Sem dependências a montante. 1 worktree.

## O que já existe (não reimplementar)
- Modelos com metadados de documento e campo `url String`: `DocumentoFornecedor` (`compras.prisma`), `DocumentoAtivo` (`inventario.prisma`), documentos de viatura/motorista (`operacoes.prisma`).
- Actions de metadados: `adicionarDocumentoFornecedorAction`, `adicionarDocumentoAtivoAction`, `adicionarDocumentoViaturaAction`, `adicionarDocumentoMotoristaAction` — **todas recebem uma `url` já pronta**.
- **Não existe** `@aws-sdk/*` no `package.json`, nem rota de upload, nem componente de upload. `lib/storage/*` são *stores* de dados mock (não é object storage) — **não confundir**.

## Requisitos

### Funcionais
- **RF1** Um utilizador autenticado com permissão de escrita do recurso pode carregar um ficheiro (PDF, imagem, Office) e associá-lo a um recurso (fornecedor, activo, viatura, motorista, colaborador).
- **RF2** O upload é **direto do browser para o S3** via *presigned PUT URL* emitido pelo servidor; o ficheiro **não** transita pelo servidor de aplicação.
- **RF3** Após o upload, persiste-se um registo de metadados (nome, tipo, content-type, tamanho, key, validade opcional) através das *actions* já existentes.
- **RF4** O download faz-se por *presigned GET URL* de curta duração, emitido só depois de verificar a posse do metadado no *tenant*.
- **RF5** Remover um documento apaga o metadado **e** o objeto no S3.
- **RF6** Lista de documentos por recurso mostra nome, tipo, data de upload, validade e ação de download/remover.

### Não-funcionais
- **RNF1 Segurança:** presign só via `withApi` (sessão + permissão). Key derivada **server-side** de `tenantId` (nunca do cliente). *Allowlist* de content-type e limite de tamanho aplicados **na assinatura** (condições da política) e revalidados no registo de metadados.
- **RNF2 Multi-tenant:** prefixo `tenant/{tenantId}/{recurso}/{recursoId}/{uuid}-{slugNome}`. Cross-tenant no download → `NotFoundError` (404), nunca 403.
- **RNF3 Testabilidade:** abstração de *porta* de storage com adaptadores `s3` (prod) e `local`/`memory` (dev/CI, sem rede).
- **RNF4 Observabilidade:** logs estruturados de presign/registo/remoção com `traceId`, sem PII no nome do objeto.
- **RNF5 Resiliência:** objetos órfãos (presign sem registo subsequente) limpáveis por *lifecycle rule* + cron opcional.

## Design

### Arquitetura (fluxo)
```
Cliente (<UploadDocumento>)                Servidor                         S3
  │  1. POST /api/documentos/presign  ──▶  withApi: sessão+permissão
  │        {recurso, recursoId,             valida content-type/size,
  │         nome, contentType, size}        deriva key = tenant/{tid}/...
  │  ◀── 2. {uploadUrl, key, headers}       assina PUT (expira 60s)
  │  3. PUT uploadUrl (ficheiro)  ─────────────────────────────────────▶ objeto
  │  4. Server Action adicionarDocumento*({recursoId, nome, key/url, ...})
  │        └─ persiste metadado (tenantId do ctx)
  │  5. revalidateTag → lista atualizada
```
Download: `GET /api/documentos/{documentoId}/download` → `withApi` verifica metadado∈tenant → 302 para *presigned GET* (expira 300s).

### Módulo de storage (novo) — `src/lib/storage/objeto/`
- `porta.ts` — interface `ObjectStorage { presignPut(key, {contentType, maxBytes}): Promise<{url, headers}>; presignGet(key, ttl): Promise<string>; delete(key): Promise<void> }`. `import 'server-only'`.
- `s3.ts` — adaptador com `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Config via env (`S3_BUCKET`, `S3_REGION`, credenciais via cadeia default/IAM role — **sem segredos no repo**).
- `local.ts` — adaptador filesystem/memória para dev/CI (grava em `.next/cache/uploads` ou memória; presign devolve URL de rota interna).
- `index.ts` — *factory* que escolhe adaptador por `STORAGE_DRIVER` (`s3`|`local`).
- `key.ts` — **função pura** `derivarKey({tenantId, recurso, recursoId, nome})` → sanitiza nome (slug, sem `../`, sem separadores), prefixa tenant, sufixa `uuid`. **Property-tested** (nunca escapa do prefixo do tenant; idempotência de sanitização).

### Rota de presign (nova) — `src/app/api/documentos/presign/route.ts` (`withApi`)
- Schema Zod: `{ recurso: enum(['fornecedor','ativo','viatura','motorista','colaborador']), recursoId: cuid, nome: string(1..200), contentType: enum(ALLOWLIST), tamanho: int(1..MAX_BYTES) }`.
- ALLOWLIST: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `application/vnd.openxmlformats-officedocument.*`, `text/plain`. MAX_BYTES: **10 MB** (config).
- Permissão por recurso (mapa `recurso → permission`, ex.: `fornecedor → fornecedores:editar`, `ativo → ativos:write`).
- Deriva key server-side; devolve `{ uploadUrl, key, requiredHeaders }`. **Nunca** aceita key do cliente.
- Faz parte de `PUBLIC_PATHS`? **Não** — exige sessão.

### Componente de UI (novo) — `src/components/patterns/upload-documento.tsx` (`'use client'`)
- Props: `recurso`, `recursoId`, `onRegistado(action)` (recebe a *server action* de registo de metadados a chamar após o PUT).
- Fluxo: seleciona ficheiro → valida tipo/tamanho no cliente (UX) → `fetch('/api/documentos/presign')` → `PUT` para S3 com `requiredHeaders` → chama a *action* de registo via `useActionState` → `toast` + refresh.
- Estados: idle/validating/uploading (progresso)/registing/success/error. Acessível (WCAG AA), dark-mode, tokens `@theme`.
- **Sem modais** (regra UI): componente inline numa secção/aba de detalhe, ou sub-rota dedicada `.../documentos/novo`.

### Delta de schema (entregue ao orquestrador; migração por ele)
Adicionar aos modelos de documento (aditivo, nullable p/ compat): `storageKey String?`, `contentType String?`, `tamanhoBytes Int?`. Manter `url` (compat) mas passar a preencher com a `key` (o download resolve via presign a partir da `storageKey`/`url`). Índice `@@index([tenantId, recursoId])` se ainda não existir.

### Envelope de download (nova) — `src/app/api/documentos/[id]/download/route.ts` (`withApi`)
- Verifica metadado (por `id`) pertence ao `tenantId` do ctx (senão 404). Emite `presignGet(storageKey, 300)` → `302`. Log de acesso (auditoria).

### Infra (entregue como diff Terraform em `infra/`)
- Bucket S3 privado (Block Public Access ON), SSE (SSE-S3/KMS), *lifecycle rule* p/ abortar multipart incompletos e expirar prefixo `tmp/`. CORS do bucket a permitir `PUT`/`GET` só das origens da app (`ALLOWED_ORIGINS`). IAM: política mínima (`s3:PutObject`,`s3:GetObject`,`s3:DeleteObject` no ARN do bucket) atribuída à role do App Runner. Sem credenciais no repo; runtime via role.

## Tarefas (paralelizáveis dentro do worktree)
1. `T1` Adicionar deps `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
2. `T2` `lib/storage/objeto/` (porta + s3 + local + key + index) com testes da função `derivarKey` (property).
3. `T3` Rota `POST /api/documentos/presign` (`withApi`, allowlist, mapa de permissões).
4. `T4` Rota `GET /api/documentos/{id}/download` (`withApi`, verificação de posse).
5. `T5` `<UploadDocumento>` + export em `patterns/index.ts`.
6. `T6` Delta de schema dos modelos de documento (para o orquestrador migrar) + ajustar mappers dos serviços que devolvem `url`/`storageKey`.
7. `T7` Terraform (bucket + IAM + CORS + lifecycle) + `.env.example` (`STORAGE_DRIVER`, `S3_BUCKET`, `S3_REGION`).
8. `T8` Testes: presign nega content-type fora da allowlist; nega tamanho > MAX; download nega cross-tenant (404).

## Critérios de aceitação
- Upload real (dev com `STORAGE_DRIVER=local`; prod com `s3`) de um PDF a um fornecedor e a um activo, com metadado persistido e download funcional.
- `derivarKey` nunca produz key fora de `tenant/{tenantId}/`.
- `pnpm check` + smoke: presign 401 sem sessão, 403 sem permissão, 200 com; download cross-tenant → 404.

## Verificação
- Property tests de `derivarKey` (fuzz de nomes com `../`, unicode, espaços).
- Teste de integração: presign→PUT(local)→registo→download.
- Revisão `code-reviewer` focada em segurança (SSRF/traversal/tenant leak) antes do merge.
