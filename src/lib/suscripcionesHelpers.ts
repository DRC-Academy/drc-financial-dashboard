/**
 * SUSCRIPCIONES · lectura del recuento en vivo — el sitio donde vive la regla
 * "PERSONAS y SUSCRIPCIONES no son la misma unidad".
 *
 * El endpoint devuelve las dos cosas y NO son intercambiables:
 *
 *   alumnos.por_origen.suscripcion  → PERSONAS de nuestra base con acceso por
 *                                     una suscripción vigente. Ya descuenta las
 *                                     huérfanas (pagan en Woo pero no existen
 *                                     como alumno) y a quien tiene dos
 *                                     suscripciones a la vez.
 *   woocommerce.por_estado.active   → SUSCRIPCIONES en estado 'active', tal
 *                                     cual las cuenta el admin de WooCommerce
 *                                     en su filtro "Activas". Sin descuentos.
 *
 * Los dos son correctos y casi nunca coinciden. Compararlos de memoria —"el
 * dashboard dice 133 y Woo dice 127, algo está mal"— es el malentendido que
 * este módulo existe para evitar: se muestran juntos y etiquetados por unidad.
 *
 * UN CERO NO ES UN DATO, igual que en profesoresHelpers: cuando WooCommerce no
 * contesta, el otro lado manda `ok: false` y TODOS los contadores en 0. Ese 0
 * significa "no lo sabemos" y pintarlo diría que hoy no hay ni una suscripción
 * activa, que es la peor lectura posible de un fallo de red. Por eso nadie lee
 * `por_estado` directo del payload: se lee por acá.
 */

import type { MetricValue } from "@/types/kpi";
import type { SubscriptionsSnapshot } from "@/types/suscripciones";

/**
 * Cuántas SUSCRIPCIONES hay en un estado de WooCommerce ('active',
 * 'pending-cancel'…), o null si no se sabe.
 *
 * Devuelve null en dos casos distintos que en pantalla se ven igual ("—") y que
 * conviene no confundir al depurar:
 *
 *   · `ok !== true`      → Woo no contestó. Los ceros del payload son ruido.
 *   · estado ausente     → ese estado no vino en la respuesta. Ojo: NO es lo
 *                          mismo que "vino en 0". Woo omite los estados sin
 *                          ninguna suscripción, así que un estado ausente
 *                          normalmente SÍ es un cero de verdad — pero no lo
 *                          afirmamos nosotros: si el otro lado deja de mandar
 *                          un estado que antes mandaba, un "—" se investiga y
 *                          un "0" se cree.
 */
export function wooPorEstado(
  susc: SubscriptionsSnapshot | null,
  estado: string
): MetricValue {
  if (!susc || susc.woocommerce?.ok !== true) return null;
  const n = susc.woocommerce.por_estado?.[estado];
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Varios estados de WooCommerce sumados en un solo número, o null si de alguno
 * no se sabe. Hoy sólo lo usa "activas + programadas", la proyección de la
 * tarjeta de suscripciones programadas.
 *
 * NULL SI FALTA CUALQUIER SUMANDO, y no "la suma de los que se sepan": a una
 * suma incompleta no se le nota que lo está. Con `scheduled` ausente y sumado
 * como 0, la proyección saldría exactamente igual que las activas y se leería
 * como "no hay ninguna programada" — que es la conclusión falsa que
 * `wooPorEstado` evita devolviendo "—" en vez de un cero inventado. Un "—" en
 * la proyección se investiga; un número que casualmente coincide con el de al
 * lado, no.
 */
export function wooSumaEstados(
  susc: SubscriptionsSnapshot | null,
  estados: readonly string[]
): MetricValue {
  let total = 0;
  for (const estado of estados) {
    const n = wooPorEstado(susc, estado);
    if (n === null) return null;
    total += n;
  }
  return total;
}
