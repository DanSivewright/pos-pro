"""Build the Louie Control Tower dashboard — Romans Pizza edition.

Usage:
  python build_dashboard.py

Reads  data/store_metrics.csv  ->  reports/Louie Control Tower.html
4 Romans branches: Boitumelo (live), Laudium, Germiston, Protea Glen.
"""

import csv
import re
import markdown as md_lib
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timedelta

ROOT = Path("G:/My Drive/Claude Brain/Consulting/Louie")
CSV       = ROOT / "data" / "store_metrics.csv"
OUT       = ROOT / "reports" / "Louie Control Tower.html"
REPORT_MD = ROOT / "reports" / "Romans Boitumelo — Consolidated Report 2026-06-07.md"

TODAY_DT = datetime(2026, 6, 7)
TODAY    = "07 Jun 2026"

# Romans branches from Pest Zero CRM — CLIENT-002, -003, -004 (Boitumelo = CLIENT-013, live)
PENDING_STORES = [
    ("Romans - Laudium",     "Abbasi Semu",  "254 Tangerine St, Centurion"),
    ("Romans - Germiston",   "Noluvuyo",     "Shop 19, Lambton Court, Wadeville"),
    ("Romans - Protea Glen", "Gomolemo",     "Shop 72A, Protea Glen Mall, Soweto"),
]

# Compliance calendar — dates are placeholders; ⚠️ confirm with each store manager.
COMPLIANCE = [
    ("Roman's Pizza Boitumelo", "Monthly pest control",        "2026-07-07"),
    ("Roman's Pizza Boitumelo", "Health / food premises cert", "2026-12-31"),
    ("Roman's Pizza Boitumelo", "Fire certificate",            "2026-11-30"),
    ("Romans - Laudium",        "Monthly pest control",        "2026-07-12"),
    ("Romans - Germiston",      "Monthly pest control",        "2026-07-08"),
    ("Romans - Protea Glen",    "Monthly pest control",        "2026-07-09"),
    ("All stores",              "Monthly royalty payment",     "2026-06-30"),
]

ROYALTY_RATE = 0.08   # 4 % royalty + 4 % advertising = 8 % of excl-VAT gross

R = "R"
def money(v):
    if v is None: return "—"
    return f"{R}{float(v):,.0f}"

def pct(v, plus=True):
    return f"{v:+.1f}%" if plus else f"{v:.1f}%"

def fnum(x):
    return float(x) if x not in (None, "", " ") else None

# ── LP Risk Score ──────────────────────────────────────────────────────────
def lp_score_calc(overrides, gaps, cash_var, discount_day, net_sales, stock_var=None):
    """Weighted loss-prevention risk 0–100. None = insufficient data."""
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
    if score is None:       return "#aaa"
    if score >= 81:         return "#C8102E"
    if score >= 61:         return "#E8820C"
    if score >= 31:         return "#D9B400"
    return "#2E9E5B"

def lp_label(score):
    if score is None: return "No data"
    if score >= 81:   return "CRITICAL"
    if score >= 61:   return "HIGH"
    if score >= 31:   return "WATCH"
    return "LOW"

def lp_gauge_html(score, detail=""):
    col = lp_color(score)
    if score is None:
        return '<div style="color:#aaa;font-size:11px;padding:6px 0">Insufficient data — needs override + invoice data</div>'
    bar = min(score, 100)
    lbl = lp_label(score)
    return f"""
    <div style="margin:8px 0 4px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">
        <div style="font-size:36px;font-weight:700;color:{col};line-height:1">{score}</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:{col}">{lbl}</div>
          <div style="font-size:10px;color:#888">LP Risk Score / 100</div>
        </div>
      </div>
      <div style="background:#f0f0f0;border-radius:4px;height:10px;width:100%;margin-bottom:6px">
        <div style="background:{col};height:10px;border-radius:4px;width:{bar}%"></div>
      </div>
      {'<div style="font-size:10px;color:#555;line-height:1.5">' + detail + '</div>' if detail else ''}
      <div style="font-size:9px;color:#aaa;margin-top:4px">
        Scoring: overrides /30 · invoice gaps /20 · cash variance /20 · discounts /15 · stock /15
        &nbsp;|&nbsp; thresholds: 0–30 Low · 31–60 Watch · 61–80 High · 81–100 Critical
      </div>
    </div>"""

