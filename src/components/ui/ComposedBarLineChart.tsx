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
import {
  CHART_BAR_RADIUS,
  CHART_STACK_GAP,
  CHART_STROKE_WIDTH,
} from "@/lib/chartColors";

export interface ComposedPoint {
  month: string;
  [seriesKey: string]: string | number | null;
}

/**
 * Barras (agrupadas o apiladas) + una línea superpuesta sobre un EJE
 * SECUNDARIO. Se usa cuando barras y línea miden cosas de escala muy distinta
 * (p. ej. conteo de pedidos vs. AOV en euros, o clientes vs. retención en %).
 *
 * Nota de diseño: el eje dual está desaconsejado por buenas prácticas de
 * dataviz porque puede inducir comparaciones engañosas; acá se usa a pedido
 * explícito, con la línea en color/eje propios y etiquetados para que las dos
 * escalas queden inequívocas.
 */
export function ComposedBarLineChart({
  data,
  bars,
  line,
  stacked = false,
  height = 260,
  barFormatter,
  lineFormatter,
}: {
  data: ComposedPoint[];
  bars: { key: string; label: string; color: string }[];
  line: { key: string; label: string; color: string };
  stacked?: boolean;
  height?: number;
  barFormatter?: (v: number) => string;
  lineFormatter?: (v: number) => string;
}) {
  const seriesKeys = [...bars.map((b) => b.key), line.key];
  const hasData = data.some((row) =>
    seriesKeys.some((k) => row[k] !== null && row[k] !== undefined)
  );
  if (!hasData) return <EmptyState />;

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
          tick={{ fontSize: 11, fill: line.color }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => (lineFormatter ? lineFormatter(v) : v)}
        />
        <Tooltip
          formatter={
            ((v: number, name: string) =>
              name === line.label
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
            {...(stacked ? CHART_STACK_GAP : {})}
            radius={
              stacked
                ? i === bars.length - 1
                  ? CHART_BAR_RADIUS
                  : undefined
                : CHART_BAR_RADIUS
            }
          />
        ))}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey={line.key}
          name={line.label}
          stroke={line.color}
          strokeWidth={CHART_STROKE_WIDTH}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
