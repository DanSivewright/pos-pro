# pos-pro — Store Reporting

A SaaS for South African stores: they upload their POS exports (PDF/CSV/XLSX), we
extract the figures in code into Convex, and serve visualized reports plus automatic
exception-alert emails. Convex is the source of truth.

## Language

**Store**:
A single physical business location (e.g. "Roman's Pizza Boitumelo"). Modelled as a
Clerk Organization. The tenant boundary.
_Avoid_: Branch, outlet, tenant, customer, client

**Store Day**:
One Store's trading on one calendar date. The atomic spine: every extracted figure
hangs off a Store Day. Range-based exports are split per day onto their Store Days.
_Avoid_: Daily report, cashup, trading day

**Super-user**:
A user (including the owner) with access across all Stores, not scoped to one
Organization.
_Avoid_: Admin, root, owner (owner is one instance of a super-user)

**Sales Target**:
A Store-level expected sales figure, set as configuration (not extracted from any
upload). Drives the sales-vs-target exception. Without it, "vs target" does not exist.
_Avoid_: Goal, budget, quota

**Variance**:
A measured shortfall/surplus against an expectation. Always qualified: **Cash Variance**
(Cashup reconciliation: POS-recorded vs actual cash/card) and **Stock Variance**
(Gross Profit: actual vs theoretical cost of sales, per item and in total).
_Avoid_: Discrepancy, difference (unqualified)

**Upload**:
A single upload action by a user: a batch of one or more files for the active Store.
The unit of provenance grouping.
_Avoid_: Import, submission, batch (informal)

**Uploaded File**:
One file within an Upload, recording its filename, detected report-type, detected date
range, and parse status. Every extracted figure references the Uploaded File it came
from. The raw file itself is not retained.
_Avoid_: Document, attachment, source

**Report-type**:
The kind of POS report a file is (Cashup, Royalty, Gross Profit, Stock Variance, Stock
Wastage). Detected from the file's header. Each report-type owns a defined subset of a
Store Day's fields.
_Avoid_: Report kind, doc type

**Channel**:
A sales origin within a Store Day: Counter, Call-in, Mobile app, Mr. Delivery, Uber Eats,
Website. The Channel mix is the breakdown of net sales across these.
_Avoid_: Source, platform (Mr. Delivery/Uber are "third-party" channels specifically)

**Exception**:
A threshold breach on a Store Day metric that warrants an alert — sales below target,
GP% below floor, cash variance over limit, stock variance over limit. Severity-tiered
(OK / Watch / High / Critical).
_Avoid_: Alert (the email is the alert; the Exception is the underlying breach), flag

**Needs-review**:
A Store Day flag raised when an extracted figure fails its in-report control-total check,
or two report-types disagree on a shared figure. The day is still stored.
_Avoid_: Invalid, error, discrepancy

**Control Tower**:
The cross-Store dashboard: every Store traffic-lit by status, worst-first. The landing
screen for super-users.
_Avoid_: Dashboard (use Control Tower for this specific view), overview
