# Handoff — WS-DOC-CORE (spec 01): Armazenamento de documentos (S3 + presigned URLs)

**Wave 7.0 · fundação BLOQUEANTE para uploads de Fornecedores, Activos, Transporte e RH.**
Estado: **entregue**. Todos os caminhos relativos a `apps/erp/` salvo indicação.

## O que ficou feito

| Tarefa | Ficheiros | Estado |
|---|---|---|
| T1 deps | `package.json` (+`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) | OK |
| T2 storage | `src/lib/storage/objeto/{porta,s3,local,key,index}.ts` + `src/lib/storage/documento-config.ts` | OK |
| T3 presign | `src/app/api/documentos/presign/route.ts` | OK |
| T4 download | `src/app/api/documentos/[id]/download/route.ts` | OK |
| — driver local | `src/app/api/documentos/local/[...key]/route.ts` (stand-in do S3 em dev/CI) | OK |
| T5 componente | `src/components/patterns/upload-documento.tsx` + export em `patterns/index.ts` | OK |
| T6 delta schema | `prisma/schema/{compras,inventario,operacoes}.prisma` (4 modelos) | OK (migração é do orquestrador) |
| T7 infra/env | `infra/modules/storage/*`, `infra/modules/app/main.tf`, `infra/live/{prod,dev}/main.tf`, `apps/erp/.env.example` | OK (endurecido; `apply` real não corrido — sem AWS) |
| T8 testes | `src/lib/storage/objeto/__tests__/{key,local}.test.ts`, `src/app/api/documentos/__tests__/{presign,download}-handler.test.ts` | OK (22 testes) |

## Contrato do `<UploadDocumento>` (para os consumidores)

Componente `'use client'`, **sem modais** — usar inline numa aba/secção de detalhe
ou numa sub-rota `.../documentos/novo`. Importar de `@/components/patterns`.

```tsx
import { UploadDocumento } from '@/components/patterns';

<UploadDocumento
  recurso="fornecedor"           // 'fornecedor'|'ativo'|'viatura'|'motorista'|'colaborador'
  recursoId={fornecedor.id}      // cuid do recurso
  label="Carregar documento"
  onSuccess={() => { /* opcional: navegar de volta */ }}
  onRegistado={async (meta) => {
    // meta: { key, urlRef, nome, contentType, tamanho }
    // Mapeia para o input da TUA action de registo já existente.
    // `urlRef` (gestpro-storage:{key}) passa a validação z.string().url()
    // dos schemas atuais; guarda-o em `url`. (E, se estenderes o teu schema,
    // guarda também `storageKey: meta.key` / `contentType` / `tamanhoBytes`.)
    return adicionarDocumentoFornecedorAction({
      fornecedorId: recursoId,
      tipo: 'CONTRATO',
      nome: meta.nome,
      url: meta.urlRef,
    });
  }}
