# Tickets — Ecrã de séries de documento (#149)

Deriva de [`intent.md`](intent.md). Fatias tracer-bullet (skill `tracer-bullet-tickets`): cada ticket
termina num gate executável. Ordem por qualidade do oráculo — contratos → núcleo puro → serviço → UI → E2E.

## Desenho fixado

- **Rotas**: `/faturacao/series` (lista), `/faturacao/series/nova`, `/faturacao/series/[id]/editar`.
- **Tipos no ecrã**: os 6 de `TipoSerieDocumentoEnum`, RECIBO incluído (Q1 decidida).
- **Invariantes do serviço**
  - **S1** — no máximo uma série `ativo = true` por `(tenantId, tipo, ano)`, para escritas da UI.
  - **S2** — `proximoNumero ≥ numeroInicial` sempre; «usada» ⇔ `proximoNumero > numeroInicial`.
  - **S3** — série usada: `prefixo`, `numeroInicial` e `ano` imutáveis; não eliminável.
  - **S4** — `formatoNumero` = `{prefixo}/{ano}/{numero:06}` para toda a série criada pela UI.
  - **S5** — `ano ∈ {anoCorrente, anoCorrente + 1}` (Africa/Maputo) na criação.
- **Códigos de erro** (`BusinessRuleError`): `SERIE_ACTIVA_EXISTENTE`, `SERIE_DUPLICADA`,
  `SERIE_USADA`, `SERIE_ANO_INVALIDO`.
- **Permissões**: leitura `faturacao:leitura` (`permiteEmLeitura: true`); escrita
  `faturacao:series:escrita` (ADMIN, FINANCEIRO). Nenhuma permissão nova.

---

- [x] 0. [HUMANO] [BLOCKING] Responder às Open Questions do `intent.md`
  - [x] 0.1 Q1 — RECIBO no ecrã ou fora até haver emissor? **Decidido: entra no ecrã** (2026-09-26)
  - [x] 0.2 Q3 — anos anteriores: **basta reactivar** (S5 só limita a criação)
  - [x] 0.3 Q4 — «documentos emitidos» = **`proximoNumero − numeroInicial`**
  - [x] 0.4 Q2 e Q5 **fora deste épico**: #93 (a #234 era duplicado) e #235
  ✅ Gate: respostas escritas no `intent.md` (secção Open Questions → «Decididas»). Nenhum gate verde substitui este.

- [ ] 1. [BLOCKING] Migração `numeroInicial` + índice parcial — **só o orquestrador**
  - [ ] 1.1 `prisma/schema/financas.prisma`: `numeroInicial Int @default(1)` em `SerieDocumento` (à mão, sem `prisma format`)
  - [ ] 1.2 Migração via `migrate diff`; acrescentar à mão `CREATE UNIQUE INDEX "SerieDocumento_activa_unica" ON "SerieDocumento"("tenantId", tipo, ano) WHERE ativo;`
  - [ ] 1.3 Backfill: o `DEFAULT 1` cobre as linhas existentes (nenhum `UPDATE` além disso)
  ✅ Gate: `npx prisma validate` · `migrate deploy` verde · `migrate diff --from-config-datasource --to-schema prisma/schema --script` = *empty migration* (o índice parcial é invisível ao Prisma — confirmar que o diff não o tenta apagar)

- [ ] 2. [BLOCKING] Contratos
  - [ ] 2.1 `src/lib/validations/faturacao.ts`: `CriarSerieDocumentoSchema` sem `formatoNumero`, com `numeroInicial: z.number().int().min(1).default(1)`; `EditarSerieDocumentoSchema` (`id: idEntidade()`, `prefixo`, `numeroInicial`); `IdSerieSchema`
  - [ ] 2.2 `faturacao.interface.ts`: `SerieDocumento.numeroInicial`; assinaturas `editarSerie`, `activarSerie`, `desactivarSerie`, `eliminarSerie`
  ✅ Gate: `npx tsc --noEmit` verde

- [ ] 3. Núcleo puro das séries (oráculo escrito por quem **não** implementa)
  - [ ] 3.1 `src/lib/series-documento.ts` (client-safe): `serieUsada(s)`, `anosPermitidos(agora)`, `previsualizarNumero(prefixo, ano, numero)` — reusa a mesma função que `proximoNumeroSerie` (exportar `formatarNumero` para `lib/`, sem cópia)
  - [ ] 3.2 `src/lib/__tests__/series-documento.property.test.ts`: S2, S5 (fronteira 31/12 23h30 Maputo = 21h30 UTC), pré-visualização = número que `proximoNumeroSerie` emitiria
  ✅ Gate: `npx vitest run src/lib/__tests__/series-documento.property.test.ts` — vermelho sem 3.1, verde com

