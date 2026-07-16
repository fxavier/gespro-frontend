# Visão Geral — Funcionalidades em Falta (specs 04–09)

Este pacote acrescenta specs (padrão Kiro: `requirements.md`/`design.md`/`tasks.md`)
para as funcionalidades **não implementadas ou incompletas** identificadas por
análise do código em 2026-07, complementando os specs 01–03 (backend Waves 0–3 e
UI Waves 0–2).

## Método

Análise dos schemas Prisma (`prisma/schema/*.prisma`), serviços
(`src/server/services/**`), actions, validações e páginas
(`src/app/(dashboard)/**`), cruzada com `docs/status.md` e `CLAUDE.md`. Para cada
área confirmou-se, com evidência no código, o que existe vs o que falta.

## Resultado da análise (o que realmente falta)

| # | Spec | Estado encontrado | Natureza |
|---|------|-------------------|----------|
| 04 | Reconciliação Bancária | Modelos + parte do serviço existem; **falta geração/importação de itens, matching real, cálculo de saldos e páginas nova/workspace** | Completar |
| 05 | Contagem/Reconciliação de Stock | O "inventário físico" existente é só de **ativos**; **não há contagem de existências nem ajuste de stock** | Novo |
| 06 | Processamento Salarial (Payroll) | Modelo `Payroll` existe mas marcado "extensão futura"; página lê prisma cru, form por ligar; **sem motor de cálculo INSS/IRPS** | Novo (crítico) |
| 07 | Recrutamento | Página é `EmptyState`; **sem schema/serviço/UI** | Greenfield |
| 08 | Benefícios | Página é `EmptyState`; **sem schema/serviço/UI** | Greenfield |
| 09 | Correções + Páginas em falta | **Bug de enum confirmado** (avaliações 360°), listas a contornar serviços, várias páginas de detalhe/edição em falta, rotas duplicadas | Correções/UI |

## Nota sobre RH (esclarecimento)

Ao contrário do que o pedido sugeria, **assiduidade, avaliações, férias, ausências
e formações JÁ estão implementadas** ao nível de serviço + action + UI (num único
`rh.service.ts`). O que falta em RH é: o **payroll** (spec 06), o **recrutamento**
(07), os **benefícios** (08) e um conjunto de **correções/páginas** (09) — incluindo
um bug real no filtro de avaliações 360°.

## Ordem de execução sugerida

1. **09** (correções — baixo risco, valor imediato, inclui o bug 360°).
2. **04** e **05** (finanças/inventário — completam fluxos operacionais).
3. **06** (payroll — crítico; validar tabelas INSS/IRPS nas fontes oficiais antes).
4. **08** depois de **06** (benefícios integram no payroll).
5. **07** (recrutamento — independente; pode correr em paralelo).

Cada spec mantém as regras invioláveis do `CLAUDE.md`: multi-tenancy por contexto,
`Decimal` para dinheiro, documentos append-only, UI sem modais, integração
inter-domínio por funções de contrato em `$transaction`, e gates de CI a zero.
