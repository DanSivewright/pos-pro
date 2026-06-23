# File extraction runs in a Next.js Node server boundary, not in Convex

Uploaded POS files are parsed in a **Next.js Route Handler / Server Action (Node runtime
on Vercel)**, in-memory, then the structured figures are persisted to Convex via mutations.
Raw file bytes are never written to disk or to Convex storage, satisfying the brief's
"do not store raw PDFs". Convex remains the **sole owner and writer of all data** — the
Next.js layer is a stateless transform. Tooling: `unpdf` (pdf.js, serverless-safe) for
PDFs; deterministic positional text parsing (these reports are machine-generated, no OCR).

Status: accepted

## Considered options
- Parse inside a Convex Node action — rejected: the file must first reach Convex (via file
  storage), conflicting with "don't store raw PDFs", plus action size/time limits.
- Parse in Next.js Node, persist via Convex mutations — chosen: natural multipart handling,
  raw bytes stay in-memory, Vercel-native, Convex stays pure and authoritative.

## Consequences
- All persistence still flows through Convex mutations; the web layer holds no durable state.
- AI is never used as a parse fallback; an unparseable recognized report is marked `failed`.
