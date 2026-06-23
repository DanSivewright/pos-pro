"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@pos-pro/ui/components/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { formatRand } from "@/lib/format";

export interface ChannelMix {
  callIn: number;
  counter: number;
  mobileApp: number;
  mrDelivery: number;
  uberEats: number;
  website: number;
}

const CENTS_PER_RAND = 100;

const CHANNELS: { key: keyof ChannelMix; label: string }[] = [
  { key: "counter", label: "Counter" },
  { key: "callIn", label: "Call in" },
  { key: "mobileApp", label: "Mobile app" },
  { key: "mrDelivery", label: "Mr. Delivery" },
  { key: "uberEats", label: "Uber Eats" },
  { key: "website", label: "Website" },
];

const config = {
  rands: { label: "Net turnover", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ChannelMixChart({ channelMix }: { channelMix: ChannelMix }) {
  const data = CHANNELS.map(({ key, label }) => ({
    channel: label,
    rands: channelMix[key] / CENTS_PER_RAND,
    cents: channelMix[key],
  }));

  return (
    <ChartContainer className="h-48 w-full" config={config}>
      <BarChart accessibilityLayer data={data} layout="vertical">
        <XAxis dataKey="rands" hide type="number" />
        <YAxis
          axisLine={false}
          dataKey="channel"
          tickLine={false}
          type="category"
          width={90}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatRand(Number(value) * CENTS_PER_RAND)}
            />
          }
        />
        <Bar dataKey="rands" fill="var(--color-rands)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
