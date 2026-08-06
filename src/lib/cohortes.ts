import { readSheetValues } from "./sheetsClient";
import { cached } from "./cache";
import { formatSheetMonth } from "./kpiHelpers";
import type { CohortData, MetricValue } from "@/types/kpi";

function toNumberOrNull(raw: unknown): MetricValue {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Un serial de fecha de Google Sheets (números ≥ 30000 ≈ año 1982 en adelante). */
function isDateSerial(raw: unknown): boolean {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 30000;
}

/**
 * "Cohortes Clientes" es un export de tabla dinámica con VARIOS bloques
 * apilados y separados por filas en blanco (COUNTUNIQUE de clientes, "Ingresos
 * Netos", "Acumulado", "Mes", "Promedio"...). Sólo nos interesa el PRIMER
 * bloque (conteo de clientes por cohorte y mes de vida).
 *
 * Estructura del bloque:
 *  - Fila de encabezado cuya col. A dice "start_month" y cuyas columnas
 *    siguientes son los meses de vida (0, 1, 2, ...).
 *  - Debajo, una fila por cohorte: col. A = fecha serial de Sheets (ej. 45658),
 *    resto = valor por mes de vida.
 *  - El bloque termina en la primera fila cuya col. A NO es un serial de fecha
 *    (ej. "Suma total" o una fila en blanco).
 */
async function readCohortSheet(sheetName: string): Promise<CohortData> {
  return cached(`cohort:${sheetName}`, async () => {
    const rows = await readSheetValues(sheetName);
    if (!rows || rows.length === 0) {
      return { cohorts: [], monthsOfLife: [] };
    }

    // 1. Ubicar la fila de encabezado del primer bloque ("start_month").
    const headerIdx = rows.findIndex(
      (r) => String(r[0] ?? "").trim().toLowerCase() === "start_month"
    );
    if (headerIdx === -1) return { cohorts: [], monthsOfLife: [] };

    // 2. Meses de vida = enteros contiguos desde la col. B; cortar en el primer
    //    valor no entero (#NUM!, "Suma total", etc.) o en la primera celda
    //    VACÍA.
    //
    //    Lo de la celda vacía no es una precaución de más: la cabecera real
    //    termina en [... 17, 18, "", "Suma total"], y ese "" es el grupo "(en
    //    blanco)" de la tabla dinámica. Como Number("") es 0 y 0 sí es entero,
    //    sin este corte entraba como un mes de vida 0 EXTRA al final, con los
    //    clientes sueltos sin mes_vida dentro. Se colaba en el heatmap y, peor,
    //    ensuciaba cualquier lectura de "el último valor de la cohorte".
    const headerRow = rows[headerIdx];
    const monthsOfLife: number[] = [];
    for (let i = 1; i < headerRow.length; i++) {
      const raw = headerRow[i];
      if (raw === null || raw === undefined || String(raw).trim() === "") break;
      const n = Number(raw);
      if (!Number.isInteger(n)) break;
      monthsOfLife.push(n);
    }

    // 3. Cohortes = filas siguientes con col. A serial de fecha; cortar en la
    //    primera fila que no lo sea (fin del bloque, p. ej. "Suma total").
    const cohorts: CohortData["cohorts"] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const first = rows[i][0];
      if (!isDateSerial(first)) break;
      cohorts.push({
        cohort: formatSheetMonth(first),
        values: monthsOfLife.map((_, idx) => toNumberOrNull(rows[i][idx + 1])),
      });
    }

    return { cohorts, monthsOfLife };
  });
}

export function readCohortesClientes() {
  return readCohortSheet("Cohortes Clientes");
}

export function readCohortesProducto() {
  return readCohortSheet("Cohortes Plan");
}
