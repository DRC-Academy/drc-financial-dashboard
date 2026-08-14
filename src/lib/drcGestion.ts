/**
 * TRANSPORTE hacia DRC Gestión — config, autenticación y manejo de errores.
 *
 * SOLO PARA USO EN SERVIDOR (route handlers de src/app/api/*), igual que
 * sheetsClient.ts. El secreto viaja en una cabecera: si esta llamada saliera del
 * navegador, el secreto estaría en el bundle y sería público. El otro lado NO
 * emite cabeceras CORS justamente para que eso no pueda pasar (ver
 * lib/externalAuth.ts de academy-scheduler), así que un import desde un
 * componente "use client" no fallaría en silencio: fallaría del todo.
 *
 * Vivía dentro de externalPayouts.ts. Se sacó acá cuando entró el segundo
 * consumidor (externalSubscriptions.ts): son dos endpoints del MISMO servicio,
 * con el mismo secreto y los mismos códigos de error documentados uno por uno,
 * así que la alternativa era copiar cien líneas de diagnóstico y que las dos
 * copias se separaran en el primer cambio.
 *
 * Variables de entorno requeridas (ver .env.local.example):
 *  - DRC_API_URL                 (ej. https://academy-scheduler-aqpt.vercel.app)
 *  - DASHBOARD_EXTERNAL_SECRET   (lo provee DRC Gestión; no se genera acá)
 *
 * Las MISMAS dos para todos los endpoints: /api/external/payouts,
 * /api/external/payouts/summary y /api/external/subscriptions comparten el
 * secreto y la cabecera. No hace falta ninguna variable nueva por endpoint.
 *
 * Nunca lanza: ante cualquier fallo devuelve null y lo loguea, para que la UI
 * muestre "sin datos" sin tumbar el resto de la página financiera (que lee de
 * Google Sheets, una fuente independiente de esta).
 */

/**
 * Techo de espera. Los endpoints remotos se cortan solos a los 60s
 * (maxDuration); pero el navegador repregunta cada 60s, y dejar una petición
 * colgando más que eso sólo apila peticiones sobre un endpoint que ya va lento.
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
      "[drcGestion] Falta configuración: definí DRC_API_URL y DASHBOARD_EXTERNAL_SECRET en el entorno. Sin ellas las secciones que leen de DRC Gestión quedan sin datos."
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
        `[drcGestion] 401 en ${path}: DASHBOARD_EXTERNAL_SECRET falta o no coincide con el de DRC Gestión. ES UN PROBLEMA DE CONFIGURACIÓN NUESTRO.${detalle}`
      );
      break;
    case 400:
      // No debería pasar: la query la armamos nosotros y validamos antes.
      console.error(
        `[drcGestion] 400 en ${path}: el endpoint rechazó los parámetros. Es un bug de cómo armamos la query.${detalle}`
      );
      break;
    case 503:
      console.error(
        `[drcGestion] 503 en ${path}: DRC Gestión no tiene configurada su variable DASHBOARD_EXTERNAL_SECRET y mantiene el endpoint cerrado.${detalle}`
      );
      break;
    case 500:
      console.error(
        `[drcGestion] 500 en ${path}: error interno de DRC Gestión al resolver la petición.${detalle}`
      );
      break;
    default:
      // 404 incluido: si el endpoint todavía no está desplegado, se ve acá.
      console.error(
        `[drcGestion] HTTP ${status} inesperado en ${path}.${detalle}`
      );
  }
}

/**
 * GET a un endpoint de DRC Gestión con el secreto en la cabecera. Devuelve el
 * JSON crudo o null. Absorbe TODO: config ausente, timeout, DNS caído, HTML en
 * vez de JSON.
 */
export async function fetchDrcGestion(path: string): Promise<unknown | null> {
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
    console.error(`[drcGestion] Falló la llamada a ${path}:`, err);
    return null;
  }
}

/** Número utilizable, o null. Cubre undefined (campo ausente), NaN e Infinity. */
export const isNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
