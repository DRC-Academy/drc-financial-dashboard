"use client";

import type { CohortData } from "@/types/kpi";
import { EmptyState } from "./EmptyState";
import { CAT, GASTO } from "@/lib/chartColors";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Interpola entre dos colores RGB según t (0-1). */
function mix(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  t: number
): string {
  const c = Math.min(1, Math.max(0, t));
  const r = Math.round(from.r + (to.r - from.r) * c);
  const g = Math.round(from.g + (to.g - from.g) * c);
  const b = Math.round(from.b + (to.b - from.b) * c);
  return `rgb(${r},${g},${b})`;
}

const CREMA = { r: 247, g: 247, b: 245 };
/** Ganancia de clientes → verde de categoría. Pérdida → rojo de gasto/pérdida,
 *  el mismo que el resto del dashboard (ver src/lib/chartColors.ts). */
const VERDE = hexToRgb(CAT.verde);
const ROJO = hexToRgb(GASTO.base);

/** Modo secuencial (retención): crema → verde según intensidad 0-1. */
function cellColorRatio(ratio: number | null): string {
  if (ratio === null) return "#f0f0ec";
  return mix(CREMA, VERDE, ratio);
}

/**
 * Modo divergente (diferencia mes a mes): negativo (pérdida) → rojo, cercano a 0
 * (estable) → crema, positivo (ganancia) → verde. `ratio` va en [-1, 1].
 */
function cellColorDiverging(ratio: number | null): string {
  if (ratio === null) return "#f0f0ec";
  if (ratio < 0) return mix(CREMA, ROJO, -ratio);
  return mix(CREMA, VERDE, ratio);
}

export function CohortHeatmap({
  data,
  valueSuffix,
  maxValue,
  variant = "ratio",
}: {
  data: CohortData;
  valueSuffix?: string;
  maxValue?: number;
  /**
   * "ratio" (default): valores 0..max, escala secuencial crema→verde.
   * "diff": valores con signo (diferencia mes a mes), escala divergente
   *   rojo↔crema↔verde centrada en 0 y etiquetas con signo (+/-).
   */
  variant?: "ratio" | "diff";
}) {
  if (!data || data.cohorts.length === 0) return <EmptyState />;

  const isDiff = variant === "diff";
  const suffix = valueSuffix ?? (isDiff ? "" : "%");

  const allValues = data.cohorts.flatMap((c) =>
    c.values.filter((v): v is number => v !== null)
  );

  // Ratio: normalizamos por el máximo. Diff: por el máximo VALOR ABSOLUTO, para
  // que la escala divergente quede centrada en 0.
  const inferredMax = isDiff
    ? allValues.length > 0
      ? Math.max(...allValues.map((v) => Math.abs(v)))
      : 1
    : allValues.length > 0
      ? Math.max(...allValues)
      : 1;
  const max = maxValue ?? (inferredMax > 0 ? inferredMax : 1);

  const label = (v: number) =>
    isDiff
      ? `${v > 0 ? "+" : ""}${Math.round(v)}`
      : `${Math.round(v)}`;

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
                const bg = isDiff ? cellColorDiverging(ratio) : cellColorRatio(ratio);
                // Texto blanco sólo sobre fondos saturados.
                const strong = ratio !== null && Math.abs(ratio) > 0.55;
                return (
                  <td key={i}>
                    <div
                      title={v !== null ? `${label(v)}${suffix}` : "sin dato"}
                      className="group relative h-9 w-12 rounded-md flex items-center justify-center text-[10px] tabular transition-transform hover:scale-[1.08] hover:z-10 hover:shadow-md cursor-default"
                      style={{
                        background: bg,
                        color: strong ? "#fff" : "var(--drc-ink)",
                      }}
                    >
                      {v !== null ? label(v) : "—"}
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
