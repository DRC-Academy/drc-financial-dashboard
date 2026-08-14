/**
 * Suscripciones y alumnos activos — lector del endpoint de recuento de DRC
 * Gestión (`/api/external/subscriptions`).
 *
 * SOLO PARA USO EN SERVIDOR (route handler de src/app/api/subscriptions), igual
 * que externalPayouts.ts: comparten transporte, secreto y cabecera (ver
 * lib/drcGestion.ts). NO hace falta ninguna variable de entorno nueva —
 * DRC_API_URL y DASHBOARD_EXTERNAL_SECRET son las mismas de payouts.
 *
 * Acá no se cuenta NADA. Los dos bloques los produce el otro lado y no son lo
 * mismo:
 *   · `woocommerce` — foto cruda por estado, contando SUSCRIPCIONES.
 *   · `alumnos`     — activos reales contando PERSONAS, con la regla única de
 *                     su lib/subscriptionAccess (Woo OR manual OR Oritalk).
 * Reimplementar cualquiera de las dos de este lado garantizaría discrepar con lo
 * que el admin tiene delante en su panel.
 *
 * EL CERO NO ES UN DATO. Cuando WooCommerce falla, el otro lado manda
 * `woocommerce.ok:false` y pone en null lo que depende de Woo
 * (`alumnos.activos`, `por_origen.suscripcion`, los dos descuadres de
 * suscripciones), pero NO `manual` ni `oritalk`, que salen de su propia base y
 * siguen siendo válidos. Este módulo respeta esa distinción tal cual llega: no
 * rellena nulls con ceros ni descarta la respuesta entera por un bloque caído.
 *
 * Nunca lanza: ante cualquier fallo devuelve null y lo loguea, para que la UI
 * muestre "sin datos" sin tumbar el resto de la página (que lee de Google
 * Sheets, una fuente independiente de esta).
 */

import { cached } from "./cache";
import { fetchDrcGestion, isNumber, isRecord } from "./drcGestion";
import type { SubscriptionsSnapshot } from "@/types/suscripciones";

/**
 * Igual que el TTL de payouts y el de Sheets. El otro lado ya cachea su
 * recuento 60s en memoria, así que este cache evita sobre todo que cada pestaña
 * abierta le pegue por su cuenta.
 */
const TTL_MS = 60_000;

/**
 * Recuento de suscripciones y alumnos activos AHORA. Sin parámetros: es una foto
 * del presente, no admite mes.
 *
 * Cachea también los fallos (null) durante el TTL: si el endpoint está caído,
 * repreguntarle en cada render de cada pestaña abierta no lo va a revivir. El
 * polling del navegador reintenta al vencer el TTL.
 */
export async function readSubscriptions(): Promise<SubscriptionsSnapshot | null> {
  return cached(
    "subscriptions:snapshot",
    async () => {
      const raw = await fetchDrcGestion("/api/external/subscriptions");
      if (!isRecord(raw)) return null;

      /**
       * Se valida el ESQUELETO, no los números: que existan los tres bloques y
       * que `alumnos.en_base` sea un número (el único recuento que no depende de
       * WooCommerce y que por tanto tiene que llegar siempre, incluso con Woo
       * caído). Si eso no está, la respuesta no es la que este código sabe leer
       * y vale más "sin datos" que una tarjeta con un valor inventado.
       *
       * Los campos que SÍ pueden ser null legítimamente (activos, suscripcion,
       * los descuadres) no se validan a propósito: null es un valor válido del
       * contrato, no una respuesta rota.
       */
      const { woocommerce, alumnos, descuadres } = raw;
      if (!isRecord(woocommerce) || !isRecord(alumnos) || !isRecord(descuadres)) {
        console.error(
          "[externalSubscriptions] Respuesta inesperada: faltan los bloques woocommerce / alumnos / descuadres."
        );
        return null;
      }
      if (!isNumber(alumnos.en_base)) {
        console.error(
          "[externalSubscriptions] Respuesta inesperada: alumnos.en_base no es un número. Es el único recuento que no depende de WooCommerce, así que su ausencia indica otra versión del endpoint."
        );
        return null;
      }

      // Woo caído NO es motivo para descartar la respuesta: manual y Oritalk
      // salen de la base del otro lado y siguen siendo datos buenos. Se avisa en
      // los logs con su motivo y la UI lo dice en pantalla.
      if (woocommerce.ok !== true) {
        console.warn(
          `[externalSubscriptions] DRC Gestión no pudo leer WooCommerce: ${
            typeof woocommerce.error === "string" && woocommerce.error
              ? woocommerce.error
              : "sin motivo declarado"
          }. Los activos por suscripción quedan en "—"; los activados a mano y los de Oritalk no se ven afectados.`
        );
      }

      return raw as unknown as SubscriptionsSnapshot;
    },
    TTL_MS
  );
}
