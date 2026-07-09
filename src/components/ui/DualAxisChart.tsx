"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { EmptyState } from "./EmptyState";

export interface DualAxisPoint {
  month: string;
  left: number | null;
  right: number | null;
}

interface AxisConfig {
  label: string;
  color: string;
  valueFormatter?: (v: number) => string;
}

/**
 * Gráfico de dos líneas con ejes Y independientes (izquierda / derecha), para
 * comparar métricas de escalas muy distintas (ej. ingresos acumulados en € vs
 * clientes acumulados en unidades) y visualizar su relación en el tiempo.
 */
export function DualAxisChart({
  data,
  left,
  right,
  height = 260,
}: {
  data: DualAxisPoint[];
  left: AxisConfig;
  right: AxisConfig;
  height?: number;
}) {
  const hasData = data.some((d) => d.left !== null || d.right !== null);
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
          tick={{ fontSize: 11, fill: left.color }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v) => (left.valueFormatter ? left.valueFormatter(v) : v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: right.color }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v) => (right.valueFormatter ? right.valueFormatter(v) : v)}
        />
        <Tooltip
          formatter={((val: number, _name: string, item: { dataKey?: string }) => {
            const cfg = item?.dataKey === "right" ? right : left;
            return cfg.valueFormatter ? cfg.valueFormatter(val) : val;
          }) as never}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--drc-line)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="left"
          name={left.label}
          stroke={left.color}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="right"
          name={right.label}
          stroke={right.color}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
