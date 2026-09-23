# Handoff — ADR-0038, nó IMPORT

- **Data**: 2026-09-23
- **Depende de**: MODEL ([handoff](./adr-0038-model.md))
- **Consumido por**: RECONCILIATION
- **Spec**: [RF-XXX §4, §5, §19](../../.kiro/specs/23-reconciliacao-bancaria-automatica/requirements.md) · [ADR-0038](../decisions/ADR-0038-reconciliacao-bancaria-automatica.md) §1, §7

## O que foi entregue

| Ficheiro | Conteúdo |
|---|---|
| `apps/erp/src/server/services/reconciliacao/extracto.parser.ts` | `ParserExtrato` (`parserCsv`, `parserXlsx`), `parserPara(nome)`, `interpretarGrelha(grelha)`, `MAXIMO_LINHAS` |
| `apps/erp/src/server/services/reconciliacao/importacao.service.ts` | `importarExtracto(input, ctx)`, `projetarMovimentosContabilisticos(contaBancariaId, ctx)`, `TAMANHO_MAXIMO_EXTRACTO` |
| `…/__tests__/extracto.parser.test.ts` | Property tests de ida e volta em CSV (1000 corridas) e XLSX, e **CSV ↔ XLSX com as mesmas chaves**; casos de regras e de erros |
| `…/__tests__/importacao.service.test.ts` | Serviço com Prisma mockado |
| `apps/erp/package.json` | `exceljs@^4.4.0` (decisão do utilizador; a `xlsx@0.18.5` tem CVE-2023-30533 e CVE-2024-22363 e continua **só** a escrever relatórios) |

### Leitura do extracto (RF §4, §5)

- **Dois passos.** Cada formato só transforma bytes numa grelha de texto; a interpretação é **uma
  só** (`interpretarGrelha`). É isso que garante que a mesma linha dá o mesmo movimento e a mesma
  chave, venha em CSV ou em XLSX, e há um property test para isso. MT940/CAMT.053 entram como mais
  um `ParserExtrato`.
- **Colunas** por nome, sem acentos, maiúsculas nem espaços. São obrigatórias `data`, `descricao` e
  `valor`. São opcionais `referencia`, `tipo`, `datavalor` e `saldo`; os sinónimos estão em
  `COLUNAS`.
- **Datas** em `AAAA-MM-DD` ou `DD/MM/AAAA` (também com `.` ou `-`), construídas ao **meio-dia
  local**. Isto fecha a lacuna UTC do handoff do MODEL. As células de data do XLSX (meia-noite UTC)
  passam primeiro a dia civil.
- **Dinheiro** em `Prisma.Decimal` desde o parse, nunca `number`. Aceita `1.234,56`, `1,234.56`,
  `1234.56`, `-500` e o sufixo `MT`/`MZN`, e recusa mais de 2 casas decimais. Um único `.` com 3
  dígitos a seguir é ambíguo e é recusado.
- **Natureza**: pela coluna `tipo` (D/C, DÉBITO/CRÉDITO) ou, se ela não existir, pelo sinal do
  valor: positivo é DEBITO (entrada) e negativo é CREDITO. O `valor` gravado é sempre positivo.
- **Referência** é opcional. A mesma referência **normalizada** duas vezes no mesmo ficheiro dá
  erro, porque colapsaria numa só chave e uma das linhas desapareceria.
- **CSV**: UTF-8, com recurso a Windows-1252; BOM removido; separador `;`, tab ou `,`, detectado pelo
  cabeçalho; campos entre aspas respeitados.

### Importação (RF §19, CA08)

`importarExtracto({ contaBancariaId, nomeFicheiro, conteudo: Uint8Array }, ctx)` faz, por ordem:
1. Verifica o tenant; conta alheia dá `NotFoundError`.
2. Verifica o tecto de 5 MB (`EXTRACTO_DEMASIADO_GRANDE`) e o formato
   (`FORMATO_EXTRACTO_NAO_SUPORTADO`).
3. **1.ª camada**: SHA-256 do conteúdo bruto. Se já existir, devolve `{ estado: 'JA_IMPORTADO' }` e
   não escreve nada.
4. **All-or-nothing**: qualquer linha inválida lança `ValidationError` (422) com
   `details.erros: { linha, mensagem }[]`, **todos de uma vez**. Um ficheiro ilegível dá
   `ValidationError` e não 500. Acima de 50 000 linhas, o ficheiro é recusado.
5. **2.ª camada**: `chaveIdempotenciaBanco` por linha. O ordinal conta-se **só nas linhas sem
   referência**, que são as únicas cuja chave o usa. Assim, um banco que passe a pôr referência numa
   linha não desloca as chaves das vizinhas.
6. Numa só `$transaction`: `ImportacaoExtracto`, depois `createMany({ skipDuplicates })`, depois
   `criados`/`ignorados`. Um extracto sobreposto só cria as linhas novas.
