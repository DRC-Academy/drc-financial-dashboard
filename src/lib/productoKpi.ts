import { readSheetValues } from "./sheetsClient";
import { cached } from "./cache";
import type { MetricValue } from "@/types/kpi";

export interface ProductoKpiData {
  months: string[];
  productos: string[];
  // data[mes][producto] = ingresos de ese producto ese mes
  data: Record<string, Record<string, MetricValue>>;
}

function toNumberOrNull(raw: unknown): MetricValue {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * "KPI Producto": misma lógica transpuesta que DB_KPI, pero encabezados
 * son nombres de producto/plan en vez de claves de métrica.
 */
export async function readProductoKPI(): Promise<ProductoKpiData> {
  return cached("KPI Producto", async () => {
    const rows = await readSheetValues("KPI Producto");
    if (!rows || rows.length < 2) {
      return { months: [], productos: [], data: {} };
    }

    const [headerRow, ...bodyRows] = rows;
    const productos = headerRow.slice(1).map((h) => String(h).trim());

    const months: string[] = [];
    const data: Record<string, Record<string, MetricValue>> = {};

    for (const row of bodyRows) {
      const month = String(row[0] ?? "").trim();
      if (!month) continue;

      const record: Record<string, MetricValue> = {};
      productos.forEach((prod, idx) => {
        record[prod] = toNumberOrNull(row[idx + 1]);
      });

      months.push(month);
      data[month] = record;
    }

    return { months, productos, data };
  });
}
