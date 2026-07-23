# ADR-0008 — Analytics privacy-first e reporte de Web Vitals

- **Estado**: Aceite
- **Data**: 2026-07-21 (proposto) · 2026-07-22 (aceite, implementado no spec 18 §7)
- **Contexto**: Spec 18 (Website de Marketing), Requisito 9
- **Skills**: `engineering:architecture`, `ui-conventions`

## Contexto

O site de marketing precisa de medir tráfego, conversão de CTAs (início de trial) e Web Vitals
reais, **sem** cookies invasivos nem fricção legal (RGPD e Lei de Protecção de Dados Pessoais de
Moçambique). O objectivo é minimizar consentimento obrigatório e não carregar scripts pesados no
caminho crítico.

## Decisão

Adoptar analytics **privacy-first sem cookies**: **Plausible** como opção recomendada de base;
**PostHog (região EU)** se o produto exigir funis/coortes/product analytics mais ricos. Reporte
de Web Vitals reais via `useReportWebVitals`. Aviso de consentimento **mínimo**, apresentado
apenas onde legalmente exigido.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Plausible** ✅ | Sem cookies, script leve (~1KB), sem banner na maioria dos casos; UE; simples | Métricas de produto limitadas (sem funis ricos) |
| PostHog (EU Cloud) | Funis, coortes, feature flags; auto-hospedável | Mais pesado; pode exigir consentimento consoante configuração |
| Umami (self-host) | Open-source, sem cookies, controlo total | Custo operacional de auto-hospedagem |
| Google Analytics 4 | Gratuito, ubíquo | Cookies + consentimento obrigatório; transferência de dados fora da UE — **descartado** |

Racional: Plausible dá o essencial (páginas, fontes, conversões de CTA) sem cookies e com
impacto mínimo em performance; PostHog EU fica como escalada se surgir necessidade real de
product analytics. GA4 é descartado por atrito de consentimento e privacidade.

## O que foi implementado

**Desligado por omissão.** Sem `NEXT_PUBLIC_PLAUSIBLE_DOMINIO` definido, nenhum script é
carregado. É o estado em desenvolvimento, em CI e nos testes de acessibilidade — o que mantém as
medições reprodutíveis e o site utilizável sem rede externa. Activar é configuração de ambiente,
nunca um segredo no repositório.

**Aviso de consentimento condicional.** `NEXT_PUBLIC_ANALYTICS_CONSENTIMENTO=obrigatorio` mostra
um aviso dispensável e só carrega o script após aceitação. Por omissão está **desligado**, porque
a configuração recomendada (Plausible, sem cookies, sem identificadores persistentes) não recolhe
dados pessoais e não obriga a consentimento prévio. Pedir consentimento onde a lei não o exige
treina o utilizador a carregar em "aceitar" sem ler — é pior para a privacidade, não melhor.

**Decisão lida com `useSyncExternalStore`.** O consentimento vive em `localStorage`, fora do
React; lê-se pela via própria para estado externo, sem `useEffect` + `setState` (que provocaria um
render extra depois da hidratação) e reagindo a decisões tomadas noutro separador. Há um fallback
em memória para o caso de `localStorage` estar bloqueado (modo privado restrito).

**Eventos fechados.** `src/lib/analytics.ts` exporta uma lista fixa (`registo_iniciado`,
`registo_concluido`, `registo_falhado`, `contacto_enviado`) — nomes soltos espalhados pelos
componentes tornam a analítica inutilizável ao fim de três meses. Nenhum evento leva dados
pessoais.

**Web Vitals para o log estruturado.** `useReportWebVitals` envia LCP/CLS/INP/TTFB para
`POST /api/vitals` do próprio site, que escreve uma linha JSON no stdout — o mesmo padrão de
recolha do ERP (log estruturado, sem SDK proprietário no bundle do cliente). Usa `sendBeacon`
para não competir com o descarregamento da página. Regista métrica, caminho e tipo de navegação;
**nenhum identificador de utilizador**.

## Consequências

- Sem cookies de tracking por omissão → aviso de consentimento reduzido ao mínimo legal, e
  desligado enquanto o mínimo legal for zero.
- `useReportWebVitals` complementa o Lighthouse sintético com dados de campo (Requisito 8).
- Se PostHog EU for adoptado, reavaliar a necessidade de consentimento conforme a configuração
  (identificação de utilizador vs. anónimo) e ligar `NEXT_PUBLIC_ANALYTICS_CONSENTIMENTO`.
- Chaves/domínios de analytics são configuração de ambiente, documentada em
  `apps/site/.env.example`, nunca segredos no repositório.
- `/api/vitals` é um endpoint público que aceita POST anónimo. É de escrita-para-log, valida o
  payload com Zod e responde sempre `204` — não há aqui superfície de ataque além de ruído no
  log. Se o ruído se tornar um problema, a resposta é rate-limit no CDN, não autenticação.
