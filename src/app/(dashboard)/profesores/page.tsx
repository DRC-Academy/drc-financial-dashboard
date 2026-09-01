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
  formatPercent,
} from "@/lib/kpiHelpers";
import { VentanasDudosasNota } from "@/components/ui/VentanasDudosasNota";
import {
  AVISO_MESES_RETROACTIVOS,
  facturacionTotalDe,
  margenPctTotalDe,
  margenTotalDe,
} from "@/lib/profesoresHelpers";
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

  /**
   * LOS TRES CONTEOS DE PROFESORES, que NO son el mismo número y no miden lo
   * mismo. De mayor a menor, y cada uno subconjunto del anterior:
   *
   *   plantilla  (teachers_total)        → la academia entera. No varía con el
   *                                        mes ni con la actividad. Es el conteo
   *                                        real, y por eso es el n1 de la
   *                                        tarjeta.
   *   activos    (active_teachers_now)   → los que tienen algún alumno asignado
   *                                        AHORA. Foto del presente: sale igual
   *                                        pidas el mes que pidas.
   *   facturaron (teachers_with_amount)  → los que cobraron algo el mes elegido.
   *                                        Éste sí es histórico y sí cambia con
   *                                        el desplegable.
   *
   * `teachers_total` llegó después y queda fuera de la validación dura del lector
   * (ver lib/externalPayouts): si el endpoint volviera atrás, llega undefined
   * pese al tipo y esto cae a null → "—", sin llevarse el resto por delante.
   */
  const plantilla: MetricValue = mes?.teachers_total ?? null;
  const facturaron: MetricValue = mes?.teachers_with_amount ?? null;
  const activos: MetricValue = mes?.active_teachers_now ?? null;

  /**
   * "21 de 29" — facturaron SIEMPRE se lee contra la plantilla, nunca suelto:
   * un "21" a secas se lee como si fueran todos los profesores que hay. Sin
   * plantilla (endpoint viejo) se muestra el número solo antes que inventarle
   * un denominador.
   */
  const facturaronSobrePlantilla =
    plantilla !== null
      ? `${formatNumber(facturaron)} de ${formatNumber(plantilla)}`
      : formatNumber(facturaron);

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
   * FACTURACIÓN Y MARGEN DEL MES — los dos agregados nuevos del endpoint.
   *
   * Los dos pasan por lib/profesoresHelpers y no se leen del payload: cuando
   * ningún alumno tiene precio resuelto, `facturacion_total` llega en 0 y ese 0
   * significa "no lo sabemos". El helper lo devuelve como null → "—".
   *
   * `facturacion_parcial` es lo contrario de un error: el dato está bien, sólo
   * que incompleto. Es un PISO, así que el aviso de abajo tiene que estar a la
   * vista de cualquiera que copie el número a una decisión, no escondido en un
   * tooltip.
   */
  const facturacionTotal = mes ? facturacionTotalDe(mes) : null;
  const margenTotal = mes ? margenTotalDe(mes) : null;
  /**
   * El mismo margen en proporción: cuánto queda de cada euro que facturan sus
   * alumnos. Va de n2 en la tarjeta, no de n1, porque la pregunta que se le hace
   * a esta página es cuánto dinero deja la plantilla; el % es para comparar
   * meses (o profesores, en la tabla), donde el € solo engaña — 600 € de margen
   * son excelentes sobre 800 € facturados y malos sobre 6.000 €.
   *
   * null cuando no se puede dividir, igual que las dos cifras de arriba: nunca
   * un 0% inventado. Ver margenSobreFacturacion.
   */
  const margenPctTotal = mes ? margenPctTotalDe(mes) : null;
  const esParcial = mes?.facturacion_parcial === true;

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
            {/* El n1 es la PLANTILLA, no la actividad: es el único de los tres
                conteos que responde a "cuántos profesores tiene la academia".
                Los otros dos bajan a n2 porque son recortes suyos —quién tiene
                alumnos hoy y quién cobró este mes—, y de n1 se leían como si
                fueran la plantilla entera. */}
            <KpiCard
              label="Profesores"
              value={formatNumber(plantilla)}
              subValues={[
                {
                  label: "Con alumnos asignados ahora",
                  value: formatNumber(activos),
                },
                {
                  label: "Facturaron este mes",
                  value: facturaronSobrePlantilla,
                },
              ]}
              hint={
                <>
                  <div>
                    Plantilla completa según DRC Gestión, tengan alumnos o no.
                    No varía con el mes del desplegable
                    {mesActivoLabel ? ` (ahora ${mesActivoLabel})` : ""} ni con
                    la actividad.
                  </div>
                  <div>
                    De los dos de abajo, «con alumnos» es una foto de HOY (sale
                    igual en todos los meses, y por eso no está en el gráfico) y
                    «facturaron» sí es del mes elegido.
                  </div>
                </>
              }
            />
            <KpiCard
              label={`Gasto en profesores${
                mesActivoLabel ? ` · ${mesActivoLabel}` : ""
              }`}
              value={formatCurrency(gasto)}
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

          {/* --- Facturación y margen del mes ---
              Fila aparte de las tres de gasto: son la otra mitad de la cuenta
              (lo que entra por esos profesores, no lo que cuestan), y el aviso
              de cifra parcial va justo debajo, pegado a los números que
              califica. */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <KpiCard
                label={`Facturación total vía profesores${
                  mesActivoLabel ? ` · ${mesActivoLabel}` : ""
                }`}
                value={formatCurrency(facturacionTotal)}
                hint="Suma de los planes de WooCommerce de los alumnos asignados a cada profesor, priceados por DRC Gestión. No es la facturación de la academia: sólo cuenta lo que pasa por un profesor con alumnos asignados."
              />
              {/* Único semáforo de la página, y por una vez no es un umbral
                  inventado: el signo del margen lo pone la propia resta. */}
              <KpiCard
                label="Margen total"
                value={formatCurrency(margenTotal)}
                semaforo={
                  margenTotal === null
                    ? "neutral"
                    : margenTotal >= 0
                      ? "green"
                      : "red"
                }
                /* Mismo n2 y misma etiqueta que la tarjeta "Margen bruto real"
                   de Resumen Ejecutivo: los hints de las dos dicen que son el
                   mismo número, así que también tienen que enseñarlo igual. */
                subValues={[
                  {
                    label: "Margen / facturación",
                    value: formatPercent(margenPctTotal),
                  },
                ]}
                hint={
                  <>
                    <div>
                      Facturación vía profesores − gasto en profesores del mes.
                    </div>
                    <div>
                      Descuenta TODO el gasto, también el de los profesores cuya
                      facturación no se sabe. Por eso es menor que el total de la
                      columna Margen de la tabla, que sólo puede sumar las filas
                      con precio resuelto: de los dos, éste es el prudente.
                    </div>
                  </>
                }
              />
            </div>

            {esParcial && (
              <div className="rounded-lg border border-drc-yellow/40 bg-drc-yellow/10 px-4 py-2.5 text-xs text-drc-ink">
                <strong>Cifra parcial</strong> — algunos alumnos no tienen precio
                de plan resuelto en DRC Gestión, así que estas dos cifras son un
                MÍNIMO: la facturación y el margen reales son iguales o mayores,
                nunca menores. En la tabla de abajo, cada profesor al que le
                falte algún precio lleva un ⚠ con el detalle.
              </div>
            )}

            {/* AZUL, y debajo del amarillo: es el otro problema del margen, no
                el mismo con otras palabras. El amarillo dice que a la cifra le
                FALTA algo; éste dice que está entera pero puede estar repartida
                entre dos meses. Del mismo color se corregiría el dato
                equivocado — ver components/ui/VentanaDudosaBadge. */}
            <VentanasDudosasNota
              mes={mes}
              coda="En la tabla de abajo, cada profesor afectado lleva un chip azul ⇄ que despliega sus alumnos."
            />

            {/* Sin un solo alumno priceado no hay cifra que dar, y las dos
                tarjetas salen en "—". Sin este texto, ese "—" se lee como un
                fallo del dashboard y no como lo que es: falta cargar precios
                del otro lado. */}
            {facturacionTotal === null && (
              <div className="rounded-lg border border-drc-yellow/40 bg-drc-yellow/10 px-4 py-2.5 text-xs text-drc-ink">
                <strong>Sin facturación calculable</strong> — ningún alumno tiene
                precio de plan resuelto en DRC Gestión este mes, así que no hay
                facturación ni margen que mostrar. No es un 0 €: es un dato que
                falta, y aparece cuando se carguen los precios de los productos.
              </div>
            )}

            {/* Sin color ni icono: no es una alerta sobre ESTE mes, es cómo se
                comporta la fuente. Va igual a la vista y no en un tooltip,
                porque el que copia el margen de un mes cerrado a una hoja lo
                hace dando por hecho justo lo contrario. */}
            {!mes.is_current_month && (
              <p className="text-[11px] text-drc-ink-soft">
                {AVISO_MESES_RETROACTIVOS}
              </p>
            )}
          </div>

          {/* --- Detalle por profesor ---
              La tabla se queda con el array `teachers` del mes y hace todo el
              filtrado y el orden en el cliente. Cambiar de mes (arriba) es lo
              único que vuelve a pedir datos. */}
          <Panel
            title={`Detalle por profesor${
              mesActivoLabel ? ` · ${mesActivoLabel}` : ""
            }`}
            description="Liquidación profesor por profesor del mes elegido. El total del pie suma lo que se está viendo, así que respeta los filtros. «Margen %» es ese mismo margen sobre lo que factura cada profesor: ordenar por esa columna da el orden de rentabilidad, que NO es el de euros — el que más margen deja suele ser el que más alumnos tiene, no el que mejor rinde. Facturación y margen salen de los planes de los alumnos asignados, y junto al nombre pueden aparecer dos avisos DISTINTOS: el ⚠ amarillo dice que falta el precio de algún alumno (el margen es un mínimo), y el chip azul ⇄ dice que la ventana de alguno no cuadra con su acceso y su importe puede estar contado en el mes de al lado — se pulsa y despliega quiénes son. Un « — » significa que no se sabe, nunca 0 €."
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

            {/* La serie se recalcula ENTERA en cada petición, meses cerrados
                incluidos: no es un histórico congelado que se va ampliando por
                la derecha. Sin decirlo, un punto que se mueve entre dos visitas
                se lee como un bug del gráfico. */}
            <p className="mt-3 text-[11px] text-drc-ink-soft">
              {AVISO_MESES_RETROACTIVOS}
            </p>
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
