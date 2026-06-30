"use client";

import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pos-pro/ui/components/table";
import { cn } from "@pos-pro/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { MetricLabel } from "@/components/metric-hint";
import { ThresholdEditor } from "@/components/threshold-editor";
import { formatRand } from "@/lib/format";

const CENTS_PER_RAND = 100;
const DESKTOP_QUERY = "(min-width: 768px)";

// Render exactly one layout (table on desktop, cards on mobile) so testids and
// store links are never duplicated or hidden — keeps Playwright `.first()` honest.
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

type Status = "green" | "amber" | "red";

const STATUS_DOT: Record<Status, string> = {
  green: "bg-green-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const STATUS_LABEL: Record<Status, string> = {
  green: "On track",
  amber: "Watch",
  red: "Critical",
};

interface Tile {
  gpPercent: number | null;
  id: Id<"stores">;
  mtdNet: number;
  name: string;
  salesTarget: number | null;
  status: Status;
  vsTarget: number | null;
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
      <span
        aria-label={STATUS_LABEL[status]}
        className={cn("inline-block size-2.5 rounded-full", STATUS_DOT[status])}
        data-status={status}
        data-testid="tile-status"
        role="img"
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function StoreName({ tile }: { tile: Tile }) {
  return (
    <Link
      className="font-medium text-foreground hover:underline"
      href={`/dashboard/stores/${tile.id}`}
    >
      {tile.name}
    </Link>
  );
}

function vsTargetClass(vsTarget: number | null): string {
  if (vsTarget === null) {
    return "text-muted-foreground";
  }
  return vsTarget < 0 ? "text-red-600 dark:text-red-400" : "text-foreground";
}

function SalesTargetEditor({ tile }: { tile: Tile }) {
  const setSalesTarget = useMutation(api.stores.setSalesTarget);
  const [value, setValue] = useState(
    tile.salesTarget === null ? "" : String(tile.salesTarget / CENTS_PER_RAND)
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const rands = Number.parseFloat(value);
    if (Number.isNaN(rands)) {
      return;
    }
    setSaving(true);
    try {
      await setSalesTarget({
        storeId: tile.id,
        salesTarget: Math.round(rands * CENTS_PER_RAND),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex items-center gap-1.5" onSubmit={handleSubmit}>
      <label
        className="text-muted-foreground text-xs"
        htmlFor={`target-${tile.id}`}
      >
        R
      </label>
      <input
        className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        data-testid="sales-target-input"
        id={`target-${tile.id}`}
        inputMode="decimal"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
      <button
        className="h-9 rounded-md border border-input px-3 font-medium text-sm hover:bg-muted disabled:opacity-50"
        data-testid="save-target"
        disabled={saving}
        type="submit"
      >
        Save
      </button>
    </form>
  );
}

function StoreTableRow({ tile, canEdit }: { tile: Tile; canEdit: boolean }) {
  return (
    <TableRow data-testid="store-tile">
      <TableCell>
        <StoreName tile={tile} />
      </TableCell>
      <TableCell className="text-right tabular-nums" data-testid="tile-mtd-net">
        {formatRand(tile.mtdNet)}
      </TableCell>
      <TableCell
        className={cn("text-right tabular-nums", vsTargetClass(tile.vsTarget))}
        data-testid="tile-vs-target"
      >
        {tile.vsTarget === null ? "—" : formatRand(tile.vsTarget)}
      </TableCell>
      <TableCell className="text-right tabular-nums" data-testid="tile-gp">
        {tile.gpPercent === null ? "—" : `${tile.gpPercent}%`}
      </TableCell>
      <TableCell>
        <StatusBadge status={tile.status} />
      </TableCell>
      {canEdit && (
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <SalesTargetEditor tile={tile} />
            <ThresholdEditor storeId={tile.id} />
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

function StoreCard({ tile }: { tile: Tile }) {
  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
      data-testid="store-tile"
    >
      <div className="flex items-center justify-between gap-3">
        <StoreName tile={tile} />
        <StatusBadge status={tile.status} />
      </div>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">
            <MetricLabel hintKey="mtdNet">MTD net</MetricLabel>
          </dt>
          <dd className="tabular-nums" data-testid="tile-mtd-net">
            {formatRand(tile.mtdNet)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            <MetricLabel hintKey="vsTarget">vs target</MetricLabel>
          </dt>
          <dd
            className={cn("tabular-nums", vsTargetClass(tile.vsTarget))}
            data-testid="tile-vs-target"
          >
            {tile.vsTarget === null ? "—" : formatRand(tile.vsTarget)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            <MetricLabel hintKey="gpPercent">GP%</MetricLabel>
          </dt>
          <dd className="tabular-nums" data-testid="tile-gp">
            {tile.gpPercent === null ? "—" : `${tile.gpPercent}%`}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function ControlTower() {
  const tiles = useQuery(api.stores.controlTower);
  const isSuperuser = useQuery(api.stores.isSuperuser);
  const isDesktop = useIsDesktop();

  if (tiles === undefined) {
    return (
      <p className="px-4 py-6 text-muted-foreground text-sm md:px-5">
        Loading stores…
      </p>
    );
  }
  if (tiles.length === 0) {
    return (
      <p className="px-4 py-6 text-muted-foreground text-sm md:px-5">
        No stores available.
      </p>
    );
  }

  const canEdit = isSuperuser === true;

  if (!isDesktop) {
    return (
      <ul className="grid gap-3 px-4 py-4">
        {tiles.map((tile) => (
          <StoreCard key={tile.id} tile={tile} />
        ))}
      </ul>
    );
  }

  return (
    <div className="px-2 py-2 md:px-3">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Store</TableHead>
            <TableHead className="text-right">
              <MetricLabel hintKey="mtdNet">MTD net</MetricLabel>
            </TableHead>
            <TableHead className="text-right">
              <MetricLabel hintKey="vsTarget">vs target</MetricLabel>
            </TableHead>
            <TableHead className="text-right">
              <MetricLabel hintKey="gpPercent">GP%</MetricLabel>
            </TableHead>
            <TableHead>
              <MetricLabel hintKey="status">Status</MetricLabel>
            </TableHead>
            {canEdit && (
              <TableHead className="text-right">
                <MetricLabel hintKey="target">
                  Target &amp; thresholds
                </MetricLabel>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiles.map((tile) => (
            <StoreTableRow canEdit={canEdit} key={tile.id} tile={tile} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
