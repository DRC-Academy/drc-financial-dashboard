import { NextResponse } from "next/server";
import { readSubscriptions } from "@/lib/externalSubscriptions";

/**
 * GET /api/subscriptions
 *
 * Puente entre la página (cliente) y el endpoint de recuento de DRC Gestión.
 * Existe para que el secreto NUNCA salga del servidor: el navegador habla con
 * esta ruta, y es esta ruta la que llama al otro proyecto con la cabecera.
 *
 * Sin parámetros: el recuento es una foto del presente y no admite mes (ver
 * types/suscripciones.ts). Que no acepte `month` es a propósito — si algún día
 * llegara uno por la query, se ignora en vez de reenviarlo, para que nadie crea
 * que el número que ve es de un mes pasado.
 *
 * Mismo contrato de respuesta que /api/kpi y /api/profesores — { ok, data,
 * fetchedAt } con HTTP 200 incluso al fallar—, que es lo que espera useLiveData
 * para mostrar "sin datos" en vez de romper.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readSubscriptions();

  if (!data) {
    // El motivo real (401/500/timeout/forma inesperada) ya quedó en los logs del
    // servidor con su diagnóstico; al navegador no se le cuenta nada del otro
    // lado más allá de que no hay datos.
    return NextResponse.json({
      ok: false,
      error: "No se pudo leer el recuento de suscripciones de DRC Gestión",
      data: null,
      fetchedAt: Date.now(),
    });
  }

  return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
}
