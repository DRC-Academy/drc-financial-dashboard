"use client";

import { Fragment, useMemo, useState } from "react";
import clsx from "clsx";
import { EmptyState } from "./EmptyState";
import { ParcialBadge } from "./ParcialBadge";
import { VentanaDudosaBadge } from "./VentanaDudosaBadge";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/kpiHelpers";
import {
  avisoDudosasDe,
  avisoParcialDe,
  detalleDudosasDe,
  facturacionDe,
  margenDe,
  margenPctDe,
  margenSobreFacturacion,
  ventanasDudosasDe,
} from "@/lib/profesoresHelpers";
import type { MetricValue } from "@/types/kpi";
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
 * Facturación y margen se leen SIEMPRE por lib/profesoresHelpers, nunca del
 * payload crudo: cuando un profesor no tiene ningún alumno con precio resuelto
 * el endpoint manda `facturacion: 0`, y pintar ese 0 como "0 €" afirmaría que
 * no factura nada. Los helpers lo devuelven como null → "—", igual que
 * cualquier otro dato ausente del dashboard.
 */

/** Columnas por las que se puede ordenar. */
type SortKey =
  | "teacher_name"
  | "classes_payable"
  | "total_amount"
  | "facturacion"
  | "margen"
  /**
   * Margen en proporción. Es una columna ordenable APARTE de "margen" y no un
   * adorno de esa celda porque responde a otra pregunta: "margen" ordena por
   * quién deja más dinero y "margen_pct" por quién rinde mejor, y los dos
   * órdenes no coinciden — el profesor con más margen en € suele ser el que más
   * alumnos tiene, no el más rentable.
   */
  | "margen_pct"
  | "status"
  | "is_active";

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

/**
 * Celda de importe que respeta el "—". `formatCurrency` ya devuelve "—" con
 * null, pero el color se decide antes: un guión no se pinta de verde ni de
 * rojo, porque no hay signo que semaforizar.
 */
function ImporteCell({
  value,
  semaforo = false,
}: {
  value: MetricValue;
  semaforo?: boolean;
}) {
  return (
    <td
      className={clsx(
        "py-2 tabular text-right font-medium",
        value === null
          ? "text-drc-ink-soft"
          : semaforo
            ? value >= 0
              ? "text-drc-green"
              : "text-drc-red"
            : "text-drc-ink"
      )}
    >
      {formatCurrency(value)}
    </td>
  );
}

/**
 * Celda de porcentaje. SIN semáforo a propósito, aunque su signo signifique lo
 * mismo que el de la columna de al lado: el margen en € ya va en verde o rojo, y
 * repetir el color en la celda pegada duplica el aviso y le quita jerarquía al
 * dato principal. Acá el gris dice "esto es el mismo margen, mirado en
 * proporción", que es justo lo que es.
 */