# ── Compliance helpers ─────────────────────────────────────────────────────
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
        if days < 0:  return f"OVERDUE {abs(days)}d"
        if days == 0: return "DUE TODAY"
        return f"{days}d — {due.strftime('%d %b')}"
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

    # WoW — same day last week
    last_dt   = datetime.strptime(last["date"], "%Y-%m-%d")
    prev_date = (last_dt - timedelta(days=7)).strftime("%Y-%m-%d")
    wow = None
    for r in rows:
        if r["date"] == prev_date:
            pns = fnum(r["net_sales"])
            if pns and ns: wow = (ns - pns) / pns
            break

    mtd_royalty = mtd_net * ROYALTY_RATE
    day_royalty = ns * ROYALTY_RATE if ns else None

    # Status
    if (cv and cv > 100) or (ov and ov >= 30) or var <= -0.20:
        st = "red"
    elif var <= -0.10 or (gp and gp < 54):
        st = "amber"
    else:
        st = "green"

    stores.append(dict(
        store=store, rows=rows,
        mtd_net=mtd_net, mtd_tgt=mtd_tgt, var=var,
        gp=gp, lp=lp, wow=wow, status=st, last=last,
        day_var=day_var, day_royalty=day_royalty, mtd_royalty=mtd_royalty,
        ov=ov, cv=cv, disc=disc, sv=sv, ns=ns, gaps=gaps,
    ))

needing     = sum(1 for s in stores if s["status"] in ("red", "amber"))
total_stores = len(stores) + len(PENDING_STORES)

# ── SVG bar chart ──────────────────────────────────────────────────────────
def svg_chart(rows):
    W, H, pad_b, pad_t, maxv = 640, 220, 34, 14, 22000.0
    bw  = (W - 20) / len(rows)
    tgt = fnum(rows[0]["target"]) or 16935
    ty  = (H - pad_b) - tgt / maxv * (H - pad_b - pad_t)
    bars = []
    for i, r in enumerate(rows):
        v = fnum(r["net_sales"])
        if not v: continue
        dv  = v / tgt - 1
        col = "#2E9E5B" if dv >= 0 else ("#C8102E" if dv <= -0.20 else "#E8820C")
        bh  = v / maxv * (H - pad_b - pad_t)
        x   = 10 + i * bw
        y   = (H - pad_b) - bh
        bars.append(
            f'<rect x="{x+6:.0f}" y="{y:.0f}" width="{bw-12:.0f}" height="{bh:.0f}" rx="3" fill="{col}"/>'
            f'<text x="{x+bw/2:.0f}" y="{H-pad_b+13:.0f}" text-anchor="middle" font-size="10" fill="#666">'
            f'{r["dow"]}</text>'
            f'<text x="{x+bw/2:.0f}" y="{y-4:.0f}" text-anchor="middle" font-size="9" fill="#333">'
            f'{v/1000:.1f}k</text>'
        )
    return (
        f'<svg viewBox="0 0 {W} {H}" width="100%" style="max-width:680px">'
        f'<line x1="10" y1="{ty:.0f}" x2="{W-10}" y2="{ty:.0f}" stroke="#333" '
        f'stroke-dasharray="5 4" stroke-width="1.2"/>'
        f'<text x="{W-12}" y="{ty-4:.0f}" text-anchor="end" font-size="9" fill="#333">'
        f'target {money(tgt)}/day</text>'
        + "".join(bars) + "</svg>"
    )

# ── Tiles ──────────────────────────────────────────────────────────────────
COLORS = {"red": "#C8102E", "amber": "#E8820C", "green": "#2E9E5B"}

def tile(s):
    c      = COLORS[s["status"]]
    lp_c   = lp_color(s["lp"])
    lp_txt = f"LP {s['lp']}" if s["lp"] is not None else "LP —"
    wow_txt = ""
    if s["wow"] is not None:
        wc = "#2E9E5B" if s["wow"] >= 0 else "#C8102E"
        wow_txt = f'<span style="font-size:9px;color:{wc};margin-left:4px">WoW {pct(s["wow"]*100)}</span>'
    return f"""<div class="tile" style="border-top-color:{c}">
      <div class="tname">{s['store']} <span class="tlive">LIVE</span></div>
      <div class="tnet">{money(s['mtd_net'])} <span class="tsub">MTD</span></div>
      <div class="trow">
        <span class="badge" style="background:{c}">{pct(s['var']*100)} vs target</span>
        {f'<span class="tgp">GP {s["gp"]:.1f}%</span>' if s['gp'] else ''}
        <span class="badge" style="background:{lp_c}">{lp_txt}</span>
        {wow_txt}
      </div>
    </div>"""

