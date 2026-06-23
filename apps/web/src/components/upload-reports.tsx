"use client";

import { Button } from "@pos-pro/ui/components/button";
import { cn } from "@pos-pro/ui/lib/utils";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface FileResult {
  date?: string;
  filename: string;
  needsReview?: boolean;
  reason?: string;
  reportType?: string;
  status: "parsed" | "failed" | "unsupported";
}

const STATUS_STYLE: Record<FileResult["status"], string> = {
  parsed:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  failed:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  unsupported: "border-border bg-muted text-muted-foreground",
};

function reportToast(result: FileResult): void {
  if (result.status === "parsed") {
    const suffix = result.needsReview ? " (needs review)" : "";
    toast.success(`${result.filename} parsed${suffix}`);
    return;
  }
  toast.error(`${result.filename}: ${result.reason ?? result.status}`);
}

function ResultRow({ result }: { result: FileResult }) {
  return (
    <li
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
      data-testid="upload-result"
    >
      <span className="font-medium">{result.filename}</span>
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 font-medium text-xs",
          STATUS_STYLE[result.status]
        )}
        data-status={result.status}
        data-testid="result-status"
      >
        {result.status}
      </span>
      {result.date && (
        <span className="text-muted-foreground text-xs">{result.date}</span>
      )}
      {result.needsReview && (
        <span className="font-medium text-amber-600 text-xs dark:text-amber-400">
          needs review
        </span>
      )}
      {result.reason && (
        <span className="w-full text-muted-foreground text-xs">
          {result.reason}
        </span>
      )}
    </li>
  );
}

export function UploadReports() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);

  async function handleFiles(files: FileList): Promise<void> {
    const body = new FormData();
    for (const file of files) {
      body.append("files", file);
    }

    setBusy(true);
    try {
      const response = await fetch("/api/upload", { method: "POST", body });
      const data = (await response.json()) as
        | { results: FileResult[] }
        | { error: string };

      if (!response.ok) {
        toast.error("error" in data ? data.error : "Upload failed");
        return;
      }

      const parsed = (data as { results: FileResult[] }).results;
      setResults(parsed);
      for (const result of parsed) {
        reportToast(result);
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <section aria-label="Upload reports" className="border-border border-b">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5">
        <div className="min-w-0">
          <p className="font-medium text-sm">Upload reports</p>
          <p className="text-muted-foreground text-xs">
            PDF cashup, royalty, gross profit, stock variance or wastage.
          </p>
        </div>
        <input
          accept="application/pdf"
          className="hidden"
          multiple
          onChange={(event) => {
            const selected = event.target.files;
            if (selected && selected.length > 0) {
              handleFiles(selected).catch(() => {
                toast.error("Upload failed");
              });
            }
          }}
          ref={inputRef}
          type="file"
        />
        <Button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Upload className="size-4" />
          {busy ? "Uploading…" : "Upload PDFs"}
        </Button>
      </div>
      {results.length > 0 && (
        <ul
          className="grid gap-1.5 px-4 pb-3 md:px-5"
          data-testid="upload-results"
        >
          {results.map((result) => (
            <ResultRow key={result.filename} result={result} />
          ))}
        </ul>
      )}
    </section>
  );
}
