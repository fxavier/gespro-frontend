# Programa "Funcionalidades em Falta — Wave 7" · Visão geral e orquestração

> Fonte: pedido do owner (2026-07-24). Alvo: `apps/erp` (Next.js 16 + Prisma 7, monólito modular multi-tenant, PT-PT).
> Convenções de referência obrigatórias: `CLAUDE.md`, `.claude/skills/{prisma,api,ui}-conventions`, `docs/status.md`.

## 1. Resumo executivo (o que a auditoria ao código revelou)

Antes de planear, foi feita uma auditoria ao código real. **Conclusão central: quase todo o *backend* pedido já existe.** O trabalho é sobretudo *last-mile* — rotas em falta, ligação de UI a *actions* já implementadas, e **uma única peça de infraestrutura nova (armazenamento de objetos S3)**. Isto reduz risco e custo face a uma leitura literal do pedido ("implementar tudo").

| Pedido do owner | Estado real no código | Natureza do trabalho |
|---|---|---|
| `docs/transporte.md` — "implementar tudo" | Serviços `operacoes/*` (viatura, motorista, rota, entrega, abastecimento, atividade, alocação, alertas) + `transporte.actions.ts` (28 actions, incl. prova de entrega, manutenção de viatura, checklist) + `validations/transporte.ts` + cron de alertas **já existem**. Página `veiculos` já consome `viaturaService` real. | **Auditoria página-a-página + de-mock + rotas `nova`/`[id]` em falta + KPIs de dashboard reais.** Não é greenfield. |
| Fornecedores: "contactos 0" apesar de haver contactos | Caminho de **leitura correto** (`obter()` inclui e conta `contactos`). Seed cria contactos. Mas `CreateFornecedorSchema`/`UpdateFornecedorSchema` **não têm campo `contactos`** → o Zod remove-os no *create/update*; e **não há UI** que chame `adicionarContactoFornecedorAction` (que já existe). | **Corrigir o caminho de escrita** + expor UI de gestão de contactos. |
| Fornecedores: upload de documentos | `DocumentoFornecedor` (campo `url`) + `adicionarDocumentoFornecedorAction` existem, mas exigem uma `url` já pronta. **Não há upload de ficheiros nem S3** (`@aws-sdk` ausente do `package.json`). | **Infra nova de storage (S3)** + UI de upload. |
| Editar categorias → 404 | `actualizarCategoriaAtivoAction` + `ativosService.actualizarCategoria` + `CategoriaAtivoUpdateSchema` existem. A tabela liga a `/inventario/categorias/{id}/editar`, mas **essa rota não existe** (só `page.tsx` e `novo/`). | **Criar rota `[id]/editar` + formulário.** Puro UI. |
| Activos: upload de documentos | `DocumentoAtivo` (campo `url`) + `adicionarDocumentoAtivoAction` existem; sem upload real. | **Reutilizar infra S3** + UI de upload. |
| Stock: entrada / transferência / saída | `registarEntradaStockAction`, `registarBaixaStockAction` (saída), `registarTransferenciaStockAction` **já existem** e envolvem `$transaction`. `movimentacoes/nova` é `'use client'`. `transferencias/page.tsx` só mostra tabela. | **Garantir/ligar os fluxos de UI às actions existentes; fluxos dedicados de entrada/saída/transferência.** |
| `/rh/formacoes/nova` | `FormacaoService.criar`, `CreateFormacaoSchema`, `criarFormacaoAction` **já existem**. A lista liga a `/rh/formacoes/nova` e a `/rh/formacoes/{id}`, mas **nenhuma dessas rotas existe**. | **Criar rota `nova` (+ `[id]` detalhe) + formulário.** Puro UI. |

Implicação de processo: os agentes **têm de auditar antes de escrever**. O maior risco é reimplementar contratos que já existem (violaria ADR-0003 — fonte única de contratos) e criar espelhos divergentes.

## 2. Âmbito e decisões de alinhamento (confirmadas com o owner)