def ptile(name, contact, address):
    return f"""<div class="tile pending">
      <div class="tname">{name}</div>
      <div style="font-size:10px;color:#bbb;margin-bottom:6px">{contact}</div>
      <div class="tnet pend">Awaiting feed</div>
      <div class="trow"><span class="badge grey">no data</span></div>
    </div>"""

tiles_html = "".join(tile(s) for s in stores) + \
             "".join(ptile(*p) for p in PENDING_STORES)

# ── KPI cards ──────────────────────────────────────────────────────────────
primary = stores[0]
last    = primary["last"]

kpis = [
    ("Day net sales",  money(primary["ns"]),            pct(primary["day_var"]*100)+" vs tgt",
        "red" if primary["day_var"] <= -0.20 else "amber"),
    ("MTD net sales",  money(primary["mtd_net"]),       pct(primary["var"]*100)+" vs tgt",
        "amber"),
    ("Gross profit %", f'{primary["gp"]:.1f}%' if primary["gp"] else "—",
        "55%+ QSR benchmark",
        "green" if (primary["gp"] and primary["gp"] >= 55) else "amber"),
    ("Day royalty",    money(primary["day_royalty"]),   "8% royalty+advert", "amber"),
    ("MTD royalty",    money(primary["mtd_royalty"]),   "cumulative Jun",    "amber"),
]

kpi_html = "".join(
    f'<div class="kpi" style="border-top-color:{COLORS[c]}">'
    f'<div class="kv">{v}</div><div class="kl">{l}</div><div class="kd">{d}</div></div>'
    for l, v, d, c in kpis
)

# WoW banner
if primary["wow"] is not None:
    wow_col = "#2E9E5B" if primary["wow"] >= 0 else "#C8102E"
    wow_html = (f'<div style="font-size:11px;color:{wow_col};font-weight:600;margin-bottom:8px">'
                f'Week-on-week: {pct(primary["wow"]*100)} vs same day last week</div>')
else:
    wow_html = ('<div style="font-size:11px;color:#aaa;margin-bottom:8px">'
                '⏳ Week-on-week: awaiting week 2 data</div>')

# Alerts
LATEST_ALERTS = [
    ("red",    "Cash control",  "Till edited R748→R735.60 to force balance; R145.50 cash-as-card reclass; "
                                "35 manager overrides; ~18 invoice number gaps."),
    ("red",    "Stock",         "Marinated Chicken −R218.86 MTD (−R141.52 on Sunday alone). "
                                "Physical count + portioning check needed."),
    ("amber",  "Sales",         "Day R12,571 = −25.8% vs R16,935 target. MTD ~14% behind R525k goal."),
    ("amber",  "Food cost",     "Sunflower Oil, Sliced Red Peppers, Caramelized Onions running "
                                "4–12× recipe. Oil / Dough / Packaging over theoretical cost."),
    ("amber",  "Discounts",     "Staff-meal write-offs R1,168.60 MTD, all manager-authorised. "
                                "Invoice #43 written to R0."),
    ("yellow", "Drivers",       "Katleho handled 52 of 54 deliveries this week — single-driver risk."),
    ("yellow", "Petty cash",    "'Trolley Sales R1,403.13' logged as an expense — description "
                                "looks wrong; verify."),
]

alerts_html = "".join(
    f'<li><span class="dot {sev}"></span><b>{area}</b> — {txt}</li>'
    for sev, area, txt in LATEST_ALERTS
)

# LP Score section
lp_detail = (
    "Jun 7 detail: 35 overrides (all Kgosana Moeng on Palesa's till; densest burst 16 in 65 min) · "
    "18 missing invoice numbers · cash figure edited R12.40 after posting · "
    "R145.50 cash/card reclass · stock take reopened 3× after cashup. "
    "<b>Owner action:</b> pull the Over-ring report; verify each void against the cancel log."
)
lp_gauge = lp_gauge_html(primary["lp"], lp_detail)

# Compliance rows
comp_rows_html = ""
for store, item, due in COMPLIANCE:
    col = comp_color(due)
    lbl = comp_label(due)
    comp_rows_html += (
        f'<tr><td style="padding:5px 8px">{store}</td>'
        f'<td style="padding:5px 8px">{item}</td>'
        f'<td style="padding:5px 8px;font-weight:600;color:{col}">{lbl}</td></tr>\n'
    )

