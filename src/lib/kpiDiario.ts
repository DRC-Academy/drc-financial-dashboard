import { readSheetValues } from "./sheetsClient";
import { cached } from "./cache";
import { parseSheetDay } from "./isoDate";
import type { DailyKpiData, MetricValue, MonthRecord } from "@/types/kpi";

// Los helpers puros (client-safe) viven en kpiDiarioHelpers.ts para que la
// página ("use client") pueda importarlos sin arrastrar `googleapis` — mismo
// reparto que kpi.ts / kpiHelpers.ts.
export * from "./kpiDiarioHelpers";

const SHEET_NAME = "KPI Diario";

function toNumberOrNull(raw: unknown): MetricValue {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Columnas de la hoja que NO son métricas numéricas y por eso no entran como
 * claves: "semana" es texto ("2026_w31") y "mes_venta" es un serial de mes. Las
 * dos son ejes alternativos de agrupación que la página diaria no usa (para
 * semanas ya está "KPI Semanal"), y colarlas como métrica sólo ensuciaría
 * `keys` con dos entradas que ningún gráfico puede dibujar.
 */
const NON_METRIC_COLUMNS = new Set(["semana", "mes_venta"]);

/**
 * Lee la hoja "KPI Diario" completa y la transforma en:
 *   { days: string[], keys: string[], data: { [díaISO]: { [clave]: valor } } }
 *
 * Estructura de la hoja (transpuesta, igual que DB_KPI):
 *  - Fila 1: encabezados = nombres EXACTOS de variable (ingresos_netos, MRR, ...)
 *  - Columna A (desde fila 2): el día, como SERIAL de fecha de Sheets (45657);
 *    parseSheetDay lo normaliza a ISO "YYYY-MM-DD".
 *  - Resto de columnas: valor diario de cada métrica.
 *
 * Nunca lanza: si Sheets falla o la hoja no existe, devuelve
 * { days: [], keys: [], data: {} } para que la UI muestre "sin datos".
 * SOLO PARA USO EN SERVIDOR (API routes) — importa googleapis.
 */
export async function readKPIDiario(): Promise<DailyKpiData> {
  return cached("KPI_DIARIO", async () => {
    const rows = await readSheetValues(SHEET_NAME);

    if (!rows || rows.length < 2) {
      return { days: [], keys: [], data: {} };
    }

    const [headerRow, ...bodyRows] = rows;

    // Igual que en readDBKPI: cada métrica se lee por su ÍNDICE DE COLUMNA real,
    // no por su posición dentro de la lista de claves, para que una columna sin
    // encabezado (o con uno repetido) se ignore sin desplazar a sus vecinas.
    const columns: { key: string; index: number }[] = [];
    const seen = new Set<string>();
    for (let i = 1; i < headerRow.length; i++) {
      const key = String(headerRow[i] ?? "").trim();
      if (!key || seen.has(key) || NON_METRIC_COLUMNS.has(key)) continue;
      seen.add(key);
      columns.push({ key, index: i });
    }
    const keys = columns.map((c) => c.key);

    const days: string[] = [];
    const data: Record<string, MonthRecord> = {};

    for (const row of bodyRows) {
      const day = parseSheetDay(row[0]);
      if (!day) continue;

      const record: MonthRecord = {};
      for (const { key, index } of columns) {
        record[key] = toNumberOrNull(row[index]);
      }

      // UN DÍA, UNA ENTRADA EN days[] — aunque el Sheet traiga la fecha repetida.
      // `data` es un mapa y de por sí colapsa los duplicados (gana la última
      // fila), pero `days` es un ARRAY y es lo que recorren daysInRange() y
      // sumOver(): un push por fila hace que un día repetido se sume dos veces.
      // Pasó de verdad — el Sheet tenía dos filas para el 20 y el 21 de julio de
      // 2026 y julio salía 637,64 € inflado, lo bastante para dar vuelta el
      // signo del comparativo de la tarjeta de ingresos. El síntoma visible era
      // que un rango de 22 días decía "vs. 24d previos".
      if (!(day in data)) days.push(day);
      data[day] = record;
    }

    // La hoja viene en orden cronológico, pero el resto del módulo (rangos,
    // "último día con dato", ventana previa) asume que `days` está ordenado.
    // Ordenar acá cuesta nada y evita que una fila fuera de sitio en el Sheet se
    // convierta en un rango que no cuadra.
    days.sort();

    return { days, keys, data };
  });
}
