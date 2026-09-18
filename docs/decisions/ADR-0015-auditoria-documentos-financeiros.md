# ADR-0015 — Trilho de auditoria dos documentos financeiros

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0011](./ADR-0011-fronteira-autorizacao.md) (correlação de identidade), [ADR-0004](./0004-gate-wave2-e-plano-wave3.md)
- **Skills**: `engineering:architecture`, `prisma-conventions`, `fiscalidade-mz`

## Contexto

`src/server/db/audit-extension.ts` implementa uma extensão do Prisma que regista mutações em
`AuditLog`, com dois modos: **síncrono dentro da transacção** para entidades críticas, e assíncrono
para as restantes. O desenho está correcto e testado.

O que está registado é isto:

```ts
export const AUDIT_MODELS = new Set<string>([
  'User', 'Role', 'Permission', 'UserRole', 'RolePermission',
]);

export const CRITICAL_ENTITIES = new Set<string>([
  // Serão adicionados na Wave 2: 'LancamentoContabil', 'Fatura', 'MovimentoCaixa'
  'User', 'Role',
]);
```

O comentário está no código desde a Wave 0. A Wave 2 aconteceu. Os modelos nunca foram acrescentados,
e nenhum dos gates o detectou — porque não há gate que detecte uma intenção escrita num comentário.

O resultado é que o GestPro tem contabilidade de partida dobrada sobre o PGC-NIRF, emite documentos
fiscais com numeração sequencial garantida, trata dinheiro em `Decimal` e mantém os documentos
*append-only* — **e não regista quem fez o quê a nenhum deles**. Quem emitiu esta factura, quem a
anulou, quem lançou este movimento de caixa, quem alterou esta configuração fiscal: nada disso é
recuperável.

Numa inspecção fiscal ou num litígio com um cliente, esta é a primeira pergunta que se faz. É também
a mais barata de resolver de toda a lista de dívida — dois a três dias, contra uma exposição
desproporcionada.

## Decisão

**Estender a auditoria aos documentos financeiros e às configurações que os governam, com escrita
síncrona e transaccional para tudo o que é dinheiro.**

### 1. Modelos auditados

| Grupo | Modelos | Modo |
|---|---|---|
| **Documentos fiscais** | `Fatura`, `LinhaFatura`, `NotaCredito`, `LinhaNotaCredito`, `NotaDebito`, `LinhaNotaDebito`, `Proforma`, `LinhaProforma`, `CotacaoComercial`, `LinhaCotacaoComercial` | Síncrono |
| **Contabilidade** | `Lancamento`, `PartidaLancamento`, `ContaPGC`, `Diario`, `CentroCusto` | Síncrono |
| **Tesouraria** | `SessaoCaixa`, `MovimentoCaixa`, `ContaBancaria`, `ReconciliacaoBancaria`, `ItemReconciliacaoBancaria` | Síncrono |
| **Numeração fiscal** | `SerieDocumento` | Síncrono |
| **Configuração fiscal** | `ConfiguracaoFiscal`, `TabelaINSS`, `EscalaoIRPS` | Síncrono |
| **Remuneração** | `FolhaPagamento`, `LinhaPayroll`, `Payroll` | Síncrono |
| **Acesso** (já existente) | `User`, `Role`, `Permission`, `UserRole`, `RolePermission` | Síncrono |
| **Movimento de stock** | `MovimentoStock`, `SaldoStock` | **Assíncrono** |

Tudo o que toca em dinheiro é **síncrono, na mesma transacção da mutação**. Se a auditoria falhar, a
operação falha. É a escolha deliberadamente conservadora: um lançamento contabilístico sem trilho vale
menos do que um lançamento que não aconteceu.

O movimento de stock fica assíncrono porque tem volume uma ordem de grandeza superior — cada linha de
venda gera um movimento — e a rastreabilidade já existe no próprio modelo, que é *append-only* e
guarda `userId`. Auditar sincronamente duplicaria escritas no caminho crítico do POS sem acrescentar
informação.

### 2. Anti-regressão: um gate, não um comentário

O que falhou aqui não foi a decisão — foi não haver nada a verificá-la. Acrescenta-se
`scripts/gate-auditoria.mjs`, quarto gate de arquitectura:

> Todo o modelo que represente um documento ou um movimento monetário tem de constar de
> `AUDIT_MODELS`. Um modelo novo que caia nesse critério e não esteja registado **falha o merge**.

O âmbito do gate **não é só `financas.prisma`** — a lista do ponto 1 atravessa quatro schemas:
`financas.prisma` (documentos, contabilidade, tesouraria, séries), `plataforma.prisma`
(`ConfiguracaoFiscal`), `pessoas-projetos.prisma` (`TabelaINSS`, `EscalaoIRPS`, `FolhaPagamento`,
`LinhaPayroll`, `Payroll`) e `inventario.prisma` (`MovimentoStock`, `SaldoStock`). O gate percorre os
quatro; restringi-lo a um deixaria metade da lista sem protecção.

