/**
 * Tipos del gasto en profesores. Espejo EXACTO de lo que devuelve el endpoint
 * externo de DRC Gestión (`/api/external/payouts` y `/api/external/payouts/summary`),
 * que es quien manda: acá no se calcula nada, sólo se lee.
 *
 * Viven en types/ y no en lib/externalPayouts.ts a propósito: el lector del
 * endpoint es SOLO SERVIDOR (lleva el secreto), así que la página cliente
 * necesita poder importar los tipos sin arrastrarlo.
 *
 * Las claves van en snake_case porque así vienen del JSON remoto. No se
 * renombran: la primera vez que un campo se llame distinto de los dos lados,
 * cuadrar un número deja de ser una búsqueda de texto.
 */

/** Estado de la liquidación de un profesor en un mes. */
export type PayoutStatus = "paid" | "pending" | "en_curso";

/** Fila del detalle por profesor. Sólo id y nombre: no llega ningún dato personal. */
export interface TeacherPayout {
  teacher_id: string;
  teacher_name: string;
  month_year: string;
  total_amount: number;
  classes_payable: number;
  status: PayoutStatus;
  is_active: boolean;
}

/** GET /api/external/payouts?month=YYYY-MM */
export interface PayoutsMonth {
  generated_at: string;
  currency: string;
  /** El mes consultado, en "YYYY-MM" (ojo: la clave es month_year, el parámetro es month). */
  month_year: string;
  /** true si es el mes en curso → el importe es el cálculo hasta hoy, no un cierre. */
  is_current_month: boolean;
  total_amount: number;
  /** Profesores que facturaron algo ESE mes. Es el número histórico real. */
  teachers_with_amount: number;
  /**
   * Profesores con ≥1 alumno activo AHORA MISMO. Es una FOTO DEL PRESENTE, no
   * del mes consultado: sale igual pidas el mes que pidas. El sufijo `_now` es
   * del otro lado y se conserva justamente para que nadie lo grafique como si
   * fuera una evolución — para eso está teachers_with_amount.
   */
  active_teachers_now: number;
  teachers: TeacherPayout[];
}

/** Un punto de la serie mensual. */
export interface PayoutsSummaryPoint {
  month_year: string;
  is_current_month: boolean;
  total_amount: number;
  teachers_with_amount: number;
  /** Foto del presente, idéntica en todos los puntos. NO graficar. Ver PayoutsMonth. */
  active_teachers_now: number;
}

/** GET /api/external/payouts/summary?from=YYYY-MM&to=YYYY-MM */
export interface PayoutsSummary {
  generated_at: string;
  currency: string;
  from: string;
  to: string;
  /** CANTIDAD de meses del rango (un número), NO la lista. La serie es `series`. */
  months: number;
  /** Total del rango. Si incluye el mes en curso, sube durante el mes. */
  total_amount: number;
  includes_current_month: boolean;
  series: PayoutsSummaryPoint[];
}
