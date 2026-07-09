import type { DBKpiData } from "@/types/kpi";

/**
 * Filtro de rango de fechas por página. Puede ser un rango rápido (últimos N
 * meses; 0 = todo) o un rango custom con extremos "yyyy-mm" (cualquiera puede
 * ser null → extremo abierto).
 */
export type DateFilter =
  | { kind: "quick"; months: number }
  | { kind: "custom"; from: string | null; to: string | null };

export const DEFAULT_FILTER: DateFilter = { kind: "quick", months: 0 };

const MONTHS_ES_INDEX: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

/**
 * Convierte un label de mes a "yyyy-mm" comparable lexicográficamente.
 * Soporta "ago-25" (formato canónico ya normalizado) y, por robustez, un
 * serial de fecha de Google Sheets (ej. "45658").
 */
export function monthLabelToYYYYMM(label: string): string | null {
  const s = String(label).trim().toLowerCase();
  const m = s.match(/^([a-z]{3})-(\d{2})$/);
  if (m) {
    const mi = MONTHS_ES_INDEX[m[1]];
    if (mi === undefined) return null;
    const year = 2000 + Number(m[2]);
    return `${year}-${String(mi + 1).padStart(2, "0")}`;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n >= 30000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

/** Devuelve el subconjunto de meses (lista ordenada) que pasa el filtro. */
export function filterMonths(months: string[], filter: DateFilter): string[] {
  if (filter.kind === "quick") {
    const n = filter.months;
    if (!n || n <= 0 || n >= months.length) return months;
    return months.slice(months.length - n);
  }
  const { from, to } = filter;
  if (!from && !to) return months;
  return months.filter((label) => {
    const ym = monthLabelToYYYYMM(label);
    if (ym === null) return true; // no descartamos si no se puede parsear
    if (from && ym < from) return false;
    if (to && ym > to) return false;
    return true;
  });
}

/**
 * Restringe un DBKpiData a los meses visibles. Sólo cambia `months`; `data` se
 * comparte porque getLatest/getSeries/getMoM iteran únicamente sobre `months`.
 * Así, todos los KPIs y gráficos que usan el kpi filtrado reflejan la ventana
 * seleccionada (los KpiCard muestran el último valor DENTRO de la ventana).
 */
export function filterKpi(kpi: DBKpiData, visibleMonths: string[]): DBKpiData {
  return { months: visibleMonths, keys: kpi.keys, data: kpi.data };
}

/** Extremos [min, max] en "yyyy-mm" de una lista de labels de mes. */
export function monthsBounds(months: string[]): { min?: string; max?: string } {
  const yms = months
    .map(monthLabelToYYYYMM)
    .filter((v): v is string => v !== null)
    .sort();
  return { min: yms[0], max: yms[yms.length - 1] };
}
