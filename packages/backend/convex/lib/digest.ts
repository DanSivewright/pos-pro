import {
  computeExceptions,
  type Exception,
  type ExceptionInput,
  SEVERITY_RANK,
  type Severity,
} from "./thresholds";

// One Store's figures going into a digest. The renderer derives the section.
export interface DigestStore {
  input: ExceptionInput;
  storeName: string;
}

// A Store that has at least one exception, ready to render. Clean Stores never
// reach this stage.
export interface DigestSection {
  exceptions: Exception[];
  severity: Severity;
  storeName: string;
}

const SEVERITY_COLOR: Record<Severity, string> = {
  watch: "#E8820C",
  critical: "#C8102E",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  watch: "Watch",
  critical: "Critical",
};

const HEADER_BG = "#161616";
const OK_COLOR = "#2E9E5B";

// The Stores worth showing, worst-first. A Store with no exceptions is hidden
// entirely (mirrors the prototype's "clean stores are not shown"). A Store's
// severity is its worst exception.
export function buildSections(stores: DigestStore[]): DigestSection[] {
  const sections: DigestSection[] = [];
  for (const store of stores) {
    const exceptions = computeExceptions(store.input);
    if (exceptions.length === 0) {
      continue;
    }
    // computeExceptions already orders worst-first, so the head is the worst.
    const severity = exceptions[0].severity;
    sections.push({ storeName: store.storeName, severity, exceptions });
  }
  return sections.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderSection(section: DigestSection): string {
  const color = SEVERITY_COLOR[section.severity];
  const rows = section.exceptions
    .map(
      (exception) =>
        `<tr><td style="padding:6px 12px;border-top:1px solid #eee;color:${SEVERITY_COLOR[exception.severity]};font-weight:600;">${SEVERITY_LABEL[exception.severity]}</td><td style="padding:6px 12px;border-top:1px solid #eee;">${escapeHtml(exception.message)}</td></tr>`
    )
    .join("");
  return `<div style="margin:16px 0;border:1px solid #eee;border-radius:8px;overflow:hidden;"><div style="background:${color};color:#fff;padding:8px 12px;font-weight:700;">${escapeHtml(section.storeName)} — ${SEVERITY_LABEL[section.severity]}</div><table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table></div>`;
}

// The digest HTML for a set of Stores on a given date. Clean Stores are hidden;
// when every Store is clean the body is an all-clear note. Pure: the same
// stores and label always render the same HTML, so it is unit-testable.
export function renderDigest(stores: DigestStore[], dateLabel: string): string {
  const sections = buildSections(stores);
  const criticalCount = sections.filter(
    (s) => s.severity === "critical"
  ).length;
  const watchCount = sections.filter((s) => s.severity === "watch").length;
  const pillColor =
    criticalCount > 0 ? SEVERITY_COLOR.critical : SEVERITY_COLOR.watch;
  const summary =
    sections.length === 0
      ? `<div style="background:${OK_COLOR};color:#fff;display:inline-block;padding:4px 12px;border-radius:999px;font-weight:600;">All clear</div>`
      : `<div style="background:${pillColor};color:#fff;display:inline-block;padding:4px 12px;border-radius:999px;font-weight:600;">${criticalCount} critical · ${watchCount} watch</div>`;
  const body =
    sections.length === 0
      ? '<p style="color:#666;">No exceptions today.</p>'
      : sections.map(renderSection).join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;"><div style="background:${HEADER_BG};color:#fff;border-bottom:3px solid ${SEVERITY_COLOR.critical};padding:16px;border-radius:8px 8px 0 0;"><h1 style="margin:0;font-size:18px;">Daily exception digest</h1><p style="margin:4px 0 0;color:#bbb;font-size:13px;">${escapeHtml(dateLabel)}</p></div><div style="padding:16px;">${summary}${body}</div><p style="color:#999;font-size:12px;padding:0 16px 16px;">Stores with no exceptions are not shown.</p></div>`;
}
