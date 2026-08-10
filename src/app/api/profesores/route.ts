import { NextResponse } from "next/server";
import { readPayoutsMonth, currentMonthMadrid } from "@/lib/externalPayouts";
import { isApiMonth } from "@/lib/kpiHelpers";

/**
 * GET /api/profesores?month=YYYY-MM
 *
 * Puente entre la página (cliente) y el endpoint externo de DRC Gestión. Existe
 * para que el secreto NUNCA salga del servidor: el navegador habla con esta
 * ruta, y es esta ruta la que llama al otro proyecto con la cabecera.
 *
 * Sin `month` devuelve el mes en curso, igual que hace el endpoint remoto. Así
 * la página de profesores puede pintar el mes actual en la primera carga, antes
 * de saber qué meses existen (esa lista la trae /api/profesores/summary), y sin
 * depender del reloj del navegador. La respuesta dice en `month_year` qué mes
 * contestó, que es lo que la UI muestra.
 *
 * Mismo contrato de respuesta que /api/kpi — { ok, data, fetchedAt } con HTTP
 * 200 incluso al fallar—, que es lo que espera useLiveData para mostrar "sin
 * datos" en vez de romper.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const month =
    new URL(request.url).searchParams.get("month") ?? currentMonthMadrid();

  // La página sólo pide meses que ya convirtió con monthLabelToApiMonth, así
  // que esto no debería saltar nunca; si salta, es un bug de este lado y no
  // vale la pena molestar al endpoint externo para confirmarlo.
  if (!isApiMonth(month)) {
    return NextResponse.json({
      ok: false,
      error: "Mes inválido: se espera el formato YYYY-MM (ej. 2026-08).",
      data: null,
      fetchedAt: Date.now(),
    });
  }

  const data = await readPayoutsMonth(month);

  if (!data) {
    // El motivo real (401/400/503/500/timeout) ya quedó en los logs del
    // servidor con su diagnóstico; al navegador no se le cuenta nada del otro
    // lado más allá de que no hay datos.
    return NextResponse.json({
      ok: false,
      error: "No se pudo leer el gasto en profesores de DRC Gestión",
      data: null,
      fetchedAt: Date.now(),
    });
  }

  return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
}
