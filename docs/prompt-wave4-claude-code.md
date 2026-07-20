# Prompt — Executar a Wave 4 (specs 04–09) em paralelo com RTK

> Cola o bloco abaixo no Claude Code, a partir da raiz do repositório `gespro/`,
> com o `rtk-plugin` já instalado. O prompt põe o Claude Code a agir como
> orquestrador, a lançar os 6 agentes `feat-*` em paralelo (um worktree cada) e a
> encaminhar **todos** os comandos de shell por RTK para poupar 60–90% de tokens.

---

```text
Age como o agente `orchestrator` do GestPro. Objetivo: executar a Wave 4 —
implementar os specs 04–09 (funcionalidades em falta) — com os 6 agentes `feat-*`
em paralelo, em worktrees separados, respeitando as regras invioláveis do CLAUDE.md.

## POLÍTICA DE TOKENS (RTK) — obrigatória para ti e para TODOS os subagentes
O plugin RTK está instalado. Para poupar tokens:
- Encaminha SEMPRE comandos de shell de leitura/pesquisa/teste/build/git por RTK:
  usa `rtk read <ficheiro>` em vez de cat, `rtk grep <padrão> <path>`,
  `rtk ls <dir>`, `rtk find`, `rtk git status|log|diff`, `rtk git add|commit|push`,
  `rtk pnpm ...`, `rtk tsc`, `rtk vitest`/`rtk test`, `rtk lint`.
- Para a verificação, corre `rtk pnpm check` e `rtk pnpm gates` (falha → lê só o
  bloco de erros condensado do RTK, não a saída completa).
- NÃO despejes ficheiros inteiros no contexto: usa `rtk read` e `rtk grep` com alvos
  precisos; abre com a ferramenta Read apenas os trechos necessários.
- Comandos com pipes/redireccionamentos passam sem RTK (é o comportamento seguro do
  plugin) — evita pipes quando um subcomando `rtk` nativo resolve.
- No fim de cada fase, corre `/rtk-plugin:gain` e reporta a poupança acumulada.
- Instrui explicitamente cada subagente `feat-*` a seguir esta mesma política RTK.

## FONTES DE VERDADE (lê primeiro, com `rtk read`)
- `docs/handoff/execucao-paralela-04-09.md` — mapa de conflitos + ordem de merge.
- `.kiro/specs/00-funcionalidades-em-falta-visao-geral.md` — visão geral.
- `.kiro/specs/0{4,5,6,7,8,9}-*/tasks.md` — o plano de cada spec.
- `CLAUDE.md` e `.claude/skills/*` — convenções normativas.

## SETUP (worktrees — isolamento para paralelismo real)
Cria um worktree por agente a partir de uma branch de integração `wave4`:
  rtk git switch -c wave4
  git worktree add wt/feat-reconciliacao-bancaria -b ws-04
  git worktree add wt/feat-reconciliacao-stock     -b ws-05
  git worktree add wt/feat-payroll                 -b ws-06
  git worktree add wt/feat-recrutamento            -b ws-07
  git worktree add wt/feat-beneficios              -b ws-08
  git worktree add wt/feat-correcoes-paginas       -b ws-09
(usa `rtk git ...` onde o RTK suporta; `git worktree add` corre normal.)

## LANÇAMENTO EM PARALELO (Task tool, várias chamadas na MESMA mensagem)
Lança em paralelo os agentes cujos ficheiros NÃO colidem à partida:
  Fase A (paralela): feat-reconciliacao-bancaria (04), feat-reconciliacao-stock (05),
                     feat-payroll (06), feat-recrutamento (07), feat-beneficios (08)
A cada subagente passa: (1) o `tasks.md` do seu spec, (2) o worktree onde trabalha
(caminho absoluto), (3) o excerto do handoff com o mapa de conflitos, (4) a política
RTK acima. Exige que termine com `rtk pnpm check` verde no seu worktree e um resumo
CURTO (ficheiros tocados, decisões, gaps) — não o diff completo.

`feat-correcoes-paginas` (09) NÃO entra na Fase A: depende de 04–08 mergidos
(páginas de payroll/reconciliação + limpeza de rotas). Lança-o na Fase B, depois dos
merges.

## MIGRATIONS E MERGE (só tu, ordem determinística)
Os agentes NUNCA correm `prisma migrate` nem fazem merge. Só editam
`prisma/schema/*.prisma`. Depois de cada worktree passar `rtk pnpm check`:
1. Merge na ordem: 04 → 05 → 06 → 08 → 07 → 09 (ver handoff; resolve os ficheiros
   partilhados `pessoas-projetos.prisma`, `financas.prisma`, `rbac.ts`,
   `validations/rh.ts`, `status-badge.tsx` de forma aditiva).
2. Após cada merge, regenera migrations na ordem `financas → inventario →
   pessoas-projetos` (nome `10xx_<feature>`) e corre `rtk pnpm check` na `wave4`.
3. Pede revisão ao agente `code-reviewer` antes de cada merge; merge só sem BLOCKERs
   (foco: isolamento multi-tenant, Decimal, partidas dobradas débito==crédito,
   máquinas de estado, sem modais).

## GATE POR AGENTE (antes do merge)
- `rtk pnpm check` verde; `rtk pnpm gates` verde (Dialog fora de AlertDialog=0;
  `'use client'` em page.tsx de listagem/detalhe=0; imports `@/data`=0).
- Cobertura de serviços ≥80% (feat-payroll ≥90% no motor de cálculo).
- Property tests das máquinas de estado e invariantes.

## FASE B e FECHO
- Após 04–08 mergidos: lança `feat-correcoes-paginas` (09); depois `qa-e2e` para os
  fluxos novos (reconciliação, contagem de stock, payroll, recrutamento).
- Atualiza `docs/status.md` com o estado da Wave 4 (tabela: spec, estado, bloqueios).
- Reporta no fim: resumo por spec, resultado dos gates e a poupança total de tokens
  do RTK (`/rtk-plugin:gain`).

Começa por: (1) confirmar o RTK ativo com `rtk gain`; (2) ler o handoff e os
tasks.md com `rtk read`; (3) criar os worktrees; (4) lançar a Fase A em paralelo.
```

---

## Notas de uso

- **Se o RTK não estiver ativo**, o plugin cai em passthrough silencioso; confirma
  com `/rtk-plugin:gain` ou `rtk gain`. Reinstala com
  `/plugin install rtk-plugin@enix` e reinicia a sessão.
- **Paralelismo real** exige os worktrees: sem eles, dois agentes a editar o mesmo
  `page.tsx`/schema colidem. O modelo acima dá a cada agente um checkout isolado e
  deixa o merge (e as migrations) exclusivamente ao orquestrador — igual ao que os
  specs 01–03 já usaram.
- **Ordem**: 04 e 05 tocam ficheiros de schema distintos (finanças vs inventário) e
  podem correr à vontade; 06/07/08 partilham `pessoas-projetos.prisma` mas
  acrescentam modelos disjuntos (o choque é só o rename de enum do 09, por isso 09 é
  o último).
- **Variante mais barata (menos paralelismo, ainda menos tokens)**: se quiseres
  minimizar custo, corre por fases sequenciais (04+05 → 06 → 08+07 → 09) com 1–2
  agentes de cada vez; o RTK aplica-se na mesma.
