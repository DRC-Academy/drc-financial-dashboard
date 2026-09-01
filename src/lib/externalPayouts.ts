/**
 * Gasto en profesores — lector del endpoint externo de DRC Gestión.
 *
 * SOLO PARA USO EN SERVIDOR (route handlers de src/app/api/profesores), igual
 * que sheetsClient.ts: el transporte lleva el secreto. Ver lib/drcGestion.ts,
 * que es donde viven la config, la cabecera y el diagnóstico por código HTTP.
 *
 * Acá no se calcula NADA. El importe lo produce `calculateTeacherFinance` del
 * otro proyecto — la misma función que ve el admin en su panel de finanzas—, con
 * ocho tablas y reglas de negocio (sesiones de 2h que cuentan una clase, tope de
 * faltas cobrables, penalizaciones, mes congelado al pagarse) que no se
 * reimplementan de este lado. Este módulo pide, valida la forma y degrada.
 *
 * CUÁNTO VALE LA RESPUESTA LO DICE LA RESPUESTA, no este módulo. El endpoint
 * manda "no-store" para el mes en curso —cambia con cada clase que se registra—
 * y "private, max-age=300" para un mes cerrado; el de la serie manda "no-store"
 * siempre. Antes se guardaban los tres con un TTL fijo de 60s, que contradecía
 * las dos puntas: cacheaba el mes en curso, que pidió que no, y tiraba a los 60s
 * el mes cerrado, que daba permiso para 300. Ahora el TTL sale de la cabecera
 * (ttlDeCacheControl) y el coalescing de lib/cache absorbe el coste de respetar
 * el "no-store": varias pestañas pidiendo lo mismo a la vez siguen siendo UNA
 * llamada al otro lado.
 *
 * Nunca lanza: ante cualquier fallo devuelve null y lo loguea, para que la UI
 * muestre "sin datos" sin tumbar el resto de la página financiera (que lee de
 * Google Sheets, una fuente independiente de esta).
 */

import { cachedConTtl } from "./cache";
import {
  fetchDrcGestionConCabeceras,
  isNumber,
  isRecord,
  ttlDeCacheControl,
} from "./drcGestion";
import { isApiMonth } from "./kpiHelpers";
import type { PayoutsMonth, PayoutsSummary } from "@/types/profesores";

/**
 * Lo leído más la instrucción de cacheo que venía con ello.
 *
 * `cacheControl` se devuelve para que la ruta interna la reenvíe al navegador
 * tal cual: /api/profesores es el proxy del endpoint externo, y un proxy que se
 * come la directiva de la fuente sin poner ninguna propia deja al navegador
 * decidiendo por su cuenta sobre un dato que sí tiene reglas.
 */
export interface PayoutsLeido<T> {
  data: T | null;
  cacheControl: string | null;
}

/**
 * Mes en curso en "YYYY-MM", hora de España. Es la zona en la que el otro lado
 * decide qué mes es "el actual" (las clases se dan en Madrid): calcularlo en UTC
 * dejaría el rango corrido durante las primeras horas del día 1 de cada mes.
 *
 * Vive acá, junto al resto de la semántica del endpoint externo, porque lo usan
 * las dos rutas internas: el detalle sin `month` y el rango sin `to`.
 */
export function currentMonthMadrid(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const anio = parts.find((p) => p.type === "year")?.value ?? "";
  const mes = parts.find((p) => p.type === "month")?.value ?? "";
  return `${anio}-${mes}`;
}

/**
 * Detalle de gasto en profesores de un mes ("YYYY-MM").
 *
 * Un fallo YA NO se cachea: sin respuesta no hay cabecera, y sin cabecera el TTL
 * es 0 (ver ttlDeCacheControl). Antes se guardaba el null 60s para no repreguntar
 * a un endpoint caído; ahora ese papel lo hace el coalescing —las peticiones
 * simultáneas se funden en una— y a cambio, en cuanto el otro lado vuelve, el
 * dato vuelve con él en vez de esperar a que venza un TTL nuestro.
 */
