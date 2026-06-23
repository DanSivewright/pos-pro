"use client";

import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { formatRand } from "@/lib/format";

const CENTS_PER_RAND = 100;

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
    <form className="flex items-center gap-2" onSubmit={handleSubmit}>
      <label
        className="text-muted-foreground text-xs"
        htmlFor={`target-${tile.id}`}
      >
        Target R
      </label>
      <input
        className="w-28 rounded border bg-background px-2 py-1 text-sm"
        data-testid="sales-target-input"
        id={`target-${tile.id}`}
        inputMode="decimal"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
      <button
        className="rounded border px-2 py-1 text-sm hover:bg-muted disabled:opacity-50"
        data-testid="save-target"
        disabled={saving}
        type="submit"
      >
        Save
      </button>
    </form>
  );
}

function StoreTile({ tile, canEdit }: { tile: Tile; canEdit: boolean }) {
  return (
    <li
      className="flex flex-col gap-3 rounded-lg border p-4"
      data-testid="store-tile"
    >
      <div className="flex items-center justify-between gap-4">
        <Link
          className="flex items-center gap-2 font-medium hover:underline"
          href={`/dashboard/stores/${tile.id}`}
        >
          <span
            aria-label={STATUS_LABEL[tile.status]}
            className={`inline-block size-3 rounded-full ${STATUS_DOT[tile.status]}`}
            data-status={tile.status}
            data-testid="tile-status"
            role="img"
          />
          {tile.name}
        </Link>
      </div>
      <dl className="flex flex-wrap gap-6 text-sm">
        <div>
          <dt className="text-muted-foreground">MTD net</dt>
          <dd data-testid="tile-mtd-net">{formatRand(tile.mtdNet)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">vs target</dt>
          <dd data-testid="tile-vs-target">
            {tile.vsTarget === null ? "—" : formatRand(tile.vsTarget)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">GP%</dt>
          <dd data-testid="tile-gp">
            {tile.gpPercent === null ? "—" : `${tile.gpPercent}%`}
          </dd>
        </div>
      </dl>
      {canEdit && <SalesTargetEditor tile={tile} />}
    </li>
  );
}

export function ControlTower() {
  const tiles = useQuery(api.stores.controlTower);
  const isSuperuser = useQuery(api.stores.isSuperuser);

  if (tiles === undefined) {
    return <p className="text-muted-foreground">Loading stores…</p>;
  }
  if (tiles.length === 0) {
    return <p className="text-muted-foreground">No stores available.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => (
        <StoreTile canEdit={isSuperuser === true} key={tile.id} tile={tile} />
      ))}
    </ul>
  );
}
