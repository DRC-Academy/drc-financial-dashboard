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
import type {
  PayoutsMonth,
  TeacherPayout,
  VentanaDudosa,
} from "@/types/profesores";

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
 * MARGEN SOBRE FACTURACIÓN — la misma resta de arriba, pero en proporción.
 *
 * Devuelve una FRACCIÓN (0,68), no puntos: es lo que espera `formatPercent`,
 * que multiplica por 100 al pintar. Si esto devolviera 68 ya multiplicado, la
 * tarjeta mostraría "6.800%" y el error no salta a la vista en revisión.
 *
 * Tres casos dan null, y los tres son "no se sabe", nunca 0%:
 *
 *   · margen null      → no hay ni un alumno priceado. No hay nada que dividir.
 *   · facturación null → lo mismo visto desde el otro lado (ver facturacionDe:
 *                        el payload manda 0 queriendo decir "sin datos").
 *   · facturación 0    → sí se sabe que factura 0 € —todos sus alumnos de pago
 *                        único están fuera de ventana este mes—, pero el
 *                        cociente no existe. Dividir daría −Infinity, y
 *                        redondearlo a "0%" diría que se queda con el 0% de lo
 *                        que factura cuando lo que pasa es que se le paga sin
 *                        que entre nada. El "—" manda a mirar el € de al lado,
 *                        que es donde está el número que importa.
 *
 * Se exporta suelta y no sólo envuelta en los dos helpers de abajo porque el
 * pie de la tabla la necesita sobre SUS sumas (las de las filas visibles con
 * precio resuelto), que no son las del mes.
 */
export function margenSobreFacturacion(
  margen: MetricValue,
  facturacion: MetricValue
): MetricValue {
  if (margen === null || facturacion === null || facturacion === 0) return null;
  return margen / facturacion;
}

/** Margen / facturación de un profesor, en fracción. null si no se puede. */
export function margenPctDe(t: TeacherPayout): MetricValue {
  return margenSobreFacturacion(margenDe(t), facturacionDe(t));
}

/**
 * Margen / facturación del MES entero, en fracción.
 *
 * Ojo: no es el promedio de los porcentajes de los profesores, es el cociente
 * de los dos totales. Y el numerador descuenta TODO el gasto —también el de los
 * profesores cuya facturación no se sabe—, así que sale más bajo que el del pie
 * de la tabla. Es el mismo desajuste que ya tienen los importes en €, por el
 * mismo motivo, y está explicado en el hint de las dos tarjetas de margen.
 */
