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

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const MESES_ES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const DIA_MS = 86_400_000;

/**
 * Lunes y domingo (en UTC) de una semana ISO: la semana 1 es la que contiene el
 * primer jueves del año, así que el lunes de la semana 1 se obtiene retrocediendo
 * desde el 4 de enero hasta su lunes.
 *
 * Que la hoja use semana ISO de lunes a domingo NO es una suposición: se
 * verificó contra la columna `semana` de "KPI Diario", donde las 53 semanas
 * empiezan lunes y terminan domingo, y contra los totales de "KPI Semanal", que
 * cuadran al céntimo con la suma de los días de 2026 de ese rango.
 */
export function isoWeekRange(year: number, week: number): { start: Date; end: Date } {
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = new Date(jan4).getUTCDay() || 7; // 1=lunes … 7=domingo
  const week1Monday = jan4 - (jan4Dow - 1) * DIA_MS;
  const start = new Date(week1Monday + (week - 1) * 7 * DIA_MS);
  const end = new Date(start.getTime() + 6 * DIA_MS);
  return { start, end };
}

/**
 * Etiquetas cortas para los ejes de los gráficos: el lunes de cada semana
 * ("13 jul"). Se prefiere la fecha al número de semana porque es lo que permite
 * cruzar el gráfico con el desplegable, que también habla en fechas.
 *
 * Si el dataset abarca más de un año se agrega el año ("13 jul '26") para que
 * dos semanas homónimas no colapsen en la misma categoría del eje.
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
    const { start } = isoWeekRange(p.year, p.week);
    const base = `${start.getUTCDate()} ${MESES_ES_CORTO[start.getUTCMonth()]}`;
    labels[id] = multiYear
      ? `${base} '${String(start.getUTCFullYear()).slice(-2)}`
      : base;
  }
  return labels;
}

/**
 * Etiqueta larga y legible del período, para el desplegable y los títulos:
 *   mismo mes      → "Semana del 13 al 19 de julio"
 *   distinto mes   → "Semana del 29 de junio al 5 de julio"
 *   distinto año   → "Semana del 29 de diciembre de 2025 al 4 de enero de 2026"
 *
 * El año sólo aparece cuando la semana cruza de un año a otro (el caso de la
 * semana 1): repetirlo en las otras 51 sería ruido.
 */
export function weekLongLabel(id: string): string {
  const p = parseWeekId(id);
  if (!p) return id;

  const { start, end } = isoWeekRange(p.year, p.week);
  const d1 = start.getUTCDate();
  const d2 = end.getUTCDate();
  const m1 = MESES_ES[start.getUTCMonth()];
  const m2 = MESES_ES[end.getUTCMonth()];
  const y1 = start.getUTCFullYear();
  const y2 = end.getUTCFullYear();

  if (y1 !== y2) {
    return `Semana del ${d1} de ${m1} de ${y1} al ${d2} de ${m2} de ${y2}`;
  }
  if (m1 !== m2) {
    return `Semana del ${d1} de ${m1} al ${d2} de ${m2}`;
  }
  return `Semana del ${d1} al ${d2} de ${m1}`;
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
