"use client";

import { useMemo, useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { ComposedBarLineChart } from "@/components/ui/ComposedBarLineChart";
import { DateRangePicker, type DayRange } from "@/components/ui/DateRangePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getAlertaOperativa,
  CPL_LIMITE,
  CPL_OBJETIVO,
  CAC_LIMITE,
  CAC_OBJETIVO,
  CR_LIMITE,
  CR_OBJETIVO,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatNumberDelta,
  formatPercent,
} from "@/lib/kpiHelpers";
import {
  EMPTY_DAILY_KPI,
  aggregate,
  buildSeries,
  daysInRange,
  getRangeDelta,
  getRangeMoM,
  previousRange,
} from "@/lib/kpiDiarioHelpers";
import { formatDayLabel, formatDayRangeShort, formatDayShort } from "@/lib/isoDate";
import { CAT, INGRESO, NEUTRO } from "@/lib/chartColors";
import type { DailyKpiData } from "@/types/kpi";

/**
 * RESUMEN EJECUTIVO (D) — la versión diaria del Resumen Ejecutivo mensual.
 *
 * Misma jerarquía de tarjetas (T/n1/n2/n3) y los mismos tres gráficos, pero
 * alimentada por la hoja "KPI Diario" y gobernada por UN SOLO DateRangePicker:
 * las tarjetas muestran el AGREGADO del rango y los gráficos, el rango entero.
 * Un único control en vez del par "mes para tarjetas + rango por gráfico" de la
 * mensual, porque acá las dos preguntas son la misma ("¿cómo fue esta semana?")
 * y tener dos selectores obligaría a mantenerlos sincronizados a mano.
 *
 * Cómo se agrega cada métrica (suma / último valor / ratio recalculado) vive en
 * kpiDiarioHelpers.ts, no acá.
 *
 * Diferencias de datos respecto de la mensual, por lo que trae la hoja:
 *  - No existen clientes_churn, clientes_perdidos ni las columnas de objetivo
 *    (CPL_obj, CAC_obj, LTV_obj, churn_obj). Los umbrales que sí se usan son
 *    las CONSTANTES de negocio de kpiHelpers, las mismas de la mensual.
 *  - No existen CPL_ads / CAC / CR_clientes globales: sólo por canal. La fila de
 *    unit economics es por canal, sin inventar un blended.
 *  - ingresos_oritalk existe pero está vacía en toda la hoja, así que su tarjeta
 *    se reemplaza por "Ingresos nuevos" (columna real y con datos).
 *  - retention_rate diaria no es una tasa acotada (llega a 4 en días sueltos):
 *    el gráfico de clientes usa recurrent_rate, que sí lo es.
 */

/** Pie de tarjeta con umbral fijo: objetivo arriba, límite debajo. */
function ObjetivoLimite({
  objetivo,
  limite,
}: {
  objetivo: string;
  limite: string;
}) {
  return (
    <>
      <div>Objetivo: {objetivo}</div>
      <div>Límite: {limite}</div>
    </>
  );
}

/** Bloque de 4 tarjetas de un canal de ads (CPL · CAC · CR · ROI). */
function CanalAds({
  nombre,
  cpl,
  cac,
  cr,
  roi,
}: {
  nombre: string;
  cpl: number | null;
  cac: number | null;
  cr: number | null;
  roi: number | null;
}) {
  return (
    <>
      <KpiCard
        label={`CPL ${nombre}`}
        value={formatCurrency(cpl)}
        alerta={getAlertaOperativa("CPL_ads", cpl)}
        hint={
          <ObjetivoLimite
            objetivo={formatCurrency(CPL_OBJETIVO)}
            limite={formatCurrency(CPL_LIMITE)}
          />
        }
      />
      <KpiCard
        label={`CAC ${nombre}`}
        value={formatCurrency(cac)}
        alerta={getAlertaOperativa("CAC", cac)}
        hint={
          <ObjetivoLimite
            objetivo={formatCurrency(CAC_OBJETIVO)}
            limite={formatCurrency(CAC_LIMITE)}
          />
        }
      />
      <KpiCard
        label={`CR ${nombre}`}
        value={formatPercent(cr)}
        alerta={getAlertaOperativa("CR_clientes", cr)}
        hint={
          <ObjetivoLimite
            objetivo={formatPercent(CR_OBJETIVO)}
            limite={formatPercent(CR_LIMITE)}
          />
        }
      />
      {/* ROI viene del Sheet en veces: 1,65 = "por cada € gastado vuelven 1,65 €
          por encima del gasto". Sin umbrales definidos → sin alerta. */}
      <KpiCard
        label={`ROI ${nombre}`}
        value={roi === null ? "—" : `${formatNumber(roi)}x`}
      />
    </>
  );
}

