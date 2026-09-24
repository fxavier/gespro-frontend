# Handoff — ADR-0039, nó `modelo`

- **Data**: 2026-09-24
- **Grafo**: [`.claude/grafos/nota-debito.md`](../../.claude/grafos/nota-debito.md) · **ADR**: [ADR-0039](../decisions/ADR-0039-nota-debito-contabilidade.md)
- **Depende de**: — · **Destranca**: `contabilizacao`, `fornecedor`

## Decisões do utilizador neste nó

- **M2 (a)**: `motivoIsencao` entra como coluna nula, e a regra `taxa 0 ⇒ motivo` fica pura e testada. **Ligá-la às
  emissões é do nó `contabilizacao`/`ui`.** O `LinhaDocumentoSchema` é partilhado com Proforma e Cotação, e os
  formulários ainda não enviam o campo; se entrasse no Zod já, todas as emissões a 0% partiam.
- **M3 (a)**: modelo `ContaNaturezaNotaDebito`. As omissões semeadas são só as de `ACERTO_PRECO`, `JUROS_MORA` e
  `PENALIZACAO`. `NotaDebito.contaCreditoId` guarda a conta usada no acto.
- **M4**: `ACERTO_PRECO → 711`, `JUROS_MORA → 781`, `PENALIZACAO → 769` (operacional, não 78x). Confirmado contra
  `prisma/seed/data/plano-contas-pgc.json`, e há teste que o tranca.
- **M5 (a)**: migração gerada e aplicada na base local, com SQL à mão que dá a omissão aos tenants existentes.
- **M6 (a)**: foi apagado da base local o `CompromissoTesouraria` «Renda do escritorio», criado à mão a
  2026-09-23. Punha a golden da spec 22 a vermelho.

## O que foi entregue

### Schema (`financas.prisma`, `compras.prisma`) e migração `20260924005303_0039_nota_debito_modelo`

| Onde | O quê |
|---|---|
| `enum NaturezaNotaDebito` | `ACERTO_PRECO`, `JUROS_MORA`, `DESPESAS_REPERCUTIDAS`, `PENALIZACAO`, `OUTRO` |
| `NotaDebito` | `natureza @default(ACERTO_PRECO)`, `contaCreditoId String?`, `motivoCancelamento String?` |
| `NotaCredito` | `motivoCancelamento String?` |
| `LinhaFatura`, `LinhaNotaCredito`, `LinhaNotaDebito` | `motivoIsencao String?` |
| `ContaNaturezaNotaDebito` (novo) | `tenantId`, `natureza`, `contaId` (FK escalar ContaPGC), `@@unique([tenantId, natureza])`. **Sem linha = sem omissão** |
| `enum TipoDocumentoContaPagar` | `FACTURA`, `NOTA_DEBITO`, `NOTA_CREDITO` |
| `ContaPagar` | `tipoDocumento @default(FACTURA)`, `contaPagarOrigemId String?`, `motivo String?` e dois índices |

A migração acaba num `INSERT … SELECT … ON CONFLICT DO NOTHING` que dá as três omissões a cada tenant existente
a partir do seu `ContaPGC`. Depois de aplicada, o `migrate diff` devolve *empty migration* e o tenant `demo` tem
as 3 linhas.

### Código

- **`src/lib/nota-debito.ts`** (client-safe):
  - `NATUREZAS_NOTA_DEBITO`, `CONTA_PADRAO_NATUREZA_ND`;
  - `classeAdmitidaParaNatureza`: `DESPESAS_REPERCUTIDAS` → classe 6, as restantes → classe 7;
  - `motivoIsencaoEmFalta`.
- **Escritores em produção**:
  - `bootstrapContasNaturezaNotaDebito`, em `tenant-bootstrap.ts`. É chamada por `bootstrapContabilidade`
    (registo público), `prisma/seed/financas.ts` e `seed/volume/base.ts`. Só semeia a conta que o serviço também
    aceitaria: tem de ser de movimento, activa e da classe certa.
  - `definirContaNaturezaNotaDebito`, em `financas/natureza-nota-debito.service.ts`. Com `contaId: null` retira a
    omissão. A conta tem de ser do tenant (senão 404), activa, folha e da classe admitida
    (senão `CONTA_NATUREZA_INVALIDA`).
  - As escritas são **singulares** (`create`/`update`/`delete`), porque a `audit-extension` não vê
    `upsert` nem `deleteMany`. `ContaNaturezaNotaDebito` entrou em `AUDIT_MODELS`.
