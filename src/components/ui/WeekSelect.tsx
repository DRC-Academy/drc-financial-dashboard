"use client";

import { isCurrentWeek, weekLongLabel } from "@/lib/kpiSemanalHelpers";

/**
 * Desplegable de semana. Gemelo de MonthSelect: controla SOLO la semana que
 * muestran las tarjetas KPI de arriba (no afecta a los gráficos, que tienen su
 * propio RangeFilter). Recibe las semanas en orden cronológico y las muestra
 * con la más reciente primero.
 *
 * La semana en curso se marca "(en curso)" porque la hoja la va llenando a
 * medida que avanza: sin el aviso, sus valores parciales se leen como una caída.
 */
export function WeekSelect({
  weeks,
  value,
  onChange,
}: {
  weeks: string[];
  value: string;
  onChange: (week: string) => void;
}) {
  if (weeks.length === 0) return null;
  const ordered = [...weeks].reverse(); // más reciente primero

  return (
    <label className="inline-flex items-center gap-2 text-xs text-drc-ink-soft">
      <span className="uppercase tracking-wide">Semana</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-drc-line bg-white px-2.5 py-1 text-xs tabular text-drc-ink"
        aria-label="Semana de las tarjetas KPI"
      >
        {ordered.map((w) => (
          <option key={w} value={w}>
            {weekLongLabel(w)}
            {isCurrentWeek(w) ? " (en curso)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
