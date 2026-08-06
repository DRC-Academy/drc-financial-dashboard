"use client";

/**
 * Rango de meses a medida: uno de inicio y uno de fin, elegidos de la misma
 * lista de meses disponibles. A diferencia de RangeFilter (últimos N meses
 * SIEMPRE contra el final de la serie), acá los dos extremos son libres, que es
 * lo que hace falta para leer un período cerrado ("lo que va del año", "el
 * primer trimestre") en vez de una ventana móvil.
 *
 * El componente garantiza que inicio ≤ fin: al elegir un inicio posterior al
 * fin (o un fin anterior al inicio) arrastra el otro extremo en vez de dejar un
 * rango invertido. Así quien lo usa no tiene que ordenar nada.
 */
export function MonthRangeSelect({
  months,
  from,
  to,
  onChange,
}: {
  /** Meses disponibles en orden cronológico ("mmm-yy"). */
  months: string[];
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  if (months.length === 0) return null;

  const handleFrom = (next: string) => {
    const invertido = months.indexOf(next) > months.indexOf(to);
    onChange(next, invertido ? next : to);
  };

  const handleTo = (next: string) => {
    const invertido = months.indexOf(next) < months.indexOf(from);
    onChange(invertido ? next : from, next);
  };

  const selectClass =
    "rounded-lg border border-drc-line bg-white px-2 py-1 text-xs tabular text-drc-ink";

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-drc-ink-soft">
      <select
        value={from}
        onChange={(e) => handleFrom(e.target.value)}
        className={selectClass}
        aria-label="Mes de inicio del rango"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <span aria-hidden>→</span>
      <select
        value={to}
        onChange={(e) => handleTo(e.target.value)}
        className={selectClass}
        aria-label="Mes de fin del rango"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
