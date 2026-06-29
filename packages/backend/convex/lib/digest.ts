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

// The Stores worth showing, worst-first. A Store with no exceptions is hidden
// entirely (clean Stores are never shown). A Store's severity is its worst
// exception. Pure: the same stores always produce the same sections, so the
// digest's selection logic is unit-testable without rendering any HTML.
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
