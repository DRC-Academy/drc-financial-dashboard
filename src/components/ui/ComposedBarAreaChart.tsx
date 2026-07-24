"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { EmptyState } from "./EmptyState";
import {
  CHART_AREA_FILL_OPACITY,
  CHART_BAR_RADIUS,
  CHART_STROKE_WIDTH,
} from "@/lib/chartColors";

export interface ComposedBarAreaPoint {
  month: string;
  [seriesKey: string]: string | number | null;
}

/**
 * Una barra sobre el eje izquierdo + un ÁREA superpuesta sobre un EJE
 * SECUNDARIO. Hermano de ComposedBarLineChart, pero con el overlay como área
 * (relleno con gradiente) en vez de línea. Se usa cuando la métrica de fondo es
 * un "stock" acumulado que gana lectura como superficie (p. ej. ARPC como barras
 * y LTV como área).
 *
 * Eje dual, sí: barra y área tienen escalas distintas; el área usa su color/eje
 * propios para que las dos escalas queden inequívocas.
 */
export function ComposedBarAreaChart({
  data,
  bar,
  area,
  height = 260,
  barFormatter,
  areaFormatter,
}: {
  data: ComposedBarAreaPoint[];
  bar: { key: string; label: string; color: string };
  area: { key: string; label: string; color: string };
  height?: number;
  barFormatter?: (v: number) => string;
  areaFormatter?: (v: number) => string;
}) {
  const seriesKeys = [bar.key, area.key];
  const hasData = data.some((row) =>
    seriesKeys.some((k) => row[k] !== null && row[k] !== undefined)
  );
  if (!hasData) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`barArea-${area.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={area.color}
              stopOpacity={CHART_AREA_FILL_OPACITY}
            />
            <stop offset="100%" stopColor={area.color} stopOpacity={0} />
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
          yAxisId="left"
          tick={{ fontSize: 11, fill: "var(--drc-ink-soft)" }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => (barFormatter ? barFormatter(v) : v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: area.color }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => (areaFormatter ? areaFormatter(v) : v)}
        />
        <Tooltip
          formatter={
            ((v: number, name: string) =>
              name === area.label
                ? areaFormatter
                  ? areaFormatter(v)
                  : v
                : barFormatter
                  ? barFormatter(v)
                  : v) as never
          }
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--drc-line)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar
          yAxisId="left"
          dataKey={bar.key}
          name={bar.label}
          fill={bar.color}
          radius={CHART_BAR_RADIUS}
        />
        <Area
          yAxisId="right"
          type="monotone"
          dataKey={area.key}
          name={area.label}
          stroke={area.color}
          strokeWidth={CHART_STROKE_WIDTH}
          fill={`url(#barArea-${area.key})`}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
