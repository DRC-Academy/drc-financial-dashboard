import { NextResponse } from "next/server";
import { readPayoutsSummary, currentMonthMadrid } from "@/lib/externalPayouts";
import { isApiMonth } from "@/lib/kpiHelpers";

/**
 * GET /api/profesores/summary?from=YYYY-MM&to=YYYY-MM
 *
 * Serie mensual del gasto en profesores, para el gráfico de tendencia. Mismo
 * papel que /api/profesores: el secreto se queda en el servidor.
 *
 * Sin parámetros devuelve los últimos MESES_TENDENCIA meses terminando en el
 * mes en curso. El rango por defecto se calcula ACÁ (servidor) y no en la
 * página a propósito: así el "mes actual" no depende del reloj del navegador ni
 * puede desincronizarse entre el render del servidor y la hidratación.
 */
export const dynamic = "force-dynamic";

/**
 * Ventana por defecto: los meses que ofrece el desplegable de la página de
 * profesores y que dibuja el gráfico. El endpoint remoto admite hasta 60.
 */
const MESES_TENDENCIA = 12;

/** Resta `n` meses a un "YYYY-MM". */
function minusMonths(month: string, n: number): string {
  const [anio, mes] = month.split("-").map(Number);
  const total = anio * 12 + (mes - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const to = params.get("to") ?? currentMonthMadrid();
  const from = params.get("from") ?? minusMonths(to, MESES_TENDENCIA - 1);

  if (!isApiMonth(from) || !isApiMonth(to) || from > to) {
    return NextResponse.json({
      ok: false,
      error:
        "Rango inválido: se esperan dos meses YYYY-MM con from anterior o igual a to.",
      data: null,
      fetchedAt: Date.now(),
    });
  }

  const data = await readPayoutsSummary(from, to);

  if (!data) {
    return NextResponse.json({
      ok: false,
      error: "No se pudo leer la serie de gasto en profesores de DRC Gestión",
      data: null,
      fetchedAt: Date.now(),
    });
  }

  return NextResponse.json({ ok: true, data, fetchedAt: Date.now() });
}
