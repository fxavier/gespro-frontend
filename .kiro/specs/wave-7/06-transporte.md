# WS-TRANSPORTE — Completar o módulo de Transporte (`docs/transporte.md`)

**Wave 7.1 · o maior workstream.** 1 worktree. Pode reutilizar `<UploadDocumento>` (WS-DOC-CORE) para documentos de viatura/motorista → agendar após o arranque de WS-DOC-CORE.

## O que já existe (não reimplementar — ADR-0003)
- **Serviços (`src/server/services/operacoes/`):** `viatura`, `motorista`, `atividade`, `rota`, `entrega`, `abastecimento`, `alocacao` (validação de conflitos de agenda/carta/capacidade), `alertas` (documentos a vencer, manutenção). Máquinas de estado: `TRANSICOES_{VIATURA,ROTA,ENTREGA,ATIVIDADE}`.
- **Actions (`transporte.actions.ts`, 28):** CRUD de viatura/motorista/atividade/rota/entrega; `transitar*` (estados); `atribuirRecursos{Rota,Entrega}`; `registarProvaEntregaAction`; `adicionarDocumento{Viatura,Motorista}Action`; `registarManutencaoViaturaAction`; `registarChecklistAction`; `registarAbastecimentoAction`; `listar*`.
- **Validações:** `validations/transporte.ts` (schemas de tudo o acima).
- **Cron:** `api/cron/transporte-alertas/route.ts` (alertas de documentos/manutenção).
- **UI (rotas existentes):** `/transporte` (dashboard), `/veiculos` (+`[id]`, `documentos`), `/motoristas` (+`[id]`, `documentos`), `/rotas` (+`[id]`), `/entregas` (+`nova`), `/manutencao` (+`[id]`), `/combustivel`, `/atividades` (+`[id]`). `veiculos/page.tsx` **já consome `viaturaService` real** (KPIs por contagem real, FilterBar, DataTable cursor).

**Conclusão:** o backend do módulo está essencialmente completo face ao `transporte.md`. O trabalho é **auditoria página-a-página, remoção de mocks residuais, criação das rotas `nova`/`[id]` em falta, KPIs de dashboard reais e ligação dos comandos operacionais**.

## Método: auditoria estruturada (primeiro passo obrigatório no worktree)
Para **cada** um dos 8 ecrãs de `transporte.md §15`, classificar e corrigir:

| Ecrã | Verificar | Ação provável |
|---|---|---|
| `/transporte` (dashboard) | KPIs vêm de dados reais ou mock? Ações rápidas ligam a rotas reais? | Substituir agregados mock por contagens/serviços reais (`viatura/entrega/rota/abastecimento` services); alertas via `alertasService`. |
| `/veiculos` | Já real. Falta `veiculos/novo`? `[id]` detalhe usa serviço? Aba documentos usa upload real? | Criar `veiculos/novo` (form → `criarViaturaAction`) se faltar; ligar `documentos` a `<UploadDocumento recurso="viatura">` + `adicionarDocumentoViaturaAction`. |
| `/motoristas` | `motoristas/novo`? detalhe real? documentos? disponibilidade? | `criarMotoristaAction`, `atualizarDisponibilidadeAction`, documentos via `<UploadDocumento recurso="motorista">`. |
| `/rotas` | `rotas/nova`? comandos iniciar/pausar/concluir? atribuir recursos? otimizar? | Ligar `transitarRotaAction` (planejada→ativa↔pausada→concluida), `atribuirRecursosRotaAction`. "Otimizar" (transporte.md §3.4) — se não houver serviço, marcar como **fora de âmbito desta wave** e documentar (não inventar motor de otimização). |
| `/entregas` + `/nova` | `nova` submete a `criarEntregaAction`? transições? prova de entrega? atribuição? | Ligar `criarEntregaAction`, `transitarEntregaAction`, `registarProvaEntregaAction` (exige evidência mínima: hora+recebedor — regra já no serviço), `atribuirRecursosEntregaAction`. |
| `/manutencao` (+`[id]`) | Lista vem de serviço? criar liga a `registarManutencaoViaturaAction`? | Ligar à action existente; estado da viatura reflete manutenção. |
| `/combustivel` | Liga a `registarAbastecimentoAction` / `listarAbastecimentosAction`? eficiência (km/l)? | Ligar às actions; métricas de eficiência via serviço/agregado. Aprovação de abastecimento suspeito: verificar se o serviço a suporta; senão documentar como follow-up. |
| `/atividades` (+`[id]`) | Real? transições? | Ligar `criar/atualizar/transitarAtividadeAction`. |

Para cada ecrã, produzir no handoff uma linha: **[real | mock→corrigido | rota criada | fora de âmbito]**.

## Requisitos
- **RF1** Todos os ecrãs de transporte consomem serviços/actions reais (zero mock residual em listagens/detalhes).
- **RF2** Rotas `nova`/`[id]` em falta são criadas (viaturas, motoristas, rotas, entregas) seguindo o golden standard sem-modais.
- **RF3** Comandos operacionais ligados e a respeitar as máquinas de estado: iniciar/pausar/concluir rota; agendar→em_transito→entregue (com prova) / falhada / cancelada; disponibilidade de viatura/motorista; registar abastecimento e manutenção.
- **RF4** Dashboard mostra KPIs reais (frota, entregas no prazo, custos/alertas) do `transporte.md §12`.
- **RF5 (docs)** Documentos de viatura/motorista via `<UploadDocumento>` (reutiliza WS-DOC-CORE) + presigned download.
- **RNF** Auditabilidade das transições (quem/quando/motivo) — já suportada pelas actions `transitar*` com `motivo`; garantir que a UI passa `motivo` onde exigido.

## Fora de âmbito desta wave (documentar, não inventar)
- Motor de **otimização de rota** e **alocação automática** viatura/motorista (transporte.md §14 Fase 5) — só se já existir `alocacaoService` suficiente; caso contrário, follow-up.
- Portal/app do motorista e resiliência offline (transporte.md §13).
- Publicação de **eventos de domínio** assíncronos (transporte.md §10) — manter integração síncrona existente; eventos como follow-up.

## Ficheiros afetados
`app/(dashboard)/transporte/**` (páginas + `_components`). **Sem** alterar `services/operacoes/*` nem `transporte.actions.ts` (salvo bug real; nesse caso, corrigir no serviço, não criar espelho). Possível toque aditivo em `rbac.ts`/`state-machines.ts` (client-safe) se faltarem entradas de UI.

## Tarefas
1. `T1` Auditoria dos 8 ecrãs + tabela de estado no handoff.
2. `T2` Dashboard com KPIs reais + ações rápidas.
3. `T3` Rotas `nova`/`[id]` em falta (viaturas, motoristas, rotas, entregas) ligadas às actions.
4. `T4` Comandos operacionais (transições, atribuição de recursos, prova de entrega).
5. `T5` Manutenção + combustível ligados às actions; métricas de eficiência.
6. `T6` Documentos de viatura/motorista via `<UploadDocumento>`.
7. `T7` E2E de 1 fluxo ponta-a-ponta: criar entrega → atribuir viatura/motorista → iniciar rota → transitar até "entregue" com prova.

## Critérios de aceitação
- Nenhum ecrã de transporte depende de dados mock.
- Fluxo A do `transporte.md` (planeamento→execução de entrega) executável na UI.
- `pnpm check` + `pnpm gates` + build + smoke autenticado dos ecrãs + E2E verdes.
