/**
 * Gasto en profesores — lector del endpoint externo de DRC Gestión.
 *
 * SOLO PARA USO EN SERVIDOR (route handlers de src/app/api/profesores/*), igual
 * que sheetsClient.ts. El secreto viaja en una cabecera: si esta llamada saliera
 * del navegador, el secreto estaría en el bundle y sería público. El otro lado
 * NO emite cabeceras CORS justamente para que eso no pueda pasar (ver
 * lib/externalAuth.ts de academy-scheduler), así que un import desde un
 * componente "use client" no fallaría en silencio: fallaría del todo.
 *
 * Acá no se calcula NADA. El importe lo produce `calculateTeacherFinance` del
 * otro proyecto — la misma función que ve el admin en su panel de finanzas—, con
 * ocho tablas y reglas de negocio (sesiones de 2h que cuentan una clase, tope de
 * faltas cobrables, penalizaciones, mes congelado al pagarse) que no se
 * reimplementan de este lado. Este módulo pide, valida la forma y degrada.
 *
 * Variables de entorno requeridas (ver .env.local.example):
 *  - DRC_API_URL                 (ej. https://academy-scheduler-aqpt.vercel.app)
 *  - DASHBOARD_EXTERNAL_SECRET   (lo provee DRC Gestión; no se genera acá)
 *
 * Nunca lanza: ante cualquier fallo devuelve null y lo loguea, para que la UI
 * muestre "sin datos" sin tumbar el resto de la página financiera (que lee de
 * Google Sheets, una fuente independiente de esta).
 */

import { cached } from "./cache";
import { isApiMonth } from "./kpiHelpers";
import type { PayoutsMonth, PayoutsSummary } from "@/types/profesores";

/** Igual que el TTL de Sheets. El dataset remoto ya se cachea 30s del otro lado. */
const TTL_MS = 60_000;

/**
 * Techo de espera. El endpoint remoto se corta solo a los 60s (maxDuration) y
 * recalcula 27 profesores × N meses sobre 11 tablas, así que puede tardar en
 * frío; pero el navegador repregunta cada 60s, y dejar una petición colgando más
 * que eso sólo apila peticiones sobre un endpoint que ya va lento.
 */
const TIMEOUT_MS = 30_000;

interface Config {
  baseUrl: string;
  secret: string;
}

/**
 * Config del entorno, o null si falta algo (y entonces ni se intenta la
 * llamada). Que falte es un problema de configuración NUESTRO, no del otro
 * lado, por eso se loguea como error y no como aviso.
 */
function getConfig(): Config | null {
  const baseUrl = process.env.DRC_API_URL?.trim();
  const secret = process.env.DASHBOARD_EXTERNAL_SECRET?.trim();

  if (!baseUrl || !secret) {
    console.error(
      "[externalPayouts] Falta configuración: definí DRC_API_URL y DASHBOARD_EXTERNAL_SECRET en el entorno. Sin ellas la sección de profesores queda sin datos."
    );
    return null;
  }

  // Sin barra final, para no armar URLs con "//api/external/...".
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret };
}

/**
 * Loguea el fallo según el código, que el otro lado documenta uno por uno. Se
 * distinguen porque NO son el mismo problema ni los arregla la misma persona:
 * 401 y 400 son nuestros, 503 y 500 son del otro lado.
 */
function logHttpError(path: string, status: number, body: string) {
  const detalle = body ? ` · respuesta: ${body.slice(0, 200)}` : "";
  switch (status) {
    case 401:
      // Crítico: el endpoint está vivo y nos rechaza. O falta
      // DASHBOARD_EXTERNAL_SECRET de este lado, o no coincide con el del otro.
      console.error(
        `[externalPayouts] 401 en ${path}: DASHBOARD_EXTERNAL_SECRET falta o no coincide con el de DRC Gestión. ES UN PROBLEMA DE CONFIGURACIÓN NUESTRO.${detalle}`
      );
      break;
    case 400:
      // No debería pasar: la query la armamos nosotros y validamos el mes antes.
      console.error(
        `[externalPayouts] 400 en ${path}: el endpoint rechazó los parámetros. Es un bug de cómo armamos la query.${detalle}`
      );
      break;
    case 503:
      console.error(
        `[externalPayouts] 503 en ${path}: DRC Gestión no tiene configurada su variable DASHBOARD_EXTERNAL_SECRET y mantiene el endpoint cerrado.${detalle}`
      );
      break;
    case 500:
      console.error(
        `[externalPayouts] 500 en ${path}: error interno de DRC Gestión al calcular la liquidación.${detalle}`
      );
      break;
    default:
      // 404 incluido: si el endpoint todavía no está desplegado, se ve acá.
      console.error(
        `[externalPayouts] HTTP ${status} inesperado en ${path}.${detalle}`
      );
  }
}

/**
 * GET al endpoint externo con el secreto en la cabecera. Devuelve el JSON crudo
 * o null. Absorbe TODO: config ausente, timeout, DNS caído, HTML en vez de JSON.
 */
async function fetchExternal(path: string): Promise<unknown | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      headers: { "X-Dashboard-Secret": config.secret },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      // El cuerpo trae { error, hint } y ayuda mucho a diagnosticar; si no se
      // puede leer, no es motivo para perder el código de estado.
      const body = await res.text().catch(() => "");
      logHttpError(path, res.status, body);
      return null;
    }

    return await res.json();
  } catch (err: unknown) {
    // Timeout (AbortError), red caída, JSON malformado.
    console.error(`[externalPayouts] Fallo la llamada a ${path}:`, err);
    return null;
  }
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

const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

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
      const raw = await fetchExternal(
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
      const raw = await fetchExternal(
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
