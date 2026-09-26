# Intent: Ecrã de Criação de Séries de Documentos (#149)

- **Issue**: [#149](https://github.com/fxavier/gespro-frontend/issues/149) — [faturação] Sem ecrã para criar séries de documento
- **Data**: 2026-09-26 · **Gravidade**: M · **Estado**: intenção fixada. Os tickets vêm a seguir.

## Problem

A Server Action `criarSerieDocumento` (`apps/erp/src/server/actions/faturacao.actions.ts`) existe e está
protegida por `faturacao:series:escrita`, mas **nenhum ecrã a chama**. Hoje as séries só nascem em dois
sítios: no bootstrap do tenant e na abertura de exercício, feita pelo cron (`bootstrapSeriesDocumento`,
com os 20 tipos e o formato fixo).

Quando falta uma série, a emissão pára com `SERIE_NAO_ENCONTRADA` e a mensagem manda «criar a série»,
coisa que o utilizador não tem por onde fazer. O mesmo vale para trocar de prefixo ou continuar a
numeração de outro sistema.

Ligar a action como está exporia defeitos que o backend não trava:

1. **Sequestro silencioso da numeração.** `proximoNumeroSerie` escolhe a série activa **mais recente**
   (`ORDER BY "createdAt" DESC`) para o par tipo+ano. Criar uma segunda série de FATURA em 2026 desvia
   de imediato toda a emissão para ela, sem que ninguém o tenha decidido.
2. **Formato livre.** Um `formatoNumero` sem `{numero}` numera todos os documentos com o mesmo valor. A
   segunda emissão rebenta no `@@unique([tenantId, numero])`.
3. **Duplicado.** Uma série repetida (mesmo tipo, ano e prefixo) viola
   `@@unique([tenantId, tipo, ano, prefixo])`, o P2002 não é traduzido e o utilizador vê «Erro interno».
4. **Sem auditoria.** `SerieDocumento` não está no trilho de auditoria.
5. **Sem ciclo de vida.** O campo `ativo` existe, mas não há action para editar, desactivar ou eliminar.

## Proposed Outcomes

### Onde fica

- Listagem em `/faturacao/series` e criação em `/faturacao/series/nova`. A edição fica em
  `/faturacao/series/[id]/editar`. São rotas dedicadas, sem modais; o `AlertDialog` fica só para as
  confirmações.
- A barra lateral ganha uma entrada «Séries» no grupo Faturação.
- **Não** vai para `/definicoes`: `/definicoes/faturacao` já é a Subscrição SaaS.

### Âmbito

Só os **6 tipos de faturação** do `TipoSerieDocumentoEnum`: FATURA, NOTA_CREDITO, NOTA_DEBITO, PROFORMA,
COTACAO_COMERCIAL e RECIBO. Os tipos operacionais (vendas, compras, caixa, stock, transporte) continuam a
ser criados só pelo bootstrap e pelo cron, e o ecrã não os mostra.

### Formulário de criação

| Campo | Regra |
|---|---|
| Tipo | `Select` com os 6 tipos e rótulos em pt-PT |
| Prefixo | 1–10 caracteres, guardado em maiúsculas |
| Ano | Só o **ano corrente e o seguinte**, contados em `Africa/Maputo` |
| Número inicial | Inteiro ≥ 1, por omissão 1. Serve para continuar a numeração de outro sistema |
| Formato | **Fixo** (`{prefixo}/{ano}/{numero:06}`) e **não editável**. O formulário mostra a pré-visualização (`FAT/2026/000488`) |

### Regras de negócio

Todas vivem no serviço, com códigos estáveis em `BusinessRuleError`.

- **Uma só série activa por tipo+ano.** Criar ou reactivar uma série quando já existe outra activa do
  mesmo tipo e ano é **recusado**. Para trocar, desactiva-se primeiro a actual. A verificação corre na
  transacção, com tranca, para que duas criações em simultâneo não passem ambas.
- **Duplicado** (tipo+ano+prefixo) → erro de negócio legível, nunca «Erro interno».
- **«Série usada»**: `proximoNumero > numeroInicial`, com a coluna nova `numeroInicial` (ver Constraints).
  - Enquanto a série **não** foi usada, podem editar-se o **prefixo** e o **número inicial**, e a série
    pode ser **eliminada**.
  - Depois do primeiro documento, a série fica só de leitura e o único ciclo de vida é activar ou
    desactivar.
- **Desactivar / reactivar** pedem confirmação num `AlertDialog`. Desactivar a única série activa do tipo
  no ano corrente **é permitido**, mas o texto de confirmação avisa: «Deixa de ser possível emitir
  <tipo> em <ano> até activar outra série.»
- Todas as escritas ficam no trilho de auditoria.

### Listagem

- Tabela (`DataTable`) com as colunas tipo, prefixo, ano, próximo número (pré-visualizado no formato),
  estado Activa/Inactiva (`StatusBadge`, com o estado registado no mapa único) e documentos emitidos.
- Filtros por tipo, ano e estado (`FilterBar`); por omissão, o ano corrente.
- As acções por linha (editar, desactivar/reactivar, eliminar) aparecem só quando a regra as permite.

### Segurança

- **A listagem** exige `faturacao:leitura`.
- **Sem `faturacao:series:escrita`** (GESTOR, LEITURA, OPERADOR):
  - a lista continua visível, sem os botões «Nova série» e sem acções por linha;
  - as rotas `nova` e `[id]/editar` mostram «Sem permissão»;
  - as actions recusam sempre no servidor.
- **Hoje têm a permissão** o ADMIN e o FINANCEIRO. O GESTOR está excluído de propósito e continua.

## Affected Users

- **FINANCEIRO e ADMIN**: criam e gerem séries, por exemplo para arrancar com um prefixo novo ou continuar
  a numeração de um sistema anterior.
- **Quem emite documentos** (facturas, NC, ND, proformas, cotações): deixa de ficar parado em
  `SERIE_NAO_ENCONTRADA` sem saída na UI.
- **GESTOR e LEITURA**: consultam as séries e o próximo número, sem as alterar.
- **Contabilista / AT**: a sequência sem lacunas por série e por ano passa a estar protegida contra o
  desvio silencioso para outra série.

## Constraints

- **Numeração fiscal sem lacunas.** Não se muda a mecânica atómica de `proximoNumeroSerie`
  (`UPDATE … RETURNING` com `FOR UPDATE`). O número inicial só é editável antes do primeiro documento, o
  que garante que nunca se reescreve uma sequência já emitida.
- **Migração aditiva** (é o orquestrador que a faz, com `migrate diff` não-interactivo e sem
  `migrate dev`): coluna `numeroInicial Int @default(1)` em `SerieDocumento`, com backfill a 1 nas linhas
  existentes.
  - Pode ainda levar um índice único parcial `(tenantId, tipo, ano) WHERE ativo`, em SQL escrito à mão,
    como rede de segurança para a regra de uma só activa.
  - Verificado a 2026-09-26: na base local não existem séries activas duplicadas por tipo+ano.
- **Zod**:
  - o `CriarSerieDocumentoSchema` perde o `formatoNumero` e ganha o `numeroInicial`;
  - o `ano` fica restrito ao ano corrente e ao seguinte;
  - o mesmo schema serve o `zodResolver` e a action.
- **Convenções da casa**:
  - `page.tsx` é Server Component;
  - colunas com `render` ficam num módulo `'use client'`;
  - as datas passam por `format-date.ts`;
  - `tenantId` vem sempre do contexto, e um pedido cross-tenant devolve 404;
  - as actions de leitura declaram `permiteEmLeitura: true`;
  - o `revalidate` cobre `series`.
- **Auditoria**: `SerieDocumento` entra em `AUDIT_MODELS`, e as escritas usam operações singulares, que
  são as únicas que a `audit-extension` vê.
- **Sem mudanças no bootstrap nem no cron.** Continuam a criar os 20 tipos com
  `createMany … skipDuplicates`. A regra de uma só activa aplica-se às escritas feitas pela UI.
- UI em pt-PT, com tokens e tema escuro.

## Open Questions

1. **RECIBO sem consumidor.** Existe série de RECIBO no bootstrap, mas nenhum serviço chama
   `proximoNumeroSerie('RECIBO')`. Mostra-se no ecrã uma série que nunca numera nada, ou o RECIBO fica
   fora até existir emissão de recibos?
2. **Elegibilidade na emissão.** Os selectores de série dos formulários de emissão (`listarSeriesParaSelecao`)
   filtram só por `ativo`, e não pelo ano da data do documento. Com uma só activa por tipo+ano, alinha-se
   o selector com o ano de `dataEmissao`? Está fora do âmbito, mas é adjacente.
3. **Anos anteriores.** Um documento retroactivo de um ano sem série (por exemplo, uma série desactivada
   por engano em 2025) não tem saída se o formulário só aceitar o ano corrente e o seguinte. Basta
   reactivar a série antiga, ou é preciso abrir anos com exercício contabilístico ainda aberto (ADR-0033)?
4. **Coluna «documentos emitidos».** Mostra-se `proximoNumero − numeroInicial`, que é o que a sequência
   diz, ou a contagem real das relações? A contagem real não existe para o RECIBO.
5. **Criação em lote para o ano seguinte.** O cron de 1/12 já cria as séries do ano seguinte. Vale a pena
   um botão «Criar séries de <ano+1>», que chame `bootstrapSeriesDocumento`, para quando o cron não correu?
   Como não há agendador em produção (ADR-0026 §5), talvez seja o único caminho.
