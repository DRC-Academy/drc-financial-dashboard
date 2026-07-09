"use client";

import clsx from "clsx";
import type { DateFilter } from "@/lib/dateFilter";
import { monthsBounds } from "@/lib/dateFilter";

const QUICK = [
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "Todo", months: 0 },
];

/**
 * Filtro de rango de fechas global por página: botones rápidos (3M/6M/12M/Todo)
 * + selector custom "desde / hasta" (inputs nativos type="month"). Afecta a
 * todos los KPIs y gráficos de la página que consuman el kpi filtrado.
 */
export function DateRangeFilter({
  months,
  filter,
  onChange,
}: {
  months: string[];
  filter: DateFilter;
  onChange: (f: DateFilter) => void;
}) {
  const { min, max } = monthsBounds(months);
  const isQuick = filter.kind === "quick";
  const from = filter.kind === "custom" ? filter.from ?? "" : "";
  const to = filter.kind === "custom" ? filter.to ?? "" : "";

  const inputClass = (active: boolean) =>
    clsx(
      "rounded-md border bg-white px-2 py-1 text-xs tabular text-drc-ink",
      active ? "border-drc-green-deep" : "border-drc-line"
    );

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-drc-line bg-white p-0.5">
        {QUICK.map((opt) => (
          <button
            key={opt.months}
            type="button"
            onClick={() => onChange({ kind: "quick", months: opt.months })}
            className={clsx(
              "px-2.5 py-1 text-xs rounded-md tabular transition-colors",
              isQuick && filter.months === opt.months
                ? "bg-drc-green-deep text-white"
                : "text-drc-ink-soft hover:text-drc-ink"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1.5 text-xs text-drc-ink-soft">
        <input
          type="month"
          aria-label="Desde"
          value={from}
          min={min}
          max={to || max}
          onChange={(e) =>
            onChange({
              kind: "custom",
              from: e.target.value || null,
              to: filter.kind === "custom" ? filter.to : null,
            })
          }
          className={inputClass(filter.kind === "custom")}
        />
        <span aria-hidden>→</span>
        <input
          type="month"
          aria-label="Hasta"
          value={to}
          min={from || min}
          max={max}
          onChange={(e) =>
            onChange({
              kind: "custom",
              from: filter.kind === "custom" ? filter.from : null,
              to: e.target.value || null,
            })
          }
          className={inputClass(filter.kind === "custom")}
        />
      </div>
    </div>
  );
}
