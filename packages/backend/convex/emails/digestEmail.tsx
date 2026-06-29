import {
  Button,
  Column,
  Heading,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import {
  buildSections,
  type DigestSection,
  type DigestStore,
} from "../lib/digest";
import type { Severity } from "../lib/thresholds";
import { EmailLayout, tokens } from "./emailLayout";

// Severity is a domain semantic: these colours are reserved strictly for it and
// never used as brand chrome (that is indigo, in EmailLayout).
const SEVERITY_COLOR: Record<Severity, string> = {
  watch: "#E8820C",
  critical: "#C8102E",
};

const SEVERITY_TINT: Record<Severity, string> = {
  watch: "#FDF2E5",
  critical: "#FCEAEC",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  watch: "Watch",
  critical: "Critical",
};

const OK_COLOR = "#2E9E5B";
const OK_TINT = "#E7F4ED";

const lede = { padding: "18px 18px 0" };

const ledeHeading = {
  margin: "0 0 12px",
  fontSize: "17px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: tokens.ink,
};

// The card sits inside an 18px-padded wrapper rather than carrying its own
// horizontal margin: React Email renders each Section as a width:100% table, and
// a side margin on a 100%-wide table overflows the container on the right (the
// margin pushes it out instead of shrinking it). Padding on a wrapper keeps both
// gutters symmetric.
const cardWrap = {
  padding: "0 18px",
};

const card = {
  margin: "16px 0",
  border: `1px solid ${tokens.hair}`,
  borderRadius: "12px",
  overflow: "hidden",
};

const cardHeader = {
  padding: "12px 14px",
  borderBottom: `1px solid ${tokens.hair}`,
};

const storeName = {
  margin: 0,
  paddingLeft: "9px",
  fontSize: "14.5px",
  fontWeight: 700,
  letterSpacing: "-0.01em",
  color: tokens.ink,
};

const exceptionRow = {
  padding: "11px 14px",
  borderTop: "1px solid #F1EFEC",
};

const exceptionMessage = {
  margin: 0,
  paddingLeft: "10px",
  fontSize: "13px",
  lineHeight: "1.45",
  color: "#2E2E2E",
};

const cta = {
  display: "block",
  margin: "4px 14px 16px",
  padding: "10px",
  fontSize: "13px",
  fontWeight: 600,
  color: tokens.indigo,
  textAlign: "center" as const,
  letterSpacing: "-0.01em",
  textDecoration: "none",
  border: `1.5px solid ${tokens.indigo}`,
  borderRadius: "9px",
};

const foot = {
  padding: "4px 18px 22px",
  margin: 0,
  fontSize: "11.5px",
  lineHeight: "1.5",
  color: tokens.faint,
};

function severityDot(severity: Severity) {
  return {
    width: "9px",
    height: "9px",
    backgroundColor: SEVERITY_COLOR[severity],
    borderRadius: "50%",
  };
}

function chip(severity: Severity) {
  return {
    display: "inline-block",
    padding: "3px 9px",
    fontSize: "10.5px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: SEVERITY_COLOR[severity],
    backgroundColor: SEVERITY_TINT[severity],
    borderRadius: "999px",
  };
}

function summaryPill(criticalCount: number, watchCount: number) {
  let color = OK_COLOR;
  let tint = OK_TINT;
  let label = "All clear";
  if (criticalCount + watchCount > 0) {
    const worst: Severity = criticalCount > 0 ? "critical" : "watch";
    color = SEVERITY_COLOR[worst];
    tint = SEVERITY_TINT[worst];
    label = `${criticalCount} critical · ${watchCount} watch`;
  }
  return (
    <table style={{ borderCollapse: "collapse" }}>
      <tbody>
        <tr>
          <td
            style={{
              padding: "5px 12px",
              fontSize: "12.5px",
              fontWeight: 600,
              color,
              backgroundColor: tint,
              borderRadius: "999px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "7px",
                height: "7px",
                marginRight: "7px",
                backgroundColor: color,
                borderRadius: "50%",
              }}
            />
            {label}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function StoreCard({
  section,
  appUrl,
}: {
  appUrl: string | null;
  section: DigestSection;
}) {
  return (
    <Section style={cardWrap}>
      <Section style={card}>
        <Row style={cardHeader}>
          <Column style={{ width: "9px" }}>
            <div style={severityDot(section.severity)} />
          </Column>
          <Column>
            <Text style={storeName}>{section.storeName}</Text>
          </Column>
          <Column style={{ textAlign: "right" }}>
            <span style={chip(section.severity)}>
              {SEVERITY_LABEL[section.severity]}
            </span>
          </Column>
        </Row>
        {section.exceptions.map((exception) => (
          <Row key={exception.metric} style={exceptionRow}>
            <Column style={{ width: "6px", verticalAlign: "top" }}>
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  marginTop: "6px",
                  backgroundColor: SEVERITY_COLOR[exception.severity],
                  borderRadius: "50%",
                }}
              />
            </Column>
            <Column>
              <Text style={exceptionMessage}>{exception.message}</Text>
            </Column>
          </Row>
        ))}
        {appUrl ? (
          <Button href={`${appUrl}/dashboard`} style={cta}>
            View in Control Tower →
          </Button>
        ) : null}
      </Section>
    </Section>
  );
}

interface DigestEmailProps {
  appUrl: string | null;
  dateLabel: string;
  sections: DigestSection[];
}

// Direction A · Branded Ledger (approved Huashu pass). Clean Stores are already
// dropped by buildSections; when every Store is clean the body is an all-clear
// note. A per-Store CTA deep-links into the Control Tower when DIGEST_APP_URL is
// configured, and is omitted gracefully when it is not.
export function DigestEmail({ appUrl, dateLabel, sections }: DigestEmailProps) {
  const criticalCount = sections.filter(
    (s) => s.severity === "critical"
  ).length;
  const watchCount = sections.length - criticalCount;
  const preview =
    sections.length === 0
      ? `No exceptions today — ${dateLabel}`
      : `${criticalCount} critical · ${watchCount} watch — ${dateLabel}`;
  return (
    <EmailLayout dateLabel={dateLabel} preview={preview}>
      <Section style={lede}>
        <Heading as="h2" style={ledeHeading}>
          Daily exception digest
        </Heading>
        {summaryPill(criticalCount, watchCount)}
      </Section>
      {sections.length === 0 ? (
        <Text style={{ ...exceptionMessage, padding: "16px 18px 0" }}>
          No exceptions today.
        </Text>
      ) : (
        sections.map((section) => (
          <StoreCard
            appUrl={appUrl}
            key={section.storeName}
            section={section}
          />
        ))
      )}
      <Text style={foot}>Stores with no exceptions are not shown.</Text>
    </EmailLayout>
  );
}

// Renders the approved digest to bulletproof, inline-styled table HTML. Pure
// over its inputs (same Stores + label + URL → same HTML). Async because the
// React Email renderer runs react-dom/server, so this must be called from a
// Convex Node-runtime action.
export function renderDigestEmail(
  stores: DigestStore[],
  dateLabel: string,
  appUrl: string | null
): Promise<string> {
  const sections = buildSections(stores);
  return render(
    <DigestEmail appUrl={appUrl} dateLabel={dateLabel} sections={sections} />
  );
}
