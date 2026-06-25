"use client";

import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import { Button } from "@pos-pro/ui/components/button";
import { cn } from "@pos-pro/ui/lib/utils";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { type ReactNode, use } from "react";
import { ChannelMixChart } from "@/components/channel-mix-chart";
import { Completeness } from "@/components/completeness";
import { Canvas, PageHeader } from "@/components/dashboard-shell";
import { TopStockVariances } from "@/components/top-stock-variances";
import { formatRand } from "@/lib/format";

function Metric({
  label,
  testid,
  emphasis,
  children,
}: {
  label: string;
  testid: string;
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 tabular-nums",
          emphasis ? "font-semibold text-base" : "font-medium text-sm"
        )}
        data-testid={testid}
      >
        {children}
      </dd>
    </div>
  );
}

const rand = (cents: number | null) =>
  cents === null ? "—" : formatRand(cents);
const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

export default function StoreDrillDown({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = use(params);
  const storeRef = storeId as Id<"stores">;
  const days = useQuery(api.storeDays.listForStore, { storeId: storeRef });
  const tiles = useQuery(api.stores.controlTower);
  const storeName =
    tiles?.find((tile) => tile.id === storeRef)?.name ?? "Store";

  return (
    <>
      <PageHeader
        actions={
          <Button
            nativeButton={false}
            render={<Link href="/dashboard" />}
            variant="outline"
          >
            <ArrowLeft className="size-4" />
            Control Tower
          </Button>
        }
        title={storeName}
      />
      <Canvas>
        <div className="px-4 py-4 md:px-5">
          {days === undefined && (
            <p className="text-muted-foreground text-sm">Loading…</p>
          )}
          {days?.length === 0 && (
            <p className="text-muted-foreground text-sm">No Store Days yet.</p>
          )}
          {days !== undefined && days.length > 0 && (
            <ul className="grid gap-3">
              {days.map((day) => (
                <li
                  className="rounded-lg border border-border p-4 md:p-5"
                  data-testid="store-day"
                  key={day.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-base tabular-nums">
                      {day.date}
                    </h2>
                    {day.needsReview && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-medium text-amber-700 text-xs dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                        Needs review
                      </span>
                    )}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    <Metric emphasis label="Net sales" testid="net-sales">
                      {rand(day.netSales)}
                    </Metric>
                    <Metric label="Cash variance" testid="cash-variance">
                      {rand(day.cashVariance)}
                    </Metric>
                    <Metric label="Royalty due" testid="royalty-due">
                      {rand(day.royaltyDue)}
                    </Metric>
                    <Metric label="GP%" testid="gp-percent">
                      {pct(day.gpPercent)}
                    </Metric>
                    <Metric label="FC%" testid="fc-percent">
                      {pct(day.fcPercent)}
                    </Metric>
                    <Metric label="Waste cost" testid="waste-cost">
                      {rand(day.wasteCost)}
                    </Metric>
                  </dl>
                  <div className="mt-4">
                    <Completeness reports={day.reports} />
                  </div>
                  {day.channelMix !== null && (
                    <div className="mt-5" data-testid="channel-mix">
                      <p className="mb-2 text-muted-foreground text-xs">
                        Channel mix
                      </p>
                      <ChannelMixChart channelMix={day.channelMix} />
                    </div>
                  )}
                  {day.itemsProvider !== null && (
                    <div className="mt-5" data-testid="top-variances">
                      <p className="mb-2 text-muted-foreground text-xs">
                        Top stock variances
                      </p>
                      <TopStockVariances storeDayId={day.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Canvas>
    </>
  );
}
