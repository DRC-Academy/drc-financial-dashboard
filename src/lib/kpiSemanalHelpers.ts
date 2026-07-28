import type { DBKpiData, MetricValue, WeeklyKpiData } from "@/types/kpi";

/**
 * Helpers puros (client-safe) de la hoja "KPI Semanal": no importan googleapis,
 * así que la página ("use client") puede usarlos sin romper el bundle de
 * browser. Mismo reparto que kpiHelpers.ts ↔ kpi.ts.
 */

/**
 * Claves de "KPI Semanal" que NO se llaman igual que su equivalente en DB_KPI.
 * La hoja semanal renombró la familia "total" y unificó los leads por canal en
 * una sola columna (no trae el desglose ads/mail que sí tiene DB_KPI):
 *
 *   DB_KPI                              KPI Semanal
 *   ─────────────────────────────       ───────────────
 *   CPL_ads                             CPL_total
 *   CAC                                 CAC_total
 *   CR_clientes                         CR_total
 *   ads_meta_captac                     ads_meta_capt
 *   AOV_nuevos                          ARPNC
 *   leads_ads_google + leads_m_google   leads_google
 *   leads_ads_meta   + leads_m_meta     leads_meta
 *
 * Se exportan como constantes para que la página no repita los literales y para
 * dejar el mapeo escrito en un solo sitio si el Sheet vuelve a renombrar algo.
 */
export const SEM = {
  cplTotal: "CPL_total",
  cacTotal: "CAC_total",
  crTotal: "CR_total",
  adsMetaCapt: "ads_meta_capt",
  aovNuevos: "ARPNC",
  leadsGoogle: "leads_google",
  leadsMeta: "leads_meta",
} as const;

/**
 * Columnas de texto de la hoja con la alerta ya calculada (CPL_status,
 * CAC_google_status, ...). Se IGNORAN al parsear: vienen desigualmente llenadas
 * (CAC_meta_status sólo tiene 10 de 31 semanas) y desalineadas en la última
 * fila, así que la página recalcula las alertas con getAlertaOperativa, que es
 * la misma fuente de verdad que usa Captación mensual.
 */
export const STATUS_SUFFIX = "_status";

/** Semana parseada: año y número de semana. */
export interface ParsedWeek {
  year: number;
  week: number;
}

/** "2026_w31" → { year: 2026, week: 31 }. null si no matchea el formato. */
export function parseWeekId(id: string): ParsedWeek | null {
  const m = /^(\d{4})_w(\d{1,2})$/i.exec(id.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  if (week < 1 || week > 53) return null;
  return { year, week };
}

/**
 * Etiquetas cortas para los ejes de los gráficos y el desplegable.
 *
 * Devuelve "S31" cuando todas las semanas del dataset son del mismo año, y
 * "S31 '26" cuando hay más de uno, para que dos semanas homónimas de años
 * distintos no colapsen en la misma categoría del eje.
 *
 * A propósito NO deriva la fecha de inicio de semana: la hoja sólo guarda el
 * número, y no está confirmado si lo calcula con semana ISO (lunes) o con el
 * WEEKNUM por defecto de Sheets (domingo). Mostrar un rango de fechas derivado
 * sería inventar una precisión que el dato no tiene.
 */
export function buildWeekLabels(ids: string[]): Record<string, string> {
  const parsed = ids.map((id) => ({ id, p: parseWeekId(id) }));
  const years = new Set(parsed.map(({ p }) => p?.year).filter((y) => y !== undefined));
  const multiYear = years.size > 1;

  const labels: Record<string, string> = {};
  for (const { id, p } of parsed) {
    if (!p) {
      labels[id] = id; // formato inesperado: se muestra crudo antes que romper
      continue;
    }
    labels[id] = multiYear
      ? `S${p.week} '${String(p.year).slice(-2)}`
      : `S${p.week}`;
  }
  return labels;
}

/** Etiqueta larga para títulos: "Semana 31 · 2026". */
export function weekLongLabel(id: string): string {
  const p = parseWeekId(id);
  return p ? `Semana ${p.week} · ${p.year}` : id;
}

/**
 * Número de semana ISO de una fecha (semana 1 = la que contiene el primer
 * jueves del año). Sirve para detectar si la última semana de la hoja es la que
 * está en curso —y por lo tanto está incompleta—.
 */
function isoWeekOf(date: Date): ParsedWeek {
  // Trabajamos en UTC y nos movemos al jueves de esa semana: el año ISO es el
  // del jueves, que es lo que resuelve los bordes de fin de año.
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dow = d.getUTCDay() || 7; // 1=lunes … 7=domingo
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86_400_000 + 1) / 7);
  return { year, week };
}

/**
 * true si el id corresponde a la semana en curso. La hoja se llena a medida que
 * avanza la semana, así que esa fila SIEMPRE está parcial: la página la marca
 * para que su caída no se lea como un desplome real.
 *
 * `now` se inyecta para poder testear y para que el render sea determinista.
 */
export function isCurrentWeek(id: string, now: Date = new Date()): boolean {
  const p = parseWeekId(id);
  if (!p) return false;
  const current = isoWeekOf(now);
  return p.year === current.year && p.week === current.week;
}

/**
 * Adapta WeeklyKpiData a la forma que esperan los helpers de kpiHelpers.ts
 * (getValueAtMonth, getMoMAtMonth, getRoiCanal, ...). No copia los datos: sólo
 * reetiqueta `weeks` como `months`, así que la "variación mensual" de esos
 * helpers pasa a ser semana contra semana (por eso las tarjetas rotulan WoW).
 */
export function weeklyToKpiShape(weekly: WeeklyKpiData): DBKpiData {
  return { months: weekly.weeks, data: weekly.data, keys: weekly.keys };
}

/**
 * ROI de captación de una semana. La hoja semanal NO trae la columna ROI_capt
 * que sí tiene DB_KPI, así que se deriva con su MISMA fórmula, verificada
 * contra los 12 meses de DB_KPI:
 *
 *   ROI_capt = (ingresos_nuevos - ads_captacion) / ads_captacion
 *
 * (No es (ingresos_google+meta+otros - ads_captacion)/ads_captacion: esa
 * variante coincide en los meses en que todo el ingreso es nuevo, pero diverge
 * en el resto — p. ej. 0,559 vs -0,534 en el mes 46082 de DB_KPI.)
 */
export function getRoiCaptacion(kpi: DBKpiData, week: string): MetricValue {
  const ingresosNuevos = kpi.data[week]?.["ingresos_nuevos"] ?? null;
  const adsCaptacion = kpi.data[week]?.["ads_captacion"] ?? null;
  if (ingresosNuevos === null || adsCaptacion === null || adsCaptacion === 0) {
    return null;
  }
  return (ingresosNuevos - adsCaptacion) / adsCaptacion;
}
