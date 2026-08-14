/**
 * PROFESORES · facturación y margen — el único sitio donde vive la regla
 * "UN CERO NO ES UN DATO".
 *
 * DRC Gestión calcula la facturación de cada profesor priceando los planes de
 * WooCommerce de sus alumnos contra su tabla `product_prices`, que se carga a
 * mano. De ahí salen tres situaciones distintas que la UI NO puede confundir:
 *
 *   1. Todos los alumnos priceados        → facturación y margen son el número.
 *   2. Algunos priceados (parcial)        → son un MÍNIMO: el real es igual o
 *                                           mayor. Se muestran, con aviso.
 *   3. Ninguno priceado                   → no se sabe nada. "—", nunca 0 €.
 *
 * El problema es que en el caso 3 el endpoint manda `facturacion: 0`, no null
 * (`margen` sí llega null). Pintar ese 0 tal cual diría "este profesor no
 * factura nada", que es una afirmación falsa y además la peor posible: un
 * margen de −1.200 € inventado sobre un profesor que factura de sobra. Por eso
 * nadie lee `facturacion` directo del payload: se lee por acá.
 *
 * Todo pasa por `num()` y tolera campos ausentes. Si DRC Gestión se revirtiera
 * a la versión anterior del endpoint, estas columnas se vaciarían a "—" solas
 * en vez de pintar "NaN €", y el gasto (total_amount) seguiría funcionando: son
 * datos independientes.
 */

import type { MetricValue } from "@/types/kpi";
import type { PayoutsMonth, TeacherPayout } from "@/types/profesores";

/** Número utilizable, o null. Cubre undefined (campo ausente), NaN e Infinity. */
const num = (v: unknown): MetricValue =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** ¿Hay al menos un alumno de este profesor con precio resuelto? */
function tienePrecios(t: TeacherPayout): boolean {
  const n = num(t.alumnos_con_precio);
  return n !== null && n > 0;
}

/**
 * Facturación del profesor, o null si no hay ni un alumno priceado (donde el
 * payload trae 0 queriendo decir "sin datos").
 */
export function facturacionDe(t: TeacherPayout): MetricValue {
  return tienePrecios(t) ? num(t.facturacion) : null;
}

/**
 * Margen del profesor (facturación − lo que le pagamos), o null. El endpoint ya
 * lo manda null cuando no hay precios; se vuelve a comprobar acá para que
 * facturación y margen no puedan discrepar en pantalla.
 */
export function margenDe(t: TeacherPayout): MetricValue {
  return tienePrecios(t) ? num(t.margen) : null;
}

/**
 * Facturación del mes entera, o null si NINGÚN profesor tiene alumnos
 * priceados. Se decide con `margen_total`, que es el campo que el otro lado
 * anula justamente en ese caso: `facturacion_total` llega en 0 y no se
 * distingue solo de una facturación real de 0 €.
 */
export function facturacionTotalDe(mes: PayoutsMonth): MetricValue {
  return num(mes.margen_total) === null ? null : num(mes.facturacion_total);
}

/** Margen del mes entero (facturación − gasto), o null si no hay precios. */
export function margenTotalDe(mes: PayoutsMonth): MetricValue {
  return num(mes.margen_total);
}

/**
 * Aviso de dato incompleto para el MES entero, o null si no hay nada que
 * avisar. Es la versión agregada de avisoParcialDe: mismo criterio, misma
 * lectura ("es un mínimo, el real es igual o mayor"), pero del mes completo.
 *
 * Lo usa el ⚠ de la tarjeta "Margen bruto real" de Resumen Ejecutivo, donde no
 * hay tabla debajo que dé el detalle por profesor: el aviso tiene que decir por
 * sí solo qué le falta al número y dónde se ve el desglose.
 */
export function avisoParcialMes(mes: PayoutsMonth): string | null {
  if (mes.facturacion_parcial !== true) return null;
  return (
    "Cifra parcial: algunos alumnos no tienen precio de plan resuelto en DRC " +
    "Gestión, así que este margen es un MÍNIMO — el real es igual o mayor, " +
    "nunca menor. El detalle profesor por profesor está en la página Profesores."
  );
}

/**
 * Aviso de dato incompleto para un profesor, o null si no hay nada que avisar.
 *
 * Se muestra SIEMPRE que aplique, por pocos alumnos que falten: el que mira la
 * columna no tiene forma de saber que le falta la mitad del dato si nadie se lo
 * dice. Los tres textos son distintos porque las tres situaciones se arreglan
 * distinto — a una le falta parte del catálogo de precios, a otra todo, y a la
 * tercera no le falta nada porque no hay alumnos que cobrar.
 */
export function avisoParcialDe(t: TeacherPayout): string | null {
  const conPrecio = num(t.alumnos_con_precio) ?? 0;
  const totales = num(t.alumnos_totales) ?? 0;

  if (totales === 0) {
    return "Sin alumnos asignados: no hay facturación ni margen que calcular.";
  }

  if (conPrecio === 0) {
    return `0 de ${totales} alumnos con precio de plan resuelto — no se puede calcular su facturación ni su margen.`;
  }

  if (t.facturacion_parcial) {
    return `${conPrecio}/${totales} alumnos con precio resuelto — el margen mostrado es un mínimo, el real es igual o mayor.`;
  }

  return null;
}
