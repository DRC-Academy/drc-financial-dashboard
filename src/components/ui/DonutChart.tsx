"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { EmptyState } from "./EmptyState";

export interface DonutSlice {
  name: string;
  value: number | null;
  color: string;
}

/**
 * Dona (pie con agujero) para mostrar la distribución de un total entre pocas
 * categorías en un instante (no en el tiempo). Filtra los segmentos nulos o ≤0
 * y muestra el total en el centro más una leyenda con valor y % por categoría.
 */
export function DonutChart({
  data,
  height = 260,
  valueFormatter = (v) => String(v),
  centerLabel,
}: {
  data: DonutSlice[];
  height?: number;
  valueFormatter?: (v: number) => string;
  centerLabel?: string;
}) {
  const slices = data.filter(
    (d): d is DonutSlice & { value: number } =>
      d.value !== null && d.value > 0
  );
  const total = slices.reduce((acc, d) => acc + d.value, 0);
  if (slices.length === 0 || total === 0) return <EmptyState />;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="var(--drc-card)"
              strokeWidth={2}
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={
                ((v: number, name: string) =>
                  [
                    `${valueFormatter(v)} · ${((v / total) * 100).toFixed(0)}%`,
                    name,
                  ]) as never
              }
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--drc-line)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold text-drc-ink">
            {valueFormatter(total)}
          </span>
          {centerLabel && (
            <span className="text-[11px] uppercase tracking-wide text-drc-ink-soft">
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      <ul className="flex w-full flex-col gap-2 sm:w-auto">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: s.color }}
              aria-hidden
            />
            <span className="text-drc-ink-soft">{s.name}</span>
            <span className="tabular ml-auto font-medium text-drc-ink">
              {valueFormatter(s.value)}
            </span>
            <span className="tabular w-10 text-right text-drc-ink-soft">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
