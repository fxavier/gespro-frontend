# ADR-0021 — Fiscalidade moçambicana da subscrição SaaS

- **Estado**: Proposto — **requer validação externa antes de aceite**
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Completa**: [ADR-0009](./ADR-0009-moeda-faturacao-saas.md), cujo principal risco em aberto era exactamente este
- **Skills**: `engineering:architecture`, `fiscalidade-mz`

## Contexto

O [ADR-0009](./ADR-0009-moeda-faturacao-saas.md) fixou a cobrança da subscrição em USD através do
Stripe, separou o livro da plataforma do livro do tenant, e terminou com esta frase:

> Implicações fiscais (IVA/retenção sobre serviço prestado do estrangeiro, faturação da própria
> GestPro ao cliente moçambicano) ficam por validar com a skill `fiscalidade-mz` **antes de
> produção** — é o principal risco em aberto desta decisão.

Continua por validar. O documento de arquitectura classifica-o como um dos três bloqueadores que
impedem cobrar o primeiro cliente.

O problema é real e tem três faces que a engenharia não pode resolver sozinha:

1. **Que entidade legal fatura?** Uma sociedade moçambicana ou uma entidade estrangeira? A resposta
   muda tudo o resto — obrigação de IVA, retenção na fonte, e se a factura da GestPro é ou não
   dedutível para o cliente.
2. **Retenção na fonte.** Se a entidade que factura for estrangeira e o cliente moçambicano, pode
   haver obrigação de retenção sobre serviços prestados por não residente. O cliente que retém recebe
   menos do que o Stripe cobrou — e a subscrição fica com saldo em falta que ninguém sabe explicar.
3. **A factura que o cliente precisa.** Uma empresa moçambicana precisa de um documento com o seu NUIT
   para deduzir o custo. O recibo do Stripe pode não servir para efeitos contabilísticos locais.

Nenhuma destas perguntas se responde a ler código. Todas bloqueiam receita.

## Decisão

**Este ADR fixa o que a engenharia constrói de forma a suportar qualquer dos desfechos possíveis, e
identifica explicitamente o que tem de ser decidido fora da engenharia.**

### 1. O que fica decidido agora (engenharia)

1. **A `Assinatura` continua sem colunas de dinheiro.** A decisão 3 do ADR-0009 mantém-se e é
   reforçada: o Stripe é a fonte de verdade do valor cobrado. Nenhum desfecho fiscal a altera.

2. **Novo modelo `DocumentoSubscricao`** no *schema* de plataforma, para o documento fiscal que a
   GestPro emite ao cliente — distinto do recibo do Stripe. Campos: `tenantId`, `stripeInvoiceId`,
   `numero` (série própria, através de `proximoNumeroSerie`), `nuitCliente`, `moeda`, `regimeIva`,
   `retencaoAplicada`, `storageKey` do PDF. **Não** entra no livro-razão do tenant, coerentemente com
   o ADR-0009.

3. **Campos fiscais no perfil do tenant** recolhidos no registo: NUIT (já validado pelo validador
   existente), morada fiscal e regime de IVA. São necessários em qualquer desfecho, e recolhê-los
   depois de o cliente já estar a usar o produto é atrito desnecessário.

4. **O tratamento fiscal é configuração, não código.** Um módulo `src/lib/fiscalidade-saas.ts`
   parametriza regime de IVA aplicável, taxa, e se há retenção — de forma a que a decisão externa,
   quando chegar, seja uma alteração de configuração e um teste, e não uma reescrita do módulo de
   facturação.

5. **Nada disto entra no PGC-NIRF do tenant.** A subscrição é uma despesa que o cliente lança na sua
   contabilidade como qualquer outra; a GestPro não a lança por ele.

### 2. O que tem de ser decidido fora da engenharia

| Questão | Quem decide | Bloqueia |
|---|---|---|
| Entidade legal que factura (moçambicana ou estrangeira) | Direcção, com assessoria jurídica | Tudo o resto |
| Regime de IVA aplicável e obrigação de registo | Contabilista certificado em MZ | Emissão do documento |
| Retenção na fonte sobre serviço de não residente | Contabilista certificado em MZ | Reconciliação de pagamentos |
| Requisitos formais do documento para dedução pelo cliente | Contabilista certificado em MZ | Formato do PDF |
| Preço final: USD com IVA incluído ou acrescido | Direcção | Catálogo de planos e site |

### 3. Regra de bloqueio

**Não se cobra o primeiro cliente antes de as cinco questões acima terem resposta escrita.** A
implementação técnica pode e deve avançar em paralelo — os modelos, os campos e o módulo de
parametrização não dependem do desfecho. Não se abre é a cobrança.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Construir parametrizável, bloquear cobrança até haver parecer** ✅ | Desbloqueia todo o trabalho técnico; a decisão externa passa a ser configuração; nenhum risco fiscal assumido | Exige disciplina para não cobrar «só a um cliente para testar» |
| Avançar e resolver depois | Receita mais cedo | Regularizar facturação emitida sob regime errado é caro e expõe a empresa. Numa empresa que vende software de contabilidade, é também um problema de credibilidade |
| Adiar toda a implementação até haver parecer | Zero retrabalho | Bloqueia trabalho técnico que não depende do desfecho; a assessoria pode demorar semanas |
| Facturar só através do Stripe, sem documento próprio | Nada a construir | O recibo do Stripe pode não servir ao cliente moçambicano para deduzir o custo — atrito de venda directo |
| Mudar para agregador de pagamento local em MZN | Resolve moeda e fiscalidade de uma vez | Contrato de integração inteiro por construir; o ADR-0009 colocou-o fora do MVP e nada mudou |

## Consequências

- **A engenharia deixa de estar bloqueada.** O trabalho técnico avança; o que fica em espera é
  exclusivamente a decisão externa e a activação da cobrança.
- **O registo passa a pedir NUIT e morada fiscal**, o que acrescenta atrito ao funil. É atrito
  justificado: são dados que serão precisos em qualquer desfecho, e um cliente empresarial não se
  surpreende com o pedido.
- **Uma nova série de documento** para as facturas da plataforma, distinta das séries do tenant.
  Reutiliza `proximoNumeroSerie` e herda a garantia de ausência de lacunas.
- **Prazo realista**: obter parecer de contabilista certificado é da ordem de semanas, não de dias.
  Deve arrancar **no início da fase 1** da recomendação, em paralelo com o trabalho de infraestrutura,
  e não quando tudo o resto estiver pronto.
- **Este ADR só passa a Aceite quando o parecer existir.** Nessa altura, ou se confirma o que aqui
  está, ou se regista um ADR que o substitua. Enquanto estiver Proposto, a cobrança está fechada.
- **Risco residual**: se o parecer determinar que a facturação em USD por entidade estrangeira é
  inviável no mercado-alvo, o caminho é o agregador local em MZN, que o ADR-0009 já identificou. Seria
  uma decisão de produto com custo de integração significativo — razão adicional para obter o parecer
  cedo, e não depois de ter clientes.
