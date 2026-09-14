# Plano de Implementação: Entrada imediata no produto após o registo self-service

Depende de: spec 18 (site), spec 19 (provisionamento/faturação), ADR-0029, ADR-0030.
Supersede parcialmente ADR-0013 §4/§5. Migrations: **nenhuma** (ver design §3).
Skills: `api-conventions`, `ui-conventions`, `prisma-conventions`,
`engineering:architecture`, `estado-com-escritor`.

- [ ] 0. Sequenciamento e decisão registada
  - [ ] 0.1 Decidir a ordem face ao ADR-0027 (Proposto) — ambos tocam no pipeline de escrita
        e na leitura de estado. Recomendado: ADR-0027 primeiro, este spec a seguir
  - [ ] 0.2 **ADR-0031** — «Entrada imediata: o registo público volta a ter palavra-passe»,
        com as três opções do design §1, o que supersede do ADR-0013 e o que continua a valer
  - [ ] 0.3 Confirmar a topologia `gestpro.co.mz` / `app.gestpro.co.mz` no ADR-0005
        (infraestrutura) e os `redirect_uri` do realm

- [ ] 1. Extracção da fronteira pública (sem mudança de comportamento)
  - [ ] 1.1 `src/server/provisioning/registo-publico.ts` — `registarTenant()` com captcha,
        rate-limit, Zod, idempotência, Keycloak e transacção; resultado discriminado
  - [ ] 1.2 `POST /api/publico/registo` passa a adaptador HTTP; códigos de erro publicados
        inalterados (`docs/handoff/site-provisionamento.md`)
  - [ ] 1.3 Testes de handler existentes verdes **sem alteração** — é o gate desta tarefa

- [ ] 2. Identidade com palavra-passe
  - [ ] 2.1 `RegistoTenantSchema` ganha `senha` + `confirmacao` (mín. 10, igual a
        `/auth/mudar-palavra-passe`)
  - [ ] 2.2 `registarTenant()`: `garantirUtilizador({ accoes: [], emailVerificado: false })`
        → `definirPalavraPasse(…, { temporaria: false })` antes da transacção
  - [ ] 2.3 Falha na escrita da palavra-passe aborta antes de Postgres e é repetível
  - [ ] 2.4 Teste de regressão: `accoes: []` — nunca `VERIFY_EMAIL` no registo público

- [ ] 3. Ecrã de registo no ERP
  - [ ] 3.1 `/registo` — Server Component + folha cliente, marca de `packages/brand`,
        sem modais, `plano` por *query string*, Turnstile
  - [ ] 3.2 `actions.ts` — `registarTenant()` → `signIn(redirect: false)` → e-mail → evento
        → `redirect('/dashboard?onboarding=1')`
  - [ ] 3.3 Falha do `signIn`: mensagem própria + ligação para `/auth/login` com e-mail
        preenchido; alerta `entrada.imediata.falhou`
  - [ ] 3.4 `middleware.ts` (`PUBLIC_PATHS`), CSP do Turnstile só nesta rota, `noindex` +
        canónico para `https://gestpro.co.mz/comecar`
  - [ ] 3.5 `.env.example` do ERP: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `EMAIL_VERIFY_SECRET`

- [ ] 4. Verificação de e-mail
  - [ ] 4.1 `enviarEmailVerificacao` (template do spec 13, `escapeHtml` aplicado) e ligação
        assinada HMAC-SHA256, prazo 24 h
  - [ ] 4.2 `GET /api/publico/verificar-email` — valida, chama `marcarEmailVerificado`
        (Admin API), 303; idempotente; rate-limit por IP
  - [ ] 4.3 `marcarEmailVerificado(sub)` em `keycloak.ts`
  - [ ] 4.4 `email_verified` propagado para o JWT/sessão na emissão e na re-resolução de
        15 min (ADR-0011) — sem coluna local, sem chamada por pedido
  - [ ] 4.5 Aviso persistente no `/dashboard` com reenvio (limitado por `sub`); checklist de
        onboarding ganha «confirmar e-mail» como primeiro item

- [ ] 5. Travões (skill `estado-com-escritor`)
  - [ ] 5.1 Emissão de documento fiscal recusada sem verificação — `BusinessRuleError` que
        nomeia a causa e o caminho
  - [ ] 5.2 Criação/reactivação de `User` recusada sem verificação
  - [ ] 5.3 Confirmar que Checkout, Portal e exportação **passam** — teste explícito
  - [ ] 5.4 Testes de transição nos dois sentidos para 5.1 e 5.2

- [ ] 6. Site: passa a ser só funil
  - [ ] 6.1 `/comecar` → `redirect(307)` com `plano` + `utm_*` e `<a>` de reserva
  - [ ] 6.2 Remover `formulario-registo.tsx`, `turnstile.tsx`, `actions/registo.ts`,
        `lib/registo.ts` e o que ficar sem uso em `validations.ts`/`rate-limit.ts`
  - [ ] 6.3 Limpar `messages/pt.json` e `messages/en.json`; `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
        sai do `.env.example` do site
  - [ ] 6.4 Auditar site + MDX + mensagens: nenhum limite fora do catálogo do ADR-0027
        (`documentosMes`, `produtos`)
  - [ ] 6.5 E2E do site: encaminhamento preserva `plano` e `utm_*`

- [ ] 7. Medição (ADR-0008)
  - [ ] 7.1 Evento servidor→Plausible no ERP com o domínio do site; sem script e sem
        *cookies* no ERP
  - [ ] 7.2 `utm_*` sobrevivem ao salto e entram no evento; zero PII

- [ ] 8. Anti-abuso
  - [ ] 8.1 Limitador de registo com backend distribuído (Redis, ADR-0014) — **pré-requisito
        de abertura ao público**, não dívida
  - [ ] 8.2 Turnstile *fail-closed* verificado em produção; chaves de teste em dev

- [ ] 9. Testes e gates
  - [ ] 9.1 Integração: atomicidade com palavra-passe; idempotência sem segundo tenant nem
        segunda identidade
  - [ ] 9.2 E2E do ERP: registo → sessão → aviso → verificação → travão levantado
  - [ ] 9.3 `pnpm check`, `pnpm gates`, `pnpm build` verdes nas duas apps; gate de cores
        hardcoded do site verde após as remoções

- [ ] 10. Verificação e handoff
  - [ ] 10.1 *Smoke* com servidor real + Postgres + Keycloak: registo, entrada imediata,
        repetição idempotente, ligação de verificação (1.ª e 2.ª visita), prazo expirado e
        reenvio, travões nos dois sentidos
  - [ ] 10.2 Actualizar `docs/handoff/site-provisionamento.md` (contrato: `senha` no corpo,
        `/registo` como entrada de referência) e `CONTEXT.md` (Primeiro acesso: terceiro
        caminho — registo público com palavra-passe)
  - [ ] 10.3 `docs/handoff/feat-21-entrada-imediata.md` com decisões, ficheiros tocados e gaps
  - [ ] 10.4 Reavaliar os gaps do Requisito 9 com dono e data antes da abertura ao público
