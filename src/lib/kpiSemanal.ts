import { readSheetValues } from "./sheetsClient";
import { cached } from "./cache";
import { STATUS_SUFFIX } from "./kpiSemanalHelpers";
import type { MetricValue, MonthRecord, WeeklyKpiData } from "@/types/kpi";

// Los helpers puros (client-safe) viven en kpiSemanalHelpers.ts para que la
// página ("use client") pueda importarlos sin arrastrar `googleapis`.
export * from "./kpiSemanalHelpers";

const SHEET_NAME = "KPI Semanal";

function toNumberOrNull(raw: unknown): MetricValue {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee la hoja "KPI Semanal" y la transforma en:
 *   { weeks: string[], keys: string[], data: { [semana]: { [clave]: valor } } }
 *
 * Estructura de la hoja (misma lógica transpuesta que DB_KPI):
 *  - Fila 1: encabezados = nombres EXACTOS de variable (ads_total, CPL_total, ...)
 *  - Columna A (desde fila 2): la semana, como TEXTO "2026_w01" … "2026_w52".
 *    No es un serial de fecha de Sheets, así que acá no hace falta la conversión
 *    que sí necesitan Cohortes y DB_KPI.
 *  - Resto de columnas: valor semanal de cada métrica.
 *
 * Nunca lanza: si Sheets falla o la hoja no existe, devuelve
 * { weeks: [], keys: [], data: {} } para que la UI muestre "sin datos".
 * SOLO PARA USO EN SERVIDOR (API routes) — importa googleapis.
 */
export async function readKPISemanal(): Promise<WeeklyKpiData> {
  return cached("KPI_SEMANAL", async () => {
    const rows = await readSheetValues(SHEET_NAME);

    if (!rows || rows.length < 2) {
      return { weeks: [], keys: [], data: {} };
    }

    const [headerRow, ...bodyRows] = rows;

    // Igual que en readDBKPI: cada métrica se lee por su ÍNDICE DE COLUMNA real
    // y no por su posición en la lista de claves, para que una columna sin
    // encabezado (o repetida) se ignore sin desplazar a las de su derecha.
    // Además se saltan las columnas *_status: son texto precalculado por el
    // Sheet y la página recalcula esas alertas con getAlertaOperativa.
    const columns: { key: string; index: number }[] = [];
    const seen = new Set<string>();
    for (let i = 1; i < headerRow.length; i++) {
      const key = String(headerRow[i] ?? "").trim();
      if (!key || seen.has(key)) continue;
      if (key.toLowerCase().endsWith(STATUS_SUFFIX)) continue;
      seen.add(key);
      columns.push({ key, index: i });
    }
    const keys = columns.map((c) => c.key);

    const weeks: string[] = [];
    const data: Record<string, MonthRecord> = {};

    for (const row of bodyRows) {
      const week = String(row[0] ?? "").trim();
      if (!week) continue;

      const record: MonthRecord = {};
      for (const { key, index } of columns) {
        record[key] = toNumberOrNull(row[index]);
      }

      weeks.push(week);
      data[week] = record;
    }

    // La hoja trae el año COMPLETO pre-creado: las semanas que todavía no
    // ocurrieron existen como filas llenas de 0 (no vacías). Si se dejaran, los
    // gráficos dibujarían meses de caída a cero que no son un desplome sino
    // simple ausencia de datos. Se recortan sólo desde el final —nunca huecos
    // intermedios— mientras la semana no tenga ni un valor distinto de 0.
    while (weeks.length > 0) {
      const last = weeks[weeks.length - 1];
      const record = data[last];
      const tieneDato = Object.values(record).some((v) => v !== null && v !== 0);
      if (tieneDato) break;
      weeks.pop();
      delete data[last];
    }

    return { weeks, keys, data };
  });
}
