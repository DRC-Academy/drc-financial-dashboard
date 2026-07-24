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
import { CHART_BAR_RADIUS } from "@/lib/chartColors";

export interface ComparisonPoint {
  month: string;
  [seriesKey: string]: string | number | null;
}

export function BarComparison({
  data,
  series,
  height = 240,
  valueFormatter,
}: {
  data: ComparisonPoint[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  const hasData = data.some((row) =>
    series.some((s) => row[s.key] !== null && row[s.key] !== undefined)
  );
  if (!hasData) return <EmptyState />;

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
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            radius={CHART_BAR_RADIUS}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
