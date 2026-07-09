import { readSheetValues } from "./sheetsClient";
import { cached } from "./cache";
import type { DBKpiData, MetricValue, MonthRecord } from "@/types/kpi";

// Los helpers puros (client-safe) viven en kpiHelpers.ts para que las
// páginas ("use client") puedan importarlos sin arrastrar `googleapis`
// (que depende de módulos de Node como "tls" y rompe el bundle de browser).
export * from "./kpiHelpers";

const SHEET_NAME = "DB_KPI";

function toNumberOrNull(raw: unknown): MetricValue {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee la hoja "DB_KPI" completa y la transforma en:
 *   { months: string[], keys: string[], data: { [mes]: { [clave]: valor } } }
 *
 * Estructura esperada de la hoja:
 *  - Fila 1: encabezados = nombres EXACTOS de variable (ingresos_netos, MRR, ...)
 *  - Columna A (desde fila 2): el mes (ago-25, sep-25, ...)
 *  - Resto de columnas: valor mensual de cada métrica
 *
 * Nunca lanza: si Sheets falla o la hoja no existe, devuelve
 * { months: [], keys: [], data: {} } para que la UI muestre "sin datos".
 * SOLO PARA USO EN SERVIDOR (API routes) — importa googleapis.
 */
export async function readDBKPI(): Promise<DBKpiData> {
  return cached("DB_KPI", async () => {
    const rows = await readSheetValues(SHEET_NAME);

    if (!rows || rows.length < 2) {
      return { months: [], keys: [], data: {} };
    }

    const [headerRow, ...bodyRows] = rows;
    const keys = headerRow.slice(1).map((h) => String(h).trim());

    const months: string[] = [];
    const data: Record<string, MonthRecord> = {};

    for (const row of bodyRows) {
      const month = String(row[0] ?? "").trim();
      if (!month) continue;

      const record: MonthRecord = {};
      keys.forEach((key, idx) => {
        record[key] = toNumberOrNull(row[idx + 1]);
      });

      months.push(month);
      data[month] = record;
    }

    return { months, keys, data };
  });
}