A lista de exclusões vive no próprio gate, com justificação escrita por linha. Passa a ser preciso
argumentar por escrito para *não* auditar, em vez de bastar esquecer para não auditar.

### 3. Conteúdo do registo

O modelo real em `auth.prisma` é este — e os nomes são em inglês, ao contrário do resto do domínio:

```prisma
model AuditLog {
  id String; tenantId String; userId String?
  action String; entity String; entityId String?
  data Json?; ip String?; createdAt DateTime
  @@index([tenantId, createdAt])
  @@index([tenantId, entity, entityId])
}
```

Mantém-se a forma e acrescentam-se **duas colunas**:

- `requestId String?` — do `AsyncLocalStorage` de observabilidade; correlaciona com o registo estruturado.
- `keycloakSub String?` — do autor (ADR-0011); correlaciona com o trilho de autenticação do Keycloak.

O **diferencial** — estado anterior e posterior dos campos alterados — vai no campo `data Json?` que
já existe, com **redacção** pelo mesmo mecanismo do logger. Nenhum segredo ou dado pessoal sensível
entra no trilho.

### 4. Retenção

**Dez anos** para o grupo fiscal e contabilístico, alinhado com o prazo de conservação de documentos
contabilísticos em Moçambique. Dois anos para acesso e stock. Sem apagamento automático nesta fase:
a política é escrita e a tarefa de expurgo fica registada como trabalho futuro, quando o volume o
justificar. Apagar por engano um trilho fiscal é pior do que pagar armazenamento a mais.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Extensão Prisma, síncrona para dinheiro** ✅ | Reutiliza infraestrutura já escrita e testada; captura toda a escrita independentemente do serviço que a origina; atomicidade real | Custo de escrita no caminho crítico; a extensão vê o modelo, não a intenção de negócio |
| Tudo assíncrono | Sem custo no caminho crítico | Uma falha de auditoria passa despercebida — e é precisamente nos documentos fiscais que isso não é aceitável |
| Auditoria explícita nos serviços | Regista a intenção de negócio («anulou factura por erro de NUIT»), não só a mutação | 51 serviços a alterar; qualquer esquecimento é um buraco silencioso. É o modo de falha que já aconteceu |
| Triggers no PostgreSQL | Impossível de contornar, mesmo por acesso directo à base de dados | Lógica fora do TypeScript, invisível ao `tsc` e ao code review; migrações mais complexas; perde `requestId` e contexto aplicacional |
| Captura de dados de alteração (CDC) para armazenamento externo | Zero impacto no caminho crítico; retenção barata | Infraestrutura desproporcionada para o volume actual; consistência eventual num trilho que se quer transaccional |

Racional: escolhemos a extensão porque **já existe e funciona** — o defeito nunca foi o mecanismo, foi
o conjunto de modelos. Rejeitámos a auditoria explícita nos serviços apesar de capturar melhor a
intenção: exigiria tocar em 51 serviços e o modo de falha é o esquecimento silencioso, que é
exactamente o que nos trouxe aqui. Onde a intenção importar de facto — anulação de factura, estorno de
lançamento — o serviço acrescenta um motivo estruturado que a extensão inclui no registo.

## Consequências

- **Escrita adicional por mutação financeira**, dentro da transacção. Em contexto de PME o impacto é
  desprezável, mas passa a fazer parte do que o teste de carga do ADR-0018 mede — a emissão de factura
  e o fecho de caixa são dois dos cenários obrigatórios.
- **`AuditLog` cresce depressa e passa a ser das maiores tabelas do sistema.** Já tem
  `@@index([tenantId, createdAt])` e `@@index([tenantId, entity, entityId])`; o segundo é **estendido**
  com `createdAt` em vez de se criar um índice novo que o duplicaria em parte. Entra na revisão de
  planos de consulta do ADR-0018.
- **Interface de consulta do trilho** na área de definições, restrita ao papel de administrador e ao
  de leitura/auditoria, com exportação para CSV pela via já existente (`withApi`). Sem isto o trilho
  existe mas não serve para nada numa inspecção.
- **O gate é a parte que impede a repetição.** Sem ele, o próximo domínio financeiro nasce sem
  auditoria pela mesma razão que este nasceu — ninguém se lembrou.
- **Correlação de ponta a ponta**: um evento de autenticação no Keycloak, uma linha de registo
  estruturado e um registo de auditoria passam a ser ligáveis pelo `keycloakSub` e pelo `requestId`.
  É o que torna uma investigação viável.
- **A imutabilidade do trilho não é resolvida aqui.** `AuditLog` é *append-only* por convenção
  aplicacional, mas quem tenha acesso de escrita à base de dados pode alterá-lo. Encadeamento por
  resumo criptográfico ou escrita para armazenamento imutável fica registado como evolução, a decidir
  quando houver requisito de conformidade que o exija.
