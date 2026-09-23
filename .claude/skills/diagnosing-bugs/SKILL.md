---
name: diagnosing-bugs
description: Ciclo disciplinado de diagnostico - observar, reduzir, hipotetizar, instrumentar, corrigir. Usar perante qualquer falha de teste, erro em runtime, comportamento divergente do esperado, ou quando um no agentico falha a verificacao pela segunda vez.
---

# Diagnóstico de defeitos — GestPro

> Adaptado dos padrões de [mattpocock/skills](https://github.com/mattpocock/skills).

## Os cinco passos, por ordem

**1. Observar.** Qual é exactamente o comportamento? Um número, não um adjectivo. «A projecção está
errada» não é uma observação; «o bucket 3 fecha em 12 450,00 e devia fechar em 12 400,00, delta de
50,00» é.

**2. Reduzir.** Qual é o caso mínimo que reproduz? Corta até nada mais poder sair. Num property
test, deixa o `fast-check` encolher e guarda o contra-exemplo. Um defeito com caso mínimo é um
defeito quase resolvido; um defeito sem caso mínimo é uma conversa.

**3. Hipotetizar.** Três causas possíveis, ordenadas por probabilidade. Para a primeira, escreve
qual é a **observação que a distingue** das outras duas. Sem isso não estás a testar hipóteses —
estás a mexer no código à espera de sorte.

**4. Instrumentar.** Observa antes de corrigir. `console.log` no servidor, teste temporário,
`EXPLAIN` na query. Confirma ou elimina a hipótese com dados.

**5. Corrigir.** Só agora. E escreve o teste que impede o regresso — se o defeito passou por todos
os testes existentes, falta um teste, e esse é parte da correcção.

## Suspeitos habituais neste repositório

Antes de qualquer outra coisa, verifica se é um destes — todos já aconteceram aqui:

| Sintoma | Suspeito |
|---|---|
| Número certo em dev, errado em produção, ou muda à meia-noite | Fuso. O servidor corre em UTC; usa `diaCivilEmMaputo` |
| Data cai no dia anterior | `new Date('aaaa-mm-dd')` lido como UTC |
| Cêntimos a mais ou a menos | `number` onde devia estar `Decimal` |
| Clique na linha da tabela deixa de navegar, sem erro | Falha de hidratação por `toLocaleDateString` directo |
| Mutação rebenta no cliente **depois** do commit | `Decimal` não serializado na fronteira SC→CC |
| `cookies().get(X)` devolve `undefined` com o cookie presente | `X` importado de um módulo `'use client'` |
| Formulário submete, escreve, e o utilizador fica lá | `redirect()` numa action chamada fora de `startTransition` |
| Action funciona e a página não actualiza | `revalidate` não declarado |
| Erro «série activa não encontrada» em todos os tenants | Série nova sem entrada em `SERIES_INICIAIS` |
| «Sem permissão» mesmo ao ADMIN | Permissão nova no catálogo sem `pnpm db:seed` |
| Mapa financeiro com receita negativa | Natureza da conta no `plano-contas-pgc.json` |
| Página devolve 200 com mensagem de filtro inválido | Schema Zod sobreposto — o defeito D2 que matou a DRE |
| Build standalone parte e `pnpm dev` não | `useSearchParams()` sem `<Suspense>` |

## Quando parar

Três tentativas sem convergir não é falta de esforço: é sinal de que o modelo mental está errado.
Páras, escreves as respostas aos passos 1–3 e o caso mínimo, e escalas. Continuar a insistir leva ao
pior resultado disponível — adaptar o teste ao código.