7. Corrida de dois uploads do mesmo ficheiro: quem perde no `@@unique` do hash (P2002) recebe
   `JA_IMPORTADO`.

### Projecção do razão (CA04)

`projetarMovimentosContabilisticos(contaBancariaId, ctx)` faz, por ordem:
- Verifica o tenant, e depois recusa:
  - conta inactiva, com `CONTA_BANCARIA_INATIVA`;
  - conta PGC com mais de uma conta bancária activa, com `CONTA_PGC_PARTILHADA` (decisão 1(a) do
    utilizador): a partida não diz de qual das contas é.
- Lê as partidas da conta PGC com `status ∈ FILTRO_LANCAMENTO_MAPA` (LANCADO ∪ ESTORNADO), **sem
  janela de datas**, por keyset de 1000. Os lançamentos estornados continuam projectados (ADR §Riscos
  b).
- Grava `createMany({ skipDuplicates })`, idempotente pelo `@@unique([tenantId, partidaId])`.
- `documento` = número do documento de origem, quando é do domínio de finanças: `Fatura`/
  `Recebimento` (a factura), `Pagamento`, `ContaPagar`, `NotaCredito` ou `NotaDebito`. Nos outros
  casos é `Lancamento.numero`. `referencia` = `documento`, para a passagem `REFERENCIA_EXACTA` do
  motor o casar com a referência bancária.
- `natureza` = `partida.tipo`: um débito numa conta de banco é entrada.

## Loop

| Fase | Resultado |
|---|---|
| INSPECT | Parser antigo client-side com `number` e referência obrigatória; conta PGC 121 partilhada no seed; `xlsx@0.18.5` vulnerável. Duas decisões pedidas ao utilizador: 1(a) recusar a conta partilhada, 2(b) `exceljs` |
| TEST | 95 testes verdes em `reconciliacao/` (24 deste nó). Um vermelho legítimo durante o TDD: a referência repetida só era detectada quando a primeira ocorrência estava válida; corrigido no código, não no teste |
| REVIEW | Subagente `code-reviewer`, sem o contexto do autor: 0 BLOCKER, 2 MAJOR, 2 NIT, veredicto «APROVAR» |
| FIX | MAJOR 1: duplicado de referência comparado na forma **normalizada**, com teste. MAJOR 2: conta inactiva recusada na projecção, com teste. NIT do ordinal: só linhas sem referência, com teste. NIT da zip bomb: tecto de linhas, com teste; o resto fica abaixo |
| VERIFY | `pnpm check` verde (1706 testes, 0 erros de lint, avisos inalterados em 109); `pnpm gates` verde |

## O que ficou por fazer

- **Sem Server Action e sem ecrã de upload** (nós RECONCILIATION/UI). A action deve:
  - receber `FormData` e converter o `File` em `Uint8Array`;
  - declarar a permissão `financas:banca:reconciliacao` e um `revalidate`;
  - pôr o **rate-limit** que o repositório já usa em exportações. O tecto de 5 MB é do ficheiro
    **comprimido**: um XLSX malicioso pode expandir em memória no `exceljs` antes de o tecto de
    linhas actuar. Risco baixo, porque exige sessão e permissão, mas real.
- **Não se chama o motor no fim da importação.** Quem orquestra `projetar → importar →
  executarMatching` é o RECONCILIATION.
- **Tenant demo**: o BCI e o Millennium bim partilham a conta PGC 121, por isso a projecção recusa
  os dois até cada um ter a sua subconta. Corrigir o seed é trabalho à parte, e volta a mexer na
  golden da spec 22 (ADR-0036 §2-bis).
- **Projecção completa em cada corrida**: indexada, mas percorre todas as partidas da conta. Uma
  marca de água por `createdAt` falharia com lançamentos que passam de RASCUNHO a LANCADO depois. Se
  o volume o pedir, marcar a partida projectada.
- `src/lib/extrato-csv.ts` (antigo, client-side) fica intacto até ao `DROP` do RECONCILIATION.
- **Rollback real** da transacção da importação: só com Postgres (Testcontainers), como no
  MATCHING.

## O que o nó seguinte assume

- `MovimentoBancario` chega com `referenciaNormalizada` preenchida, `valor > 0`, `dataMovimento` ao
  meio-dia do dia civil, `origem` = formato e `importacaoId` = lote.
- `MovimentoContabilistico` chega com `documento`/`referencia` = número do documento (ou do
  lançamento), `dataContabilistica` = `Lancamento.data` e `estado = PENDENTE`.
- Reimportar e reprojectar são sempre seguros: nada duplica e nada se apaga.
- Erros de importação chegam como `ValidationError` com `details.erros` por linha; a UI deve
  mostrá-los todos.
