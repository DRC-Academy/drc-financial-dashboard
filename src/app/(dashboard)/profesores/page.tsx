"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { ComposedBarLineChart } from "@/components/ui/ComposedBarLineChart";
import { PayoutsTable } from "@/components/ui/PayoutsTable";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  apiMonthToLabel,
  monthLabelToApiMonth,
  formatCurrency,
  formatNumber,
} from "@/lib/kpiHelpers";
import type { MetricValue } from "@/types/kpi";
import type { PayoutsMonth, PayoutsSummary } from "@/types/profesores";
import { CAT, GASTO } from "@/lib/chartColors";

/**
 * PROFESORES — la única página del dashboard que NO lee de Google Sheets.
 *
 * Todo sale del endpoint externo de DRC Gestión, que devuelve el gasto ya
 * calculado con su lógica de liquidación completa (la misma que ve el admin en
 * su panel de finanzas). Acá no se calcula nada salvo el promedio por profesor y
 * el total del pie de la tabla.
 *
 * Las dos llamadas van contra rutas internas (/api/profesores*), nunca contra el
 * endpoint externo: el secreto vive en el servidor y no sale de ahí (ver
 * src/lib/externalPayouts.ts, que es sólo de servidor). Como la fuente es otra,
 * un fallo acá no afecta al resto del dashboard ni al revés.
 *
 * Esta sección vivía dentro de Situación Financiera y se mudó cuando pidió más
 * sitio del que tenía: el detalle por profesor es una tabla entera, no una
 * tarjeta más del cashflow.
 */

/** Meses del gráfico y del desplegable, si el summary todavía no contestó. */
const SIN_MESES: string[] = [];

