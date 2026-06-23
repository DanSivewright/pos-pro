"use client";

import { Button } from "@pos-pro/ui/components/button";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface FileResult {
  filename: string;
  needsReview?: boolean;
  reason?: string;
  status: "parsed" | "failed" | "unsupported";
}

function reportResult(result: FileResult): void {
  if (result.status === "parsed") {
    const suffix = result.needsReview ? " (needs review)" : "";
    toast.success(`${result.filename} parsed${suffix}`);
    return;
  }
  toast.error(`${result.filename}: ${result.reason ?? result.status}`);
}

export function UploadCashup() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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

      for (const result of (data as { results: FileResult[] }).results) {
        reportResult(result);
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
    <div>
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
        {busy ? "Uploading…" : "Upload Cashup"}
      </Button>
    </div>
  );
}
