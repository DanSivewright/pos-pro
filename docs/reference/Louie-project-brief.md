# Louie — Store Reporting & Reconciliation System — Developer Brief
**Date:** 2026-06-18
**Owner:** Roy (Mase Capital)
**Target:** Working MVP within **1 week** for live testing on Louis's stores
**Source:** Meeting 2026-06-18 ([meeting notes](Louie%20—%20Store%20Reporting%20Meeting%20Notes%202026-06-18.md))

---

## 1. What we're building

An **AI reporting & reconciliation layer that sits on top of existing POS systems** for a multi-store restaurant group (Romans Pizza + "M-system" stores). Clients keep their current POS/hardware. The system ingests daily store data, reconciles it against bank and delivery-platform data, and **emails exception-based reports** to the owner. No dashboard UI for v1.

**Core principle:** all arithmetic/reconciliation is **hardcoded and verifiable**. AI is used only for fuzzy matching (bank-description → store mapping) and must expose a confidence score. Never let AI compute totals.

## 2. Data ingestion (v1)

- **Source = a dedicated email inbox.** POS vendors will not provide API/back-end access, so do not build POS integrations for v1.
- **Accepted formats:**
  - **Store-level data: PDF only** (CSV is editable at store level → fraud risk).
  - **Bank statements: CSV or PDF** (bank can auto-send; standardise to PDF where possible for audit trail).
- Parser must handle **multiple store report templates** (Romans vs M-system vs S) keyed off store/store-type.
- Bank-supported auto-send → one ingestion email address.

## 3. Reconciliation engine

1. **Bank ↔ POS ↔ cash match**
   - Match bank deposits to store cash-up totals.
   - Bank descriptions differ per bank → matching logic / trained agent with **confidence score**.
   - **Auto-approve ≥100% confidence; queue anything ≤90% for one-click human approve/reject.**
2. **Segregation-of-duties variance check** (key fraud control)
   - System **auto-populates the POS report column** from the store PDF.
   - Staff independently enter the **photo/WhatsApp evidence figure** into a separate column — they must **not** be able to see the auto-populated POS figure.
   - Output: a management-only **variance report** (POS figure vs evidence figure, flag yes/no).
3. **Safe log integration** — pull safe-count log for real-time cash-in-safe (independent of physical collection). *(Scaffold v1; can follow.)*
4. **Mr D / Uber** — **do NOT auto-reconcile in v1.** No reliable formula exists (commission % inconsistent; Romans rings Mr D on standard menu → built-in ~20–30% per-item gap). Surface the Mr D/Uber figures for **manual review** only and flag known shortfalls.

## 4. Stock / purchasing — par-level logic

- Implement **par levels**, not opening/closing stock counts.
- Replenishment **one week in arrears** (this week's suggested order is sized to last week's sales).
- **Par is fixed** — do not auto-mutate it; an optional monitoring agent may *suggest* par adjustments for human approval. Buffer baked into par (e.g. 16-day par for 10-day cover).
- New SKU → add item, "draw down / top up." Track **purchases vs sales**, not stock counts.

## 5. Output — reports, not dashboards

- **Email-delivered, exception-first reports.** Owner does not want to log into a dashboard.
- Tiered notifications: cash differences over a threshold → immediate alert; significant stock variance → alert; clean days → digest only.
- Report tone: "all money banked / X is wrong / here's the problem" — actionable summary, not raw tables.
- Monthly: income-statement-style roll-up emailed.

## 6. Scope guardrails (v1 — priority 1 only)

**In:** email ingestion (PDF/CSV), bank↔POS↔cash recon with confidence/auto-approve, segregation-of-duties variance report, par-level ordering suggestions, unique-invoice-number check, emailed exception reports.

**Deferred:** catch-up/historical reconciliation, third-party physical stock counts (Sculptor), Mr D/Uber auto-recon, camera/AR monitoring, full dashboard.

**Explicitly out:** POS API integrations, salary/payroll calc, replacing any client hardware/software.

## 7. Infra & ownership

- **AWS**, cloud only. Per-store / per-user tenancy (pricing is per-store tiered).
- Multi-store, multi-tenant from the start (vision: hundreds of stores).
- Built by the 2-dev team under equity arrangement; new 50/50 company to hold IP.

## 8. Open items blocking/feeding the build

- [ ] Louis to send **full list of daily checks/processes** (defines exact report fields; prevents scope creep).
- [ ] Sample **store PDF report** per store type (Romans / M-system / S) for parser.
- [ ] Sample **bank statement** (CSV + PDF) per bank in use.
- [ ] Sample **Mr D / Uber report** for the manual-review view.
- [ ] Confirm the **safe log** export format/access.
