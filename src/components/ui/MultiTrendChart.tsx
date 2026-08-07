"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { EmptyState } from "./EmptyState";
import { CHART_STROKE_WIDTH } from "@/lib/chartColors";

export interface MultiTrendPoint {
  month: string;
  [seriesKey: string]: string | number | null;
}

/**
 * Gráfico de líneas con varias series sobre el mismo eje temporal (misma escala).
 * Mismo estilo que TrendChart pero para comparar 2+ métricas (ej. ingresos vs MRR).
 */
export function MultiTrendChart({
  data,
  series,
  height = 240,
  valueFormatter,
  yAxisWidth = 48,
  legendInSeriesOrder = false,
}: {
  data: MultiTrendPoint[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  valueFormatter?: (v: number) => string;
  /**
   * Ancho del eje Y. Los 48px por defecto se quedan cortos en cuanto los ticks
   * son importes de 5-6 cifras ("340.000 €"): recharts no encoge el texto, lo
   * recorta por la izquierda y el tick se lee mal ("0.000 €"). Subilo en los
   * gráficos de € grandes.
   */
  yAxisWidth?: number;
  /**
   * Ordena la leyenda como está declarado `series` en vez de alfabéticamente.
   *
   * recharts 3 trae itemSorter="value" por defecto, que ordena los items de la
   * leyenda por su etiqueta: "LTV, AOV nuevos, CAC, CPL" se dibuja como "AOV
   * nuevos, CAC, CPL, LTV" aunque las líneas estén declaradas en otro orden.
   * Con este flag la leyenda respeta el orden de `series` (y sigue siendo
   * determinista entre renders, porque el sorter devuelve el índice declarado
   * en vez de desactivar el ordenamiento).
   */
  legendInSeriesOrder?: boolean;
}) {
  const hasData = data.some((row) =>
    series.some((s) => row[s.key] !== null && row[s.key] !== undefined)
  );
  if (!hasData) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          width={yAxisWidth}
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
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          itemSorter={
            legendInSeriesOrder
              ? (item) => series.findIndex((s) => s.key === item.dataKey)
              : "value"
          }
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={CHART_STROKE_WIDTH}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
