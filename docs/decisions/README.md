# Registo de Decisões de Arquitectura (ADRs)

Índice dos ADRs do GestPro. Cada ADR documenta uma decisão significativa (contexto,
alternativas consideradas, decisão e consequências). ADRs são **imutáveis** depois de aceites —
uma decisão que muda é registada num **novo** ADR que *substitui* o anterior (nunca se reescreve
o histórico).

## Convenção

- **Ficheiro**: `ADR-<NNNN>-<slug>.md` (quatro dígitos, zero-padded). Os ADRs 0001–0004 usam o
  prefixo curto `<NNNN>-<slug>.md` por razões históricas; do 0006 em diante a convenção é
  `ADR-<NNNN>-<slug>.md`.
- **Numeração**: sequencial e **única**. O próximo número livre é **0010**.
- **Estado**: `Proposto` → `Aceite` → (`Substituído por ADR-XXXX` | `Descontinuado`).

## Índice

| ADR | Título | Estado | Spec/Contexto |
|---|---|---|---|
| [0001](./0001-stack-e-scaffolding.md) | Stack e scaffolding | Aceite | 01 — Backend foundation |
| [0002](./0002-wave0-enxuta-vs-spec01.md) | Wave 0 enxuta vs. spec 01 | Aceite | 01 — Backend foundation |
| [0003](./0003-gate-wave1-arbitragens.md) | Gate Wave 1 — arbitragens | Aceite | Waves 1 |
| [0004](./0004-gate-wave2-e-plano-wave3.md) | Gate Wave 2 e plano Wave 3 | Aceite | Waves 2–3 |
| [0005-a](./0005-motor-pdf.md) | Motor de documentos PDF e formato de exportação | Aceite | 12 — Relatórios/Documentos |
| [0005-b](./ADR-0005-infraestrutura-deploy.md) | Infraestrutura & Deploy — Docker + Terraform AWS | Aceite | 16 — Infraestrutura/Deploy |
| [0005-c](./ADR-0005-observabilidade.md) | Observabilidade & Operações | Aceite | 14 — Observabilidade |
| [0006](./ADR-0006-monorepo-site.md) | Monorepo (pnpm + Turborepo) para ERP + site | Proposto | 18 — Website de Marketing |
| [0007](./ADR-0007-animacao-motion.md) | Biblioteca de animação do site (Motion) | Proposto | 18 — Website de Marketing |
| [0008](./ADR-0008-analytics-privacy-first.md) | Analytics privacy-first e Web Vitals | Proposto | 18 — Website de Marketing |
| [0009](./ADR-0009-moeda-faturacao-saas.md) | Moeda de faturação da subscrição SaaS (Stripe) | Proposto | 19 — Onboarding/Provisionamento |

## Nota — colisão de numeração no 0005 (conhecida)

O número **0005** foi atribuído três vezes, em waves paralelas, a decisões distintas:

- `0005-motor-pdf.md` (spec 12) — prefixo curto;
- `ADR-0005-infraestrutura-deploy.md` (spec 16);
- `ADR-0005-observabilidade.md` (spec 14).

Os três documentos são **válidos e aceites**; apenas o número colide. Para não quebrar links já
existentes, os ficheiros **não** são renumerados — a colisão fica registada aqui e são
desambiguados como `0005-a/-b/-c` neste índice. A sequência **retoma limpa em 0006** e daí em
diante é estritamente única. Antes de criar um novo ADR, consultar este índice e usar o próximo
número livre (**0010**).
