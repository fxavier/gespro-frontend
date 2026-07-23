# Consumo do contrato de provisionamento — lado do site (spec 18)

Complemento de `docs/handoff/site-provisionamento.md`, que é **o contrato** e pertence ao
spec 19. Este documento descreve apenas **como o site o consome** — se os dois divergirem,
prevalece o do spec 19 e é este que se corrige.

## Onde vive cada peça

| Responsabilidade | Ficheiro |
|---|---|
| URLs dos endpoints e do callback | `apps/site/src/lib/env.ts` |
| Cliente do catálogo + schema Zod + fallback | `apps/site/src/lib/planos.ts` |
| Cliente de `POST /registo` | `apps/site/src/lib/registo.ts` |
| Tradução formulário → payload do contrato | `apps/site/src/lib/validations.ts` (`paraPayloadRegisto`) |
| Server Action do formulário | `apps/site/src/actions/registo.ts` |
| UI do formulário | `apps/site/src/components/marketing/formulario-registo.tsx` |
| Página do CTA | `apps/site/src/app/[locale]/(marketing)/comecar/page.tsx` |

Nenhum componente conhece URLs ou o formato do payload: tudo passa por estes quatro módulos de
`lib/`. Uma mudança de contrato é um edit localizado, não uma caça pelo código da UI.

## `GET /api/publico/planos`

- Chamado **server-side** com `next: { revalidate: 300, tags: ["planos"] }` — ISR: uma mudança de
  preço propaga em 5 minutos sem rebuild do site.
- Resposta validada com Zod. `precoMensal.valor` aceita **string ou número**: o contrato diz
  `number`, mas um `Decimal` do Prisma serializa como string e a diferença não deve partir a
  página de preços. É normalizado para string internamente.
- **Nunca lança.** Rede em baixo, 5xx ou payload fora do contrato → devolve o catálogo de
  demonstração com `origem: "demonstracao"`, e `/precos` mostra um aviso visível de que os
  valores são indicativos. Uma página de preços em branco é pior do que uma assinalada.
- O catálogo de demonstração vive só em `lib/planos.ts` e **nunca** é importado por componentes.
  Verificado por `src/lib/__tests__/mensagens.test.ts` (nenhum valor monetário em
  `messages/pt.json`) e pelo teste de degradação em `__tests__/planos.test.ts`.

**TODO(spec 19):** remover `PLANOS_DEMONSTRACAO` quando o endpoint existir em todos os ambientes.

## `POST /api/publico/registo`

- Chamado do **servidor do site** (Server Action), não do browser. Duas consequências:
  1. não há chamada cross-origin, pelo que o fluxo funciona mesmo antes de a origem do site estar
     em `ALLOWED_ORIGINS` — o que **não** dispensa a allowlist para chamadas futuras feitas a
     partir do browser;
  2. o rate-limit do spec 19, se for por IP, vê o IP do site. O site reencaminha o IP real em
     `X-Forwarded-For` e aplica também um limite próprio (5 tentativas / 10 min por cliente).
- `Idempotency-Key` gerado **uma vez por instância do formulário**, no evento de submissão
  (não no render, que tem de ser puro). Uma segunda tentativa após timeout envia a mesma chave —
  o spec 19 reconhece o pedido repetido em vez de criar uma segunda empresa.
- Em 201, o site lê **apenas** `handoffToken` e navega para
  `${APP_URL}/auth/registo-callback?token=<token>`. O token é opaco: não é descodificado, não é
  guardado, não é registado no log.
- Em 4xx/5xx: o corpo do backend **nunca** chega à UI. Guarda-se o `traceId` (opaco) para
  correlação de suporte e mostra-se uma mensagem PT-PT do catálogo. Timeout de 15 s.
- Falha de rede/endpoint inexistente tem mensagem própria (`comecar.erros.indisponivel`), que
  encaminha o utilizador para o formulário de contacto em vez de o deixar num beco.

### Divergências conhecidas face ao contrato

1. **`captchaToken` é enviado vazio.** O contrato prevê o campo, mas o provedor (hCaptcha ou
   Turnstile) ainda não foi fixado pelo spec 19 e a chave pública teria de vir de lá. O campo
   existe em `paraPayloadRegisto(dados, captchaToken?)` — ligar é passar o argumento. Enquanto
   não existir, a defesa é: campo-armadilha no formulário (submissões de robô devolvem sucesso
   silencioso sem chamar o endpoint), rate-limit do site e rate-limit do spec 19.
2. **Verificação de email** — a página pós-registo é do ERP (`/auth/registo-callback`); o site
   não mostra copy sobre confirmação de email porque nunca chega a essa etapa. Se o spec 19
   preferir que o site avise antes do redireccionamento, é uma linha em `messages/pt.json`.

## O que o spec 19 tem de garantir antes do deploy conjunto

- `GET /api/publico/planos` e `POST /api/publico/registo` em `PUBLIC_PATHS` do `middleware.ts`
  do ERP (senão devolvem 307 → `/auth/login` e o site cai sempre no catálogo de demonstração).
- Origem do site (produção **e** staging) em `ALLOWED_ORIGINS`.
- `${APP_URL}/auth/registo-callback` a aceitar `?token=` e a lidar com token expirado/reutilizado
  com uma mensagem própria — o site já não tem contexto nesse ponto.

## Variáveis de ambiente do lado do site

| Chave | Omissão | Efeito |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Destino de "Entrar" e do callback de registo |
| `PLATAFORMA_API_URL` | igual a `NEXT_PUBLIC_APP_URL` | Base dos dois endpoints públicos |

Separadas de propósito: permite apontar o site a um ambiente de testes do provisionamento sem
mudar o destino dos links de login.
