# ADR-0008 — Analytics privacy-first e reporte de Web Vitals

- **Estado**: Proposto
- **Data**: 2026-07-21
- **Contexto**: Spec 18 (Website de Marketing)
- **Skills**: `engineering:architecture`, `ui-conventions`

> Stub para ratificação.

## Contexto

O site de marketing precisa de medir tráfego, conversão de CTAs (início de trial) e Web Vitals
reais, **sem** cookies invasivos nem fricção legal (RGPD e Lei de Protecção de Dados Pessoais de
Moçambique). O objectivo é minimizar consentimento obrigatório e não carregar scripts pesados no
caminho crítico.

## Decisão

Adoptar analytics **privacy-first sem cookies**: **Plausible** como opção recomendada de base;
**PostHog (região EU)** se o produto exigir funis/coortes/product analytics mais ricos. Reporte
de Web Vitals reais via `useReportWebVitals` para o mesmo backend. Banner de consentimento
**mínimo**, apresentado apenas onde legalmente exigido.

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

## Consequências

- Sem cookies de tracking por omissão → banner de consentimento reduzido ao mínimo legal.
- `useReportWebVitals` envia LCP/CLS/INP reais para o backend de analytics escolhido,
  complementando o Lighthouse CI sintético (spec 18, Requisito 8).
- Se PostHog EU for adoptado, reavaliar a necessidade de consentimento conforme a configuração
  (identificação de utilizador vs. anónimo).
- Chaves/domínios de analytics são configuração de ambiente, nunca segredos no repositório.
