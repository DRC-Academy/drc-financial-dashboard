"use client";

import { formatNumber } from "@/lib/kpiHelpers";
import {
  detalleDudosasDe,
  profesoresConDudosas,
  ventanasDudosasTotalDe,
} from "@/lib/profesoresHelpers";
import type { PayoutsMonth, TeacherPayout } from "@/types/profesores";

/**
 * Aviso de mes: "hay N ventanas de facturación en duda", con el listado de
 * quiénes son detrás de un desplegable.
 *
 * AZUL, no amarillo, y el color es la mitad del mensaje: el aviso amarillo de
 * "cifra parcial" dice que al número le FALTA algo (es un mínimo); éste dice que
 * el número está entero pero puede estar repartido entre dos meses. Puestos del
 * mismo color, quien los lea corregiría el dato equivocado.
 *
 * El listado va en un <details> nativo y no en un tooltip porque puede tener
 * decenas de líneas: un `title` no se puede leer con calma, ni copiar, ni
 * repasar nombre por nombre, que es exactamente lo que hay que hacer con él.
 *
 * Se usa en las dos páginas que enseñan margen (Profesores y Resumen
 * Ejecutivo). En Profesores además cada fila de la tabla lleva su propio chip;
 * acá está el total, que es lo único que se ve sin bajar a la tabla — y en
 * Resumen, donde no hay tabla debajo, es el único sitio donde se ven los
 * nombres.
 */
export function VentanasDudosasNota({
  mes,
  /** Texto extra al final, para decir dónde está el desglose en cada página. */
  coda,
}: {
  mes: PayoutsMonth;
  coda?: string;
}) {
  const total = ventanasDudosasTotalDe(mes);
  if (total === 0) return null;

  const profesores = profesoresConDudosas(mes);

  return (
    <div className="rounded-lg border border-drc-blue/40 bg-drc-blue/5 px-4 py-2.5 text-xs text-drc-ink">
      <div>
        <span className="font-semibold text-drc-blue">
          ⇄ {formatNumber(total)}{" "}
          {total === 1 ? "ventana de facturación en duda" : "ventanas de facturación en duda"}
        </span>{" "}
        — no es lo mismo que una cifra parcial: el importe de estos alumnos SÍ
        está sumado, pero su plan de pago único termina en una fecha y su acceso
        en otra muy distinta, así que puede estar contado en el mes de al lado.
        Hay que revisar su ficha en DRC Gestión.
        {coda ? ` ${coda}` : ""}
      </div>

      {profesores.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-drc-blue hover:underline">
            Ver quiénes son ({formatNumber(profesores.length)}{" "}
            {profesores.length === 1 ? "profesor" : "profesores"})
          </summary>
          <ul className="mt-2 space-y-2">
            {profesores.map((t) => (
              <li key={t.teacher_id}>
                <div className="font-medium text-drc-ink">{t.teacher_name}</div>
                <ListaDudosas teacher={t} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * Los alumnos de un profesor, o por qué no se pueden listar.
 *
 * El contador y el detalle son dos campos distintos del payload y pueden no
 * cuadrar (una versión del endpoint que mande sólo el número, o filas del
 * detalle sin nombre, que detalleDudosasDe descarta). Cuando pasa, se dice: un
 * nombre de profesor con una lista vacía debajo parece un fallo de la página, y
 * lo que hay que hacer —ir a mirar sus alumnos en DRC Gestión— es lo mismo.
 */
function ListaDudosas({ teacher }: { teacher: TeacherPayout }) {
  const alumnos = detalleDudosasDe(teacher);

  if (alumnos.length === 0) {
    return (
      <div className="mt-0.5 border-l border-drc-blue/30 pl-2.5 text-drc-ink-soft">
        DRC Gestión no mandó el detalle por alumno: hay que mirar sus alumnos de
        pago único en la ficha del profesor.
      </div>
    );
  }

  return (
    <ul className="mt-0.5 space-y-0.5 border-l border-drc-blue/30 pl-2.5">
      {alumnos.map((d) => (
        <li
          key={`${teacher.teacher_id}:${d.student_name}`}
          className="text-drc-ink-soft"
        >
          <span className="text-drc-ink">{d.student_name}</span> — {d.motivo}
        </li>
      ))}
    </ul>
  );
}
