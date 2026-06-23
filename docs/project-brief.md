# Project Initiation — pos-pro (Store Reporting SaaS)

> Read this first. It is the canonical brief for this project. Reference material
> lives in `docs/reference/`.

## 0. The stack is already scaffolded — build inside it, do not re-scaffold

This repo was generated with **Better-T-Stack**: a **pnpm + Turborepo monorepo**. It
already provides everything our constraints require. Work *within* this structure.

```
pos-pro/
├── apps/
│   └── web/          # Next.js frontend (dev port 3001)
├── packages/
│   ├── backend/      # Convex backend — convex/ holds schema + functions
│   ├── ui/           # shared shadcn/ui primitives, imported as @pos-pro/ui
│   ├── config/
│   └── env/
└── docs/             # project brief + reference material
```

- **Package manager is `pnpm`** (not npm/bun). Key scripts: `pnpm run dev`,
  `pnpm run dev:web`, `pnpm run dev:setup` (Convex), `pnpm run check-types`.
- **Convex schema and functions live in `packages/backend/convex/`** — the source of truth.
- **Web app lives in `apps/web/`.**
- **Shared UI** goes through `packages/ui`
  (`import { Button } from "@pos-pro/ui/components/button"`); add primitives with
  `npx shadcn@latest add <name> -c packages/ui`.
- **Clerk is already wired** for Convex+Clerk auth (see README "Clerk Authentication
  Setup"). Build on it.
- **Code standards: Ultracite / Biome.** Read `AGENTS.md` and obey it — no barrel files,
  Server Components for async data fetching, Next.js `<Image>`, semantic/accessible HTML,
  explicit types, early returns. Run `pnpm dlx ultracite fix` before finishing. Also honour
  the intent skill-loading note at the top of `AGENTS.md`.
- **File names use kebab-case** (project preference; consistent throughout).

## 1. Role & mission

You are the lead engineer building a **SaaS for stores/businesses across South Africa**.
Customers pay (externally — see §3) to use our software: they **upload their POS files
(PDF / CSV / XLSX)** and receive **visualized reports** plus **automatically-emailed
exception alerts**.

The single most important architectural fact: **Convex and its database are the source of
truth.** Everything we report on and email about is read from Convex tables. File uploads
are merely the means to populate those tables.

## 2. Core goals (in order)

1. **Design a Convex schema** (in `packages/backend/convex/`) for the information needed for
   (a) reporting/visualization and (b) email alerts. Reason backwards: decide what the
   reports and emails need, then model the tables to serve that.
2. **Ingest uploaded files** (PDF primarily; also CSV / XLSX) and **extract the needed
   figures ourselves, in code**, storing the results in Convex tables.
3. **Visualize** the stored data as reports.
4. **Automatically email exception-based alerts** off the stored data.
5. **Track which file each datum came from** via a table of uploaded filenames, so
   provenance is traceable.

## 3. Hard constraints (do not violate)

- **Convex is the source of truth.** The DB drives all reporting and emails.
- **Extraction is code-based, not AI.** Do the extraction yourself in code. Reach for AI
  only if genuinely necessary — and if so, **flag it explicitly**, never introduce it
  silently.
- **No Python.** Do processing **on the server** using **Next.js-native / Vercel-friendly**
  tooling (Convex actions / Node server runtime as appropriate).
- **Auth is Clerk, and only Clerk.** Nothing custom. If it can be done in Clerk, do it in
  Clerk; if it genuinely **cannot**, **flag it and skip it** — no custom workaround.
  - Each **customer / store is a Clerk Organization.** Model multi-tenancy around Clerk
    Organizations.
  - A few users (including the owner) are **super-users** with access to **all orgs.**
    Accommodate this through Clerk.
  - **All auth concerns route through Clerk.**
- **No payments in the platform yet.** Billing is handled **manually / externally.**
  **Treat every org present on the platform as an active, paying customer.** Build no
  billing, subscriptions, or payment gating.
- **Do not store raw uploaded PDFs for now.** Storing the **extracted results in tables is
  sufficient.** Keep a table recording the **filenames** used in each upload for provenance.
- **Deploy target is Vercel** — choose tooling accordingly throughout.

## 4. Engineering principles (non-negotiable posture)

- **DO NOT over-complicate. DO NOT over-abstract.**
- Favour **simple, easy-to-read, easy-to-understand, easy-to-maintain** solutions.
- Maintain a **consistent naming and organizing convention** at all times — the "best"
  convention is not the concern, **consistency is.** File names in **kebab-case**.
- The goal right now is **small and polished**, not feature-complete.

## 5. Context you must absorb first (in `docs/reference/`)

This prompt is itself the product of feedback on a prototype. Order of events:

1. **`docs/reference/Louie-project-brief.md`** — the **original v1 brief**, written *before*
   this prompt (store reporting & reconciliation over existing POS systems; originally
   AWS-era, reconciliation/fraud focus, email-first reports). Read it for domain intent, but
   the constraints in §3 now supersede its infra/approach choices.
2. **`docs/reference/broy-python/`** — the **Python prototype the client liked.** It extracts
   text from POS PDFs/XLSX, reduces them to per-store metrics, and generates
   **exception-based, severity-tiered HTML digest emails** plus a "Control Tower" HTML
   dashboard. **We are NOT replicating it and NOT using Python** — it exists purely as
   context for *"the client liked this direction"* (useful for digest/dashboard
   look-and-feel and which metrics/thresholds matter). Build forward from the idea, not the
   code.
3. **`docs/reference/rp-first-batch/`** and **`docs/reference/rp-sv-forms/`** — the **real
   reference files** for the build (Romans Pizza, ServeUp POS): Store Cashup, Royalty, Gross
   Profit (per-item stock-variance tables), Stock Variance, Stock Wastage, Third Party,
   Deliveries, Hourly Sales, Petty Cash, etc. Currency is **Rand (R / ZAR)**. They are
   machine-generated PDFs → clean, consistent text extraction (no OCR needed).

Your digestion takeaway: what figures the reports/emails need → which report files carry them
→ how to extract them in code → how to shape the Convex tables to hold them.

## 6. Scope for this MVP

**In:** Clerk auth with org-per-store + super-users; file upload (PDF/CSV/XLSX); code-based
extraction into Convex tables; a filename/provenance table; report visualization; automatic
exception-based alert emails; all orgs treated as active.

**Out / deferred:** storing raw PDFs; in-platform payments/billing; AI-based extraction
(unless flagged necessary); anything not doable through Clerk; replicating the Python
prototype.

## 7. How to proceed

Do **not** start coding yet. Intended next steps:

1. Confirm you've digested the brief, the Python prototype, and the reference files; surface
   anything ambiguous.
2. Initiate the **buildmore-engineering** skill.
3. Run a **grill session** to pressure-test the plan (schema, extraction strategy, Clerk
   org/super-user model, email triggers) before building.
