"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { EmptyState } from "./EmptyState";

export interface MultiBarLinePoint {
  month: string;
  [seriesKey: string]: string | number | null;
}

interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/**
 * Varias barras (agrupadas o apiladas) sobre el eje izquierdo + varias líneas
 * sobre el eje derecho. Extiende ComposedBarLineChart (que sólo admite UNA
 * línea) para los casos "N canales de barras + N métricas de coste como líneas"
 * (leads por canal + CPL_google/CPL_meta; ventas por canal + CAC_google/CAC_meta;
 * ingresos por canal apilados + ARPC de cada canal).
 *
 * Eje dual, sí: las barras (conteos/€) y las líneas (€) tienen escalas distintas.
 * Cada línea usa un tono más oscuro del mismo hue que su barra para dejar clara
 * la correspondencia barra↔línea por canal.
 *
 * `stacked` apila las barras (stackId común) en vez de agruparlas — útil cuando
 * las barras son partes de un total (mix de ingresos por canal).
 */
export function MultiBarLineChart({
  data,
  bars,
  lines,
  stacked = false,
  height = 280,
  barFormatter,
  lineFormatter,
}: {
  data: MultiBarLinePoint[];
  bars: SeriesDef[];
  lines: SeriesDef[];
  stacked?: boolean;
  height?: number;
  barFormatter?: (v: number) => string;
  lineFormatter?: (v: number) => string;
}) {
  const keys = [...bars, ...lines].map((s) => s.key);
  const hasData = data.some((row) =>
    keys.some((k) => row[k] !== null && row[k] !== undefined)
  );
  if (!hasData) return <EmptyState />;

  const lineLabels = new Set(lines.map((l) => l.label));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          tick={{ fontSize: 11, fill: "var(--drc-ink-soft)" }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => (lineFormatter ? lineFormatter(v) : v)}
        />
        <Tooltip
          formatter={
            ((v: number, name: string) =>
              lineLabels.has(name)
                ? lineFormatter
                  ? lineFormatter(v)
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
        {bars.map((b, i) => (
          <Bar
            key={b.key}
            yAxisId="left"
            dataKey={b.key}
            name={b.label}
            fill={b.color}
            stackId={stacked ? "a" : undefined}
            radius={
              stacked
                ? i === bars.length - 1
                  ? [4, 4, 0, 0]
                  : undefined
                : [4, 4, 0, 0]
            }
          />
        ))}
        {lines.map((l) => (
          <Line
            key={l.key}
            yAxisId="right"
            type="monotone"
            dataKey={l.key}
            name={l.label}
            stroke={l.color}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
