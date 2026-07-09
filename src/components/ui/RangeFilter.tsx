"use client";

import clsx from "clsx";

const OPTIONS = [
  { label: "3M", value: 3 },
  { label: "6M", value: 6 },
  { label: "12M", value: 12 },
  { label: "Todo", value: 0 },
];

export function RangeFilter({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-drc-line bg-white p-0.5">
      {OPTIONS.map((opt) => (
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