- **Entrega desta sessão:** documentos de requisitos + design (este pacote). Não se escreve código de app nesta sessão.
- **Transporte:** completar o módulo (backend real; sem mocks).
- **Storage de documentos:** **S3 com presigned URLs** (upload direto cliente→S3), metadados na BD. Alinha com a infra existente (App Runner + RDS + Secrets Manager, spec 16).
- **Orquestração:** orquestrador em modelo **`fable`**; **todos os agentes e o orquestrador carregam o plugin `rtk`** (plugin Claude Code do ambiente do owner).

## 3. Workstreams e grafo de dependências

```
Wave 7.0 (fundação, BLOQUEANTE p/ uploads)
  └─ WS-DOC-CORE  Módulo de storage S3 + rota presign + <UploadDocumento> (pattern) + migração de metadados
        │
Wave 7.1 (paralelo, 1 worktree por agente)
  ├─ WS-TRANSPORTE   Auditoria + de-mock + rotas/KPIs do módulo de transporte      (independente*)
  ├─ WS-FORNECEDORES Correção de contactos + upload de documentos                   (depende de WS-DOC-CORE p/ docs)
  ├─ WS-ATIVOS       Upload de documentos + rota "editar categorias"                (depende de WS-DOC-CORE p/ docs)
  ├─ WS-STOCK        Entrada / saída / transferência (UI → actions existentes)      (independente)
  └─ WS-RH-FORMACOES Rota /rh/formacoes/nova (+ [id]) + formulário                   (independente)

Wave 7.2 (só orquestrador)
  └─ Merge determinístico → migrations → pnpm check → pnpm gates → build → smoke autenticado → pnpm e2e
```

\* WS-TRANSPORTE pode, no fim, reutilizar `<UploadDocumento>` para documentos de viatura/motorista; por isso agenda-se **depois** do arranque de WS-DOC-CORE, mas o grosso do trabalho é independente.

### Porquê esta partição
- **WS-DOC-CORE isolado e primeiro:** o storage é transversal (fornecedores, activos, transporte, RH). Implementá-lo uma vez evita 3–4 implementações divergentes e um conflito garantido em `lib/`. É o único item verdadeiramente *blocking*.
- **Fronteiras de conflito mínimas:** cada agente de Wave 7.1 toca ficheiros disjuntos (ver matriz §5). Conflitos previstos apenas em ficheiros aditivos partilhados (`rbac.ts`, `state-machines.ts`, `status-badge.tsx`), resolvidos pelo orquestrador como nas waves anteriores.
- **Migrations só pelo orquestrador** (regra do `CLAUDE.md`): WS-DOC-CORE e WS-FORNECEDORES podem exigir *delta* de schema (metadados de documento); os agentes entregam o `.prisma` alterado, o orquestrador gera e aplica a migração não-interativa (`migrate diff` + `migrate deploy`).

## 4. Modelo de orquestração (fable + plugin rtk)

- **Orquestrador (`fable`):** detém a ordem de merge, as migrations, a resolução de conflitos aditivos e os *gates*. Não implementa features. Carrega o plugin **`rtk`**.
- **Agentes (Wave 7.1):** 1 *git worktree* cada (isolamento de escrita paralela), contexto da spec respetiva, carregam o plugin **`rtk`**. Cada agente corre `pnpm check` no seu worktree antes de entregar.
- **Gate de revisão:** `code-reviewer` (agente já existente em `.claude/agents/`) revê cada workstream antes do merge; BLOCKERs voltam ao agente via continuação de contexto.
- **Ordem de merge determinística:** `WS-DOC-CORE → WS-STOCK → WS-RH-FORMACOES → WS-ATIVOS → WS-FORNECEDORES → WS-TRANSPORTE`. (Storage primeiro; consumidores de storage por último; transporte no fim por ser o maior e poder consumir o storage.)

> Nota sobre execução: nesta sessão (cloud) os subagentes não editam o repositório local diretamente. A execução real deve correr no Claude Code local do owner, usando estas specs como *input* dos agentes `feat-*`. As definições de agentes `.claude/agents/*` não foram geradas por opção do owner ("só documentos").