- [ ] 4. Serviço com as regras S1–S5 (oráculo primeiro)
  - [ ] 4.1 `financas/__tests__/series-documento.test.ts` contra um duplo **com estado**: criar recusa 2.ª activa; reactivar recusa se outra activa; P2002 → `SERIE_DUPLICADA`; editar/eliminar usada → `SERIE_USADA`; `numeroInicial` → `proximoNumero` na criação e na edição; cross-tenant → `NotFoundError`
  - [ ] 4.2 `faturacao.service.ts`: `criarSerie` (S1 na transacção com `pg_advisory_xact_lock(hashtextextended('series:'||tenantId||tipo||ano,0))`; índice parcial como rede), `editarSerie`, `activarSerie`, `desactivarSerie`, `eliminarSerie` — escritas singulares com `tenantId` no `where`
  - [ ] 4.3 `audit-extension.ts`: `SerieDocumento` em `AUDIT_MODELS`
  - [ ] 4.4 `test:integration`: duas criações concorrentes do mesmo tipo+ano → exactamente uma passa
  ✅ Gate: `npx vitest run src/server/services/financas/__tests__/series-documento.test.ts` verde · `pnpm test:integration` verde · `proximoNumeroSerie` inalterado (`git diff` sem hunks nessa função)

- [ ] 5. Actions
  - [ ] 5.1 `faturacao.actions.ts`: `editarSerieDocumento`, `activarSerieDocumento`, `desactivarSerieDocumento`, `eliminarSerieDocumento` — `permission: 'faturacao:series:escrita'`, `revalidate: { tags: ['faturacao','series'] }`
  ✅ Gate: `pnpm gates` verde (inclui `gate-leitura`) · `pnpm check` verde

- [ ] 6. Lista `/faturacao/series`
  - [ ] 6.1 `page.tsx` (Server Component) + colunas em módulo `'use client'`; `DataTable` + `FilterBar` (tipo, ano, estado; omissão = ano corrente)
  - [ ] 6.2 Colunas: tipo (rótulo pt-PT), prefixo, ano, próximo número (`previsualizarNumero`), estado (`StatusBadge` — registar `ATIVA`/`INACTIVA` se faltar), emitidos
  - [ ] 6.3 Botão «Nova série» e acções por linha só com `faturacao:series:escrita`; `AppSidebar` e `CommandPalette`: entrada «Séries» em Faturação
  ✅ Gate: smoke autenticado — `admin@` vê botões, `gestor@` vê a lista sem botões (registado no handoff)

- [ ] 7. Criar, editar e ciclo de vida
  - [ ] 7.1 `nova/page.tsx` e `[id]/editar/page.tsx` com `SemPermissao` sem a permissão; formulário RHF + `zodResolver` com o schema do 2.1; ano em `Select` com `anosPermitidos`; pré-visualização ao vivo; `startTransition` à volta do submit
  - [ ] 7.2 Editar só abre se `!serieUsada`; senão, página só de leitura
  - [ ] 7.3 `AlertDialog` para desactivar (com aviso quando é a única activa do tipo no ano corrente), reactivar e eliminar
  ✅ Gate: `pnpm build` verde · smoke: criar, tentar 2.ª activa (erro legível), desactivar, reactivar, eliminar

- [ ] 8. E2E, acessibilidade e fecho
  - [ ] 8.1 `e2e/19-series-documento.spec.ts` (escrito pelo verificador): fluxo do 7 + GESTOR sem botões + `/nova` com «Sem permissão»; repõe o estado no fim (não deixar séries novas no `demo`)
  - [ ] 8.2 `e2e/a11y.a11y.ts`: `/faturacao/series` e `/nova`, nos dois temas
  - [ ] 8.3 `docs/sistema/08-lacunas-conhecidas.md`: retirar «séries (#149)»; manual de faturação: secção Séries
  ✅ Gate: `npx playwright test e2e/19-series-documento.spec.ts` verde 3× seguidas · `pnpm e2e:a11y` verde · `pnpm check && pnpm gates` verde

---

**Leitura dos gates, de cima a baixo:** as dúvidas estão decididas → a coluna e a rede de unicidade
existem → os contratos compilam → a pré-visualização é o número que se emite → o serviço recusa a 2.ª
activa, os duplicados e a edição de séries usadas, também em concorrência → as actions obedecem aos gates →
a lista distingue quem escreve de quem lê → o ciclo de vida corre no build de produção → o fluxo inteiro
passa em E2E e em axe.
