"use client";

import { api } from "@pos-pro/backend/convex/_generated/api";
import type { Id } from "@pos-pro/backend/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { use } from "react";
import { ChannelMixChart } from "@/components/channel-mix-chart";
import { Completeness } from "@/components/completeness";
import { TopStockVariances } from "@/components/top-stock-variances";
import { formatRand } from "@/lib/format";

export default function StoreDrillDown({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = use(params);
  const days = useQuery(api.storeDays.listForStore, {
    storeId: storeId as Id<"stores">,
  });

  return (
    <main className="container mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 font-semibold text-2xl">Store Days</h1>
      {days === undefined && <p className="text-muted-foreground">Loading…</p>}
      {days?.length === 0 && (
        <p className="text-muted-foreground">No Store Days yet.</p>
      )}
      {days !== undefined && days.length > 0 && (
        <ul className="grid gap-3">
          {days.map((day) => (
            <li
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
              data-testid="store-day"
              key={day.id}
            >
              <span className="font-medium">{day.date}</span>
              <dl className="flex flex-wrap gap-6 text-sm">
                <div>
                  <dt className="text-muted-foreground">Net sales</dt>
                  <dd data-testid="net-sales">
                    {day.netSales === null ? "—" : formatRand(day.netSales)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cash variance</dt>
                  <dd data-testid="cash-variance">
                    {day.cashVariance === null
                      ? "—"
                      : formatRand(day.cashVariance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Royalty due</dt>
                  <dd data-testid="royalty-due">
                    {day.royaltyDue === null ? "—" : formatRand(day.royaltyDue)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">GP%</dt>
                  <dd data-testid="gp-percent">
                    {day.gpPercent === null ? "—" : `${day.gpPercent}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">FC%</dt>
                  <dd data-testid="fc-percent">
                    {day.fcPercent === null ? "—" : `${day.fcPercent}%`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Waste cost</dt>
                  <dd data-testid="waste-cost">
                    {day.wasteCost === null ? "—" : formatRand(day.wasteCost)}
                  </dd>
                </div>
              </dl>
              {day.needsReview && (
                <span className="rounded bg-orange-100 px-2 py-1 text-orange-700 text-xs dark:bg-orange-950 dark:text-orange-300">
                  Needs review
                </span>
              )}
              <Completeness reports={day.reports} />
              {day.channelMix !== null && (
                <div className="w-full" data-testid="channel-mix">
                  <p className="mb-2 text-muted-foreground text-sm">
                    Channel mix
                  </p>
                  <ChannelMixChart channelMix={day.channelMix} />
                </div>
              )}
              {day.itemsProvider !== null && (
                <div className="w-full" data-testid="top-variances">
                  <p className="mb-2 text-muted-foreground text-sm">
                    Top stock variances
                  </p>
                  <TopStockVariances storeDayId={day.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