# ── Daily report sections (from MD, collapsible) ──────────────────────────
report_sections_html = ""
if REPORT_MD.exists():
    raw   = REPORT_MD.read_text(encoding="utf-8")
    parts = re.split(r'\n(?=## )', raw)
    for part in parts:
        if not part.strip() or not part.startswith("##"):
            continue
        title     = part.split("\n")[0].lstrip("# ").strip()
        body_html = md_lib.markdown(
            "\n".join(part.split("\n")[1:]).strip(),
            extensions=["tables", "sane_lists"]
        )
        report_sections_html += f"""
  <details style="background:#fff;border:1px solid #e6e6e6;border-radius:8px;
                  margin-bottom:8px;overflow:hidden">
    <summary style="padding:11px 16px;font-size:13px;font-weight:600;cursor:pointer;
                    list-style:none;display:flex;justify-content:space-between;
                    align-items:center;border-left:4px solid #C8102E">
      {title}
      <span style="font-size:18px;color:#aaa;font-weight:300">›</span>
    </summary>
    <div style="padding:14px 18px;font-size:12px;line-height:1.7;
                border-top:1px solid #f0f0f0;overflow-x:auto">
      <style>
        details table{{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}}
        details th{{background:#1f1f1f;color:#fff;padding:5px 8px;text-align:left;font-weight:600}}
        details td{{padding:5px 8px;border-bottom:1px solid #efefef;vertical-align:top}}
        details tbody tr:nth-child(even) td{{background:#f9f9f9}}
        details p{{margin:4px 0}}
        details ul,details ol{{padding-left:20px;margin:4px 0}}
        details li{{margin-bottom:2px}}
        details hr{{border:none;border-top:1px solid #eee;margin:10px 0}}
      </style>
      {body_html}
    </div>
  </details>"""

chart = svg_chart(primary["rows"])
mtd_royalty_all = sum(s["mtd_royalty"] for s in stores)

