"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { EmptyState } from "./EmptyState";

const PALETTE = [
  "#1e9e3a",
  "#ffc400",
  "#3f7a53",
  "#d6483c",
  "#8bbf9f",
  "#a8842f",
  "#5d7a68",
];

export function StackedBarChart({
  data,
  keys,
  height = 260,
  valueFormatter,
}: {
  data: Record<string, string | number | null>[];
  keys: string[];
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  const hasData = data.some((row) =>
    keys.some((k) => row[k] !== null && row[k] !== undefined)
  );
  if (!hasData || keys.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--drc-line)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "var(--drc-ink-soft)" }}
          axisLine={{ stroke: "var(--drc-line)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--drc-ink-soft)" }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : v)}
        />
        <Tooltip
          formatter={((v: number) =>
            valueFormatter ? valueFormatter(v) : v) as never}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--drc-line)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => (
          <Bar
            key={k}
            dataKey={k}
            stackId="a"
            fill={PALETTE[i % PALETTE.length]}
            radius={i === keys.length - 1 ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
