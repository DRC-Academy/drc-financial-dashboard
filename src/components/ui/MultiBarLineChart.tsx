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

export interface MultiBarLinePoint {
  month: string;
  [seriesKey: string]: string | number | null;
}

interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/** Sub-valor de una barra, mostrado sólo en el tooltip (ver `barBreakdown`). */
export interface BreakdownDef {
  key: string;
  label: string;
}

type TooltipEntry = {
  name?: string;
  value?: number | null;
  color?: string;
  dataKey?: string | number;
  payload?: MultiBarLinePoint;
};

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
 *
 * `barBreakdown` desglosa una barra en el tooltip (clave de barra → sub-series
 * que vienen en la misma fila), sin sumar barras al gráfico: p. ej. "Otros" =
 * otros canales + ex-alumnos + referidos + sin atribuir. Un sub-valor null se
 * omite en vez de mostrarse como 0.
 */
export function MultiBarLineChart({
  data,
  bars,
  lines,
  stacked = false,
  height = 280,
  barFormatter,
  lineFormatter,
  barBreakdown,
}: {
  data: MultiBarLinePoint[];
  bars: SeriesDef[];
  lines: SeriesDef[];
  stacked?: boolean;
  height?: number;
  barFormatter?: (v: number) => string;
  lineFormatter?: (v: number) => string;
  barBreakdown?: Record<string, BreakdownDef[]>;
}) {
  const keys = [...bars, ...lines].map((s) => s.key);
  const hasData = data.some((row) =>
    keys.some((k) => row[k] !== null && row[k] !== undefined)
  );
  if (!hasData) return <EmptyState />;

  const lineLabels = new Set(lines.map((l) => l.label));
  const fmt = (v: number, name: string) =>
    lineLabels.has(name)
      ? lineFormatter
        ? lineFormatter(v)
        : v
      : barFormatter
        ? barFormatter(v)
        : v;

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
          formatter={fmt as never}
          content={
            barBreakdown
              ? ((props: { active?: boolean; label?: string; payload?: TooltipEntry[] }) => (
                  <BreakdownTooltip
                    {...props}
                    breakdown={barBreakdown}
                    format={fmt}
                  />
                )) as never
              : undefined
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
        {lines.map((l) => (
          <Line
            key={l.key}
            yAxisId="right"
            type="monotone"
            dataKey={l.key}
            name={l.label}
            stroke={l.color}
            strokeWidth={CHART_STROKE_WIDTH}
            dot={false}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Tooltip con el mismo aspecto que el de recharts por defecto, más las
 * sub-series de `barBreakdown` indentadas bajo su barra.
 */
function BreakdownTooltip({
  active,
  label,
  payload,
  breakdown,
  format,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipEntry[];
  breakdown: Record<string, BreakdownDef[]>;
  format: (v: number, name: string) => string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-drc-card px-2.5 py-2"
      style={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--drc-line)" }}
    >
      <div className="mb-1 text-drc-ink">{label}</div>
      {payload.map((p) => {
        if (p.value === null || p.value === undefined) return null;
        const subs = (breakdown[String(p.dataKey)] ?? []).filter(
          (b) => p.payload?.[b.key] !== null && p.payload?.[b.key] !== undefined
        );
        return (
          <div key={String(p.dataKey)} className="py-0.5">
            <div style={{ color: p.color }}>
              {p.name} : <span className="tabular">{format(p.value, p.name ?? "")}</span>
            </div>
            {subs.map((b) => (
              <div key={b.key} className="pl-3 text-drc-ink-soft">
                {b.label} :{" "}
                <span className="tabular">
                  {format(p.payload?.[b.key] as number, p.name ?? "")}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
