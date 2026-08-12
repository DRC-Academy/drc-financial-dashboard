/** Valor de una métrica: número, o null si la celda está vacía / no existe. */
export type MetricValue = number | null;

/** Métricas de un mes puntual, indexadas por la clave exacta de DB_KPI. */
export type MonthRecord = Record<string, MetricValue>;

/** Resultado completo de leer DB_KPI. */
export interface DBKpiData {
  /** Meses en el orden en que aparecen en la hoja (columna A), p. ej. "ago-25". */
  months: string[];
  /** data[mes][clave] = valor */
  data: Record<string, MonthRecord>;
  /** Claves (encabezados) detectadas en la fila 1. */
  keys: string[];
}

/**
 * Resultado completo de leer "KPI Semanal". Misma forma que DBKpiData, pero la
 * dimensión temporal son semanas ("2026_w31") en vez de meses. Se mantiene como
 * tipo aparte —en vez de reusar DBKpiData con `months` lleno de semanas— para
 * que la capa de datos no mienta sobre su granularidad; la página lo adapta con
 * weeklyToKpiShape() y así reutiliza todos los helpers de kpiHelpers.ts.
 */
export interface WeeklyKpiData {
  /** Semanas en el orden de la hoja (columna A), p. ej. "2026_w31". */
  weeks: string[];
  /** data[semana][clave] = valor */
  data: Record<string, MonthRecord>;
  /** Claves (encabezados) numéricas detectadas en la fila 1. */
  keys: string[];
}

/**
 * Resultado completo de leer "KPI Diario". Misma forma transpuesta que
 * DBKpiData, pero la dimensión temporal son DÍAS en ISO "YYYY-MM-DD".
 *
 * Tipo aparte —en vez de reusar DBKpiData con `months` lleno de días— por el
 * mismo motivo que WeeklyKpiData: que la capa de datos no mienta sobre su
 * granularidad. La diferencia con la semanal es que acá los helpers tampoco se
 * reutilizan tal cual: sobre un rango de días las tarjetas AGREGAN (suman los
 * flujos, toman el último valor de los stocks), y eso vive en kpiDiarioHelpers.
 */
export interface DailyKpiData {
  /** Días en orden cronológico (columna A), en ISO "YYYY-MM-DD". */
  days: string[];
  /** data[día][clave] = valor */
  data: Record<string, MonthRecord>;
  /** Claves (encabezados) detectadas en la fila 1. */
  keys: string[];
}

export interface CohortRow {
  cohort: string;
  values: MetricValue[]; // valor por mes de vida (mes 0, 1, 2, ...)
}

export interface CohortData {
  cohorts: CohortRow[];
  monthsOfLife: number[]; // ej. [0,1,2,3,...]
}

export interface CancelacionRow {
  fecha: string | null;
  motivo: string;
  suscripcion: string;
}

export interface CuponRow {
  fecha: string | null;
  cupon: string;
  suscripcion: string;
  impacto: string;
}

export interface RenovacionRow {
  suscripcion: string;
  estado: string;
  fecha: string | null;
}
