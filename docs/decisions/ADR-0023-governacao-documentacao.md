# ADR-0023 — Governação da documentação e numeração de ADRs

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0024](./ADR-0024-gates-arquitectura.md)
- **Skills**: `engineering:documentation`

## Contexto

Três problemas de documentação acumularam-se e todos têm o mesmo efeito: quem entra na equipa parte de
um modelo mental errado.

1. **`docs/DOCUMENTACAO.md` descreve um sistema que já não existe.** Fala de Next.js 15, de acesso a
   dados por PostgREST, de serviços em `src/services`, de um assistente conversacional que foi
   removido a pedido, e de dados que hoje vêm todos da base de dados. É a documentação funcional mais
   visível do repositório e está inteiramente desactualizada — descreve o estado **anterior** à
   migração das Waves 0–3.

2. **Três ADRs partilham o número 0005.** Aconteceu em *waves* paralelas: motor de PDF, infraestrutura
   e observabilidade receberam todos o mesmo número. O `README.md` das decisões regista a colisão e
   desambigua-os como `0005-a/-b/-c`, mas a referência cruzada por número deixou de ser fiável — «ver
   ADR-0005» não identifica documento nenhum.

3. **As convenções normativas vivem em três sítios sem ponto de entrada.** As *skills* em
   `.claude/skills/` são a fonte de verdade das convenções; os contratos entre especificações estão em
   `docs/handoff/`; o estado operacional está em `docs/status.md`. O arranjo funcionou muito bem para
   agentes, que recebem o caminho exacto na instrução. Para uma pessoa que abre o repositório pela
   primeira vez, não há por onde começar.

## Decisão

### 1. Numeração de ADR: sem renumeração, com registo canónico

**Os três ADRs 0005 não são renumerados.** Renumerar quebraria ligações já existentes noutros
documentos e no histórico, e ADRs aceites são imutáveis por convenção deste repositório. Em vez disso:

- Cada um dos três recebe, no cabeçalho, um **identificador canónico** — `ADR-0005-a`, `-b`, `-c` —
  que passa a ser a forma correcta de os citar.
- O `README.md` das decisões torna-se o **índice autoritativo**, com o próximo número livre indicado
  de forma explícita e obrigatória de actualizar em cada ADR novo.
- Um teste em `docs/decisions/__tests__/adr-index.test.ts` verifica que todo o ficheiro `ADR-*.md`
  consta do índice, que não há números duplicados acima de 0005, e que todos os estados são válidos.
  A colisão histórica é a única excepção declarada, com justificação no próprio teste.

Fica assim documentado como um erro de processo que a automação passa a impedir, em vez de um erro de
processo que se repete.

### 2. `DOCUMENTACAO.md` é substituído

O ficheiro é substituído pelo documento de arquitectura produzido nesta wave
(`docs/GestPro-Arquitectura-e-Estado.pdf` e a sua fonte), que descreve o sistema tal como está. O
ficheiro antigo não é apagado — é movido para `docs/historico/DOCUMENTACAO-pre-migracao.md`, com um
aviso no topo a dizer o que descreve e até quando foi válido. Tem valor histórico; não pode é ser
confundido com documentação corrente.

### 3. Um único ponto de entrada

Novo `docs/README.md`, e apenas ele, com o papel de encaminhar:

| Se queres… | Vai a |
|---|---|
| Perceber o sistema | `GestPro-Arquitectura-e-Estado.pdf` |
| Saber o que está feito e o que falta | `status.md` |
| Escrever código que passe na revisão | `.claude/skills/*` — as convenções normativas |
| Perceber porque é assim | `decisions/README.md` |
| Integrar com outro domínio | `handoff/` |
| Resolver um incidente | `runbooks/` |
| Pôr a correr localmente | `../CLAUDE.md` |

### 4. Regra de manutenção

**Todo o ADR novo actualiza o índice no mesmo *pull request*** — verificado pelo teste. **Toda a
alteração de arquitectura que contradiga o documento de arquitectura obriga a nota em `status.md`**
com a data. O documento de arquitectura é regenerado a cada fecho de *wave*, não continuamente: um
documento que se tenta manter sempre actual acaba por não ser mantido de todo.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Não renumerar, índice canónico com teste** ✅ | Não quebra ligações; respeita a imutabilidade dos ADRs; a automação impede a repetição | A colisão fica visível para sempre no histórico |
| Renumerar os três 0005 | Sequência limpa | Quebra ligações em *handoffs* e no histórico; contradiz a imutabilidade que o próprio repositório declara |
| Ignorar a colisão | Zero trabalho | «Ver ADR-0005» continua ambíguo; e nada impede que volte a acontecer numa próxima wave paralela |
| Ferramenta de gestão de ADR (adr-tools) | Numeração automática, sem colisões | Mais uma ferramenta para instalar e aprender; um teste de 40 linhas resolve o mesmo problema |
| Actualizar `DOCUMENTACAO.md` em vez de substituir | Preserva o caminho do ficheiro | Reescrever de raiz um documento inteiramente obsoleto é mais caro do que substituir, e mantém o risco de ficar meio actualizado |

## Consequências

- **`docs/README.md` passa a ser o primeiro ficheiro a ler.** Deve ser referenciado no `README.md` da
  raiz do repositório.
- **O teste do índice é o único mecanismo que impede a repetição.** Sem ele, a próxima wave paralela
  colide outra vez — foi exactamente assim que aconteceu.
- **`docs/historico/` é criado** e passa a ser o destino de documentação superada. Uma pasta com esse
  nome comunica, por si só, o que lá está.
- **O documento de arquitectura passa a ser um artefacto de *wave*.** Regenerá-lo é uma tarefa de
  fecho, como o `status.md`, não trabalho contínuo.
- **Custo baixo, valor desproporcionado.** É o item mais barato desta wave e o que mais reduz o tempo
  de familiarização de quem assumir a manutenção — que o documento de arquitectura identifica como
  risco, dado que nenhuma pessoa percorreu todo o código.
