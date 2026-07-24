# Handoff — WS-TRANSPORTE (spec 06): completar o módulo de Transporte

**Wave 7.1 · o maior workstream.** Branch `ws-transporte`. Todos os caminhos relativos a `apps/erp/`.
Estado: **entregue**. Backend já existente (ADR-0003) **não** foi alterado — só ligações de UI.

## Método: auditoria página-a-página (RF1)

Os 8 ecrãs de `transporte.md §15` **já consumiam serviços/actions reais** (listagens, KPIs
por contagem, detalhes via `obter*`). O trabalho foi criar as rotas `nova`/`[id]` em falta,
ligar os comandos operacionais e o upload de documentos, e corrigir um mismatch de enum.

| Ecrã | Estado inicial | Ação |
|---|---|---|
| `/transporte` (dashboard) | real (viatura/atividade/motorista + alertas) | **mock→real (KPIs)**: adicionados KPIs de **entregas em trânsito + % no prazo** e **custo de combustível** (RF4 §12) via `entregaService`/`abastecimentoService` |
| `/veiculos` | real (lista + KPIs) | **rotas criadas**: `veiculos/novo`, `veiculos/[id]/editar`; detalhe ganhou aba **Ações** (transitar + manutenção + checklist) e **upload de documentos** |
| `/motoristas` | real | **rotas criadas**: `motoristas/novo`, `motoristas/[id]/editar`; detalhe ganhou **gerir disponibilidade** + **upload de documentos** |
| `/rotas` | real | **rota criada**: `rotas/novo`, `rotas/[id]/editar`; detalhe ganhou aba **Ações** (iniciar/pausar/concluir/cancelar + atribuir viatura/motorista) |
| `/entregas` (+`/nova`) | lista/KPIs reais; **`nova` já existia**; **detalhe `[id]` em falta** | **rota criada**: `entregas/[id]` (detalhe + comandos: transitar, **prova de entrega**, atribuir recursos) |
| `/manutencao` (+`[id]`) | real (via `prismaBase` com `where tenantId`) | registo ligado via aba **Ações** da viatura (`registarManutencaoViaturaAction`) |
| `/combustivel` | lista/KPIs reais (km/L do serviço) | **rota criada**: `combustivel/novo`; **mock→corrigido**: opções do filtro (`GASOLEO/GPL/ELECTRICO`) **não batiam** com o enum real (`GASOLINA/DIESEL/ETANOL/GNV`) — corrigido |
| `/atividades` (+`[id]`) | real | **rotas criadas**: `atividades/novo`, `atividades/[id]/editar`; detalhe ganhou aba **Ações** (transitar com descrição) |

**Conclusão RF1:** nenhum ecrã dependia de dados mock em listagens/detalhes; o único mock
residual era o conjunto de opções do filtro de combustível (corrigido).

## Rotas criadas (RF2)

Todas seguem o padrão sem-modais (rota dedicada; `page.tsx` sempre Server Component; formulário
numa folha `'use client'`; mesmo schema Zod das `validations/transporte.ts`; Decimal→string SC→CC).

- `veiculos/novo`, `veiculos/[id]/editar` → `criar/atualizarViaturaAction`
- `motoristas/novo`, `motoristas/[id]/editar` → `criar/atualizarMotoristaAction`
- `rotas/novo`, `rotas/[id]/editar` → `criar/atualizarRotaAction`
- `atividades/novo`, `atividades/[id]/editar` → `criar/atualizarAtividadeAction`
- `combustivel/novo` → `registarAbastecimentoAction` (valorTotal calculado = litros×valor/litro para satisfazer a regra do serviço)
- `entregas/[id]` → detalhe + comandos

Componentes de formulário reutilizados criar/editar: `_components/{viatura,motorista,rota,atividade}-form.tsx`.

> Nota interceptor `@panel/(.)[id]`: o módulo de transporte **não usa** parallel-route
> interceptor, por isso `novo`/`nova` não colidem com `[id]` (segmento estático tem
> prioridade sobre dinâmico no Next). Sem workaround necessário.

## Comandos operacionais ligados (RF3, RNF)

Folhas `'use client'` que ligam às actions existentes e mostram só transições válidas a partir
dos mapas **client-safe** que adicionei a `src/lib/state-machines.ts`
(`TRANSICOES_{VIATURA,ROTA,ATIVIDADE,ENTREGA}`, espelham as interfaces `server-only`).

