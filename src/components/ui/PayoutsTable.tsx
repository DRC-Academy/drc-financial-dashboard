"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { EmptyState } from "./EmptyState";
import { formatCurrency, formatNumber } from "@/lib/kpiHelpers";
import type { PayoutStatus, TeacherPayout } from "@/types/profesores";

/**
 * Detalle de la liquidación del mes, profesor por profesor. Los datos llegan ya
 * calculados por DRC Gestión (ver src/lib/externalPayouts.ts): acá no se suma ni
 * se deriva nada que no sea el TOTAL del pie.
 *
 * Todo el filtrado y el orden pasan en el CLIENTE, sobre el array que ya vino en
 * la respuesta del mes: cambiar de estado o escribir en el buscador no vuelve a
 * pedirle nada al servidor. Sólo cambiar de MES dispara una petición nueva, y
 * eso lo maneja la página.
 *
 * La estructura de columnas está pensada para crecer: cuando DRC Gestión
 * confirme la facturación por profesor, entra como una COLUMNA más (con su
 * `sortKey` y su celda) sin tocar el orden, los filtros ni el pie.
 */

/** Columnas por las que se puede ordenar. */
type SortKey = "teacher_name" | "classes_payable" | "total_amount" | "status" | "is_active";

type SortDir = "asc" | "desc";

const ESTADO_LABEL: Record<PayoutStatus, string> = {
  paid: "Pagado",
  pending: "Pendiente",
  en_curso: "En curso",
};

/**
 * Colores del badge de estado. Mismos tonos que los chips de alerta de KpiCard:
 * el amarillo usa el tono "-deep" para el texto porque el de marca no contrasta
 * lo suficiente sobre fondo claro.
 */
const ESTADO_CHIP: Record<PayoutStatus, string> = {
  paid: "text-drc-green bg-drc-green/10",
  pending: "text-drc-yellow-deep bg-drc-yellow/25",
  en_curso: "text-drc-blue bg-drc-blue/10",
};

/**
 * Orden de los estados cuando se ordena por esa columna. No es alfabético: va
 * del más cerrado al más abierto, que es como se mira una liquidación.
 */
const ESTADO_ORDEN: Record<PayoutStatus, number> = {
  paid: 0,
  pending: 1,
  en_curso: 2,
};

type FiltroEstado = "todos" | PayoutStatus;
type FiltroActivo = "todos" | "activos" | "inactivos";

/**
 * ¿Es un estado de los que conocemos? El array `teachers` llega sin validar fila
 * a fila (el cliente sólo comprueba los agregados del mes), así que si DRC
 * Gestión añadiera un estado nuevo llegaría hasta acá: mejor mostrarlo crudo y
 * en gris que pintar "undefined".
 */
function esEstadoConocido(status: string): status is PayoutStatus {
  return status in ESTADO_LABEL;
}

function EstadoBadge({ status }: { status: PayoutStatus }) {
  const conocido = esEstadoConocido(status);
  return (
    <span
      className={clsx(
        "inline-block text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5 whitespace-nowrap",
        conocido ? ESTADO_CHIP[status] : "text-drc-ink-soft bg-drc-line/40"
      )}
    >
      {conocido ? ESTADO_LABEL[status] : status}
    </span>
  );
}

const SELECT_CLASS =
  "rounded-lg border border-drc-line bg-white px-2.5 py-1 text-xs text-drc-ink";

/**
 * Cabecera ordenable. Vive a nivel de módulo y no dentro de PayoutsTable: un
 * componente declarado en el cuerpo del render tiene identidad nueva en cada
 * render, así que React lo desmonta y lo vuelve a montar entero cada vez (y el
 * linter de React lo marca como error).
 */
