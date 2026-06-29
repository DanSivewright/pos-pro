import { auth, clerkClient } from "@clerk/nextjs/server";
import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import { fetchMutation } from "convex/nextjs";
import { NextResponse } from "next/server";
import { mapWithConcurrency } from "@/lib/concurrency";
import { detectReportType } from "@/lib/extraction/detect-report-type";
import { parseCashup } from "@/lib/extraction/parse-cashup";
import { parseGrossProfit } from "@/lib/extraction/parse-gross-profit";
import { parseRoyalty } from "@/lib/extraction/parse-royalty";
import { parseStockVariance } from "@/lib/extraction/parse-stock-variance";
import { parseStockWastage } from "@/lib/extraction/parse-stock-wastage";
import { extractPdfText } from "@/lib/extraction/pdf-text";

// Parsing runs in this Node boundary, in memory; raw bytes are never persisted.
export const runtime = "nodejs";

// How many files a single upload batch processes at once. Each file does an
// in-memory PDF extraction plus a Convex round-trip; a small pool keeps a large
// batch off the serverless timeout without exhausting memory on big PDFs. The
// per-file ingest mutations are independent Convex transactions (OCC-safe), so
// concurrency cannot lose data — only the result array order is pinned to the
// input order, below.
const UPLOAD_CONCURRENCY = 5;

// Hard ceiling on a single file's size. POS report PDFs are small text exports;
// anything this large is malformed or hostile, and parsing it in memory in the
// Node boundary risks OOM/timeout. Oversized files are refused before any read.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

interface FileResult {
  date?: string;
  filename: string;
  needsReview?: boolean;
  reason?: string;
  reportType?: string;
  status: "parsed" | "failed" | "unsupported";
}

interface IngestContext {
  storeName: string;
  token: string;
  uploadId: Id<"uploads">;
}

// The subset of a Clerk user this route reads to label an upload. Typed
// structurally so the route needn't depend on @clerk/backend directly.
interface ClerkUploader {
  emailAddresses: { emailAddress: string; id: string }[];
  fullName: string | null;
  primaryEmailAddressId: string | null;
  username: string | null;
}

// The uploader's display name from Clerk, preferring a real name, then a
// username, then the primary email. Returns undefined when none is set, leaving
// the upload row's name blank so the history falls back to the subject id.
function resolveUploaderName(user: ClerkUploader): string | undefined {
  const fullName = user.fullName?.trim();
  if (fullName) {
    return fullName;
  }
  if (user.username) {
    return user.username;
  }
  const primary =
    user.emailAddresses.find(
      (entry) => entry.id === user.primaryEmailAddressId
    ) ?? user.emailAddresses[0];
  return primary?.emailAddress;
}

// Records a file that never reached ingest against the batch, so a bad file in
// a multi-file action is accounted for without blocking the others.
async function recordUnparsed(
  ctx: IngestContext,
  filename: string,
  status: "failed" | "unsupported",
  reason: string
): Promise<FileResult> {
  await fetchMutation(
    api.ingest.recordUnparsed,
    { uploadId: ctx.uploadId, filename, status, reason },
    { token: ctx.token }
  );
  return { filename, status, reason };
}

async function ingestParsed(
  ctx: IngestContext,
  filename: string,
  text: string,
  reportType:
    | "cashup"
    | "royalty"
    | "grossProfit"
    | "stockVariance"
    | "stockWastage"
): Promise<FileResult> {
  const { storeName, token, uploadId } = ctx;
  const base = { storeName, filename, uploadId };

  if (reportType === "royalty") {
    const extract = parseRoyalty(text);
    const result = await fetchMutation(
      api.ingest.royalty,
      { ...base, extract },
      { token }
    );
    return {
      filename,
      status: "parsed",
      reportType,
      date: extract.date,
      needsReview: result.needsReview,
    };
  }

  if (reportType === "grossProfit") {
    const extract = parseGrossProfit(text);
    const result = await fetchMutation(
      api.ingest.grossProfit,
      { ...base, extract },
      { token }
    );
    return {
      filename,
      status: "parsed",
      reportType,
      date: extract.date,
      needsReview: result.needsReview,
    };
  }

  if (reportType === "stockVariance") {
    const extract = parseStockVariance(text);
    const result = await fetchMutation(
      api.ingest.stockVariance,
      { ...base, extract },
      { token }
    );
    return {
      filename,
      status: "parsed",
      reportType,
      date: extract.date,
      needsReview: result.needsReview,
    };
  }

  if (reportType === "stockWastage") {
    const extract = parseStockWastage(text);
    const result = await fetchMutation(
      api.ingest.stockWastage,
      { ...base, extract },
      { token }
    );
    return {
      filename,
      status: "parsed",
      reportType,
      date: extract.date,
      needsReview: result.needsReview,
    };
  }

  const extract = parseCashup(text);
  const result = await fetchMutation(
    api.ingest.cashup,
    { ...base, extract },
    { token }
  );
  return {
    filename,
    status: "parsed",
    reportType,
    date: extract.date,
    needsReview: result.needsReview,
  };
}

async function ingestFile(file: File, ctx: IngestContext): Promise<FileResult> {
  let text: string;
  try {
    text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return recordUnparsed(ctx, file.name, "failed", "Could not read PDF");
  }

  const reportType = detectReportType(text);
  if (reportType === null) {
    return recordUnparsed(ctx, file.name, "unsupported", "Unrecognised report");
  }

  try {
    return await ingestParsed(ctx, file.name, text, reportType);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Parse failed";
    return recordUnparsed(ctx, file.name, "failed", reason);
  }
}

export async function POST(request: Request): Promise<Response> {
  const { userId, orgId, getToken } = await auth();
  if (userId === null) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json(
      { error: "Select a Store before uploading" },
      { status: 400 }
    );
  }

  const token = await getToken({ template: "convex" });
  if (token === null) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Per-org upload rate limit, enforced in Convex (the source of truth) so it
  // holds across stateless function instances. One batch spends one token.
  const limit = await fetchMutation(api.rateLimit.checkUpload, {}, { token });
  if (!limit.ok) {
    const retryAfterSeconds = Math.ceil(limit.retryAfter / 1000);
    return NextResponse.json(
      { error: "Too many uploads — please wait a moment and try again" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const client = await clerkClient();
  const [org, user] = await Promise.all([
    client.organizations.getOrganization({ organizationId: orgId }),
    client.users.getUser(userId),
  ]);
  const uploaderName = resolveUploaderName(user);

  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Refuse oversized files before opening a batch or reading any bytes, so a
  // pathological PDF can never reach the in-memory extractor.
  const oversized = files.filter((file) => file.size > MAX_UPLOAD_BYTES);
  if (oversized.length > 0) {
    const names = oversized.map((file) => file.name).join(", ");
    return NextResponse.json(
      { error: `File too large (max 15MB): ${names}` },
      { status: 413 }
    );
  }

  // One batch for the whole action; every file (parsed, failed or unsupported)
  // is recorded against it.
  const { uploadId } = await fetchMutation(
    api.ingest.createBatch,
    { storeName: org.name, fileCount: files.length, uploaderName },
    { token }
  );
  const ctx: IngestContext = { storeName: org.name, token, uploadId };

  // Process the batch with bounded concurrency; results stay in input order.
  const results = await mapWithConcurrency(files, UPLOAD_CONCURRENCY, (file) =>
    ingestFile(file, ctx)
  );

  return NextResponse.json({ results });
}
