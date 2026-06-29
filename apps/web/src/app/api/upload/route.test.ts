import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { type FunctionReference, getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the auth + Convex boundaries only; everything in between (real PDF →
// extractPdfText → detectReportType → the matching parser → mutation dispatch)
// runs for real. This is the upload pipeline's integration seam — the glue the
// per-unit parser and ingest tests never exercise together (code-review #1).

const { fetchMutation } = vi.hoisted(() => ({ fetchMutation: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({
    userId: "user_1",
    orgId: "org_1",
    getToken: vi.fn(async () => "token_abc"),
  })),
  clerkClient: vi.fn(async () => ({
    organizations: {
      getOrganization: vi.fn(async () => ({ name: "Boitumelo" })),
    },
  })),
}));

vi.mock("convex/nextjs", () => ({ fetchMutation }));

import { POST } from "./route";

const REF = "../../docs/reference";
const SINGLE = {
  cashup: `${REF}/rp-sv-forms/Store_Cashup_From_07-06-2026_Printed_On_07-06-2026.pdf`,
  royalty: `${REF}/rp-first-batch/Royalty_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf`,
  grossProfit: `${REF}/rp-first-batch/Gross_Profit_From_07-06-2026_To_07-06-2026_Printed_On_08-06-2026.pdf`,
  stockVariance: `${REF}/rp-sv-forms/Stock_Variance_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf`,
  stockWastage: `${REF}/rp-sv-forms/Stock_Wastage_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf`,
};
const RANGE_ROYALTY = `${REF}/rp-first-batch/Royalty_From_01-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf`;
const UNSUPPORTED = `${REF}/rp-first-batch/Deliveries_From_07-06-2026_To_07-06-2026_Printed_On_07-06-2026.pdf`;

const RANGE_REASON = /Multi-day range/;
const OVERSIZED_NAME = /huge\.pdf/;

interface ResultRow {
  date?: string;
  filename: string;
  needsReview?: boolean;
  reason?: string;
  reportType?: string;
  status: string;
}

function postFiles(files: File[]): Promise<Response> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const request = new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  });
  return POST(request);
}

async function post(relPaths: string[]): Promise<ResultRow[]> {
  const files = await Promise.all(
    relPaths.map(async (rel) => {
      const bytes = await readFile(join(process.cwd(), rel));
      return new File([bytes], basename(rel), { type: "application/pdf" });
    })
  );
  const response = await postFiles(files);
  const body = (await response.json()) as { results: ResultRow[] };
  return body.results;
}

// The args passed to fetchMutation for a given mutation, matched by its Convex
// reference name (the api proxy isn't reference-stable across accesses).
function argsFor(name: string): Record<string, unknown> | undefined {
  const call = fetchMutation.mock.calls.find(
    ([ref]) => getFunctionName(ref) === name
  );
  return call?.[1] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  fetchMutation.mockReset();
  fetchMutation.mockImplementation((ref: FunctionReference<"mutation">) => {
    if (getFunctionName(ref) === "rateLimit:checkUpload") {
      return Promise.resolve({ ok: true, retryAfter: 0 });
    }
    if (getFunctionName(ref) === "ingest:createBatch") {
      return Promise.resolve({ uploadId: "upload_1" });
    }
    return Promise.resolve({ needsReview: false });
  });
});

describe("upload route — full pipeline", () => {
  it("routes every single-day report to its mutation with figures to the cent", async () => {
    const results = await post([
      SINGLE.cashup,
      SINGLE.royalty,
      SINGLE.grossProfit,
      SINGLE.stockVariance,
      SINGLE.stockWastage,
    ]);

    // One batch opened for the whole action, sized to the file count.
    expect(argsFor("ingest:createBatch")).toEqual({
      storeName: "Boitumelo",
      fileCount: 5,
    });

    // Each report dispatched to the correct mutation, carrying the real
    // extracted figures and the shared batch provenance.
    const cashup = argsFor("ingest:cashup");
    expect(cashup?.storeName).toBe("Boitumelo");
    expect(cashup?.uploadId).toBe("upload_1");
    expect((cashup?.extract as { netSales: number }).netSales).toBe(1_257_100);
    expect((cashup?.extract as { date: string }).date).toBe("2026-06-07");

    expect(
      (argsFor("ingest:royalty")?.extract as { royaltyDue: number }).royaltyDue
    ).toBe(100_568);
    expect(
      (argsFor("ingest:grossProfit")?.extract as { gpPercent: number })
        .gpPercent
    ).toBe(57.21);
    expect(
      (
        argsFor("ingest:stockVariance")?.extract as {
          stockVarianceTotal: number;
        }
      ).stockVarianceTotal
    ).toBe(-24_412);
    expect(
      (argsFor("ingest:stockWastage")?.extract as { wasteCost: number })
        .wasteCost
    ).toBe(1324);

    // Response mirrors the dispatch, every file parsed.
    expect(results.map((row) => `${row.reportType}:${row.status}`)).toEqual([
      "cashup:parsed",
      "royalty:parsed",
      "grossProfit:parsed",
      "stockVariance:parsed",
      "stockWastage:parsed",
    ]);
  });

  it("rejects a multi-day range export as failed (P0 range guard)", async () => {
    const results = await post([RANGE_ROYALTY]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failed");
    expect(results[0].reason).toMatch(RANGE_REASON);
    // No royalty figures were ever written — only the unparsed record.
    expect(argsFor("ingest:royalty")).toBeUndefined();
    const unparsed = argsFor("ingest:recordUnparsed");
    expect(unparsed?.status).toBe("failed");
  });

  it("marks an unrecognised report unsupported without parsing", async () => {
    const results = await post([UNSUPPORTED]);

    expect(results[0].status).toBe("unsupported");
    expect(argsFor("ingest:recordUnparsed")?.status).toBe("unsupported");
  });
});

describe("upload route — guards", () => {
  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

  it("returns 429 with Retry-After when the org is rate limited", async () => {
    fetchMutation.mockImplementation((ref: FunctionReference<"mutation">) => {
      if (getFunctionName(ref) === "rateLimit:checkUpload") {
        return Promise.resolve({ ok: false, retryAfter: 3000 });
      }
      return Promise.resolve({ uploadId: "upload_1" });
    });

    const file = new File([new Uint8Array(10)], "cashup.pdf", {
      type: "application/pdf",
    });
    const response = await postFiles([file]);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3");
    // The limit gates before any batch is opened or any file is read.
    expect(argsFor("ingest:createBatch")).toBeUndefined();
  });

  it("returns 413 for an oversized file before opening a batch or parsing", async () => {
    const huge = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.pdf", {
      type: "application/pdf",
    });
    const response = await postFiles([huge]);

    expect(response.status).toBe(413);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(OVERSIZED_NAME);
    // No batch, no ingest — the oversized file never reached the extractor.
    expect(argsFor("ingest:createBatch")).toBeUndefined();
    expect(argsFor("ingest:cashup")).toBeUndefined();
  });
});
