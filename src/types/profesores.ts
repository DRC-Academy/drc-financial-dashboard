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

  // ── Facturación y margen (DRC Gestión, 11/08/2026) ────────────────────────
  //
  // Salen de los planes de WooCommerce de los alumnos asignados, priceados con
  // la tabla `product_prices` del otro lado, que se carga A MANO. Mientras esa
  // tabla esté incompleta, estos campos vienen a medias — y el dashboard tiene
  // que decirlo, no taparlo.
  //
  // CUIDADO CON EL CERO: `facturacion` NO es nullable. Cuando ningún alumno
  // tiene precio resuelto llega como 0, y ahí el 0 significa "no lo sabemos",
  // no "no factura". Quien lo pinte tiene que pasar por facturacionDe() de
  // lib/profesoresHelpers, que lo traduce a null → "—". El campo que sí es
  // honesto por sí solo es `margen`.

  /** Suma de lo que facturan sus alumnos con precio resuelto. 0 si no hay ninguno. */
  facturacion: number;
  /** facturacion − total_amount. null si NINGÚN alumno tiene precio resuelto. */
  margen: number | null;
  alumnos_con_precio: number;
  alumnos_totales: number;
  /**
   * true = falta el precio de al menos un alumno (alumnos_con_precio <
   * alumnos_totales), así que `facturacion` es un PISO y `margen` un MÍNIMO: el
   * real es igual o mayor. No es un error ni un dato inválido, es un dato
   * incompleto, y se muestra siempre.
   *
   * Ojo con el caso 0 de 0 alumnos: ahí sale FALSE (0 < 0 no se cumple) aunque
   * no haya nada que facturar. Por eso el aviso de la UI no se decide sólo con
   * este flag — ver avisoParcialDe() en lib/profesoresHelpers.
   */
  facturacion_parcial: boolean;
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

  /** Facturación del mes = suma de la de todos los profesores. Mismo aviso del
   *  cero que en TeacherPayout.facturacion: 0 puede ser "no lo sabemos". */
  facturacion_total: number;
  /**
   * facturacion_total − total_amount. null si NINGÚN profesor tiene un solo
   * alumno con precio resuelto (p. ej. `product_prices` vacía del otro lado).
   *
   * Es además el interruptor que dice si `facturacion_total` significa algo:
   * margen_total === null ⟺ ningún alumno priceado ⟺ facturacion_total es 0
   * por falta de datos, no por falta de facturación.
   */
  margen_total: number | null;
  /** true si a CUALQUIER profesor le falta el precio de algún alumno → las dos
   *  cifras de arriba son un mínimo. */
  facturacion_parcial: boolean;

  teachers: TeacherPayout[];
}

/**
 * Un punto de la serie mensual.
 *
 * SIN facturación ni margen a propósito: el endpoint de la serie
 * (/api/external/payouts/summary) sólo devuelve gasto y nº de profesores, así
 * que no se declaran acá. Para la facturación de un mes hay que pedir ese mes
 * con /api/profesores?month=.
 */
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
