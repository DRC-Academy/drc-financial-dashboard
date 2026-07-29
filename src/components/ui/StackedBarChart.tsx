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
import {
  CATEGORIA,
  NEUTRO,
  CHART_BAR_RADIUS,
  CHART_STACK_GAP,
} from "@/lib/chartColors";

/** Fallback cuando la página no pasa `colors`: orden fijo de CATEGORIA y, a
 *  partir del 4º, el gris de "otros" (ver nota de chartColors sobre por qué no
 *  hay un 4º slot categórico). */
const PALETTE = [...CATEGORIA, NEUTRO.gris];

export function StackedBarChart({
  data,
  keys,
  colors,
  labels,
  height = 260,
  valueFormatter,
}: {
  data: Record<string, string | number | null>[];
  keys: string[];
  /** Colores por serie (mismo orden que `keys`). Si falta, cae a PALETTE. */
  colors?: string[];
  /**
   * Rótulos de leyenda y tooltip (mismo orden que `keys`). Si falta, se muestra
   * la clave cruda del Sheet, que es el comportamiento histórico.
   */
  labels?: string[];
  height?: number;
  valueFormatter?: (v: number) => string;
}) {
  const hasData = data.some((row) =>
    keys.some((k) => row[k] !== null && row[k] !== undefined)
  );
  if (!hasData || keys.length === 0) return <EmptyState />;

  const colorAt = (i: number) =>
    colors?.[i] ?? PALETTE[Math.min(i, PALETTE.length - 1)];

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
            name={labels?.[i] ?? k}
            stackId="a"
            fill={colorAt(i)}
            {...CHART_STACK_GAP}
            radius={i === keys.length - 1 ? CHART_BAR_RADIUS : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
