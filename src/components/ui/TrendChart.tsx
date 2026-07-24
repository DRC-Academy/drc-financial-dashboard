"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { EmptyState } from "./EmptyState";
import {
  CAT,
  CHART_STROKE_WIDTH,
  CHART_AREA_FILL_OPACITY,
} from "@/lib/chartColors";

export interface TrendPoint {
  month: string;
  value: number | null;
}

export function TrendChart({
  data,
  color = CAT.verde,
  valueFormatter,
  height = 220,
}: {
  data: TrendPoint[];
  color?: string;
  valueFormatter?: (v: number) => string;
  height?: number;
}) {
  const hasData = data.some((d) => d.value !== null);
  if (!hasData) return <EmptyState />;

  // El id del degradado deriva del color: con un id fijo, dos TrendChart de
  // colores distintos en la misma página (Financiera tiene dos) compartirían
  // <defs> y el segundo se pintaría con el relleno del primero.
  const fillId = `trendFill-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={color}
              stopOpacity={CHART_AREA_FILL_OPACITY}
            />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          labelStyle={{ fontSize: 12, fontWeight: 600 }}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--drc-line)",
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={CHART_STROKE_WIDTH}
          fill={`url(#${fillId})`}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
