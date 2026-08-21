# ADR-0016 — Protecção anti-abuso do registo público

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0014](./ADR-0014-cache-e-rate-limit-distribuido.md), [ADR-0013](./ADR-0013-migracao-identidade.md), [ADR-0008](./ADR-0008-analytics-privacy-first.md)
- **Skills**: `engineering:architecture`, `api-conventions`

## Contexto

O registo público é a **única superfície não autenticada com custo real por pedido**. Cada submissão
válida cria uma organização no Keycloak, um tenant em Postgres com plano de contas semeado, e envia
um e-mail. Um atacante com um guião simples pode encher a base de dados de tenants fantasma, queimar
a quota de envio de e-mail e sujar a reputação do domínio remetente.

O estado real do código é melhor do que o documento de arquitectura sugeria, e importa registá-lo com
precisão porque muda o âmbito do trabalho:

**Já existe.** `src/server/security/captcha.ts` verifica o *token* do lado do servidor, suporta
**Turnstile e hCaptcha**, e é chamado em `/api/publico/registo` **depois** do Zod — de propósito, para
não gastar uma chamada ao fornecedor com um corpo inválido. `src/lib/validations/onboarding.ts` já
exige `min(1)`. E `CAPTCHA_PROVIDER=none` em produção **recusa o registo e regista erro** — já falha
fechado.

**Não existe.** O `CAPTCHA_PROVIDER` é `none` por omissão e nunca foi mudado; não há chaves de
fornecedor; e **o site não tem o widget**. O `captchaToken ?? ""` que o documento de arquitectura cita
está em `apps/site/src/lib/validations.ts`, o lado que **envia** — não no ERP, que valida.

Ou seja: a verificação está construída e desligada. O que falta é escolher fornecedor, obter chaves,
montar o widget no site, e ligar o interruptor.

Há uma restrição própria deste produto: o [ADR-0008](./ADR-0008-analytics-privacy-first.md) fixou
uma postura de análise respeitadora da privacidade, sem rastreio de terceiros. Colar um verificador
que perfila o visitante através de toda a Internet contradiz essa postura no primeiro ecrã que um
prospect vê.

## Decisão

**Defesa em profundidade em quatro camadas, com Cloudflare Turnstile como verificador.**

### Camada 1 — Campo-armadilha (existente, mantido)

Custo zero, apanha guiões triviais. Mantém-se sem alteração.

### Camada 2 — Limitação de tráfego distribuída (ADR-0014)

Três registos por hora e por IP; três por hora e por domínio de e-mail. Esta superfície é a única que
**falha fechada** se o Valkey estiver inacessível, por ser a única não autenticada e com custo real.

### Camada 3 — Cloudflare Turnstile

**Fixa-se `CAPTCHA_PROVIDER=turnstile`** — o módulo já suporta os dois; esta decisão escolhe qual.

O trabalho que resta é do lado do site: montar o *widget* em `apps/site`, fazer o `captchaToken`
viajar preenchido, e tornar o campo obrigatório também na validação do site (hoje `?? ""`). Do lado do
ERP não há código a escrever — há chaves a fornecer.

O segredo do fornecedor vive no Secrets Manager. A CSP ganha o domínio do Turnstile em `script-src`
e `frame-src` — e é preciso confirmar que a directiva com *nonce* por pedido continua a funcionar,
porque é exactamente o tipo de detalhe que só aparece no *smoke* em produção.

### Camada 4 — Verificação de e-mail antes de provisionar valor

Já é o comportamento actual e mantém-se como última linha: um tenant cujo e-mail nunca é verificado
não passa de um registo inerte. Acrescenta-se uma tarefa de expurgo de registos não verificados ao
fim de sete dias, para o custo do abuso residual não se acumular indefinidamente.

### Modo degradado

Se a API do Turnstile estiver inacessível, o registo **continua a aceitar**, com o evento registado e
alerta disparado. Um verificador em baixa não pode fechar o funil comercial do produto — as camadas 2
e 4 continuam de pé, e o custo de alguns registos falsos é menor do que o de perder clientes reais
durante uma indisponibilidade de terceiros.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Cloudflare Turnstile** ✅ | Gratuito sem limite prático; sem interacção na maioria dos casos; não perfila o visitante nem usa cookies de rastreio — coerente com o ADR-0008; **já suportado pelo `captcha.ts`** | Dependência de um terceiro no funil de aquisição; exige alteração à CSP |
| hCaptcha | Postura de privacidade semelhante; escalão gratuito; **também já suportado pelo `captcha.ts`** | Desafios visuais mais frequentes, com atrito real na conversão; o modelo de negócio assenta em trabalho de anotação do utilizador |
| Google reCAPTCHA v3 | Detecção madura e amplamente testada | Perfila o visitante através de toda a rede Google e usa cookies de rastreio — contradiz frontalmente o ADR-0008 |
| Prova de trabalho no cliente (Altcha, mCaptcha) | Sem terceiros; sem dados a sair do domínio; auto-alojável | Encarece o atacante linearmente, não exponencialmente; uma *botnet* passa. Penaliza dispositivos lentos, e o mercado-alvo tem telemóveis modestos |
| Só limitação de tráfego, sem verificador | Zero dependências novas; nada a integrar | Limite por IP é contornado por proxies rotativos. É a solução que temos hoje e que o documento de arquitectura classifica como insuficiente |
| Exigir cartão de crédito no registo | Elimina abuso por completo | Mata o teste sem cartão que é a proposta de valor do funil da spec 19 |

Racional: o Turnstile é a única opção que satisfaz simultaneamente as três restrições reais — atrito
mínimo num funil de aquisição que ainda não converte nada, coerência com a postura de privacidade já
decidida, e custo zero num produto pré-receita. A prova de trabalho é a alternativa filosoficamente
mais atraente por não envolver terceiros, mas não resolve o modelo de ameaça que interessa: o custo
para uma *botnet* distribuída é marginal.

## Consequências

- **Uma dependência de terceiro entra no caminho de aquisição.** É mitigada pelo modo degradado, mas
  passa a ser algo a monitorizar — a taxa de falha da verificação é uma métrica com alerta (ADR-0019).
- **A CSP fica mais permissiva** para acomodar o *widget*. A alteração deve ser feita **antes** de
  passar a política para modo estrito, e verificada com *smoke* real — não por inspecção.
- **O `captchaToken` deixa de ser opcional no site.** O ERP já o exige (`min(1)` em
  `src/lib/validations/onboarding.ts`); é `apps/site/src/lib/validations.ts` que o deixa passar vazio.
  É esse o ficheiro a corrigir, e é esse o teste a actualizar.
- **Nova tarefa agendada** de expurgo de registos não verificados com mais de sete dias, através de
  `withApi` como as restantes — e, ao contrário da tarefa actual, **passando** pelo pipeline, o que
  corrige um dos seis achados menores da revisão da spec 19.
- **Métrica de conversão**: percentagem de registos bloqueados por cada camada. Sem ela não se sabe se
  o verificador está a proteger ou a matar a conversão — e a resposta a essa pergunta muda a decisão.
- **Interacção com o Keycloak**: o registo continua a ser um endpoint próprio do ERP e **não** migra
  para as páginas de registo do Keycloak, porque cria um tenant e semeia um plano de contas — trabalho
  de domínio que não pertence ao fornecedor de identidade. O Turnstile protege o nosso endpoint; a
  política de força bruta do Keycloak protege o login. São camadas independentes e complementares.