export function margenPctTotalDe(mes: PayoutsMonth): MetricValue {
  return margenSobreFacturacion(margenTotalDe(mes), facturacionTotalDe(mes));
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

// ── Ventanas dudosas ────────────────────────────────────────────────────────
//
// El OTRO problema del margen, y no hay que confundirlo con el de arriba:
//
//   facturacion_parcial → FALTA el precio de un alumno. La facturación es un
//                         piso y el margen está inflado. ADVERTENCIA (amarillo).
//   ventanas_dudosas    → no falta nada: el importe está sumado. Lo que no
//                         cuadra es la VENTANA de ese alumno de pago único (su
//                         plan termina en una fecha y su acceso en otra muy
//                         distinta), así que el importe puede estar contado en
//                         el mes de al lado. INFORMATIVO (azul).
//
// Se separan hasta en el color porque no se arreglan igual: uno se arregla
// cargando precios en `product_prices`, el otro revisando la ficha de ESE
// alumno. Fundirlos en un único ⚠ mandaría a mirar el sitio equivocado.
//
// Todo se lee con tolerancia a campos ausentes, igual que el resto del módulo:
// los dos campos llegaron el 01/09/2026 y quedan fuera de la validación dura del
// lector, así que con un endpoint anterior valen 0 y [] y no se pinta nada.

/** Cuántos alumnos de este profesor tienen la ventana en duda. 0 si no se sabe. */
export function ventanasDudosasDe(t: TeacherPayout): number {
  const n = num(t.ventanas_dudosas);
  if (n !== null) return Math.max(0, n);
  // Sin el contador, el propio detalle sirve de recuento: no se inventa nada,
  // se cuenta lo que hay.
  return detalleDudosasDe(t).length;
}

/**
 * Quiénes son. El array llega SIN validar fila a fila (el lector sólo comprueba
 * los agregados del mes), así que se filtra acá: una fila sin nombre o sin
 * motivo no se pinta, en vez de dejar un "undefined" en la lista.
 */
export function detalleDudosasDe(t: TeacherPayout): VentanaDudosa[] {
  const detalle = t.ventanas_dudosas_detalle;
  if (!Array.isArray(detalle)) return [];
  return detalle.filter(
    (d): d is VentanaDudosa =>
      typeof d?.student_name === "string" &&
      d.student_name.length > 0 &&
      typeof d?.motivo === "string" &&
      d.motivo.length > 0
  );
}

/**
 * Ventanas dudosas del MES entero. Se prefiere el agregado del endpoint, que es
 * quien manda; si no viene (versión anterior), se suma por profesor para que el
 * aviso no desaparezca teniendo el detalle delante.
 */
export function ventanasDudosasTotalDe(mes: PayoutsMonth): number {
  const n = num(mes.ventanas_dudosas_total);
  if (n !== null) return Math.max(0, n);
  return (mes.teachers ?? []).reduce((s, t) => s + ventanasDudosasDe(t), 0);
}

/** Los profesores con alguna, en el orden en que vinieron. Vacío si no hay. */
export function profesoresConDudosas(mes: PayoutsMonth): TeacherPayout[] {
  return (mes.teachers ?? []).filter((t) => ventanasDudosasDe(t) > 0);
}

/**
 * Etiqueta del badge azul de un profesor, o null si no tiene ninguna. Dice el
 * número Y qué significa: "2" a secas no distingue este aviso del amarillo.
 */
export function avisoDudosasDe(t: TeacherPayout): string | null {
  const n = ventanasDudosasDe(t);
  if (n === 0) return null;
  return n === 1
    ? "1 alumno con la ventana de facturación en duda: su importe SÍ está sumado, pero puede estar contado en el mes de al lado."
    : `${n} alumnos con la ventana de facturación en duda: su importe SÍ está sumado, pero puede estar contado en el mes de al lado.`;
}

/**
 * UN MES CERRADO NO ES INMUTABLE. Es la frase que falta cuando alguien guarda
 * una captura del margen de julio y en septiembre le sale otro número.
 *
 * El motivo está en cómo arma DRC Gestión el roster de cada profesor: los
 * alumnos se filtran por el acceso que tienen HOY, no por el que tenían en el
 * mes que se pide. Un alumno que caduca deja de contar también en los meses
 * pasados, y uno que renueva vuelve a contar en ellos, así que la facturación y
 * el margen de un mes ya cerrado pueden moverse sin que nadie toque ese mes.
 *
 * El GASTO no depende de eso (sale de la liquidación del mes, congelada al
 * pagarse), pero sí puede cambiar si el admin reabre o rectifica una
 * liquidación. Por eso el aviso habla de "los valores", no sólo del margen.
 *
 * Vive acá y no suelto en cada página para que las tres vistas que enseñan
 * histórico digan exactamente lo mismo.
 */
export const AVISO_MESES_RETROACTIVOS =
  "Los meses cerrados pueden variar: DRC Gestión arma el roster de cada " +
  "profesor con el acceso que tienen sus alumnos HOY, no con el que tenían ese " +
  "mes, así que la facturación y el margen de un mes pasado cambian si un " +
  "alumno caduca o renueva (y el gasto, si se rectifica su liquidación). Un " +
  "número guardado de un mes viejo no tiene por qué coincidir con el de ahora.";
