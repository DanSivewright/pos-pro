import { auth, clerkClient } from "@clerk/nextjs/server";
import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import { fetchMutation } from "convex/nextjs";
import { NextResponse } from "next/server";
import { detectReportType } from "@/lib/extraction/detect-report-type";
import { parseCashup } from "@/lib/extraction/parse-cashup";
import { parseGrossProfit } from "@/lib/extraction/parse-gross-profit";
import { parseRoyalty } from "@/lib/extraction/parse-royalty";
import { parseStockVariance } from "@/lib/extraction/parse-stock-variance";
import { parseStockWastage } from "@/lib/extraction/parse-stock-wastage";
import { extractPdfText } from "@/lib/extraction/pdf-text";

// Parsing runs in this Node boundary, in memory; raw bytes are never persisted.
export const runtime = "nodejs";

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

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });

  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // One batch for the whole action; every file (parsed, failed or unsupported)
  // is recorded against it.
  const { uploadId } = await fetchMutation(
    api.ingest.createBatch,
    { storeName: org.name, fileCount: files.length },
    { token }
  );
  const ctx: IngestContext = { storeName: org.name, token, uploadId };

  const results: FileResult[] = [];
  for (const file of files) {
    results.push(await ingestFile(file, ctx));
  }

  return NextResponse.json({ results });
}
