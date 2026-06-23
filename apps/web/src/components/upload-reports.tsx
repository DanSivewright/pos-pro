"use client";

import { Button } from "@pos-pro/ui/components/button";
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
  parsed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  unsupported: "bg-muted text-muted-foreground",
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
      className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"
      data-testid="upload-result"
    >
      <span className="font-medium">{result.filename}</span>
      <span
        className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[result.status]}`}
        data-status={result.status}
        data-testid="result-status"
      >
        {result.status}
      </span>
      {result.date && (
        <span className="text-muted-foreground text-xs">{result.date}</span>
      )}
      {result.needsReview && (
        <span className="text-orange-600 text-xs dark:text-orange-400">
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
    <div className="flex flex-col items-end gap-3">
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
        {busy ? "Uploading…" : "Upload reports"}
      </Button>
      {results.length > 0 && (
        <ul className="grid w-full gap-1" data-testid="upload-results">
          {results.map((result) => (
            <ResultRow key={result.filename} result={result} />
          ))}
        </ul>
      )}
    </div>
  );
}
