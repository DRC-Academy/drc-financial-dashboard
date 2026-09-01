"use client";

import clsx from "clsx";

/**
 * Aviso de "ventana de facturación en duda" — el chip AZUL que marca un número
 * que está completo pero que puede estar contado en el mes de al lado.
 *
 * DELIBERADAMENTE distinto del ParcialBadge amarillo, porque son dos problemas
 * distintos y se arreglan en sitios distintos:
 *
 *   ⚠  amarillo (ParcialBadge)  → FALTA un precio. El margen es un mínimo. Se
 *                                 arregla cargando `product_prices` en DRC
 *                                 Gestión.
 *   ⇄  azul (este)              → no falta nada. El importe está sumado, pero la
 *                                 ventana del alumno no cuadra con su acceso, así
 *                                 que puede estar corrido de mes. Se arregla
 *                                 revisando la ficha de ESE alumno.
 *
 * Las tres diferencias son a propósito y ninguna sobra: color (azul informativo
 * vs amarillo de advertencia), glifo (⇄ de "corrido" vs ⚠ de "ojo") y el NÚMERO
 * a la vista. Un chip azul sin número se leería como otro ⚠ de otro color.
 *
 * Y a diferencia del amarillo, éste es un BOTÓN: el detalle por alumno ya viene
 * en el payload, así que el aviso puede decir quiénes son en vez de dejar un
 * número suelto que obliga a ir a buscarlos a mano al otro proyecto.
 */
export function VentanaDudosaBadge({
  n,
  aviso,
  expandido,
  onToggle,
  controla,
}: {
  /** Cuántos alumnos. Se pinta, no se esconde en el tooltip. */
  n: number;
  /** Texto largo, para el tooltip y el lector de pantalla. */
  aviso: string;
  expandido: boolean;
  onToggle: () => void;
  /** id del bloque que abre/cierra, para aria-controls. */
  controla: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={aviso}
      aria-label={`${aviso} Pulsa para ver el detalle.`}
      aria-expanded={expandido}
      aria-controls={controla}
      className={clsx(
        "ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5",
        "text-[10px] leading-none align-middle tabular font-semibold transition-colors",
        "border-drc-blue/40 text-drc-blue hover:bg-drc-blue/15",
        expandido ? "bg-drc-blue/15" : "bg-drc-blue/5"
      )}
    >
      <span aria-hidden>⇄</span>
      <span aria-hidden>{n}</span>
      <span className="text-[8px] opacity-70" aria-hidden>
        {expandido ? "▾" : "▸"}
      </span>
    </button>
  );
}