function SortableTh({
  columna,
  children,
  align = "left",
  sortKey,
  sortDir,
  onSort,
}: {
  columna: SortKey;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const activa = sortKey === columna;
  return (
    <th
      aria-sort={activa ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      className={clsx(
        "py-2 font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left pr-4"
      )}
    >
      <button
        type="button"
        onClick={() => onSort(columna)}
        className={clsx(
          "inline-flex items-center gap-1 hover:text-drc-ink transition-colors",
          activa && "text-drc-ink font-semibold"
        )}
      >
        {children}
        <span className={clsx("text-[9px]", !activa && "opacity-0")} aria-hidden>
          {sortDir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

export function PayoutsTable({ teachers }: { teachers: TeacherPayout[] }) {
  // Por defecto, importe descendente: la pregunta habitual sobre una
  // liquidación es "quién se lleva más", no "quién va primero por nombre".
  const [sortKey, setSortKey] = useState<SortKey>("total_amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [activo, setActivo] = useState<FiltroActivo>("todos");
  const [busqueda, setBusqueda] = useState("");

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();

    const filtradas = teachers.filter((t) => {
      if (estado !== "todos" && t.status !== estado) return false;
      if (activo === "activos" && !t.is_active) return false;
      if (activo === "inactivos" && t.is_active) return false;
      if (q && !t.teacher_name.toLowerCase().includes(q)) return false;
      return true;
    });

    const signo = sortDir === "asc" ? 1 : -1;

    // Copia antes de ordenar: sort() muta, y `teachers` es el array de la
    // respuesta cacheada del hook.
    return [...filtradas].sort((a, b) => {
      switch (sortKey) {
        case "teacher_name":
          // localeCompare con "es" para que los acentos y la ñ caigan donde
          // corresponde ("Núñez" antes que "Nuria" es lo que espera un lector).
          return signo * a.teacher_name.localeCompare(b.teacher_name, "es");
        case "status": {
          // Un estado que no conocemos va al final, sin romper el orden.
          const orden = (s: PayoutStatus) =>
            esEstadoConocido(s) ? ESTADO_ORDEN[s] : 99;
          return signo * (orden(a.status) - orden(b.status));
        }
        case "is_active":
          return signo * (Number(a.is_active) - Number(b.is_active));
        default:
          return signo * (a[sortKey] - b[sortKey]);
      }
    });
  }, [teachers, estado, activo, busqueda, sortKey, sortDir]);

  // El pie resume lo que se está VIENDO, no el mes entero: con un filtro puesto,
  // un total del mes completo debajo de una tabla recortada se lee como si fuera
  // la suma de las filas de arriba.
  const totalImporte = filas.reduce((s, t) => s + t.total_amount, 0);
  const totalClases = filas.reduce((s, t) => s + t.classes_payable, 0);

  if (teachers.length === 0) {
    return <EmptyState label="Sin detalle por profesor para este mes" />;
  }

  /** Alterna dirección si ya se ordena por esa columna; si no, arranca donde conviene. */
  const ordenarPor = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    // Los textos se leen mejor de la A a la Z; los números, de mayor a menor.
    setSortDir(key === "teacher_name" ? "asc" : "desc");
  };

  /** Props de orden, iguales para las cinco cabeceras. */
  const orden = { sortKey, sortDir, onSort: ordenarPor };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar profesor…"
          aria-label="Buscar profesor por nombre"
          className="rounded-lg border border-drc-line bg-white px-2.5 py-1 text-xs text-drc-ink placeholder:text-drc-ink-soft min-w-48"
        />
        <label className="inline-flex items-center gap-2 text-xs text-drc-ink-soft">
          <span className="uppercase tracking-wide">Estado</span>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as FiltroEstado)}
            className={SELECT_CLASS}
          >
            <option value="todos">Todos</option>
            <option value="paid">Pagado</option>
            <option value="pending">Pendiente</option>
            <option value="en_curso">En curso</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-drc-ink-soft">
          <span className="uppercase tracking-wide">Activo</span>
          <select
            value={activo}
            onChange={(e) => setActivo(e.target.value as FiltroActivo)}
            className={SELECT_CLASS}
          >
            <option value="todos">Todos</option>
            <option value="activos">Sólo activos</option>
            <option value="inactivos">Sólo inactivos</option>
          </select>
        </label>
        <span className="text-[11px] text-drc-ink-soft">
          {filas.length === teachers.length
            ? `${formatNumber(teachers.length)} profesores`
            : `${formatNumber(filas.length)} de ${formatNumber(teachers.length)} profesores`}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-drc-ink-soft border-b border-drc-line">
              <SortableTh columna="teacher_name" {...orden}>
                Nombre
              </SortableTh>
              <SortableTh columna="classes_payable" align="right" {...orden}>
                Clases pagables
              </SortableTh>
              <SortableTh columna="total_amount" align="right" {...orden}>
                Importe
              </SortableTh>
              <SortableTh columna="status" {...orden}>
                Estado
              </SortableTh>
              <SortableTh columna="is_active" align="center" {...orden}>
                Activo
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {filas.map((t) => (
              <tr key={t.teacher_id} className="border-b border-drc-line/60">
                <td className="py-2 pr-4 text-drc-ink">{t.teacher_name}</td>
                <td className="py-2 tabular text-right text-drc-ink-soft">
                  {formatNumber(t.classes_payable)}
                </td>
                <td className="py-2 tabular text-right font-medium text-drc-ink">
                  {formatCurrency(t.total_amount)}
                </td>
                <td className="py-2 pr-4">
                  <EstadoBadge status={t.status} />
                </td>
                <td className="py-2 text-center">
                  {t.is_active ? (
                    <span className="text-drc-ink">Sí</span>
                  ) : (
                    <span className="text-drc-ink-soft">No</span>
                  )}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-drc-ink-soft">
                  Ningún profesor cumple los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-drc-line font-semibold text-drc-ink">
              <td className="py-2 pr-4">
                Total · {formatNumber(filas.length)}{" "}
                {filas.length === 1 ? "profesor" : "profesores"}
              </td>
              <td className="py-2 tabular text-right">{formatNumber(totalClases)}</td>
              <td className="py-2 tabular text-right">
                {formatCurrency(totalImporte)}
              </td>
              <td className="py-2" />
              <td className="py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
