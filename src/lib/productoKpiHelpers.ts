import type { MetricValue } from "@/types/kpi";

/**
 * Tipos y helpers PUROS de la hoja "KPI Producto" (client-safe: no importan
 * googleapis). El lector que toca el Sheet vive en productoKpi.ts, que
 * re-exporta todo esto — mismo patrón que kpiHelpers.ts / kpi.ts.
 *
 * ESTRUCTURA REAL DE LA HOJA (diagnosticada sobre las 170 filas):
 * no es una tabla simple, son ~17 TABLAS APILADAS en la misma hoja, separadas
 * por filas vacías. La columna A está vacía; la B lleva las etiquetas; de la C
 * en adelante van los 12 meses (como seriales de fecha). La fila de cabecera es
 * la que dice "Meses" en la columna de etiquetas.
 *
 * Cada tabla es un BLOQUE: su primera fila es el título (a veces con los
 * totales del mes, a veces vacía) y las siguientes son sus series. Los bloques
 * se alternan entre dos desgloses distintos del mismo dato:
 *   - por PRODUCTO ("Curso de inglés general", "Preparación B1 Preliminary", …)
 *   - por HORAS semanales ("1h-semanal", "2h-semanales", …)
 * Por eso "Horas" aparece repetido: cada bloque de horas desglosa al bloque de
 * producto inmediatamente anterior (su `parent`).
 */

export type ProductoDimension = "producto" | "horas";

export interface ProductoSerie {
  label: string;
  /** Un valor por mes, en el mismo orden que `ProductoKpiData.months`. */
  values: MetricValue[];
}

export interface ProductoBlock {
  /** Título tal cual está en la hoja: "Ingresos", "LTV", "Ventas", "Horas"… */
  name: string;
  dimension: ProductoDimension;
  /** Bloque de producto al que desglosa. Sólo para dimension "horas". */
  parent: string | null;
  /** Fila del título: totales del bloque, o todo null si la hoja no los trae. */
  totals: MetricValue[];
  series: ProductoSerie[];
}

export interface ProductoKpiData {
  /** Meses normalizados a "mmm-yy", en orden cronológico. */
  months: string[];
  blocks: ProductoBlock[];
  /** Productos vistos en los bloques de dimensión "producto", en orden de aparición. */
  productos: string[];
}

export const EMPTY_PRODUCTO_KPI: ProductoKpiData = {
  months: [],
  blocks: [],
  productos: [],
};

/**
 * Compara títulos de bloque ignorando mayúsculas y espacios sobrantes. Las
 * tildes SÍ cuentan: los títulos se escriben en el código tal cual están en la
 * hoja, así que si un día alguien renombra un bloque en el Sheet, el lookup
 * falla de forma visible (el panel queda vacío) en vez de acertar por
 * casualidad con una comparación laxa.
 */
function normalize(s: string): string {
  return s.trim().toLowerCase().normalize("NFC");
}

/** Primer bloque con ese título y esa dimensión, o null si la hoja no lo trae. */
export function getBlock(
  data: ProductoKpiData,
  name: string,
  dimension: ProductoDimension = "producto"
): ProductoBlock | null {
  const target = normalize(name);
  return (
    data.blocks.find(
      (b) => normalize(b.name) === target && b.dimension === dimension
    ) ?? null
  );
}

/**
 * Valores de un bloque en UN mes: [{ label, value }] ya filtrado de series sin
 * dato. No ordena — de eso se encarga quien lo pinte (ranking, mix, cuadrante).
 */
export function blockAtMonth(
  block: ProductoBlock | null,
  months: string[],
  month: string
): { label: string; value: number }[] {
  if (!block) return [];
  const i = months.indexOf(month);
  if (i < 0) return [];
  return block.series
    .map((s) => ({ label: s.label, value: s.values[i] }))
    .filter((r): r is { label: string; value: number } => r.value !== null);
}

/** Ranking descendente de un bloque en un mes, quitando los ceros. */
export function rankAtMonth(
  block: ProductoBlock | null,
  months: string[],
  month: string
): { label: string; value: number }[] {
  return blockAtMonth(block, months, month)
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

/**
 * Crecimiento de cada serie del bloque entre el mes elegido y el anterior, en
 * PUNTOS porcentuales. Devuelve null cuando el mes previo es 0 o falta (no hay
 * base sobre la que calcular un %), para no inventar un "+∞".
 */
export function growthAtMonth(
  block: ProductoBlock | null,
  months: string[],
  month: string
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (!block) return out;
  const i = months.indexOf(month);
  if (i < 0) return out;
  for (const s of block.series) {
    const now = s.values[i];
    const prev = i > 0 ? s.values[i - 1] : null;
    if (now === null || prev === null || prev === 0) {
      out.set(s.label, null);
      continue;
    }
    out.set(s.label, ((now - prev) / Math.abs(prev)) * 100);
  }
  return out;
}
