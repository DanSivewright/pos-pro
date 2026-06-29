"use client";

import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import { Button } from "@pos-pro/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pos-pro/ui/components/table";
import { cn } from "@pos-pro/ui/lib/utils";
import { usePaginatedQuery } from "convex/react";
import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 768px)";

// One window of upload batches per page.
const BATCHES_PER_PAGE = 50;

// Render exactly one layout (table on desktop, cards on mobile) so testids are
// never duplicated or hidden — mirrors the Control Tower pattern.
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

type FileStatus = "parsed" | "failed" | "unsupported";

// Same pill styling as the upload results panel (components/upload-reports.tsx).
const STATUS_STYLE: Record<FileStatus, string> = {
  parsed:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  failed:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  unsupported: "border-border bg-muted text-muted-foreground",
};

const REPORT_LABEL: Record<string, string> = {
  cashup: "Cashup",
  royalty: "Royalty",
  grossProfit: "Gross Profit",
  stockVariance: "Stock Variance",
  stockWastage: "Stock Wastage",
};

interface HistoryFile {
  date: string | null;
  dateRangeEnd: string | null;
  dateRangeStart: string | null;
  filename: string;
  reason: string | null;
  reportType: string | null;
  status: FileStatus;
}

interface HistoryBatch {
  fileCount: number;
  files: HistoryFile[];
  id: Id<"uploads">;
  uploadedAt: number;
  uploadedBy: string;
}

// Upload timestamps are stored as epoch millis; show them in the Store's
// timezone (Africa/Johannesburg) so the history reads in local trading time.
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Johannesburg",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatUploadedAt(millis: number): string {
  return TIMESTAMP_FORMAT.format(new Date(millis));
}

function reportLabel(reportType: string | null): string {
  if (reportType === null) {
    return "—";
  }
  return REPORT_LABEL[reportType] ?? reportType;
}

// The date a file's figures landed on, or the report's own range when it never
// reached a Store Day (a multi-day export, recorded but not split).
function fileDate(file: HistoryFile): string {
  if (file.date !== null) {
    return file.date;
  }
  if (file.dateRangeStart !== null && file.dateRangeEnd !== null) {
    return `${file.dateRangeStart} → ${file.dateRangeEnd}`;
  }
  return "—";
}

function StatusPill({ status }: { status: FileStatus }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2 py-0.5 font-medium text-xs",
        STATUS_STYLE[status]
      )}
      data-status={status}
      data-testid="history-status"
    >
      {status}
    </span>
  );
}

function BatchMeta({ batch }: { batch: HistoryBatch }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="font-semibold text-sm tabular-nums">
        {formatUploadedAt(batch.uploadedAt)}
      </span>
      <span className="text-muted-foreground text-xs">
        {batch.fileCount} file{batch.fileCount === 1 ? "" : "s"} ·{" "}
        {batch.uploadedBy}
      </span>
    </div>
  );
}

function DesktopHistory({ batches }: { batches: HistoryBatch[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Uploaded</TableHead>
          <TableHead>File</TableHead>
          <TableHead>Report</TableHead>
          <TableHead>Store Day</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.flatMap((batch) =>
          batch.files.map((file, index) => (
            <TableRow
              data-testid="history-row"
              key={`${batch.id}-${file.filename}-${index}`}
            >
              <TableCell className="align-top text-muted-foreground">
                {index === 0 ? <BatchMeta batch={batch} /> : null}
              </TableCell>
              <TableCell className="align-top font-medium">
                {file.filename}
              </TableCell>
              <TableCell className="align-top">
                {reportLabel(file.reportType)}
              </TableCell>
              <TableCell className="align-top tabular-nums">
                {fileDate(file)}
              </TableCell>
              <TableCell className="align-top">
                <div className="flex flex-col gap-1">
                  <StatusPill status={file.status} />
                  {file.reason !== null && (
                    <span className="max-w-xs whitespace-normal text-muted-foreground text-xs">
                      {file.reason}
                    </span>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function MobileFileRow({ file }: { file: HistoryFile }) {
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2"
      data-testid="history-row"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-all font-medium text-sm">
          {file.filename}
        </span>
        <StatusPill status={file.status} />
      </div>
      <div className="flex flex-wrap gap-x-3 text-muted-foreground text-xs">
        <span>{reportLabel(file.reportType)}</span>
        <span className="tabular-nums">{fileDate(file)}</span>
      </div>
      {file.reason !== null && (
        <span className="text-muted-foreground text-xs">{file.reason}</span>
      )}
    </li>
  );
}

function MobileHistory({ batches }: { batches: HistoryBatch[] }) {
  return (
    <ul className="grid gap-3">
      {batches.map((batch) => (
        <li
          className="rounded-lg border border-border p-3"
          data-testid="history-batch"
          key={batch.id}
        >
          <BatchMeta batch={batch} />
          <ul className="mt-2 grid gap-1.5">
            {batch.files.map((file, index) => (
              <MobileFileRow file={file} key={`${file.filename}-${index}`} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function UploadHistory({ storeId }: { storeId: Id<"stores"> }) {
  const {
    results: batches,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.uploads.listForStore,
    { storeId },
    { initialNumItems: BATCHES_PER_PAGE }
  );
  const isDesktop = useIsDesktop();

  return (
    <section data-testid="upload-history">
      <h2 className="font-semibold text-base">Upload history</h2>
      <p className="mt-0.5 text-muted-foreground text-xs">
        Every file submitted for this Store and whether it parsed. Source files
        are never retained.
      </p>
      <div className="mt-3">
        {status === "LoadingFirstPage" && (
          <p className="text-muted-foreground text-sm">Loading…</p>
        )}
        {status !== "LoadingFirstPage" && batches.length === 0 && (
          <p className="text-muted-foreground text-sm">No uploads yet.</p>
        )}
        {batches.length > 0 &&
          (isDesktop ? (
            <div className="rounded-lg border border-border">
              <DesktopHistory batches={batches} />
            </div>
          ) : (
            <MobileHistory batches={batches} />
          ))}
        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <div className="mt-3 flex justify-center">
            <Button
              data-testid="load-more-history"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(BATCHES_PER_PAGE)}
              variant="outline"
            >
              {status === "LoadingMore" ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