- **Entrega** (`entregas/_components/entrega-comandos.tsx`): `atribuirRecursosEntregaAction`,
  `transitarEntregaAction` (AGENDADA/EM_TRANSITO/CANCELADA com motivo), `registarProvaEntregaAction`
  (recebedor + tipo + dados → transita para ENTREGUE atomicamente). FALHADA exige motivo (RNF).
- **Rota** (`rotas/_components/rota-comandos.tsx`): `transitarRotaAction` (iniciar/pausar/concluir/
  cancelar) + `atribuirRecursosRotaAction`.
- **Viatura** (`veiculos/_components/viatura-comandos.tsx`): `transitarViaturaAction`,
  `registarManutencaoViaturaAction`, `registarChecklistAction` (itens dinâmicos).
- **Atividade** (`atividades/_components/atividade-comandos.tsx`): `transitarAtividadeAction`
  (descrição da transição obrigatória).
- **Motorista** (`motoristas/_components/motorista-comandos.tsx`): `atualizarDisponibilidadeAction`.

## Documentos de viatura/motorista (RF5)

`_components/documento-upload-form.tsx` (partilhado) — preenche metadados do documento e usa
`<UploadDocumento recurso="viatura"|"motorista">` de `@/components/patterns`.
`onRegistado(meta)` mapeia `meta.urlRef` → campo **`anexo`** e chama
`adicionarDocumento{Viatura,Motorista}Action`.

- **Decisão:** o `urlRef` (`gestpro-storage:{key}`) é guardado em `anexo` (não `url`; o schema de
  doc de viatura/motorista usa `anexo`, não `url`). O handler de download
  (`/api/documentos/[id]/download?recurso=viatura|motorista`) resolve a key por `storageKey` e,
  na sua ausência, faz parse de `anexo` via `urlRefParaKey` — pelo que o download funciona **sem**
  precisar de persistir `storageKey`. Não toquei nos serviços `operacoes/*` para acrescentar
  `storageKey/contentType/tamanhoBytes` ao registo (ficaria a alterar contrato). Se se quiser
  persistir esses campos, é um toque aditivo a `validations/transporte.ts` + `*.service.ts`
  (ver follow-up).
- Links **Descarregar ficheiro** nas abas de documentos (viatura e motorista) e nas fichas.

## RBAC

Nenhuma permissão nova foi necessária — o catálogo `prisma/seed/rbac.ts` já cobre todas as
actions usadas (`transporte:viatura:*`, `:motorista:*`, `:rota:*`, `:entrega:*`, `:atividade:*`,
`:abastecimento:*`). `rbac.ts` **não** foi alterado.

## E2E (T7)

`e2e/06-transporte.spec.ts` — cria entrega via formulário → aterra no detalhe `[id]` →
aba Ações → PENDENTE→AGENDADA→EM_TRANSITO → regista prova → ENTREGUE. Passos de transição
são best-effort (guardados por visibilidade do botão) para resiliência a regras de negócio do
serviço; a criação + navegação para o detalhe são assertadas de forma dura.

## Verificação

- `tsc --noEmit` → **OK** (0 erros).
- `pnpm gates` → **OK** (dialog / use-client / data-imports).
- `eslint` (ficheiros de transporte + state-machines) → ver estado no commit final.
- **Smoke autenticado / build / E2E**: correr na integração (a porta :3000 pode estar ocupada
  no ambiente do worktree). O fluxo A do `transporte.md` é executável na UI.

## Follow-ups (fora de âmbito desta wave — documentado, não construído)

- **Otimização de rota** e **alocação automática** viatura/motorista (`transporte.md §14 Fase 5`):
  não existe motor suficiente; a atribuição é manual via os comandos. Não inventei motor.
- **Portal/app do motorista** e resiliência offline (`§13`).
- **Eventos de domínio assíncronos** (`§10`): mantida a integração síncrona existente.
- **Aprovação de abastecimento suspeito** (`§15`): o serviço não expõe fluxo de aprovação;
  registo é directo. Follow-up se se quiser workflow de aprovação.
- **Persistir `storageKey/contentType/tamanhoBytes`** no registo de documentos de viatura/motorista
  (aditivo a `validations` + `*.service.ts`); hoje o download resolve por `anexo` sem eles.
- **`veiculos/documentos` e `motoristas/documentos`** continuam vistas globais read-only (upload
  faz-se na ficha do recurso). Não alterei estas rotas.
