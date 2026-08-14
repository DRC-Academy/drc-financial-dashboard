/**
 * Tipos del recuento de suscripciones. Espejo EXACTO de `SubscriptionsSnapshot`
 * de `lib/externalSubscriptions.ts` de DRC Gestión, que es quien manda: acá no
 * se calcula nada, sólo se lee.
 *
 * Viven en types/ y no en lib/externalSubscriptions.ts a propósito: el lector es
 * SOLO SERVIDOR (lleva el secreto), así que la página cliente necesita poder
 * importar los tipos sin arrastrarlo.
 *
 * Las claves van en snake_case porque así vienen del JSON remoto. No se
 * renombran: la primera vez que un campo se llame distinto de los dos lados,
 * cuadrar un número deja de ser una búsqueda de texto.
 *
 * ES UNA FOTO DEL PRESENTE, no una serie: el endpoint no acepta `month` y no
 * sabe cuántos activos había en marzo. Por eso nada de esto se grafica en el
 * tiempo ni depende del desplegable de mes — igual que `active_teachers_now` en
 * profesores. La serie histórica sigue saliendo del Sheet.
 */

/**
 * Recuento crudo de WooCommerce, contando SUSCRIPCIONES (no personas: un alumno
 * puede tener más de una).
 */
export interface WooCount {
  /**
   * false → no se pudo leer WooCommerce. Con ok:false los recuentos de abajo
   * vienen en 0, y son ceros de "no lo sabemos": no se pintan como dato.
   */
  ok: boolean;
  total: number;
  /** Un contador por estado conocido ('active', 'cancelled', 'on-hold', 'pending-cancel', 'expired', 'scheduled'). */
  por_estado: Record<string, number>;
  /** Estados que el otro lado no mapea ('switched', 'pending'…). Vacío lo normal. */
  otros_estados: Record<string, number>;
  /** Suscripciones que DAN ACCESO: active + pending-cancel. */
  dan_acceso: number;
  paginas_leidas: number;
  /** Motivo del fallo cuando ok:false. null si fue bien. */
  error: string | null;
}

/** GET /api/external/subscriptions */
export interface SubscriptionsSnapshot {
  generated_at: string;
  /** Día en el que el otro lado hizo las cuentas, hora de España ("YYYY-MM-DD"). */
  today_madrid: string;
  woocommerce: WooCount;
  alumnos: {
    en_base: number;
    /**
     * Activos totales contando PERSONAS, con la regla única de DRC Gestión
     * (Woo 'active'/'pending-cancel' OR activación manual vigente OR Oritalk).
     *
     * `null` cuando WooCommerce no contestó: sin su respuesta falta uno de los
     * tres orígenes y el total sería un piso, no el dato. Es null explícito y
     * NUNCA 0 — un 0 acá dibujaría una caída inventada.
     */
    activos: number | null;
    inactivos: number | null;
    /** Excluyentes por precedencia oritalk > manual > woo: suman `activos`. */
    por_origen: {
      suscripcion: number | null;
      manual: { total: number; plan_empresa: number; a_mano: number };
      oritalk: number;
    };
  };
  descuadres: {
    /** Pagan en Woo pero no existen en la base: altas sin dar de alta. */
    suscripciones_activas_sin_alumno: number | null;
    /** Dan acceso pero Woo no trae email: imposible cruzarlas con nadie. */
    suscripciones_activas_sin_email: number | null;
    /** Alumnos sin email cargado: nunca podrán contarse por suscripción. */
    alumnos_sin_email: number;
  };
}
