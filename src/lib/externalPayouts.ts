/**
 * Gasto en profesores — lector del endpoint externo de DRC Gestión.
 *
 * SOLO PARA USO EN SERVIDOR (route handlers de src/app/api/profesores/*), igual
 * que sheetsClient.ts: el transporte lleva el secreto. Ver lib/drcGestion.ts,
 * que es donde viven la config, la cabecera y el diagnóstico por código HTTP.
 *
 * Acá no se calcula NADA. El importe lo produce `calculateTeacherFinance` del
 * otro proyecto — la misma función que ve el admin en su panel de finanzas—, con
 * ocho tablas y reglas de negocio (sesiones de 2h que cuentan una clase, tope de
 * faltas cobrables, penalizaciones, mes congelado al pagarse) que no se
 * reimplementan de este lado. Este módulo pide, valida la forma y degrada.
 *
 * Nunca lanza: ante cualquier fallo devuelve null y lo loguea, para que la UI
 * muestre "sin datos" sin tumbar el resto de la página financiera (que lee de
 * Google Sheets, una fuente independiente de esta).
 */

import { cached } from "./cache";
import { fetchDrcGestion, isNumber, isRecord } from "./drcGestion";
import { isApiMonth } from "./kpiHelpers";
import type { PayoutsMonth, PayoutsSummary } from "@/types/profesores";

/** Igual que el TTL de Sheets. El dataset remoto ya se cachea 30s del otro lado. */
const TTL_MS = 60_000;

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
 * Cachea también los fallos (null) durante el TTL: si el endpoint está caído,
 * repreguntarle en cada render de cada pestaña abierta no lo va a revivir. El
 * polling del navegador reintenta al vencer el TTL.
 */
export async function readPayoutsMonth(
  month: string
): Promise<PayoutsMonth | null> {
  if (!isApiMonth(month)) {
    console.error(
      `[externalPayouts] Mes inválido "${month}": se esperaba YYYY-MM. No se llama al endpoint.`
    );
    return null;
  }

  return cached(
    `payouts:month:${month}`,
    async () => {
      const raw = await fetchDrcGestion(
        `/api/external/payouts?month=${encodeURIComponent(month)}`
      );
      if (!isRecord(raw)) return null;

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
        return null;
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

      return raw as unknown as PayoutsMonth;
    },
    TTL_MS
  );
}

/**
 * Serie mensual agregada entre dos meses ("YYYY-MM"), inclusive. Un punto por
 * mes, sin detalle por profesor. El otro lado lee su dataset UNA vez para todo
 * el rango, así que pedir 12 meses le cuesta casi lo mismo que pedir uno.
 */
export async function readPayoutsSummary(
  from: string,
  to: string
): Promise<PayoutsSummary | null> {
  if (!isApiMonth(from) || !isApiMonth(to) || from > to) {
    console.error(
      `[externalPayouts] Rango inválido (${from} → ${to}): se esperaban dos meses YYYY-MM con from <= to. No se llama al endpoint.`
    );
    return null;
  }

  return cached(
    `payouts:summary:${from}:${to}`,
    async () => {
      const raw = await fetchDrcGestion(
        `/api/external/payouts/summary?from=${encodeURIComponent(
          from
        )}&to=${encodeURIComponent(to)}`
      );
      if (!isRecord(raw)) return null;

      // Ojo: `months` es la CANTIDAD de meses, no la lista. La serie es `series`.
      if (!Array.isArray(raw.series)) {
        console.error(
          `[externalPayouts] Respuesta inesperada para ${from} → ${to}: falta el array "series".`
        );
        return null;
      }

      return raw as unknown as PayoutsSummary;
    },
    TTL_MS
  );
}
