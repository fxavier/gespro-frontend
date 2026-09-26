# Handoff — grafo `dfc`, nó `adr` (ticket 0)

- **Data**: 2026-09-25 · **Grafo**: [`.claude/grafos/dfc.md`](../../.claude/grafos/dfc.md) · **Destranca**: `contratos`
- **Gate**: `grep -c "Estado\*\*: Aceite"` = 1 · `grep -c "Emenda 2026-09-25"` = 1

## Entregue

- **[ADR-0037](../decisions/ADR-0037-demonstracao-fluxos-caixa.md)**: secção «Emenda 2026-09-25» (E1–E6), com o
  estado passado a **Aceite** pelo humano. O índice em `docs/decisions/README.md` também diz Aceite.
  - **E1**: `VersaoMapeamentoFluxo`, com V1–V3.
  - **E2**: `AtividadeFluxo.CAIXA`. `saldoCaixa` e `I6` passam a ler só as contas mapeadas a `CAIXA`.
  - **E3**: V4, `DFC_ENTRE_EXERCICIOS`, e o N-1 homólogo, com «—» quando não há exercício anterior.
  - **E4**: exportação só em PDF.
- **Decisões do humano na aceitação**:
  - **E5**: permissão própria `financas:fluxo-caixa:validar`, por omissão só no ADMIN. É segregação de funções:
    `:configurar` altera o mapeamento, `:validar` assina uma versão dele.
  - **E6**: o enum é `PENDING`/`VALIDATED`. Na UI, «Por validar» e «Validado».
  - As justificações que o agente redactor tinha acrescentado sem suporte nas decisões foram removidas.
- **Propagado** a `intent.md`, `tickets.md` (6.1, 7.2 e os nomes do enum) e `.claude/grafos/dfc.md`.
- **Agentes**:
  - `verificador-fluxo-caixa` pode escrever também em `provisioning/__tests__/` (só os casos DFC), em
    `api/contabilidade/dfc/**/__tests__/` e em `e2e/18-dfc.spec.ts`;
  - `model: fable` em `feat-dfc`, `code-reviewer` e `verificador-fluxo-caixa`.

## O que o `contratos` assume

- O enum `EstadoVersaoMapeamento { PENDING VALIDATED }` e `AtividadeFluxo` com `CAIXA`.
- Três permissões novas no ticket 6.1, e não duas: `:leitura`, `:configurar` e `:validar`.

## Estado conhecido da base local

A golden da spec 22 (`projecao.golden.test.ts`) está vermelha **só** por dados: `compromissosManuais: 1`, do
compromisso «Pagamento da Internet» criado à mão a 2026-09-24. Por decisão do humano, não se apaga. Nos gates dos
nós seguintes, esse vermelho só se aceita se for **o único** teste a falhar e se a mensagem for a de resíduos.