- **Leitor**: `resolverContaNaturezaNotaDebito(client, natureza, ctx)`. Aceita o `tx` da emissão e devolve
  `{ id, codigo }` ou `null`.
- **`cancelarNotaDebito`/`cancelarNotaCredito`**: escrevem `motivoCancelamento` e deixam de sobrescrever
  `observacoes`.

## Loop

| Fase | Resultado |
|---|---|
| INSPECT | A skill `estado-com-escritor` não existe (já registado em `s21-l5-travoes.md:243`); aplicou-se a definição por extenso. Faltava onde guardar a conta escolhida no acto; `motivoIsencao` obrigatório partiria emissões; 769 em vez de 78x para penalizações. Seis decisões pedidas (M1–M6) |
| TEST | 4 ficheiros, 40 testes. Property tests da regra de isenção. O duplo do serviço **tem estado**: o que `definir` escreve é o que `resolver` lê, nos dois sentidos (omissão → redefinida → retirada → reposta). As recusas provam que nada é escrito. Isolamento por tenant. Destino do motivo de cancelamento |
| Mutação | Seis mutações, todas mortas: resolver que ignora a tabela (6 vermelhos), sem verificação de classe (2), omissão numa conta de agregação (2), ND a voltar a sobrescrever `observacoes` (1), motivo só com espaços aceite (1), provisionamento que não semeia (1) |
| REVIEW | Subagente `code-reviewer`, sem o contexto do autor: 0 BLOCKER, 1 MAJOR, 1 MINOR, 1 NIT, «APROVAR COM NITS». O eixo 2 (fidelidade) não teve achados |
| FIX | **MAJOR**: `upsert`/`deleteMany` escapavam à auditoria. Passou a escrita singular, com teste que falha se voltarem. **NIT**: o bootstrap passou a filtrar pela classe, com teste; o SQL da migração ficou como estava, porque já foi aplicada, editá-la muda o checksum, e o único tenant tem as três contas na classe 7. **MINOR**: ver em baixo |
| VERIFY | `pnpm check` verde (122 ficheiros, **1732** testes; 0 erros de lint, 109 avisos antigos). `pnpm gates` verde |

## O que ficou por fazer (e de quem é)

- **`contabilizacao`**:
  - ligar `resolverContaNaturezaNotaDebito` a `construirLancamentoNotaDebito`;
  - pôr `emitirNotaDebito` a escrever `natureza` e `contaCreditoId`. Para `DESPESAS_REPERCUTIDAS`/`OUTRO`, ou
    quando o resolver devolve `null`, a conta vem no input; sem ela, a emissão recusa;
  - ligar `motivoIsencaoEmFalta` às emissões de Fatura, NC e ND;
  - fazer o estorno no cancelamento, em `$transaction`. É também aí que se fecha o **MINOR** da revisão:
    `cancelar*` faz `update({ where: { id } })` depois de um `findFirst` com tenant, que é um TOCTOU anterior a
    este nó.
- **`fornecedor`**: escrever `tipoDocumento`, `contaPagarOrigemId` e `motivo`. Os dois escritores actuais de
  `ContaPagar` (`compras.service.ts:990`, `conta-pagar.service.ts:245`) continuam a gravar `FACTURA` por omissão, o
  que está correcto. Os seis leitores (IVA, mapas de IVA, projecção, analytics, fornecedor e conta-pagar) ainda
  não filtram por `tipoDocumento`.
- **`ui`**: a Server Action de `definirContaNaturezaNotaDebito` (a permissão é a decidir) e o ecrã de
  configuração.
- **Proforma e Cotação** não têm `motivoIsencao`: o ADR só nomeia Fatura, NC e ND. Uma factura convertida de
  proforma com linhas a 0% nasce sem motivo. É decisão para o nó `contabilizacao`.
- **Skill `estado-com-escritor`**: continua por escrever. Ou se escreve, ou se corrigem as referências no
  `no.md`, nos ADR-0033/0036 e na spec 21.

## O que os nós seguintes assumem

- Um tenant provisionado depois deste nó tem sempre as três omissões. Um tenant anterior tem-nas pela migração,
  **desde que** o seu plano tenha as contas.
- `resolverContaNaturezaNotaDebito` devolver `null` é um estado legítimo: essa natureza pede escolha no acto, e
  o código não deve cair em silêncio para 711.
- As ND históricas têm `natureza = ACERTO_PRECO` e `contaCreditoId = NULL`. Não há backfill (ADR-0039, risco a).
