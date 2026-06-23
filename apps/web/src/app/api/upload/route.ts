import { auth, clerkClient } from "@clerk/nextjs/server";
import { api } from "@pos-pro/backend/convex/_generated/api";
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

async function ingestFile(
  file: File,
  storeName: string,
  token: string
): Promise<FileResult> {
  let text: string;
  try {
    text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return {
      filename: file.name,
      status: "failed",
      reason: "Could not read PDF",
    };
  }

  const reportType = detectReportType(text);
  if (reportType === null) {
    return {
      filename: file.name,
      status: "unsupported",
      reason: "Unrecognised report",
    };
  }

  try {
    if (reportType === "royalty") {
      const extract = parseRoyalty(text);
      const result = await fetchMutation(
        api.ingest.royalty,
        { storeName, filename: file.name, extract },
        { token }
      );
      return {
        filename: file.name,
        status: "parsed",
        reportType: "royalty",
        date: extract.date,
        needsReview: result.needsReview,
      };
    }

    if (reportType === "grossProfit") {
      const extract = parseGrossProfit(text);
      const result = await fetchMutation(
        api.ingest.grossProfit,
        { storeName, filename: file.name, extract },
        { token }
      );
      return {
        filename: file.name,
        status: "parsed",
        reportType: "grossProfit",
        date: extract.date,
        needsReview: result.needsReview,
      };
    }

    if (reportType === "stockVariance") {
      const extract = parseStockVariance(text);
      const result = await fetchMutation(
        api.ingest.stockVariance,
        { storeName, filename: file.name, extract },
        { token }
      );
      return {
        filename: file.name,
        status: "parsed",
        reportType: "stockVariance",
        date: extract.date,
        needsReview: result.needsReview,
      };
    }

    if (reportType === "stockWastage") {
      const extract = parseStockWastage(text);
      const result = await fetchMutation(
        api.ingest.stockWastage,
        { storeName, filename: file.name, extract },
        { token }
      );
      return {
        filename: file.name,
        status: "parsed",
        reportType: "stockWastage",
        date: extract.date,
        needsReview: result.needsReview,
      };
    }

    const extract = parseCashup(text);
    const result = await fetchMutation(
      api.ingest.cashup,
      { storeName, filename: file.name, extract },
      { token }
    );
    return {
      filename: file.name,
      status: "parsed",
      reportType: "cashup",
      date: extract.date,
      needsReview: result.needsReview,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Parse failed";
    return { filename: file.name, status: "failed", reason };
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

  const results: FileResult[] = [];
  for (const file of files) {
    results.push(await ingestFile(file, org.name, token));
  }

  return NextResponse.json({ results });
}
