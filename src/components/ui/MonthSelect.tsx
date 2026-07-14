"use client";

/**
 * Desplegable de mes. Controla SOLO el mes mostrado en las tarjetas KPI de
 * arriba (no afecta gráficos). Recibe los meses en orden cronológico y los
 * muestra con el más reciente primero.
 */
export function MonthSelect({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string;
  onChange: (month: string) => void;
}) {
  if (months.length === 0) return null;
  const ordered = [...months].reverse(); // más reciente primero

  return (
    <label className="inline-flex items-center gap-2 text-xs text-drc-ink-soft">
      <span className="uppercase tracking-wide">Mes</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-drc-line bg-white px-2.5 py-1 text-xs tabular text-drc-ink"
        aria-label="Mes de las tarjetas KPI"
      >
        {ordered.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  );
}