export default function ProfesoresPage() {
  /**
   * Mes elegido en "YYYY-MM", o null mientras el usuario no toca el desplegable.
   *
   * Con null, la petición va SIN parámetro y el servidor responde el mes en
   * curso (en hora de Madrid, que es como lo cuenta DRC Gestión). Así la primera
   * carga ya muestra el mes actual sin esperar a saber qué meses existen, y sin
   * mirar el reloj del navegador. El mes que contestó viene en `month_year`.
   */
  const [mesElegido, setMesElegido] = useState<string | null>(null);

  const {
    data: mes,
    loading: mesLoading,
    error: mesError,
  } = useLiveData<PayoutsMonth>(
    mesElegido ? `/api/profesores?month=${mesElegido}` : "/api/profesores",
    60_000
  );

  // La serie va sin parámetros: el rango por defecto (los últimos 12 meses hasta
  // el mes en curso) lo decide el servidor. De acá salen el gráfico Y la lista
  // de meses del desplegable.
  const { data: serie } = useLiveData<PayoutsSummary>(
    "/api/profesores/summary",
    60_000
  );

  const [rango, setRango] = useState(0);

  /**
   * DESPLEGABLE DE MES — independiente del Sheet.
   *
   * Los meses salen de la propia serie de DRC Gestión, no de DB_KPI. Es lo que
   * permite elegir el MES EN CURSO: el Sheet va un mes por detrás (su última
   * fila es el último mes cerrado), así que mientras la sección vivió dentro de
   * Situación Financiera —atada al desplegable del cashflow— el mes actual no se
   * podía ni seleccionar, justo el que más se mira de una liquidación.
   *
   * Se muestran con el formato del resto del dashboard ("ago-26") y se traducen
   * de vuelta a "2026-08" al elegir; las dos conversiones son puras y redondas.
   */
  const mesesApi = serie?.series.map((p) => p.month_year) ?? SIN_MESES;
  const mesesLabel = mesesApi.map(apiMonthToLabel);

  // El mes que se está mostrando: el elegido, o el que contestó el servidor.
  const mesActivo = mesElegido ?? mes?.month_year ?? "";
  const mesActivoLabel = mesActivo ? apiMonthToLabel(mesActivo) : "";

  const gasto: MetricValue = mes?.total_amount ?? null;
  const facturaron: MetricValue = mes?.teachers_with_amount ?? null;
  const activos: MetricValue = mes?.active_teachers_now ?? null;

  /**
   * Gasto medio = total del mes ÷ profesores que FACTURARON ese mes.
   *
   * No se divide por active_teachers_now a propósito: ese número es una foto de
   * hoy (los mismos profesores en todos los meses de la serie), así que en un mes
   * viejo con dos liquidaciones daría un promedio diluido que no describe nada.
   * Con 0 facturando no hay promedio que calcular → "—".
   */
  const gastoMedio: MetricValue =
    gasto !== null && facturaron !== null && facturaron > 0
      ? gasto / facturaron
      : null;

  /**
   * Serie del gráfico. Se grafican total_amount y teachers_with_amount, y NO
   * active_teachers_now: el propio endpoint lo marca como foto del presente
   * (sale idéntico en todos los puntos), y dibujarlo sugeriría una evolución que
   * no existe. Los meses anteriores a junio de 2026 vienen en 0 y se muestran
   * igual: un 0 real es información, y esconderlo haría creer que el gasto
   * arranca antes de lo que arranca.
   */
  const filasGrafico = applyRange(serie?.series ?? [], rango).map((punto) => ({
    month: apiMonthToLabel(punto.month_year),
    total_amount: punto.total_amount,
    teachers_with_amount: punto.teachers_with_amount,
  }));

  return (
    <>
      <PageHeader
        eyebrow="07 · Profesores"
        title="Qué cuesta la plantilla"
        description="Gasto real en profesores, calculado por DRC Gestión con la misma liquidación que ve el admin en su panel. Es la única página que no lee del Sheet de KPIs, así que su desplegable de mes es propio y llega hasta el mes en curso."
        right={
          mesesLabel.length > 0 ? (
            <MonthSelect
              months={mesesLabel}
              value={mesActivoLabel}
              onChange={(label) => setMesElegido(monthLabelToApiMonth(label))}
            />
          ) : undefined
        }
      />

      {mesLoading && !mes && (
        <div className="text-sm text-drc-ink-soft">
          Cargando gasto en profesores…
        </div>
      )}

      {/* Degradación: mismo EmptyState que el resto del dashboard. El motivo
          real (401/400/503/500/timeout) queda en los logs del servidor. */}
      {!mesLoading && !mes && (
        <EmptyState label="Sin datos de profesores: DRC Gestión no respondió" />
      )}

      {mes && (
        <div className="space-y-6">
          {/* Sin semáforo (borde neutral) en las tres tarjetas: no hay objetivo
              definido para el gasto en profesores, y un umbral inventado se lee
              igual de firme que uno acordado. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Profesores activos ahora"
              value={formatNumber(activos)}
              hint={
                <>
                  <div>
                    Dato actual, no histórico: profesores con al menos un alumno
                    activo hoy.
                  </div>
                  <div>
                    No cambia con el mes del desplegable
                    {mesActivoLabel ? ` (ahora ${mesActivoLabel})` : ""} — es una
                    foto del presente, y por eso tampoco aparece en el gráfico.
                  </div>
                </>
              }
            />
            <KpiCard
              label={`Gasto en profesores${
                mesActivoLabel ? ` · ${mesActivoLabel}` : ""
              }`}
              value={formatCurrency(gasto)}
              subValues={[
                {
                  label: "Profesores que facturaron este mes",
                  value: formatNumber(facturaron),
                },
              ]}
              hint={
                mes.is_current_month
                  ? "Mes en curso: es lo que llevan ganado hasta hoy, no un cierre."
                  : "Liquidación de ese mes (congelada si ya se pagó)."
              }
            />
            <KpiCard
              label="Gasto promedio por profesor"
              value={formatCurrency(gastoMedio)}
              hint="Gasto del mes ÷ profesores que facturaron ESE mes. No se divide por los activos de ahora: ese número no varía por mes y diluiría el promedio en los meses sin actividad."
            />
          </div>

          {/* --- Detalle por profesor ---
              La tabla se queda con el array `teachers` del mes y hace todo el
              filtrado y el orden en el cliente. Cambiar de mes (arriba) es lo
              único que vuelve a pedir datos. */}
          <Panel
            title={`Detalle por profesor${
              mesActivoLabel ? ` · ${mesActivoLabel}` : ""
            }`}
            description="Liquidación profesor por profesor del mes elegido. El total del pie suma lo que se está viendo, así que respeta los filtros. Facturación y margen por profesor todavía no están: hacen falta datos que DRC Gestión aún no expone."
          >
            <PayoutsTable teachers={mes.teachers ?? []} />
          </Panel>

          {/* --- Tendencia --- */}
          <Panel
            title="Gasto en profesores y profesores que facturan"
            description="Las barras son el gasto del mes y la línea el nº de profesores que facturaron (eje derecho). Los profesores activos NO se grafican: son la foto de hoy, idéntica en todos los meses. Antes de junio de 2026 no hay liquidaciones cargadas, así que la serie arranca en 0 — el 0 es el dato."
            action={<RangeFilter value={rango} onChange={setRango} />}
          >
            <ComposedBarLineChart
              data={filasGrafico}
              bars={[
                {
                  key: "total_amount",
                  label: "Gasto en profesores",
                  color: GASTO.base,
                },
              ]}
              line={{
                key: "teachers_with_amount",
                label: "Profesores que facturaron",
                color: CAT.oro,
              }}
              barFormatter={(v) => formatCurrency(v)}
              lineFormatter={(v) => formatNumber(v)}
            />
          </Panel>

          {mesError && (
            <p className="text-xs text-drc-ink-soft">
              No se pudo contactar con DRC Gestión: los datos de arriba son los
              últimos que llegaron.
            </p>
          )}
        </div>
      )}
    </>
  );
}
