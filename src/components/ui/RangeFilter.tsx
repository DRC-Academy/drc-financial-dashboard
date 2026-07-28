"use client";

import clsx from "clsx";

export interface RangeOption {
  label: string;
  /** Cuántos períodos mostrar. 0 = todo. */
  value: number;
}

/** Rangos por defecto, en MESES (páginas con granularidad mensual). */
const OPTIONS: RangeOption[] = [
  { label: "3M", value: 3 },
  { label: "6M", value: 6 },
  { label: "9M", value: 9 },
  { label: "12M", value: 12 },
  { label: "Todo", value: 0 },
];

/**
 * Rangos en SEMANAS, para las páginas de granularidad semanal. Mismo componente
 * y mismo aspecto: sólo cambia la unidad, porque "3M/6M" no significa nada
 * cuando cada punto de la serie es una semana.
 */
export const WEEK_OPTIONS: RangeOption[] = [
  { label: "4S", value: 4 },
  { label: "8S", value: 8 },
  { label: "12S", value: 12 },
  { label: "26S", value: 26 },
  { label: "Todo", value: 0 },
];

export function RangeFilter({
  value,
  onChange,
  options = OPTIONS,
}: {
  value: number;
  onChange: (n: number) => void;
  /** Opciones a mostrar. Por defecto, meses; pasar WEEK_OPTIONS para semanas. */
  options?: RangeOption[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-drc-line bg-white p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "px-2.5 py-1 text-xs rounded-md tabular transition-colors",
            value === opt.value
              ? "bg-drc-green-deep text-white"
              : "text-drc-ink-soft hover:text-drc-ink"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Recorta un array (de meses o series) a los últimos N elementos. 0 = todo. */
export function applyRange<T>(arr: T[], n: number): T[] {
  if (!n || n <= 0 || n >= arr.length) return arr;
  return arr.slice(arr.length - n);
}
