"""Build the Louie Control Tower — phone-friendly version.

Usage:
  python build_dashboard_mobile.py

Reads  data/store_metrics.csv  ->  reports/Louie Control Tower — Mobile.html
Designed for 390px (iPhone) width. No charts, large text, tap-friendly.
"""

import csv
import re
import markdown as md_lib
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timedelta

ROOT        = Path("G:/My Drive/Claude Brain/Consulting/Louie")
CSV         = ROOT / "data" / "store_metrics.csv"
OUT         = ROOT / "reports" / "Louie Control Tower — Mobile.html"
REPORT_MD   = ROOT / "reports" / "Romans Boitumelo — Consolidated Report 2026-06-07.md"

TODAY_DT = datetime(2026, 6, 7)
TODAY    = "07 Jun 2026"

PENDING_STORES = [
    ("Romans - Laudium",     "Abbasi Semu"),
    ("Romans - Germiston",   "Noluvuyo"),
    ("Romans - Protea Glen", "Gomolemo"),
]

COMPLIANCE = [
    ("Boitumelo",    "Monthly pest control",        "2026-07-07"),
    ("Boitumelo",    "Health / food premises cert", "2026-12-31"),
    ("Boitumelo",    "Fire certificate",            "2026-11-30"),
    ("Laudium",      "Monthly pest control",        "2026-07-12"),
    ("Germiston",    "Monthly pest control",        "2026-07-08"),
    ("Protea Glen",  "Monthly pest control",        "2026-07-09"),
    ("All stores",   "Monthly royalty payment",     "2026-06-30"),
]

ROYALTY_RATE = 0.08

R = "R"
def money(v):
    if v is None: return "—"
    return f"{R}{float(v):,.0f}"

def fnum(x):
    return float(x) if x not in (None, "", " ") else None

def pct(v):
    return f"{v:+.1f}%"

def lp_score_calc(overrides, gaps, cash_var, discount_day, net_sales, stock_var=None):
    if overrides is None and gaps is None:
        return None
    s = 0.0
    if overrides   is not None: s += min(overrides   / 30,   1.0) * 30
    if gaps         is not None: s += min(gaps         / 20,   1.0) * 20
    if cash_var     is not None: s += min(abs(cash_var) / 300, 1.0) * 20
    if discount_day is not None and net_sales:
        s += min((discount_day / net_sales) / 0.05, 1.0) * 15
    if stock_var    is not None and net_sales:
        s += min(abs(stock_var) / net_sales / 0.05, 1.0) * 15
    return round(s)

def lp_color(score):
    if score is None:   return "#aaa"
    if score >= 81:     return "#C8102E"
    if score >= 61:     return "#E8820C"
    if score >= 31:     return "#D9B400"
    return "#2E9E5B"

def lp_label(score):
    if score is None: return "No data"
    if score >= 81:   return "CRITICAL"
    if score >= 61:   return "HIGH"
    if score >= 31:   return "WATCH"
    return "LOW"

def comp_color(due_str):
    try:
        days = (datetime.strptime(due_str, "%Y-%m-%d") - TODAY_DT).days
        if days <= 7:  return "#C8102E"
        if days <= 30: return "#E8820C"
        return "#2E9E5B"
    except: return "#aaa"

def comp_label(due_str):
    try:
        due  = datetime.strptime(due_str, "%Y-%m-%d")
        days = (due - TODAY_DT).days
        if days < 0:  return f"OVERDUE"
        if days == 0: return "TODAY"
        return f"{days}d"
    except: return due_str