function PctCell({ value }: { value: MetricValue }) {
  return (
    <td className="py-2 tabular text-right text-drc-ink-soft">
      {formatPercent(value)}
    </td>
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
  className,
  sortKey,
  sortDir,
  onSort,
}: {
  columna: SortKey;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  /** Ajustes puntuales de separación. Ver el pl-4 de la columna Estado. */
  className?: string;
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
        align === "left" && "text-left pr-4",
        className
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

/**
 * Fila desplegable con los alumnos cuya ventana de facturación está en duda.
 *
 * Va como una <tr> propia y no como un panel flotante a propósito: la tabla vive
 * dentro de un `overflow-x-auto`, que recorta cualquier cosa posicionada encima,
 * y un tooltip nativo no da para leer con calma una lista de nombres con su
 * motivo. Acá se puede leer, seleccionar y copiar.
 *
 * El contador y el detalle son dos campos distintos del payload: si el contador
 * dice 2 y el detalle llega vacío (versión anterior del endpoint, o filas sin
 * nombre que detalleDudosasDe descarta), se dice — una fila desplegada y vacía
 * parece un fallo de la página, y la revisión a hacer es la misma.
 */
function FilaDudosas({ teacher, id }: { teacher: TeacherPayout; id: string }) {
  const alumnos = detalleDudosasDe(teacher);

  return (
    <tr id={id} className="border-b border-drc-line/60 bg-drc-blue/5">
      <td colSpan={8} className="px-2 py-2 text-[11px] text-drc-ink-soft">
        <div className="font-medium text-drc-blue">
          Ventanas de facturación en duda — su importe está sumado, pero puede
          estar contado en el mes de al lado.
        </div>
        {alumnos.length === 0 ? (
          <div className="mt-1">
            DRC Gestión no mandó el detalle por alumno: hay que revisar los
            alumnos de pago único de este profesor en su ficha.
          </div>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {alumnos.map((d) => (
              <li key={d.student_name}>
                <span className="text-drc-ink">{d.student_name}</span> —{" "}
                {d.motivo}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
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

  /**
   * Profesores con la fila de ventanas dudosas desplegada. Un Set y no un id
   * suelto: son avisos que se comparan entre sí (¿a cuáles les baila el mes?), y
   * un acordeón que cierra el anterior al abrir el siguiente obliga a recordar
   * lo que acaba de desaparecer.
   */
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const alternarDetalle = (teacherId: string) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (!next.delete(teacherId)) next.add(teacherId);
      return next;
    });
  };

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
        case "facturacion":
        case "margen":
        case "margen_pct": {
          const leer =
            sortKey === "facturacion"
              ? facturacionDe
              : sortKey === "margen"
                ? margenDe
                : margenPctDe;
          const va = leer(a);
          const vb = leer(b);
          // Los "sin dato" van SIEMPRE al final, se ordene ascendente o
          // descendente (por eso el 1 / -1 no se multiplica por `signo`).
          // Tratarlos como 0 los metería entre los números y haría parecer que
          // ese profesor no factura; ponerlos primero al invertir el orden
          // taparía justo el dato que se está buscando.
          if (va === null || vb === null) {
            if (va === vb) return 0;
            return va === null ? 1 : -1;
          }
          return signo * (va - vb);
        }
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

  /**
   * Facturación y margen del pie: suman SÓLO las filas que tienen el dato, y
   * dicen cuántas son. Con ninguna, el total es "—" y no 0 €.
   *
   * Por eso Margen puede no cuadrar con Facturación − Importe: el Importe suma
   * todas las filas visibles (el gasto se sabe siempre), y estos dos sólo las
   * que tienen precio resuelto. El tooltip del pie lo dice con el recuento
   * delante, que es la única forma de que el que reste no crea que sobra dinero.
   */
  const sumaConDato = (leer: (t: TeacherPayout) => MetricValue) => {
    const valores = filas.map(leer).filter((v): v is number => v !== null);
    return {
      total: valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0),
      filas: valores.length,
    };
  };
  const totalFacturacion = sumaConDato(facturacionDe);
  const totalMargen = sumaConDato(margenDe);
  /**
   * El % del pie sale de los DOS totales, no de promediar los porcentajes de
   * las filas: promediarlos le daría el mismo peso al profesor de 80 € que al
   * de 3.000 €, y el número dejaría de ser el margen del conjunto.
   *
   * Como las dos sumas recorren exactamente las mismas filas (las que tienen
   * precio resuelto), el cociente es consistente con lo que se ve arriba.
   */
  const totalMargenPct = margenSobreFacturacion(
    totalMargen.total,
    totalFacturacion.total
  );
  const tituloPie = (conDato: number) =>
    `Suma de ${formatNumber(conDato)} de ${formatNumber(
      filas.length
    )} filas visibles: sólo las que tienen precio de plan resuelto.`;

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

  /** Props de orden, iguales para las siete cabeceras. */
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
              <SortableTh columna="facturacion" align="right" {...orden}>
                Facturación
              </SortableTh>
              <SortableTh columna="margen" align="right" {...orden}>
                Margen
              </SortableTh>
              <SortableTh columna="margen_pct" align="right" {...orden}>
                Margen %
              </SortableTh>
              {/* pl-4: con "Margen %" al lado —una cabecera bastante más ancha
                  que sus valores— "Estado" quedaba pegado a su flecha de orden.
                  El padding va en la cabecera Y en las celdas para que la
                  columna entera se mueva junta. */}
              <SortableTh columna="status" className="pl-4" {...orden}>
                Estado
              </SortableTh>
              <SortableTh columna="is_active" align="center" {...orden}>
                Activo
              </SortableTh>
            </tr>
          </thead>
          <tbody>
            {filas.map((t) => {
              const aviso = avisoParcialDe(t);
              // Los dos avisos conviven en la misma celda y NO se funden: a uno
              // le falta un precio (amarillo) y al otro le baila la ventana
              // (azul). Un profesor puede tener los dos, y son dos revisiones
              // distintas en dos sitios distintos de DRC Gestión.
              const avisoDudosas = avisoDudosasDe(t);
              const detalleId = `dudosas-${t.teacher_id}`;
              const abierta = expandidos.has(t.teacher_id);
              return (
                <Fragment key={t.teacher_id}>
                  <tr className="border-b border-drc-line/60">
                    <td className="py-2 pr-4 text-drc-ink">
                      {t.teacher_name}
                      {aviso && <ParcialBadge aviso={aviso} />}
                      {avisoDudosas && (
                        <VentanaDudosaBadge
                          n={ventanasDudosasDe(t)}
                          aviso={avisoDudosas}
                          expandido={abierta}
                          onToggle={() => alternarDetalle(t.teacher_id)}
                          controla={detalleId}
                        />
                      )}
                    </td>
                    <td className="py-2 tabular text-right text-drc-ink-soft">
                      {formatNumber(t.classes_payable)}
                    </td>
                    <td className="py-2 tabular text-right font-medium text-drc-ink">
                      {formatCurrency(t.total_amount)}
                    </td>
                    <ImporteCell value={facturacionDe(t)} />
                    {/* El margen sí lleva semáforo: es la única columna con un
                        signo que significa algo (ganamos o perdemos con él). */}
                    <ImporteCell value={margenDe(t)} semaforo />
                    <PctCell value={margenPctDe(t)} />
                    <td className="py-2 pl-4 pr-4">
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
                  {abierta && <FilaDudosas teacher={t} id={detalleId} />}
                </Fragment>
              );
            })}
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-drc-ink-soft">
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
              <td
                className="py-2 tabular text-right"
                title={tituloPie(totalFacturacion.filas)}
              >
                {formatCurrency(totalFacturacion.total)}
              </td>
              <td
                className={clsx(
                  "py-2 tabular text-right",
                  totalMargen.total !== null &&
                    (totalMargen.total >= 0 ? "text-drc-green" : "text-drc-red")
                )}
                title={tituloPie(totalMargen.filas)}
              >
                {formatCurrency(totalMargen.total)}
              </td>
              <td
                className="py-2 tabular text-right text-drc-ink-soft"
                title={tituloPie(totalMargen.filas)}
              >
                {formatPercent(totalMargenPct)}
              </td>
              <td className="py-2" />
              <td className="py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* El pie de Margen suma la COLUMNA (sólo filas con precio resuelto) y la
          tarjeta "Margen total" resta todo el gasto, incluido el de esas filas
          sin dato. Los dos números son correctos y NO coinciden; sin este aviso,
          quien los vea juntos asume que uno de los dos está mal. */}
      {totalMargen.filas < filas.length && (
        <p className="text-[11px] text-drc-ink-soft">
          El pie sólo puede sumar las {formatNumber(totalMargen.filas)} filas con
          precio de plan resuelto (de {formatNumber(filas.length)}). Por eso su
          Margen —y su %— es mayor que el de la tarjeta «Margen total» de arriba,
          que descuenta además lo que se paga a los profesores sin facturación
          conocida.
        </p>
      )}
    </div>
  );
}