## 5. Matriz de propriedade de ficheiros (evitar colisões)

| Workstream | Escreve (novo/alterado) | Partilhado (merge aditivo pelo orquestrador) |
|---|---|---|
| WS-DOC-CORE | `src/lib/storage/objeto/*` (novo), `src/app/api/documentos/presign/route.ts` (novo), `src/components/patterns/upload-documento.tsx` (novo), `prisma/schema/*` (delta metadados), `.env.example`, `infra/*` (bucket + IAM) | `patterns/index.ts` (export), `package.json` (`@aws-sdk/*`) |
| WS-TRANSPORTE | `src/app/(dashboard)/transporte/**`, componentes `_components` desses ecrãs; ligações a `operacoes/*` (sem alterar contratos) | `rbac.ts` (se faltarem permissões de UI), `state-machines.ts` |
| WS-FORNECEDORES | `src/app/(dashboard)/fornecedores/**`, `validations/fornecedores.ts`, `services/compras/fornecedor.service.ts`, `actions/fornecedores.actions.ts` | `rbac.ts` |
| WS-ATIVOS | `src/app/(dashboard)/inventario/{ativos,categorias}/**` | — |
| WS-STOCK | `src/app/(dashboard)/inventario/{movimentacoes,transferencias}/**`, `src/app/(dashboard)/stock/**` | — |
| WS-RH-FORMACOES | `src/app/(dashboard)/rh/formacoes/**` | — |

## 6. Gates de qualidade (Wave 7.2, invioláveis)

1. `pnpm check` (prisma validate + tsc + eslint + vitest) verde.
2. `pnpm gates` verde (sem `Dialog` fora de `AlertDialog`; sem `'use client'` em `page.tsx` de listagem/detalhe; sem imports de `@/data/`).
3. `pnpm build` verde (`output: standalone`) — apanha `useSearchParams`/RSC que o `check` não apanha.
4. **Smoke autenticado** das rotas novas (login `admin@demo.mz`/`demo1234`) — obrigatório para UI (o `check` não apanha crashes RSC/runtime).
5. `pnpm e2e` (Playwright) dos fluxos críticos + 1 novo fluxo por workstream com mutação (ex.: criar formação, registar entrada de stock, upload de documento).
6. Testes: property/unit para qualquer regra de negócio nova (S3 key derivation, validação de contacto); ≥80% no código novo de serviço.

## 7. Riscos e mitigação

1. **Reimplementar contratos existentes (ADR-0003).** → Cada spec começa com "o que já existe"; agentes importam contratos, nunca criam espelhos.
2. **Presigned URL como vetor de abuso** (upload não autenticado, *content-type*/tamanho, *path traversal* na key, objetos órfãos). → Presign server-side com `withApi` (sessão+permissão), key derivada de `tenantId` (nunca do cliente), *allowlist* de content-type, limite de tamanho, `Content-Length` obrigatório, política de limpeza de órfãos (ver WS-DOC-CORE §Segurança).
3. **Multi-tenancy no storage.** → Prefixo de key `tenant/{tenantId}/...`; download sempre via presigned GET emitido após verificação de posse do metadado na BD (nunca URL pública direta).
4. **Interceptor de *parallel route* `@panel/(.)[id]` captura `nova`/`novo`** (bug conhecido do golden standard, `docs/status.md`). → Ao criar rotas `nova`, garantir que o painel devolve `null` (não `notFound()`), ou não usar interceptor nessas listagens.
5. **`prisma migrate dev` rebenta sem TTY.** → Só o orquestrador gera migrações via `migrate diff` + `migrate deploy` (não-interativo).
6. **Custo/latência de S3 em dev/CI.** → Adapter de storage com *driver* `local`/`memory` para testes; S3 real só em produção via env.

## 8. Ordem de leitura das specs

`01-doc-core-storage-s3.md` (fundação) → `02-fornecedores.md` → `03-ativos-e-categorias.md` → `04-operacoes-stock.md` → `05-rh-formacoes.md` → `06-transporte.md`.
