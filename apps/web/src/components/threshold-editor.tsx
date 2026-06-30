"use client";

import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import { Button } from "@pos-pro/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pos-pro/ui/components/dialog";
import { Input } from "@pos-pro/ui/components/input";
import { Label } from "@pos-pro/ui/components/label";
import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";

// The eight override bands, keyed exactly as the `stores` override fields, the
// thresholds defaults, and the `setThresholds` args. Each band converts between
// the value stored on the Store (sales as a signed fraction, GP as percent,
// cash/stock as signed cents) and the value a human edits (sales/GP as a
// percent, cash/stock as Rand).
type BandKey =
  | "salesWatchDeviation"
  | "salesCriticalDeviation"
  | "gpWatchPercent"
  | "gpCriticalPercent"
  | "cashWatchCents"
  | "cashCriticalCents"
  | "stockWatchCents"
  | "stockCriticalCents";

interface Band {
  key: BandKey;
  label: string;
  toDisplay: (stored: number) => number;
  toStored: (display: number) => number;
}

const round = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const asPercent: Band["toDisplay"] = (stored) => round(stored, 2);
const fromPercent: Band["toStored"] = (display) => display;
const fractionToPercent: Band["toDisplay"] = (stored) => round(stored * 100, 2);
const percentToFraction: Band["toStored"] = (display) =>
  round(display / 100, 4);
const centsToRand: Band["toDisplay"] = (stored) => round(stored / 100, 2);
const randToCents: Band["toStored"] = (display) => Math.round(display * 100);

const BANDS: Band[] = [
  {
    key: "salesWatchDeviation",
    label: "Sales watch (%)",
    toDisplay: fractionToPercent,
    toStored: percentToFraction,
  },
  {
    key: "salesCriticalDeviation",
    label: "Sales critical (%)",
    toDisplay: fractionToPercent,
    toStored: percentToFraction,
  },
  {
    key: "gpWatchPercent",
    label: "GP watch (%)",
    toDisplay: asPercent,
    toStored: fromPercent,
  },
  {
    key: "gpCriticalPercent",
    label: "GP critical (%)",
    toDisplay: asPercent,
    toStored: fromPercent,
  },
  {
    key: "cashWatchCents",
    label: "Cash watch (R)",
    toDisplay: centsToRand,
    toStored: randToCents,
  },
  {
    key: "cashCriticalCents",
    label: "Cash critical (R)",
    toDisplay: centsToRand,
    toStored: randToCents,
  },
  {
    key: "stockWatchCents",
    label: "Stock watch (R)",
    toDisplay: centsToRand,
    toStored: randToCents,
  },
  {
    key: "stockCriticalCents",
    label: "Stock critical (R)",
    toDisplay: centsToRand,
    toStored: randToCents,
  },
];

interface ThresholdData {
  defaults: Record<BandKey, number>;
  overrides: Record<BandKey, number | null>;
}

function initialValues(data: ThresholdData): Record<BandKey, string> {
  const values = {} as Record<BandKey, string>;
  for (const band of BANDS) {
    const override = data.overrides[band.key];
    values[band.key] =
      override === null ? "" : String(band.toDisplay(override));
  }
  return values;
}

// The loaded editor form. Split from the dialog so its initial state is seeded
// once from the resolved query rather than reconciled in an effect. A blank
// field clears that band on save, resetting it to the global default.
function ThresholdsForm({
  storeId,
  data,
  onSaved,
}: {
  storeId: Id<"stores">;
  data: ThresholdData;
  onSaved: () => void;
}) {
  const setThresholds = useMutation(api.stores.setThresholds);
  const [values, setValues] = useState(() => initialValues(data));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const args: { storeId: Id<"stores"> } & Partial<Record<BandKey, number>> = {
      storeId,
    };
    for (const band of BANDS) {
      const raw = values[band.key].trim();
      if (raw === "") {
        continue;
      }
      const parsed = Number.parseFloat(raw);
      if (Number.isNaN(parsed)) {
        continue;
      }
      args[band.key] = band.toStored(parsed);
    }
    setSaving(true);
    try {
      await setThresholds(args);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 gap-3">
        {BANDS.map((band) => (
          <div className="flex flex-col gap-1" key={band.key}>
            <Label htmlFor={`threshold-${band.key}`}>{band.label}</Label>
            <Input
              data-testid={`threshold-input-${band.key}`}
              id={`threshold-${band.key}`}
              inputMode="decimal"
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  [band.key]: event.target.value,
                }))
              }
              placeholder={String(band.toDisplay(data.defaults[band.key]))}
              value={values[band.key]}
            />
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Leave a field blank to use the global default (shown as the
        placeholder).
      </p>
      <DialogFooter>
        <Button data-testid="save-thresholds" disabled={saving} type="submit">
          {saving ? "Saving…" : "Save thresholds"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Lazily loads the Store's overrides only once the dialog is open (the query
// lives inside DialogContent, mounted on open).
function ThresholdsBody({
  storeId,
  onSaved,
}: {
  storeId: Id<"stores">;
  onSaved: () => void;
}) {
  const data = useQuery(api.stores.getThresholds, { storeId });
  if (data === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  return <ThresholdsForm data={data} onSaved={onSaved} storeId={storeId} />;
}

// Super-user control to override a Store's exception thresholds. Rendered only
// for super-users by the Control Tower; the mutation re-checks regardless.
export function ThresholdEditor({ storeId }: { storeId: Id<"stores"> }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        data-testid="threshold-editor-trigger"
        render={<Button className="h-9" type="button" variant="outline" />}
      >
        Thresholds
      </DialogTrigger>
      <DialogContent data-testid="threshold-dialog">
        <DialogHeader>
          <DialogTitle>Exception thresholds</DialogTitle>
          <DialogDescription>
            Per-store overrides for the sales, GP, cash and stock severity
            bands.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ThresholdsBody onSaved={() => setOpen(false)} storeId={storeId} />
        )}
      </DialogContent>
    </Dialog>
  );
}
