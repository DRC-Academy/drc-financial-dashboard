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