# ── Read CSV ───────────────────────────────────────────────────────────────
rows_by_store = defaultdict(list)
with open(CSV, newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        rows_by_store[r["store"]].append(r)

stores = []
for store, rows in rows_by_store.items():
    rows.sort(key=lambda r: r["date"])
    mtd_net = sum(fnum(r["net_sales"]) or 0 for r in rows)
    mtd_tgt = sum(fnum(r["target"])    or 0 for r in rows)
    var      = (mtd_net / mtd_tgt - 1) if mtd_tgt else 0

    last = rows[-1]
    gp   = fnum(last.get("gp_pct"))
    ov   = fnum(last.get("lp_overrides"))
    cv   = fnum(last.get("cash_recon_var"))
    gaps = fnum(last.get("invoice_gaps"))
    disc = fnum(last.get("discounts_day"))
    sv   = fnum(last.get("stock_var_net"))
    ns   = fnum(last.get("net_sales"))
    tgt  = fnum(last.get("target"))
    day_var = (ns / tgt - 1) if (ns and tgt) else var

    lp = lp_score_calc(ov, gaps, cv, disc, ns, sv)

    # Week trend arrow from daily sales
    week_sales = [fnum(r["net_sales"]) for r in rows if fnum(r["net_sales"])]
    if len(week_sales) >= 2:
        trend = "↑" if week_sales[-1] >= week_sales[-2] else "↓"
        trend_col = "#2E9E5B" if week_sales[-1] >= week_sales[-2] else "#C8102E"
    else:
        trend, trend_col = "—", "#aaa"

    mtd_royalty = mtd_net * ROYALTY_RATE
    day_royalty = ns * ROYALTY_RATE if ns else None

    if (cv and cv > 100) or (ov and ov >= 30) or var <= -0.20:
        st = "red"
    elif var <= -0.10 or (gp and gp < 54):
        st = "amber"
    else:
        st = "green"

    stores.append(dict(
        store=store, rows=rows, mtd_net=mtd_net, mtd_tgt=mtd_tgt, var=var,
        gp=gp, lp=lp, status=st, last=last, day_var=day_var,
        day_royalty=day_royalty, mtd_royalty=mtd_royalty,
        ov=ov, cv=cv, disc=disc, sv=sv, ns=ns, gaps=gaps,
        trend=trend, trend_col=trend_col,
    ))

COLORS = {"red": "#C8102E", "amber": "#E8820C", "green": "#2E9E5B"}

# ── Store cards (live) ─────────────────────────────────────────────────────
def store_card(s):
    c      = COLORS[s["status"]]
    lp_c   = lp_color(s["lp"])
    lp_txt = f"LP {s['lp']} {lp_label(s['lp'])}" if s["lp"] is not None else "LP —"
    return f"""
    <div style="background:#fff;border-radius:12px;margin-bottom:12px;
                overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
      <div style="background:{c};color:#fff;padding:10px 16px;
                  display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:14px;font-weight:700">{s['store']}</div>
          <div style="font-size:10px;opacity:.85">LIVE FEED</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:700;line-height:1">{pct(s['var']*100)}</div>
          <div style="font-size:10px;opacity:.85">vs target</div>
        </div>
      </div>
      <div style="padding:12px 16px">
        <!-- KPI row 1 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div style="background:#f7f7f7;border-radius:8px;padding:10px">
            <div style="font-size:18px;font-weight:700">{money(s['mtd_net'])}</div>
            <div style="font-size:10px;color:#777">MTD net sales</div>
          </div>
          <div style="background:#f7f7f7;border-radius:8px;padding:10px">
            <div style="font-size:18px;font-weight:700">{f"{s['gp']:.1f}%" if s['gp'] else "—"}</div>
            <div style="font-size:10px;color:#777">Gross profit %</div>
          </div>
        </div>
        <!-- KPI row 2 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <div style="background:#f7f7f7;border-radius:8px;padding:10px">
            <div style="font-size:18px;font-weight:700">{money(s['day_royalty'])}</div>
            <div style="font-size:10px;color:#777">Day royalty</div>
          </div>
          <div style="background:#f7f7f7;border-radius:8px;padding:10px">
            <div style="font-size:18px;font-weight:700">{money(s['mtd_royalty'])}</div>
            <div style="font-size:10px;color:#777">MTD royalty</div>
          </div>
        </div>
        <!-- LP Score bar -->
        <div style="background:#f7f7f7;border-radius:8px;padding:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:10px;color:#777;font-weight:600">LOSS-PREVENTION SCORE</div>
            <div style="font-size:13px;font-weight:700;color:{lp_c}">{lp_txt}</div>
          </div>
          <div style="background:#e8e8e8;border-radius:4px;height:8px">
            <div style="background:{lp_c};height:8px;border-radius:4px;
                        width:{min(s['lp'],100) if s['lp'] else 0}%"></div>
          </div>
        </div>
      </div>
    </div>"""

def pending_card(name, contact):
    return f"""
    <div style="background:#fff;border-radius:12px;margin-bottom:12px;
                overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);opacity:.55">
      <div style="background:#cfd3d8;color:#fff;padding:10px 16px;
                  display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:14px;font-weight:700">{name}</div>
          <div style="font-size:10px;opacity:.85">{contact}</div>
        </div>
        <div style="font-size:11px;font-weight:600">AWAITING FEED</div>
      </div>
    </div>"""

live_cards    = "".join(store_card(s) for s in stores)
pending_cards = "".join(pending_card(n, c) for n, c in PENDING_STORES)

# ── Alerts ─────────────────────────────────────────────────────────────────
ALERTS = [
    ("🔴", "Cash control",  "Till edited R748→R735.60; R145 cash-as-card reclass; 35 overrides; ~18 invoice gaps."),
    ("🔴", "Stock",         "Marinated Chicken −R218 MTD. Physical count needed."),
    ("🟠", "Sales",         "Day −25.8% vs target. MTD ~14% behind R525k goal."),
    ("🟠", "Food cost",     "Sunflower Oil, Red Peppers, Onions using 4–12× recipe."),
    ("🟠", "Discounts",     "Staff meals R1,168 MTD, all manager-authorised."),
    ("🟡", "Drivers",       "Katleho: 52 of 54 deliveries — single-driver risk."),
]

alert_rows = "".join(
    f'<div style="padding:10px 0;border-bottom:1px solid #f3f3f3;display:flex;gap:10px;'
    f'font-size:13px;line-height:1.4">'
    f'<span style="font-size:16px;flex-shrink:0">{icon}</span>'
    f'<div><b>{area}</b><br><span style="color:#555;font-size:12px">{txt}</span></div></div>'
    for icon, area, txt in ALERTS
)

# ── Compliance ─────────────────────────────────────────────────────────────
comp_rows = "".join(
    f'<div style="display:flex;justify-content:space-between;align-items:center;'
    f'padding:9px 0;border-bottom:1px solid #f3f3f3">'
    f'<div><div style="font-size:12px;font-weight:600">{item}</div>'
    f'<div style="font-size:10px;color:#aaa">{store}</div></div>'
    f'<div style="font-size:12px;font-weight:700;color:{comp_color(due)}">{comp_label(due)}</div>'
    f'</div>'
    for store, item, due in COMPLIANCE
)

primary = stores[0]

# ── Daily report sections (from MD) ───────────────────────────────────────
# Split the MD into h2 sections and render each as a collapsible card.
report_sections_html = ""
if REPORT_MD.exists():
    raw = REPORT_MD.read_text(encoding="utf-8")
    # Replace severity emoji with text badges
    raw = raw.replace("🔴", "🔴").replace("🟠", "🟠").replace("🟡", "🟡")
    # Split on ## headings (but skip the h1 header block before first ##)
    parts = re.split(r'\n(?=## )', raw)
    for part in parts:
        if not part.strip() or not part.startswith("##"):
            continue
        first_line = part.split("\n")[0]
        title = first_line.lstrip("# ").strip()
        body_md = "\n".join(part.split("\n")[1:]).strip()
        body_html = md_lib.markdown(body_md, extensions=["tables", "sane_lists"])
        report_sections_html += f"""
  <details style="background:#fff;border-radius:12px;margin-bottom:8px;
                  box-shadow:0 1px 4px rgba(0,0,0,.07);overflow:hidden">
    <summary style="padding:13px 16px;font-size:13px;font-weight:700;
                    cursor:pointer;list-style:none;display:flex;
                    justify-content:space-between;align-items:center;
                    border-left:4px solid #C8102E">
      {title}
      <span style="font-size:18px;color:#aaa;font-weight:300">›</span>
    </summary>
    <div style="padding:12px 16px;font-size:13px;line-height:1.6;
                border-top:1px solid #f0f0f0;overflow-x:auto">
      <style>
        details table{{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}}
        details th{{background:#1f1f1f;color:#fff;padding:5px 8px;text-align:left}}
        details td{{padding:5px 8px;border-bottom:1px solid #f0f0f0}}
        details tr:nth-child(even) td{{background:#f9f9f9}}
        details p{{margin:4px 0}}
        details ul,details ol{{padding-left:18px;margin:4px 0}}
        details li{{margin-bottom:3px}}
        details strong{{color:#111}}
        details hr{{border:none;border-top:1px solid #eee;margin:8px 0}}
      </style>
      {body_html}
    </div>
  </details>"""

HTML = f"""<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Louie — Romans Control Tower</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: #f2f3f5; color: #1a1a1a; -webkit-text-size-adjust: 100%; }}
  .section {{ background: #fff; border-radius: 12px; margin: 0 0 12px 0;
              box-shadow: 0 1px 4px rgba(0,0,0,.07); overflow: hidden; }}
  .section-header {{ padding: 12px 16px; background: #1f1f1f; color: #fff; }}
  .section-header h2 {{ font-size: 12px; font-weight: 700; text-transform: uppercase;
                        letter-spacing: .6px; color: #aaa; }}
  .section-body {{ padding: 0 16px; }}
</style>
</head><body>

<!-- Header -->
<div style="background:#161616;color:#fff;padding:16px;border-bottom:3px solid #C8102E;
            position:sticky;top:0;z-index:10">
  <div style="font-size:18px;font-weight:700">
    Lou<span style="color:#ff3b53">ie</span> — Roman's Pizza
  </div>
  <div style="font-size:11px;color:#aaa;margin-top:2px">
    {TODAY} · 4 stores · 1 live feed
  </div>
</div>

<div style="padding:12px">

  <!-- Summary pills -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
    <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;
                box-shadow:0 1px 4px rgba(0,0,0,.07)">
      <div style="font-size:26px;font-weight:700;color:#C8102E">1</div>
      <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:.4px">
        Need attention</div>
    </div>
    <div style="background:#fff;border-radius:10px;padding:12px;text-align:center;
                box-shadow:0 1px 4px rgba(0,0,0,.07)">
      <div style="font-size:26px;font-weight:700">{money(primary['mtd_royalty'])}</div>
      <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:.4px">
        MTD royalty</div>
    </div>
  </div>

  <!-- Store cards -->
  <div class="section">
    <div class="section-header"><h2>Stores</h2></div>
    <div style="padding:12px">{live_cards}{pending_cards}</div>
  </div>

  <!-- Alerts -->
  <div class="section">
    <div class="section-header" style="background:#C8102E">
      <h2 style="color:#fff">🚨 Boitumelo — Flags ({TODAY})</h2>
    </div>
    <div class="section-body">{alert_rows}</div>
  </div>

  <!-- Compliance -->
  <div class="section">
    <div class="section-header"><h2>Compliance Calendar</h2></div>
    <div class="section-body">{comp_rows}</div>
    <div style="padding:8px 16px 12px;font-size:10px;color:#aaa">
      ⚠️ Health + fire cert dates are placeholders — confirm with each store.
    </div>
  </div>

  <!-- Daily Management Report (collapsible sections) -->
  <div style="background:#1f1f1f;border-radius:12px;padding:12px 16px;margin-bottom:10px">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;
                letter-spacing:.6px;color:#aaa">Daily Management Report</div>
    <div style="font-size:11px;color:#666;margin-top:2px">
      Roman's Pizza Boitumelo · {TODAY} · tap to expand each section
    </div>
  </div>
  {report_sections_html}

  <div style="font-size:10px;color:#aaa;text-align:center;padding:8px 0 20px">
    Louie · data/store_metrics.csv · {TODAY}
  </div>

</div>
</body></html>"""

OUT.write_text(HTML, encoding="utf-8")
print("Mobile dashboard ->", OUT)