/>
```

- `onRegistado` recebe `UploadDocumentoMeta` e devolve algo compatível com
  `ActionResult` (`{ ok: boolean; error?: { message } }`). O componente trata
  toast + `router.refresh()`.
- Fluxo interno: valida tipo/tamanho no cliente → `POST /api/documentos/presign`
  → `PUT` direto para o storage (XHR com progresso) → `onRegistado`.
- Estados: idle / uploading (com %) / registing / success / error. WCAG AA,
  dark-mode, tokens `@theme`, zero cores hardcoded.

### Download nas listas
Construir o link como `GET /api/documentos/{documentoId}/download?recurso={recurso}`.
O `recurso` é opcional (sem ele o handler procura nas tabelas conhecidas), mas
**passá-lo é mais eficiente**. O endpoint verifica posse no tenant (cross-tenant
→ 404) e faz 302 para um presigned GET de 300s.

## Rotas (API)

- `POST /api/documentos/presign` — `withApi` (sessão + permissão dinâmica por
  recurso). Zod: `{ recurso, recursoId(cuid), nome(1..200), contentType(allowlist), tamanho(1..10MB) }`.
  Deriva a **key server-side** (nunca aceita key do cliente). Devolve
  `{ uploadUrl, key, requiredHeaders, urlRef }`. Não está em `PUBLIC_PATHS`.
- `GET /api/documentos/[id]/download[?recurso=]` — `withApi`; posse no tenant → 302 presigned GET (300s); cross-tenant → 404.
- `PUT|GET /api/documentos/local/[...key]` — só ativo com `STORAGE_DRIVER=local`;
  faz o papel do S3 em dev/CI. Em `s3` responde 404.

### Mapa recurso → permissão (presign)
| recurso | permissão |
|---|---|
| fornecedor | `fornecedores:editar` |
| ativo | `ativos:write` |
| viatura | `transporte:viatura:documentos` |
| motorista | `transporte:motorista:documentos` |
| colaborador | `rh:colaboradores:update` |

### Allowlist / limite
`application/pdf`, `image/png`, `image/jpeg`, `image/webp`, OpenXML
(docx/xlsx/pptx), `text/plain`. Máx. **10 MB**. Fonte única:
`src/lib/storage/documento-config.ts` (client-safe).

## Módulo de storage (porta + adaptadores)

- `porta.ts` — `ObjectStorage { presignPut, presignGet, delete }` (`server-only`).
- `s3.ts` — `@aws-sdk/*`; env `S3_BUCKET`/`S3_REGION`; credenciais via cadeia
  default/IAM role (**zero segredos no repo**). PUT expira 60s e liga o
  `Content-Type` (o cliente reenvia-o em `requiredHeaders`).
- `local.ts` — filesystem (`STORAGE_LOCAL_DIR` ou `.next/cache/uploads`), sem
  rede; `caminhoSeguro()` bloqueia traversal. Helpers `guardarObjetoLocal` /
  `lerObjetoLocal` usados pela rota interna.
- `index.ts` — factory por `STORAGE_DRIVER` (`s3`|`local`; default `local`),
  memoizada. Reexporta `derivarKey`, `keyParaUrlRef`, `urlRefParaKey`.
- `key.ts` — `derivarKey({tenantId,recurso,recursoId,nome})` **pura**:
  `tenant/{tenantId}/{recurso}/{recursoId}/{uuid}-{slugNome}`. Sanitização
  idempotente; **property-tested** (nunca escapa do prefixo do tenant, mesmo
  com `../`/unicode/espaços).

## Delta de schema (para o orquestrador migrar)

Aditivo e **nullable** (compat) em `DocumentoFornecedor`, `DocumentoAtivo`,
`DocumentoViatura`, `DocumentoMotorista`:

```prisma
storageKey   String?
contentType  String?
tamanhoBytes Int?
```

Índices `@@index([tenantId, <recursoId>])` **já existiam** nos 4 modelos — não
foi preciso adicionar. **Não gerei migração** (regra do CLAUDE.md); gerar com
`migrate diff` + `migrate deploy`.

## Decisões

1. **`url` guarda a key, via ref opaca** `gestpro-storage:{key}`. Motivo: as
   actions de registo existentes validam `url` com `z.string().url()` e são
   propriedade de outros workstreams (não as toquei). A ref passa a validação e
   o download recupera a key (`new URL(ref).pathname`). O download prefere
   `storageKey` quando presente; cai para o parse de `url`; URL http legada →
   302 direto.
2. **Permissão dinâmica no handler** (não `withApi({permission})`) porque
   depende do `recurso` do corpo — mesmo padrão de `/api/export/[modulo]`.
3. **Driver local com rota interna** em vez de S3 real em dev/CI → sem rede,
   testável, smoke autenticado funciona. `STORAGE_DRIVER` decide.
4. **Download resolve URL relativa** do driver local contra `req.nextUrl.origin`
   (`NextResponse.redirect` exige URL absoluta).
5. **Infra reaproveitou** `infra/modules/storage` (já criado na spec 16):
   endureci CORS (PUT/GET só, origens = `ALLOWED_ORIGINS`, sem wildcard),
   adicionei lifecycle *abort-incomplete-multipart* (órfãos), reduzi a IAM a
   `Get/Put/DeleteObject` no `arn/*`, e injectei `STORAGE_DRIVER=s3`,
   `S3_BUCKET`, `S3_REGION` no App Runner.

## Dívida / gaps

- **Limite de tamanho no PUT S3 não é hard-enforced** na presigned PUT URL
  (SigV4 query não suporta condição de content-length como uma POST policy). É
  aplicado: (a) no presign (Zod `tamanho<=10MB`), (b) no cliente, (c) lifecycle.
  Se for preciso enforcement duro, migrar para **POST policy** (`createPresignedPost`)
  com `content-length-range`. Registado como melhoria.
- **`colaborador`**: o presign aceita-o e a permissão existe, mas **não há
  modelo de documento de colaborador** nem action de registo. O upload assina e
  o PUT funciona; o registo fica à responsabilidade do WS de RH quando criar o
  modelo. O download não cobre `colaborador` (sem tabela).
- **Remoção (RF5) do objeto no S3**: a porta expõe `delete(key)`, mas as actions
  `removerDocumento*` existentes só apagam o metadado. Ligar `storage.delete()`
  a essas actions é trabalho dos WS consumidores (precisam da `storageKey`).
- **`terraform apply` real não corrido** (sem credenciais AWS no ambiente).
  Alterações validadas por leitura; correr `terraform plan/apply` no deploy.
- **Mappers de serviço** continuam a devolver `url` (não expus `storageKey` nos
  mappers de leitura) — o download resolve pela `storageKey`/`url` diretamente na
  BD, por isso as listas só precisam do `id`+`recurso`. Se um consumidor quiser
  mostrar content-type/tamanho, estende o `select` do seu mapper.

## Verificação (comandos e resultado)

- `prisma validate` → **OK** (schemas válidos).
- `tsc --noEmit` → **OK** (exit 0).
- `eslint` (ficheiros novos) → **OK** (0 erros).
- `node scripts/gates.mjs` → **OK** (dialog / use-client / data-imports).
- `vitest run` (doc-core) → **22/22 passam** (key property, local round-trip,
  presign 401/403/422/200, download 401/404/302).