export default function ResumenDiarioPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DailyKpiData>(
    "/api/kpi-diario",
    60_000
  );

  const kpi = data ?? EMPTY_DAILY_KPI;
  const days = kpi.days;
  const hasAnyData = days.length > 0;

  // Rango elegido. Mientras no haya elección del usuario, arranca en los últimos
  // 7 días con dato: es la ventana que se mira por defecto en una serie diaria
  // (y no "todo el histórico", que en 592 días no dice nada de un vistazo).
  const [range, setRange] = useState<DayRange | null>(null);
  const activeRange: DayRange | null = useMemo(() => {
    if (!hasAnyData) return null;
    if (range) return range;
    const to = days[days.length - 1];
    const from = days[Math.max(0, days.length - 7)];
    return { from, to };
  }, [range, days, hasAnyData]);

  // Días del dataset dentro del rango, y la ventana previa de igual largo.
  const rangoDias = useMemo(
    () => daysInRange(days, activeRange),
    [days, activeRange]
  );
  // Tramo contra el que se compara: el MISMO tramo del mes anterior (ver
  // previousRange). Se guarda el rango, no sólo sus días, porque el comparativo
  // de cada tarjeta lo nombra por fecha.
  const rangoPrevio = useMemo(
    () => previousRange(days, activeRange),
    [days, activeRange]
  );
  const previoDias = useMemo(
    () => daysInRange(days, rangoPrevio),
    [days, rangoPrevio]
  );

  const agg = (key: string) => aggregate(kpi, key, rangoDias);
  const mom = (key: string) => getRangeMoM(kpi, key, rangoDias, previoDias);
  const delta = (key: string) => getRangeDelta(kpi, key, rangoDias, previoDias);

  const nDias = rangoDias.length;
  const ultimoDia = rangoDias[rangoDias.length - 1] ?? "";
  // Etiqueta del comparativo n3: contra qué se compara el badge de cada tarjeta.
  // Va con las FECHAS del tramo previo y no con su largo ("vs. 22d previos"),
  // que era verdad y a la vez tapaba contra qué tramo del mes se comparaba.
  const periodo =
    rangoPrevio && previoDias.length > 0
      ? `vs. ${formatDayRangeShort(rangoPrevio.from, rangoPrevio.to)}`
      : "";

  // ---- Fila 1 · Ingresos ----
  const b2c = agg("ingresos_B2C_netos");
  const b2b = agg("ingresos_B2B");
  // "DRC Academy" = B2C neto + B2B. No es columna del Sheet: se suma acá, igual
  // que en la mensual.
  const drcAcademy = b2c === null && b2b === null ? null : (b2c ?? 0) + (b2b ?? 0);

  // ---- Fila 3 · Suscripciones ----
  const suscNuevas = agg("suscripciones_nuevas");
  const suscPerdidas = agg("suscripciones_perdidas");

  // ---- Unit economics por canal ----
  const roiGoogle = agg("ROI_google");
  const roiMeta = agg("ROI_meta");

  let mejorCanal: string | null = null;
  if (roiGoogle !== null && roiMeta !== null) {
    mejorCanal = roiGoogle >= roiMeta ? "Google Ads" : "Meta Ads";
  } else if (roiGoogle !== null) {
    mejorCanal = "Google Ads";
  } else if (roiMeta !== null) {
    mejorCanal = "Meta Ads";
  }

  // ---- Series de los gráficos: el rango completo, día a día ----
  const ingresosMrrSeries = buildSeries(kpi, rangoDias, ["ingresos_netos", "MRR"]);
  const pedidosAovRows = buildSeries(kpi, rangoDias, [
    "pedidos_nuevos",
    "pedidos_recurrentes",
    "AOV",
  ]);
  const clientesRows = buildSeries(kpi, rangoDias, [
    "clientes_nuevos",
    "clientes_recurrentes",
    "recurrent_rate",
  ]);

  return (
    <>
      <PageHeader
        eyebrow="01d · Resumen ejecutivo (D)"
        title="Cómo está el negocio, día a día"
        description="Un solo selector manda en toda la página: las tarjetas muestran el agregado del rango elegido y los gráficos, su evolución diaria."
        right={
          <div className="flex flex-wrap items-center gap-3">
            {hasAnyData && activeRange && (
              <DateRangePicker
                value={activeRange}
                onChange={setRange}
                availableDays={days}
              />
            )}
            <LiveIndicator fetchedAt={fetchedAt} error={error} />
          </div>
        }
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}

      {!loading && !hasAnyData && (
        <EmptyState label='No se encontraron datos en la hoja "KPI Diario". Verificá el Sheet ID y las credenciales.' />
      )}

      {hasAnyData && nDias === 0 && (
        <EmptyState label="El rango elegido no tiene ningún día con datos. Probá con otro." />
      )}

      {hasAnyData && nDias > 0 && (
        <div className="space-y-6">
          <div className="text-xs text-drc-ink-soft">
            Mostrando{" "}
            <span className="tabular font-medium text-drc-ink">{nDias}</span>{" "}
            {nDias === 1 ? "día" : "días"} ·{" "}
            <span className="tabular">{formatDayLabel(rangoDias[0])}</span> →{" "}
            <span className="tabular">{formatDayLabel(ultimoDia)}</span>
            {rangoPrevio && previoDias.length > 0 && (
              <>
                {" "}
                · comparado contra{" "}
                <span className="tabular">
                  {formatDayLabel(rangoPrevio.from)}
                </span>{" "}
                →{" "}
                <span className="tabular">{formatDayLabel(rangoPrevio.to)}</span>{" "}
                (
                <span className="tabular font-medium text-drc-ink">
                  {previoDias.length}
                </span>{" "}
                {previoDias.length === 1 ? "día" : "días"})
              </>
            )}
          </div>

          {/*
            Filas 1-3 comparten una única grilla de 7 columnas para que la
            tarjeta titular (T, span 3) quede alineada a lo ancho en las tres —
            mismo criterio que en la mensual.
          */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            {/* --- Fila 1 · Ingresos --- */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Ingresos netos"
              value={formatCurrency(agg("ingresos_netos"))}
              mom={mom("ingresos_netos")}
              period={periodo}
              subValues={[
                {
                  label: "vs. período anterior",
                  value: formatCurrencyDelta(delta("ingresos_netos")),
                },
              ]}
            />
            <KpiCard
              className="lg:col-span-2"
              label="DRC Academy"
              value={formatCurrency(drcAcademy)}
              subValues={[
                { label: "B2C", value: formatCurrency(b2c) },
                { label: "B2B", value: formatCurrency(b2b) },
              ]}
            />
            {/* La mensual pone Oritalk acá; en la diaria esa columna está vacía
                en las 592 filas, así que su hueco lo ocupa ingresos_nuevos —
                cuánto de la facturación del rango vino de clientes nuevos. */}
            <KpiCard
              className="lg:col-span-2"
              label="Ingresos nuevos"
              value={formatCurrency(agg("ingresos_nuevos"))}
              mom={mom("ingresos_nuevos")}
              period={periodo}
            />

            {/* --- Fila 2 · Pedidos --- */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Pedidos"
              value={formatNumber(agg("pedidos"))}
              mom={mom("pedidos")}
              period={periodo}
              subValues={[
                {
                  label: "vs. período anterior",
                  value: formatNumberDelta(delta("pedidos")),
                },
              ]}
            />
            {/* AOV del rango = media de la columna del Sheet ponderada por los
                pedidos de cada día (ver kpiDiarioHelpers): para un rango de un
                día es exactamente la celda. */}
            <KpiCard
              className="lg:col-span-2"
              label="AOV"
              value={formatCurrency(agg("AOV"))}
              mom={mom("AOV")}
              period={periodo}
            />
            <KpiCard
              className="lg:col-span-2"
              label="Ventas"
              value={formatNumber(agg("ventas"))}
              mom={mom("ventas")}
              period={periodo}
            />

            {/* --- Fila 3 · MRR y suscripciones --- */}
            {/* MRR es un STOCK: la foto del último día del rango, no una suma.
                MRR neto sí se suma (es el alta menos la baja de cada día). */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="MRR"
              value={formatCurrency(agg("MRR"))}
              mom={mom("MRR")}
              period={periodo}
              subValues={[
                { label: "MRR neto del rango", value: formatCurrency(agg("MRR_net")) },
              ]}
              hint={`Stock al ${formatDayLabel(ultimoDia)}`}
            />
            <KpiCard
              className="lg:col-span-2"
              label="Suscripciones activas"
              value={formatNumber(agg("suscripciones_activas"))}
              mom={mom("suscripciones_activas")}
              period={periodo}
              hint={`Stock al ${formatDayLabel(ultimoDia)}`}
            />
            {/* La mensual pone "Clientes en churn" acá; clientes_churn no existe
                en la diaria. El equivalente disponible es el neto de altas y
                bajas de suscripción del rango (neto_suscripciones = nuevas +
                perdidas, verificado contra la hoja). */}
            <KpiCard
              className="lg:col-span-2"
              label="Suscripciones netas"
              value={formatNumberDelta(agg("neto_suscripciones"))}
              subValues={[
                { label: "Altas", value: formatNumber(suscNuevas) },
                {
                  label: "Bajas",
                  value: formatNumber(
                    suscPerdidas === null ? null : Math.abs(suscPerdidas)
                  ),
                },
              ]}
            />
          </div>

          {/* --- Unit economics de cliente --- */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* LTV = ingresos_acumulados / clientes_acumulados (verificado): es
                un acumulado desde el origen del negocio, así que se muestra el
                valor del último día del rango, no una suma. Sin columna LTV_obj
                en la diaria → sin alerta de objetivo. */}
            <KpiCard
              label="LTV"
              value={formatCurrency(agg("LTV"))}
              mom={mom("LTV")}
              period={periodo}
              hint={`Acumulado al ${formatDayLabel(ultimoDia)}`}
            />
            <KpiCard
              label="ARPC"
              value={formatCurrency(agg("ARPC"))}
              mom={mom("ARPC")}
              period={periodo}
            />
            <KpiCard
              label="Recurrencia"
              value={formatPercent(agg("recurrent_rate"))}
              mom={mom("recurrent_rate")}
              period={periodo}
              hint="Clientes recurrentes sobre el total del rango"
            />
          </div>

          {/* --- Captación por canal --- */}
          <Panel
            title="Unit economics por canal"
            description="CPL, CAC, CR y ROI recalculados sobre el rango completo con la misma fórmula que usa el Sheet día a día. La hoja diaria no trae un CPL/CAC/CR global, así que no se muestra ninguno mezclado."
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <CanalAds
                nombre="Google"
                cpl={agg("CPL_google")}
                cac={agg("CAC_google")}
                cr={agg("CR_google")}
                roi={roiGoogle}
              />
              <CanalAds
                nombre="Meta"
                cpl={agg("CPL_meta")}
                cac={agg("CAC_meta")}
                cr={agg("CR_meta")}
                roi={roiMeta}
              />
            </div>
          </Panel>

          <Panel
            title="Oportunidad del rango"
            description="Mejor canal de adquisición según el ROI del rango elegido."
          >
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              <div>
                <div className="text-xs text-drc-ink-soft">Canal recomendado</div>
                <div className="text-lg font-semibold text-drc-green">
                  {mejorCanal ?? "Sin datos"}
                </div>
              </div>
              <div>
                <div className="text-xs text-drc-ink-soft">Gasto en captación</div>
                <div className="text-lg font-semibold text-drc-ink tabular">
                  {formatCurrency(agg("ads_captacion"))}
                </div>
              </div>
              <div>
                <div className="text-xs text-drc-ink-soft">Leads de ads</div>
                <div className="text-lg font-semibold text-drc-ink tabular">
                  {formatNumber(agg("leads_ads"))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Ingresos netos y MRR en el tiempo"
            description="Evolución diaria conjunta sobre la misma línea temporal."
          >
            <MultiTrendChart
              data={ingresosMrrSeries}
              xKey="day"
              xTickFormatter={formatDayShort}
              xMinTickGap={40}
              series={[
                { key: "ingresos_netos", label: "Ingresos netos", color: INGRESO.fuerte },
                { key: "MRR", label: "MRR", color: INGRESO.medio },
              ]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          <Panel
            title="Pedidos y ticket medio (AOV)"
            description="Pedidos nuevos + recurrentes (apilados, eje izq.) y AOV como línea sobre eje derecho en € — escalas distintas, por eso el eje dual."
          >
            <ComposedBarLineChart
              data={pedidosAovRows}
              xKey="day"
              xTickFormatter={formatDayShort}
              xMinTickGap={40}
              stacked
              /* Recharts apila en orden de declaración: el primero abajo. Para
                 que "nuevos" quede ARRIBA, va declarado último. */
              bars={[
                { key: "pedidos_recurrentes", label: "Pedidos recurrentes", color: CAT.verdeClaro },
                { key: "pedidos_nuevos", label: "Pedidos nuevos", color: CAT.oro },
              ]}
              line={{ key: "AOV", label: "AOV", color: INGRESO.base }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          <Panel
            title="Movimiento de clientes y recurrencia"
            description="Altas y recurrentes del día (eje izq.) con la tasa de recurrencia como línea (%) sobre eje derecho. La mensual usa retention_rate acá; la columna diaria no es una tasa acotada (llega a 400% en días sueltos), así que se usa recurrent_rate, que sí lo es."
          >
            <ComposedBarLineChart
              data={clientesRows}
              xKey="day"
              xTickFormatter={formatDayShort}
              xMinTickGap={40}
              bars={[
                { key: "clientes_nuevos", label: "Nuevos", color: CAT.verde },
                { key: "clientes_recurrentes", label: "Recurrentes", color: CAT.verdeClaro },
              ]}
              line={{ key: "recurrent_rate", label: "Recurrencia", color: NEUTRO.ink }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatPercent(v)}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
