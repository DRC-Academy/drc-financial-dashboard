import { readSheetValues } from "./sheetsClient";
import { cached } from "./cache";
import { formatSheetMonth } from "./kpiHelpers";
import type { MetricValue } from "@/types/kpi";
import type { ProductoBlock, ProductoKpiData } from "./productoKpiHelpers";
import { EMPTY_PRODUCTO_KPI } from "./productoKpiHelpers";

// Los tipos y helpers puros viven en productoKpiHelpers.ts para que la página
// ("use client") pueda importarlos sin arrastrar googleapis.
export * from "./productoKpiHelpers";

const SHEET_NAME = "KPI Producto";

/** Etiquetas del desglose por horas: "1h-semanal", "2h-semanales", … */
const HORAS_LABEL = /^\s*\d+\s*h[-\s]?semanal/i;

function toNumberOrNull(raw: unknown): MetricValue {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee "KPI Producto", que NO es una tabla simple sino ~17 tablas apiladas en la
 * misma hoja separadas por filas vacías (ver la nota de estructura en
 * productoKpiHelpers.ts).
 *
 * El parseo no hardcodea posiciones: localiza la fila de cabecera buscando la
 * celda "Meses" (de ahí salen la columna de etiquetas y la primera columna de
 * datos) y a partir de ahí trocea en bloques por filas vacías. Así, si mañana
 * se añade un bloque nuevo a la hoja, aparece solo.
 *
 * Nunca lanza: si falla Sheets o la hoja no existe, devuelve la forma vacía.
 * SOLO PARA USO EN SERVIDOR (API routes) — importa googleapis.
 */
export async function readProductoKPI(): Promise<ProductoKpiData> {
  return cached(SHEET_NAME, async () => {
    const rows = await readSheetValues(SHEET_NAME);
    if (!rows || rows.length === 0) return EMPTY_PRODUCTO_KPI;

    // --- 1. Cabecera: la fila que dice "Meses" ---
    let headerRow = -1;
    let labelCol = -1;
    for (let r = 0; r < rows.length && headerRow < 0; r++) {
      const row = rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        if (String(row[c] ?? "").trim().toLowerCase() === "meses") {
          headerRow = r;
          labelCol = c;
          break;
        }
      }
    }
    if (headerRow < 0) return EMPTY_PRODUCTO_KPI;

    const firstValueCol = labelCol + 1;
    const months = (rows[headerRow] ?? [])
      .slice(firstValueCol)
      .map((m) => formatSheetMonth(m))
      .filter((m) => m !== "");
    if (months.length === 0) return EMPTY_PRODUCTO_KPI;

    // --- 2. Trocear en bloques por filas vacías ---
    const blocks: ProductoBlock[] = [];
    let current: ProductoBlock | null = null;

    for (const row of rows.slice(headerRow + 1)) {
      const label = String(row?.[labelCol] ?? "").trim();

      if (!label) {
        // Fila vacía: cierra el bloque en curso. Varias seguidas no molestan.
        if (current) blocks.push(current);
        current = null;
        continue;
      }

      const values = months.map((_, i) =>
        toNumberOrNull(row?.[firstValueCol + i])
      );

      if (!current) {
        // Primera fila tras un hueco = título del bloque. Sus valores son los
        // totales, que en algunos bloques ("Ventas", "LTV") vienen vacíos.
        current = {
          name: label,
          dimension: "producto",
          parent: null,
          totals: values,
          series: [],
        };
      } else {
        current.series.push({ label, values });
      }
    }
    if (current) blocks.push(current);

    // --- 3. Marcar los bloques de horas y colgarlos de su bloque de producto ---
    let lastProducto: string | null = null;
    for (const b of blocks) {
      const esHoras =
        b.series.length > 0 && b.series.every((s) => HORAS_LABEL.test(s.label));
      if (esHoras) {
        b.dimension = "horas";
        b.parent = lastProducto;
      } else {
        lastProducto = b.name;
      }
    }

    // --- 4. Catálogo de productos, en orden de aparición ---
    const productos: string[] = [];
    for (const b of blocks) {
      if (b.dimension !== "producto") continue;
      for (const s of b.series) {
        if (!productos.includes(s.label)) productos.push(s.label);
      }
    }

    return { months, blocks, productos };
  });
}
