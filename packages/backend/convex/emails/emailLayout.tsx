import {
  Body,
  Column,
  Container,
  Font,
  Head,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

// Brand + neutral tokens, mirrored from the approved Huashu mockup
// (_design/email/digest-directions.html, Direction A). Indigo is the app
// identity; the severity colours (critical / watch / ok) are domain semantics
// and live with their consumer (the digest), not here.
export const tokens = {
  indigo: "#5B50E8",
  ink: "#1A1A1A",
  muted: "#6B6B6B",
  faint: "#9B9B97",
  shell: "#F3F2F0",
  paper: "#FFFFFF",
  hair: "#E6E4E1",
} as const;

const FONT_STACK =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const body = {
  margin: 0,
  padding: "24px 0",
  backgroundColor: tokens.shell,
  fontFamily: FONT_STACK,
  color: tokens.ink,
};

const container = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: tokens.paper,
  borderRadius: "14px",
  overflow: "hidden",
  border: `1px solid ${tokens.hair}`,
};

const brandbar = {
  backgroundColor: tokens.indigo,
  padding: "16px 18px",
};

const pmark = {
  width: "30px",
  height: "30px",
  lineHeight: "30px",
  textAlign: "center" as const,
  fontSize: "17px",
  fontWeight: 800,
  letterSpacing: "-0.05em",
  color: tokens.indigo,
  backgroundColor: tokens.paper,
  borderRadius: "7px",
};

const wordmark = {
  margin: 0,
  paddingLeft: "11px",
  fontSize: "15px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: tokens.paper,
};

const when = {
  margin: 0,
  textAlign: "right" as const,
  fontSize: "11.5px",
  color: "rgba(255, 255, 255, 0.78)",
};

interface EmailLayoutProps {
  children: ReactNode;
  dateLabel: string;
  preview: string;
}

// The shared brand chrome every client email sits inside: Inter (with a system
// fallback for clients that block web fonts), the indigo brand bar with the
// square "P" mark and the date, and a 600px paper container on a warm-grey
// shell. The digest is its first consumer; future client emails reuse it as-is.
export function EmailLayout({
  children,
  dateLabel,
  preview,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fallbackFontFamily="sans-serif"
          fontFamily="Inter"
          fontStyle="normal"
          fontWeight={400}
          webFont={{
            url: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2",
            format: "woff2",
          }}
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={brandbar}>
            <Row>
              <Column style={{ width: "30px" }}>
                <div style={pmark}>P</div>
              </Column>
              <Column>
                <Text style={wordmark}>pos-pro</Text>
              </Column>
              <Column>
                <Text style={when}>{dateLabel}</Text>
              </Column>
            </Row>
          </Section>
          {children}
        </Container>
      </Body>
    </Html>
  );
}
