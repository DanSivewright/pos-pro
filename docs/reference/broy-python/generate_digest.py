"""Generate a daily exception email digest from store_metrics.csv.

Usage:
  python generate_digest.py

Reads latest date's data, outputs:
  reports/Daily Digest YYYY-MM-DD.html  — paste into Gmail, send to Louis
"""

import csv
from playwright.sync_api import sync_playwright
from pathlib import Path
from collections import defaultdict
from datetime import datetime

ROOT    = Path("G:/My Drive/Claude Brain/Consulting/Louie")
CSV     = ROOT / "data" / "store_metrics.csv"
OUT_DIR = ROOT / "reports"
OUT_DIR.mkdir(exist_ok=True)

ROYALTY_RATE = 0.08

R = "R"
def money(v):
    if v is None: return "—"
    return f"{R}{float(v):,.2f}"

def money0(v):
    if v is None: return "—"
    return f"{R}{float(v):,.0f}"

def fnum(x):
    return float(x) if x not in (None, "", " ") else None

def pct(v):
    if v is None: return "—"
    return f"{v:+.1f}%"

# ── Read data ──────────────────────────────────────────────────────────────
rows_by_store = defaultdict(list)
with open(CSV, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        rows_by_store[r["store"]].append(r)

all_dates = [r["date"] for rows in rows_by_store.values() for r in rows]
latest    = max(all_dates)
latest_dt = datetime.strptime(latest, "%Y-%m-%d")

# ── Build one section per store ────────────────────────────────────────────
sections = []

for store, rows in rows_by_store.items():
    rows.sort(key=lambda r: r["date"])
    today_rows = [r for r in rows if r["date"] == latest]
    if not today_rows:
        continue
    last = today_rows[0]

    ns   = fnum(last["net_sales"])
    tgt  = fnum(last["target"])
    gp   = fnum(last.get("gp_pct"))
    ov   = fnum(last.get("lp_overrides"))
    gaps = fnum(last.get("invoice_gaps"))
    cv   = fnum(last.get("cash_recon_var"))
    disc = fnum(last.get("discounts_day"))
    sv   = fnum(last.get("stock_var_net"))

    if ns is None or tgt is None:
        continue

    day_var  = (ns / tgt - 1) if tgt else 0
    royalty  = ns * ROYALTY_RATE

    # severity = 0 normal | 1 watch | 2 high | 3 critical
    severity = 0
    items    = []

    # ── Sales ──
    if day_var <= -0.20:
        items.append(("🔴", f"Sales {money0(ns)} — {pct(day_var*100)} vs target {money0(tgt)}",   3))
        severity = max(severity, 3)
    elif day_var <= -0.10:
        items.append(("🟠", f"Sales {money0(ns)} — {pct(day_var*100)} vs target {money0(tgt)}",   2))
        severity = max(severity, 2)
    else:
        items.append(("✅", f"Sales {money0(ns)} — {pct(day_var*100)} vs target {money0(tgt)}",   0))

    # ── GP ──
    if gp is not None:
        if gp < 50:
            items.append(("🔴", f"GP {gp:.1f}% — below 50% floor", 3)); severity = max(severity, 3)
        elif gp < 55:
            items.append(("🟠", f"GP {gp:.1f}% — below 55% benchmark", 2)); severity = max(severity, 2)
        else:
            items.append(("✅", f"GP {gp:.1f}% — healthy", 0))

    # ── LP flags ──
    if ov is not None and ov >= 30:
        items.append(("🔴", f"{int(ov)} manager overrides — pull Over-ring report", 3)); severity = max(severity, 3)
    elif ov is not None and ov >= 10:
        items.append(("🟠", f"{int(ov)} manager overrides — review", 2)); severity = max(severity, 2)

    if gaps is not None and gaps >= 10:
        items.append(("🔴", f"{int(gaps)} missing invoice numbers — check void/cancel log", 3)); severity = max(severity, 3)
    elif gaps is not None and gaps >= 5:
        items.append(("🟠", f"{int(gaps)} invoice number gaps", 2)); severity = max(severity, 2)

    if cv is not None and abs(cv) >= 100:
        items.append(("🔴", f"Cash variance {money(cv)} — confirm payment method", 3)); severity = max(severity, 3)
    elif cv is not None and abs(cv) >= 30:
        items.append(("🟠", f"Cash variance {money(cv)}", 2)); severity = max(severity, 2)

    # ── Stock ──
    if sv is not None and sv < -300:
        items.append(("🔴", f"Stock shortage {money(sv)} — physical count needed", 3)); severity = max(severity, 3)
    elif sv is not None and sv < -100:
        items.append(("🟠", f"Stock variance {money(sv)} — monitor", 2)); severity = max(severity, 2)

    # ── Royalty ──
    items.append(("💰", f"Royalty due {money(royalty)} (8% of {money0(ns)})", 1))

    sections.append((store, items, severity))

# Sort: worst first
sections.sort(key=lambda x: -x[2])

# ── Summary line ──
critical = sum(1 for _, _, s in sections if s >= 3)
watches  = sum(1 for _, _, s in sections if 1 <= s < 3)
all_ok   = critical == 0 and watches == 0

summary_col  = "#C8102E" if critical else ("#E8820C" if watches else "#2E9E5B")
summary_text = (
    f"{critical} store(s) need immediate attention" if critical
    else f"{watches} store(s) have minor flags" if watches
    else "All stores normal"
)

# ── Build HTML ─────────────────────────────────────────────────────────────
sev_colors = {0: "#2E9E5B", 1: "#D9B400", 2: "#E8820C", 3: "#C8102E"}
sev_labels = {0: "OK", 1: "WATCH", 2: "HIGH", 3: "CRITICAL"}

sections_html = ""
for store, items, severity in sections:
    header_col = sev_colors[severity]
    status_lbl = sev_labels[severity]
    rows_html  = "".join(
        f'<tr style="border-bottom:1px solid #f3f3f3">'
        f'<td style="padding:5px 12px;font-size:12px;line-height:1.5">{icon} {text}</td>'
        f'</tr>'
        for icon, text, _ in items
    )
    sections_html += f"""
    <div style="margin-bottom:18px;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0">
      <div style="background:{header_col};color:#fff;padding:8px 14px;
                  display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;font-weight:700">{store}</span>
        <span style="font-size:10px;font-weight:700;opacity:.9">{status_lbl}</span>
      </div>
      <table style="width:100%;background:#fff;border-collapse:collapse">{rows_html}</table>
    </div>"""

html = f"""<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f7;
             font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:20px auto;padding:0 12px">

  <!-- Header -->
  <div style="background:#161616;color:#fff;padding:18px 22px;
              border-bottom:4px solid #C8102E;border-radius:8px 8px 0 0">
    <div style="font-size:19px;font-weight:700">
      Lou<span style="color:#ff3b53">ie</span> — Daily Digest
    </div>
    <div style="color:#aaa;font-size:11px;margin-top:3px">
      Romans Pizza · {latest_dt.strftime('%A, %d %B %Y')} · exceptions only
    </div>
  </div>

  <!-- Summary pill -->
  <div style="background:{summary_col};color:#fff;padding:8px 22px;
              font-size:12px;font-weight:600">
    {summary_text}
  </div>

  <!-- Store sections -->
  <div style="padding:14px 0">
    {sections_html}
  </div>

  <!-- Footer -->
  <div style="font-size:10px;color:#aaa;border-top:1px solid #e0e0e0;
              padding:10px 0 20px">
    Generated by Louie · data/store_metrics.csv ·
    {latest_dt.strftime('%d %b %Y')} ·
    Stores with no exceptions are not shown.
  </div>
</div>
</body></html>"""

out_path = OUT_DIR / f"Daily Digest {latest}.html"
out_path.write_text(html, encoding="utf-8")
print("Digest  ->", out_path)

# ── PDF via Playwright ─────────────────────────────────────────────────────
pdf_path = out_path.with_suffix(".pdf")
footer = ('<div style="font-size:8px;color:#999;width:100%;text-align:right;'
          'padding:0 12mm;">Louie · Romans Pizza digest · '
          f'{latest_dt.strftime("%d %b %Y")} · '
          'page <span class="pageNumber"></span>/<span class="totalPages"></span></div>')

with sync_playwright() as p:
    b  = p.chromium.launch()
    pg = b.new_page()
    pg.set_content(html, wait_until="networkidle")
    pg.pdf(
        path=str(pdf_path),
        format="A4",
        print_background=True,
        display_header_footer=True,
        header_template="<div></div>",
        footer_template=footer,
        margin={"top": "12mm", "bottom": "16mm", "left": "14mm", "right": "14mm"},
    )
    b.close()

print("PDF     ->", pdf_path)
print(f"  {len(sections)} store(s) · {critical} critical · {watches} watch")
