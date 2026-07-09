"use client";

import type { CohortData } from "@/types/kpi";
import { EmptyState } from "./EmptyState";

/** Interpola entre el crema de fondo y el verde de marca según intensidad 0-1. */
function cellColor(ratio: number | null): string {
  if (ratio === null) return "#f0f0ec";
  const clamped = Math.min(1, Math.max(0, ratio));
  // De crema (#F7F7F5) a verde marca (#1E9E3A)
  const from = { r: 247, g: 247, b: 245 };
  const to = { r: 30, g: 158, b: 58 };
  const r = Math.round(from.r + (to.r - from.r) * clamped);
  const g = Math.round(from.g + (to.g - from.g) * clamped);
  const b = Math.round(from.b + (to.b - from.b) * clamped);
  return `rgb(${r},${g},${b})`;
}

export function CohortHeatmap({
  data,
  valueSuffix = "%",
  maxValue,
}: {
  data: CohortData;
  valueSuffix?: string;
  maxValue?: number;
}) {
  if (!data || data.cohorts.length === 0) return <EmptyState />;

  const allValues = data.cohorts.flatMap((c) =>
    c.values.filter((v): v is number => v !== null)
  );
  const inferredMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const max = maxValue ?? (inferredMax > 0 ? inferredMax : 1);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="text-left text-[11px] font-medium text-drc-ink-soft pr-3 pb-1 sticky left-0 bg-drc-bg">
              Cohorte
            </th>
            {data.monthsOfLife.map((m) => (
              <th
                key={m}
                className="text-[11px] font-medium text-drc-ink-soft pb-1 w-12 text-center"
              >
                m{m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.cohorts.map((row) => (
            <tr key={row.cohort}>
              <td className="text-xs font-medium text-drc-ink pr-3 sticky left-0 bg-drc-bg whitespace-nowrap">
                {row.cohort}
              </td>
              {row.values.map((v, i) => {
                const ratio = v !== null ? v / max : null;
                return (
                  <td key={i}>
                    <div
                      title={v !== null ? `${v}${valueSuffix}` : "sin dato"}
                      className="group relative h-9 w-12 rounded-md flex items-center justify-center text-[10px] tabular transition-transform hover:scale-[1.08] hover:z-10 hover:shadow-md cursor-default"
                      style={{
                        background: cellColor(ratio),
                        color: ratio !== null && ratio > 0.55 ? "#fff" : "var(--drc-ink)",
                      }}
                    >
                      {v !== null ? Math.round(v) : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
