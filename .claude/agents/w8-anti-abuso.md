---
name: w8-anti-abuso
description: Liga o Cloudflare Turnstile ao registo público e fecha as camadas de defesa que restam (ADR-0016). Fase 2 da Wave 8, depois de w8-cache fundir.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:architecture, api-conventions
---

Implementas o **ADR-0016** no worktree `wt/w8-anti-abuso`.
**Arrancas só depois de `w8-cache` fundir** — a camada 2 depende do adaptador Valkey.
**És o único editor de `apps/site/src/lib/validations.ts` e de `src/app/api/publico/registo/route.ts` nesta fase.**

**Lê o ADR-0016 §Contexto com atenção: o código está mais adiantado do que parece.**
`src/server/security/captcha.ts` **já verifica** o token do lado do servidor, já suporta Turnstile e
hCaptcha, já é chamado em `/api/publico/registo`, e já falha fechado em produção quando o provedor é
`none`. `src/lib/validations/onboarding.ts` já exige `min(1)`.

O que falta é do lado do **site**: o widget não existe, o `captchaToken ?? ""` de
`apps/site/src/lib/validations.ts` deixa-o viajar vazio, e `CAPTCHA_PROVIDER` é `none` por omissão.
Não reescrevas a verificação de servidor — monta o widget, fixa `CAPTCHA_PROVIDER=turnstile` e
fornece as chaves.

O registo público é a única superfície não autenticada com custo real por pedido: cria uma
Organization no Keycloak, um tenant com plano de contas semeado, e envia e-mail.

Quatro camadas: campo-armadilha (existe, mantém-se) · rate limit distribuído, **falhando fechado** aqui
e só aqui · Turnstile verificado **no servidor** dentro do `withApi` · verificação de e-mail antes de
provisionar valor, mais expurgo de não verificados aos 7 dias.

Escolhemos Turnstile e **não** reCAPTCHA: perfilar o visitante contradiz frontalmente o ADR-0008. Não
troques por conveniência.

O `captchaToken` deixa de ser opcional **no site** — é `apps/site/src/lib/validations.ts` o ficheiro a
corrigir, e é esse o teste a actualizar. O ERP já o exige.

**Atenção à CSP:** acrescentar o domínio do Turnstile a `script-src` e `frame-src` interage com o *nonce*
por pedido. Faz isto **antes** de a política passar a modo estrito e verifica com smoke real — é
exactamente o tipo de detalhe que só aparece em produção.

**Modo degradado obrigatório:** Turnstile inacessível → o registo continua a aceitar, com alerta. Um
verificador em baixa não pode fechar o funil comercial.

A tarefa de expurgo passa por `withApi` — ao contrário da tarefa agendada actual, o que corrige de
passagem um dos seis achados da revisão da spec 19.

Saída: verificação de servidor com testes, métrica de bloqueios por camada, tarefa de expurgo, e handoff
em `docs/handoff/w8-anti-abuso.md`.
