"use client";

import type { PeriodoMargen } from "@/lib/kpiHelpers";

/**
 * Selector de periodicidad "Mensual / Trimestral" para el cuadro de resultados.
 * Mismo control segmentado que el "Clientes / %" del heatmap de cohortes.
 *
 * No elige el período: eso lo sigue haciendo el desplegable de mes. Sólo decide
 * si las tarjetas leen ese mes suelto o el trimestre natural que lo contiene.
 */
export function PeriodoToggle({
  value,
  onChange,
}: {
  value: PeriodoMargen;
  onChange: (value: PeriodoMargen) => void;
}) {
  const opciones: { label: string; value: PeriodoMargen }[] = [
    { label: "Mensual", value: "mensual" },
    { label: "Trimestral", value: "trimestral" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-drc-line bg-white p-0.5">
      {opciones.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={
            "px-2.5 py-1 text-xs rounded-md transition-colors " +
            (value === opt.value
              ? "bg-drc-green-deep text-white"
              : "text-drc-ink-soft hover:text-drc-ink")
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
