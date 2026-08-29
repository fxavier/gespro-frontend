# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary. This repo is **single-context**: there is no
  `CONTEXT-MAP.md` and there are no per-app `CONTEXT.md` files. `apps/site` is marketing over the
  same domain as `apps/erp` (Tenant, Assinatura, Plano) and shares its vocabulary.
- **`docs/decisions/`** — the ADRs. **Not `docs/adr/`.** Read the ones that touch the area you are
  about to work in; `docs/decisions/README.md` is the canonical index and tells you what each one
  decided without opening all 26.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md                 ← glossary (single context)
├── docs/
│   ├── decisions/             ← ADRs live HERE, not in docs/adr/
│   │   ├── README.md          ← canonical index + next free number
│   │   └── ADR-00NN-slug.md
│   └── agents/                ← this file
├── apps/erp/                  ← the ERP
└── apps/site/                 ← marketing site, same domain vocabulary
```

## Writing an ADR here

The numbering is governed by [ADR-0023](../decisions/ADR-0023-governacao-documentacao.md). Follow it —
it exists because three ADRs already collided on number 0005:

1. **Take the next free number from `docs/decisions/README.md`**, which states it explicitly. Do not
   infer it by listing the directory: the numbering is not gap-free and three files share `0005`.
2. **Name the file `ADR-00NN-slug.md`** (the pre-`0006` files use a shorter `000N-slug.md` form; do
   not imitate it).
3. **Update the index in `docs/decisions/README.md`** in the same change — table row *and* the
   "próximo número livre" line. A test enforces this.
4. **Never renumber an existing ADR.** The three colliding `0005` documents are all valid and are
   cited as `ADR-0005-a` / `-b` / `-c`.
5. **Write it in Portuguese (pt-PT)**, matching every other ADR in the directory. Keep the existing
   section shape: Contexto → Decisão → Alternativas consideradas (a table, with ✅ on the chosen row)
   → Consequências.

An ADR is worth writing only when the decision is hard to reverse, surprising without context, and
the result of a real trade-off. If any of the three is missing, skip it.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test
name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly
avoids — `CONTEXT.md` distinguishes **Identidade** from **Utilizador** precisely because conflating
them produced a real modelling error.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language
the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradiz o ADR-0011 (fronteira de autorização) — mas vale a pena reabrir porque…_

Note that ADRs marked **Proposto** (all of 0010–0026, the Wave 8 set) are not yet settled: correcting
one in place is legitimate. ADRs marked **Aceite** are superseded by a new ADR, never edited.
