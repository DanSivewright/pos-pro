# Convex document IDs and selective soft-delete (overrides buildmore CUID2/soft-delete rule)

buildmore mandates CUID2 primary keys and soft-deletes everywhere. Convex supplies its own
system document IDs (`_id`), so we use those rather than CUID2. Soft-delete is applied only
to **user-authored** records where history matters; **re-derived** data is hard-deleted and
reinserted. Specifically, `stockVarianceItems` are fully replaced (hard delete + insert) when
a Store Day's Gross Profit or Stock Variance report is re-parsed, because they are derived
artefacts of the latest source file, not user-authored state.

Status: accepted

## Money & date representation (recorded here for durability)
- Money stored as **integer cents** (ZAR); formatted to `R#,###.##` only at display.
- Store Day date stored as a plain **`YYYY-MM-DD` string** (store-local calendar date), not a timestamp.
- Project timezone: **Africa/Johannesburg (SAST, UTC+2)** for cron and "today" logic.
- Percentages (GP%, FC%, variance %) stored as numbers rounded to 2dp — display-only.