# ── HTML ───────────────────────────────────────────────────────────────────
HTML = f"""<!doctype html><html><head><meta charset="utf-8">
<title>Louie — Roman's Pizza Control Tower</title>
<style>
*{{box-sizing:border-box}}
body{{margin:0;font-family:"Segoe UI",Helvetica,Arial,sans-serif;background:#f4f5f7;color:#222}}
.top{{background:#161616;color:#fff;padding:16px 26px;border-bottom:4px solid #C8102E}}
.top h1{{margin:0;font-size:21px;letter-spacing:-.3px}}
.top h1 b{{color:#ff3b53}}
.top .sub{{color:#aaa;font-size:12px;margin-top:3px}}
.wrap{{max-width:1080px;margin:0 auto;padding:20px 26px 40px}}
.summary{{display:flex;gap:14px;margin:6px 0 18px}}
.scard{{background:#fff;border:1px solid #e6e6e6;border-radius:8px;padding:12px 16px;flex:1}}
.scard .n{{font-size:24px;font-weight:700}}
.scard .l{{font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.4px}}
h2{{font-size:13px;font-weight:700;margin:22px 0 10px;color:#111;
    border-bottom:2px solid #C8102E;padding-bottom:5px;text-transform:uppercase;
    letter-spacing:.5px}}
.grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}}
.tile{{background:#fff;border:1px solid #e6e6e6;border-top:4px solid #ccc;
       border-radius:8px;padding:12px 14px;min-height:100px}}
.tile.pending{{opacity:.55;border-top-color:#cfd3d8;background:#fafafa}}
.tlive{{font-size:8px;background:#2E9E5B;color:#fff;padding:1px 5px;
        border-radius:8px;vertical-align:middle;margin-left:4px;font-weight:600}}
.tname{{font-size:12px;font-weight:600;color:#111;margin-bottom:4px}}
.tnet{{font-size:20px;font-weight:700;margin:4px 0}}
.tnet.pend{{font-size:13px;color:#999;font-weight:500}}
.tsub{{font-size:10px;color:#999;font-weight:500}}
.trow{{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap}}
.badge{{color:#fff;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px}}
.badge.grey{{background:#b6bbc1}}
.tgp{{font-size:10px;color:#666}}
.panel{{background:#fff;border:1px solid #e6e6e6;border-radius:10px;padding:18px 20px;margin-top:8px}}
.panel h3{{margin:0 0 2px;font-size:16px;font-weight:700}}
.panel .ps{{color:#777;font-size:11px;margin-bottom:14px}}
.kgrid{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px}}
.kpi{{border:1px solid #eee;border-top:3px solid #ccc;border-radius:8px;padding:10px;text-align:center}}
.kv{{font-size:18px;font-weight:700}}
.kl{{font-size:10px;color:#777;margin-top:2px}}
.kd{{font-size:9px;color:#aaa;margin-top:2px}}
.chartwrap{{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start}}
.chartbox{{flex:1.4;min-width:340px}}
.alertbox{{flex:1;min-width:300px}}
.alertbox ul{{list-style:none;margin:0;padding:0}}
.alertbox li{{font-size:11px;padding:7px 0;border-bottom:1px solid #f0f0f0;line-height:1.4}}
.dot{{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}}
.dot.red{{background:#C8102E}}
.dot.amber{{background:#E8820C}}
.dot.yellow{{background:#D9B400}}
.cap{{font-size:11px;color:#888;margin:4px 0 10px}}
.lpsec{{background:#fff;border:1px solid #e6e6e6;border-radius:10px;padding:18px 20px;margin-top:14px}}
.comptable{{width:100%;border-collapse:collapse}}
.comptable th{{background:#1f1f1f;color:#fff;text-align:left;padding:6px 8px;font-size:11px;font-weight:600}}
.comptable td{{font-size:11px;border-bottom:1px solid #f0f0f0}}
.compnote{{font-size:10px;color:#aaa;margin-top:8px}}
.foot{{color:#9aa0a6;font-size:10px;margin-top:24px;border-top:1px solid #e6e6e6;padding-top:10px}}
</style></head><body>
<div class="top">
  <h1>Lou<b>ie</b> — Roman's Pizza Control Tower</h1>
  <div class="sub">Romans Pizza group · {total_stores} stores · 1 live feed · {TODAY}</div>
</div>
<div class="wrap">

  <!-- Summary bar -->
  <div class="summary">
    <div class="scard"><div class="n">{total_stores}</div><div class="l">Romans branches</div></div>
    <div class="scard"><div class="n" style="color:#C8102E">{needing}</div><div class="l">Need attention (live)</div></div>
    <div class="scard"><div class="n">1</div><div class="l">Live feed connected</div></div>
    <div class="scard"><div class="n">{money(mtd_royalty_all)}</div><div class="l">MTD royalty liability</div></div>
  </div>

  <!-- Store tiles -->
  <h2>All stores — traffic-lit by status</h2>
  <div class="grid">{tiles_html}</div>

  <!-- Drill-down -->
  <h2>Drill-down — Roman's Pizza Boitumelo</h2>
  <div class="panel">
    <h3>Roman's Pizza Boitumelo</h3>
    <div class="ps">01–07 Jun 2026 · manager Kgosana Moeng · cashier Palesa Sithole · POS ServeUp</div>
    {wow_html}
    <div class="kgrid">{kpi_html}</div>
    <div class="chartwrap">
      <div class="chartbox">
        <div class="cap">Daily net sales vs target — green beat, amber under, red &gt;20% under</div>
        {chart}
      </div>
      <div class="alertbox">
        <div class="cap">Flags from latest batch ({TODAY})</div>
        <ul>{alerts_html}</ul>
      </div>
    </div>
  </div>

  <!-- Loss-Prevention Score -->
  <h2>Loss-Prevention Risk — Roman's Pizza Boitumelo</h2>
  <div class="lpsec">
    {lp_gauge}
  </div>

  <!-- Compliance Calendar -->
  <h2>Compliance Calendar</h2>
  <div class="panel">
    <table class="comptable">
      <thead><tr><th>Store</th><th>Item</th><th>Status</th></tr></thead>
      <tbody>{comp_rows_html}</tbody>
    </table>
    <div class="compnote">
      ⚠️ Health, fire and trading licence dates are placeholders — send to Louis to confirm actual renewal dates per store.
    </div>
  </div>

  <!-- Daily Management Report -->
  <h2>Daily Management Report — Roman's Pizza Boitumelo</h2>
  {report_sections_html}

  <div class="foot">
    Generated by Louie from data/store_metrics.csv · Romans Pizza group · {TODAY}
  </div>
</div></body></html>"""

OUT.write_text(HTML, encoding="utf-8")
print("Dashboard ->", OUT)
print(f"stores={len(stores)}  needing={needing}  total={total_stores}  LP={primary['lp']}  MTD royalty={money(mtd_royalty_all)}")
