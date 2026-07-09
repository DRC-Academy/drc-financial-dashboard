import { readSheetValues } from "./sheetsClient";
import { cached } from "./cache";
import type { CohortData, MetricValue } from "@/types/kpi";

function toNumberOrNull(raw: unknown): MetricValue {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formato esperado de "Cohortes Clientes" / "Cohortes Producto":
 *  - Fila 1: encabezados = mes de vida (0, 1, 2, 3, ...)
 *  - Columna A (desde fila 2): nombre de la cohorte (ej. "ago-25")
 *  - Resto: valor (retención %, LTV acumulado, etc.) para ese mes de vida
 */
async function readCohortSheet(sheetName: string): Promise<CohortData> {
  return cached(`cohort:${sheetName}`, async () => {
    const rows = await readSheetValues(sheetName);
    if (!rows || rows.length < 2) {
      return { cohorts: [], monthsOfLife: [] };
    }

    const [headerRow, ...bodyRows] = rows;
    const monthsOfLife = headerRow
      .slice(1)
      .map((h) => Number(h))
      .filter((n) => Number.isFinite(n));

    const cohorts = bodyRows
      .filter((row) => row[0] !== undefined && String(row[0]).trim() !== "")
      .map((row) => ({
        cohort: String(row[0]).trim(),
        values: row.slice(1).map(toNumberOrNull),
      }));

    return { cohorts, monthsOfLife };
  });
}

export function readCohortesClientes() {
  return readCohortSheet("Cohortes Clientes");
}

export function readCohortesProducto() {
  return readCohortSheet("Cohortes Plan");
}