export async function readPayoutsMonth(
  month: string
): Promise<PayoutsLeido<PayoutsMonth>> {
  if (!isApiMonth(month)) {
    console.error(
      `[externalPayouts] Mes inválido "${month}": se esperaba YYYY-MM. No se llama al endpoint.`
    );
    return { data: null, cacheControl: null };
  }

  return cachedConTtl(`payouts:month:${month}`, async () => {
    const { json: raw, cacheControl } = await fetchDrcGestionConCabeceras(
      `/api/external/payouts?month=${encodeURIComponent(month)}`
    );

    const nada: PayoutsLeido<PayoutsMonth> = { data: null, cacheControl: null };
    // Un cuerpo que no sabemos leer no se guarda aunque la cabecera dé permiso:
    // el "max-age=300" califica a la respuesta buena, no a nuestra confusión.
    const descartar = { value: nada, ttlMs: 0 };

    if (!isRecord(raw)) return descartar;

    // Se validan los tres agregados de GASTO, que son el esqueleto de la
    // página. Si alguno no es un número, la respuesta no es la que este
    // código sabe leer y vale más "sin datos" que una tarjeta con un valor
    // inventado.
    if (
      !isNumber(raw.total_amount) ||
      !isNumber(raw.teachers_with_amount) ||
      !isNumber(raw.active_teachers_now)
    ) {
      console.error(
        `[externalPayouts] Respuesta inesperada para ${month}: faltan los agregados (total_amount / teachers_with_amount / active_teachers_now).`
      );
      return descartar;
    }

    // Facturación y margen (añadidos el 11/08/2026) NO entran en esa
    // validación a propósito: son datos independientes del gasto, así que si
    // el otro lado volviera a una versión anterior del endpoint, el mes se
    // devuelve igual y sólo se vacían esas columnas. Tumbar la página entera
    // —incluidas las tres tarjetas de gasto que ya funcionaban— por un campo
    // que se añadió después sería cambiar un hueco por un apagón.
    if (!isNumber(raw.facturacion_total)) {
      console.warn(
        `[externalPayouts] ${month} llega sin facturacion_total: DRC Gestión está respondiendo una versión anterior del endpoint. Facturación y margen quedan en "—"; el gasto no se ve afectado.`
      );
    }

    // Misma política con teachers_total (27/08/2026), que es el conteo de la
    // plantilla completa: fuera de la validación dura para que una versión
    // anterior del endpoint deje la tarjeta de profesores en "—" en vez de
    // dejar la página sin gasto. Se avisa para que el "—" no sea mudo.
    if (!isNumber(raw.teachers_total)) {
      console.warn(
        `[externalPayouts] ${month} llega sin teachers_total: DRC Gestión está respondiendo una versión anterior del endpoint. El conteo de plantilla queda en "—"; los profesores con alumnos y los que facturaron no se ven afectados.`
      );
    }

    // Y con ventanas_dudosas_total (01/09/2026). Sin él, el aviso azul de
    // "ventanas dudosas" no se pinta y no pasa nada más: no es un dato que
    // corrija ninguna cifra, es uno que señala cuáles hay que ir a revisar.
    if (!isNumber(raw.ventanas_dudosas_total)) {
      console.warn(
        `[externalPayouts] ${month} llega sin ventanas_dudosas_total: DRC Gestión está respondiendo una versión anterior del endpoint. El aviso de ventanas de facturación dudosas no se muestra; el resto de las cifras no se ve afectado.`
      );
    }

    return {
      value: { data: raw as unknown as PayoutsMonth, cacheControl },
      ttlMs: ttlDeCacheControl(cacheControl),
    };
  });
}

/**
 * Serie mensual agregada entre dos meses ("YYYY-MM"), inclusive. Un punto por
 * mes, sin detalle por profesor. El otro lado lee su dataset UNA vez para todo
 * el rango, así que pedir 12 meses le cuesta casi lo mismo que pedir uno.
 *
 * Hoy este endpoint manda "no-store" en todas sus respuestas (el rango por
 * defecto incluye el mes en curso, y hasta un rango cerrado puede moverse: ver
 * la nota de meses retroactivos de la página Profesores), así que en la práctica
 * no se cachea. Se lee la cabecera igual, sin dar por hecho ese "hoy".
 */
export async function readPayoutsSummary(
  from: string,
  to: string
): Promise<PayoutsLeido<PayoutsSummary>> {
  if (!isApiMonth(from) || !isApiMonth(to) || from > to) {
    console.error(
      `[externalPayouts] Rango inválido (${from} → ${to}): se esperaban dos meses YYYY-MM con from <= to. No se llama al endpoint.`
    );
    return { data: null, cacheControl: null };
  }

  return cachedConTtl(`payouts:summary:${from}:${to}`, async () => {
    const { json: raw, cacheControl } = await fetchDrcGestionConCabeceras(
      `/api/external/payouts/summary?from=${encodeURIComponent(
        from
      )}&to=${encodeURIComponent(to)}`
    );

    const nada: PayoutsLeido<PayoutsSummary> = {
      data: null,
      cacheControl: null,
    };

    if (!isRecord(raw)) return { value: nada, ttlMs: 0 };

    // Ojo: `months` es la CANTIDAD de meses, no la lista. La serie es `series`.
    if (!Array.isArray(raw.series)) {
      console.error(
        `[externalPayouts] Respuesta inesperada para ${from} → ${to}: falta el array "series".`
      );
      return { value: nada, ttlMs: 0 };
    }

    return {
      value: { data: raw as unknown as PayoutsSummary, cacheControl },
      ttlMs: ttlDeCacheControl(cacheControl),
    };
  });
}
