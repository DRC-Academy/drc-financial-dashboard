"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { WeekSelect } from "@/components/ui/WeekSelect";
import { KpiCard } from "@/components/ui/KpiCard";
import { ChannelAdsCard } from "@/components/ui/ChannelAdsCard";
import { Panel } from "@/components/ui/Panel";
import { DonutChart } from "@/components/ui/DonutChart";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { MultiBarLineChart } from "@/components/ui/MultiBarLineChart";
import { RangeFilter, WEEK_OPTIONS, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getValueAtMonth,
  getMoMAtMonth,
  getRoiCanal,
  getAlertaOperativa,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/kpiHelpers";
import {
  SEM,
  buildWeekLabels,
  getRoiCaptacion,
  isCurrentWeek,
  weekLongLabel,
  weeklyToKpiShape,
} from "@/lib/kpiSemanalHelpers";
import { CANAL, CAT, INGRESO } from "@/lib/chartColors";
import type { MetricValue, WeeklyKpiData } from "@/types/kpi";

/**
 * Captación semanal — misma lectura que la página de Captación mensual, pero
 * sobre la hoja "KPI Semanal". Las diferencias no son de diseño sino de lo que
 * el Sheet ofrece en cada granularidad:
 *  - los leads NO vienen desglosados en ads/mail, sólo el total por canal;
 *  - ROI_capt no existe como columna y se deriva (ver getRoiCaptacion);
 *  - las variaciones son semana contra semana → los badges rotulan WoW.
 */

/**
 * Ticket medio de un canal: ingresos / ventas. Idem Captación mensual: es lo
 * único comparable que se puede dar de "Otros", que no tiene inversión en ads y
 * por lo tanto tampoco CPL, CAC ni ROI.
 */
function ticketMedio(ingresos: MetricValue, ventas: MetricValue): MetricValue {
  if (ingresos === null || ventas === null || ventas === 0) return null;
  return ingresos / ventas;
}

/** Identidad por canal, desde la paleta central (idem Captación mensual). */
const C = {
  google: CANAL.google,
  meta: CANAL.meta,
  otros: CANAL.otros,
  googleBar: CANAL.googleSuave,
  googleLine: CANAL.google,
  metaBar: CANAL.metaSuave,
  metaLine: CANAL.meta,
};

export default function CaptacionSemanalPage() {
  const { data, loading, error, fetchedAt } = useLiveData<WeeklyKpiData>(
    "/api/kpi-semanal",
    60_000
  );

  const weekly = data ?? { weeks: [], keys: [], data: {} };
  // Se reetiqueta a la forma de DB_KPI para reutilizar tal cual los helpers de
  // kpiHelpers.ts (getValueAtMonth, getMoMAtMonth, getRoiCanal): acá "month" es
  // una semana.
  const kpi = weeklyToKpiShape(weekly);
  const weeks = weekly.weeks;
  const hasAnyData = weeks.length > 0;

  // Etiquetas cortas ("S31") para los ejes de los gráficos.
  const labels = buildWeekLabels(weeks);

  // Desplegable de semana → controla SOLO las tarjetas.
  const [weekChoice, setWeekChoice] = useState<string>("");
  const activeWeek =
    weekChoice && weeks.includes(weekChoice)
      ? weekChoice
      : weeks[weeks.length - 1] ?? "";
  const activeEnCurso = activeWeek ? isCurrentWeek(activeWeek) : false;

  // Rangos independientes por gráfico, en SEMANAS.
  const [leadsRange, setLeadsRange] = useState(12);
  const [ventasRange, setVentasRange] = useState(12);
  const [mixRange, setMixRange] = useState(12);

  // ---- Fila 1 · Total en Ads ----
  const adsTotal = getValueAtMonth(kpi, "ads_total", activeWeek);
  const adsCaptacion = getValueAtMonth(kpi, "ads_captacion", activeWeek);
  const roiCapt = getRoiCaptacion(kpi, activeWeek);

  // ---- Dona · distribución de ventas de la semana seleccionada ----
  // Igual que en la mensual, "Otros" sale de la columna ventas_otros de la hoja
  // (no de ventas_total - google - meta). Desde w13 las tres columnas suman
  // exacto el total semanal; antes de w12 el desglose por canal todavía no se
  // cargaba y la hoja deja los tres canales en 0.
  const ventasSlices = [
    {
      name: "Google Ads",
      value: getValueAtMonth(kpi, "ventas_google", activeWeek),
      color: C.google,
    },
    {
      name: "Meta Ads",
      value: getValueAtMonth(kpi, "ventas_meta", activeWeek),
      color: C.meta,
    },
    {
      name: "Otros",
      value: getValueAtMonth(kpi, "ventas_otros", activeWeek),
      color: C.otros,
    },
  ];

  // ---- Gráficos (dataset completo, recortado por su propio rango) ----
  // A diferencia de la mensual, los leads por canal ya vienen totalizados en una
  // sola columna: no hay suma ads + mail que hacer.
  const leadsRows = applyRange(weeks, leadsRange).map((week) => ({
    month: labels[week],
    leads_google: kpi.data[week]?.[SEM.leadsGoogle] ?? null,
    leads_meta: kpi.data[week]?.[SEM.leadsMeta] ?? null,
    CPL_google: kpi.data[week]?.["CPL_google"] ?? null,
    CPL_meta: kpi.data[week]?.["CPL_meta"] ?? null,
  }));

  const ventasRows = applyRange(weeks, ventasRange).map((week) => ({
    month: labels[week],
    ventas_google: kpi.data[week]?.["ventas_google"] ?? null,
    ventas_meta: kpi.data[week]?.["ventas_meta"] ?? null,
    ventas_otros: kpi.data[week]?.["ventas_otros"] ?? null,
    CAC_google: kpi.data[week]?.["CAC_google"] ?? null,
    CAC_meta: kpi.data[week]?.["CAC_meta"] ?? null,
  }));

  const mixRows = applyRange(weeks, mixRange).map((week) => ({
    month: labels[week],
    AOV_nuevos: kpi.data[week]?.[SEM.aovNuevos] ?? null,
    CAC: kpi.data[week]?.[SEM.cacTotal] ?? null,
    CPL_ads: kpi.data[week]?.[SEM.cplTotal] ?? null,
  }));

  return (
    <>
      <PageHeader
        eyebrow="02s · Captación semanal"
        title="De dónde vienen los alumnos y a qué costo, semana a semana"
        description="Elegí la semana para las tarjetas; cada gráfico tiene su propio rango. Las semanas van de lunes a domingo y las variaciones comparan contra la semana anterior con dato (WoW)."
        right={
          <div className="flex flex-wrap items-center gap-3">
            {hasAnyData && (
              <WeekSelect
                weeks={weeks}
                value={activeWeek}
                onChange={setWeekChoice}
              />
            )}
            <LiveIndicator fetchedAt={fetchedAt} error={error} />
          </div>
        }
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}
      {!loading && !hasAnyData && <EmptyState label="Sin datos semanales" />}

      {hasAnyData && (
        <div className="space-y-6">
          {/* La semana en curso está a medio llenar: sin este aviso, sus valores
              parciales se leen como un desplome real. */}
          {activeEnCurso && (
            <div className="rounded-lg border border-drc-yellow/40 bg-drc-yellow/10 px-4 py-2.5 text-xs text-drc-ink">
              <strong>{weekLongLabel(activeWeek)}</strong> — en curso: la hoja
              todavía se está llenando, así que sus valores son parciales y la
              comparación WoW no es representativa.
            </div>
          )}

          {/* --- Fila 1 · Total en Ads --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Total en Ads"
              value={formatCurrency(adsTotal)}
              mom={getMoMAtMonth(kpi, "ads_total", activeWeek)}
              period="WoW"
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              className="lg:col-span-2"
              label="Ads captación"
              value={formatCurrency(adsCaptacion)}
              mom={getMoMAtMonth(kpi, "ads_captacion", activeWeek)}
              period="WoW"
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              className="lg:col-span-2"
              label="ROI captación"
              value={formatPercent(roiCapt)}
              hint="Derivado: (ingresos nuevos − ads captación) / ads captación"
            />
          </div>

          {/* --- Dona · distribución de ventas de la semana --- */}
          <Panel
            title={`Distribución de ventas — ${weekLongLabel(activeWeek)}`}
            description="Ventas por canal en la semana seleccionada (no depende del rango de los gráficos)."
            className="lg:max-w-2xl"
          >
            <DonutChart
              data={ventasSlices}
              valueFormatter={(v) => formatNumber(v)}
              centerLabel="ventas"
            />
          </Panel>

          {/* --- Fila 3 · Google Ads / Meta Ads --- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChannelAdsCard
              title="Google Ads"
              accentColor={C.google}
              period="WoW"
              gastoLabel="Inversión"
              gasto={formatCurrency(getValueAtMonth(kpi, "ads_google", activeWeek))}
              gastoMom={getMoMAtMonth(kpi, "ads_google", activeWeek)}
              gastoIsGoodWhenPositive={false}
              ingreso={{
                label: "Ingresos",
                value: formatCurrency(getValueAtMonth(kpi, "ingresos_google", activeWeek)),
                mom: getMoMAtMonth(kpi, "ingresos_google", activeWeek),
              }}
              leads={[
                {
                  label: "Leads",
                  value: formatNumber(getValueAtMonth(kpi, SEM.leadsGoogle, activeWeek)),
                },
              ]}
              metrics={[
                {
                  label: "CPL",
                  value: formatCurrency(getValueAtMonth(kpi, "CPL_google", activeWeek)),
                  alerta: getAlertaOperativa("CPL_ads", getValueAtMonth(kpi, "CPL_google", activeWeek)),
                },
                { label: "Ventas", value: formatNumber(getValueAtMonth(kpi, "ventas_google", activeWeek)) },
                {
                  label: "CAC",
                  value: formatCurrency(getValueAtMonth(kpi, "CAC_google", activeWeek)),
                  alerta: getAlertaOperativa("CAC", getValueAtMonth(kpi, "CAC_google", activeWeek)),
                },
                {
                  label: "CR",
                  value: formatPercent(getValueAtMonth(kpi, "CR_google", activeWeek)),
                  alerta: getAlertaOperativa("CR_clientes", getValueAtMonth(kpi, "CR_google", activeWeek)),
                },
                { label: "ROI", value: formatPercent(getRoiCanal(kpi, activeWeek, "google")) },
              ]}
            />
            <ChannelAdsCard
              title="Meta Ads"
              accentColor={C.meta}
              period="WoW"
              gastoLabel="Inversión"
              gasto={formatCurrency(getValueAtMonth(kpi, SEM.adsMetaCapt, activeWeek))}
              gastoMom={getMoMAtMonth(kpi, SEM.adsMetaCapt, activeWeek)}
              gastoIsGoodWhenPositive={false}
              ingreso={{
                label: "Ingresos",
                value: formatCurrency(getValueAtMonth(kpi, "ingresos_meta", activeWeek)),
                mom: getMoMAtMonth(kpi, "ingresos_meta", activeWeek),
              }}
              leads={[
                {
                  label: "Leads",
                  value: formatNumber(getValueAtMonth(kpi, SEM.leadsMeta, activeWeek)),
                },
              ]}
              metrics={[
                {
                  label: "CPL",
                  value: formatCurrency(getValueAtMonth(kpi, "CPL_meta", activeWeek)),
                  alerta: getAlertaOperativa("CPL_ads", getValueAtMonth(kpi, "CPL_meta", activeWeek)),
                },
                { label: "Ventas", value: formatNumber(getValueAtMonth(kpi, "ventas_meta", activeWeek)) },
                {
                  label: "CAC",
                  value: formatCurrency(getValueAtMonth(kpi, "CAC_meta", activeWeek)),
                  alerta: getAlertaOperativa("CAC", getValueAtMonth(kpi, "CAC_meta", activeWeek)),
                },
                {
                  label: "CR",
                  value: formatPercent(getValueAtMonth(kpi, "CR_meta", activeWeek)),
                  alerta: getAlertaOperativa("CR_clientes", getValueAtMonth(kpi, "CR_meta", activeWeek)),
                },
                { label: "ROI", value: formatPercent(getRoiCanal(kpi, activeWeek, "meta")) },
              ]}
            />
            {/* Otros: idem mensual — a ancho completo y sin CPL/CAC/ROI, porque
                no tiene inversión en ads que atribuirle. */}
            <ChannelAdsCard
              className="lg:col-span-2"
              title="Otros canales"
              accentColor={C.otros}
              period="WoW"
              ingreso={{
                label: "Ingresos",
                value: formatCurrency(getValueAtMonth(kpi, "ingresos_otros", activeWeek)),
                mom: getMoMAtMonth(kpi, "ingresos_otros", activeWeek),
              }}
              leads={[]}
              metrics={[
                {
                  label: "Ventas",
                  value: formatNumber(getValueAtMonth(kpi, "ventas_otros", activeWeek)),
                },
                {
                  label: "Ticket medio",
                  value: formatCurrency(
                    ticketMedio(
                      getValueAtMonth(kpi, "ingresos_otros", activeWeek),
                      getValueAtMonth(kpi, "ventas_otros", activeWeek)
                    )
                  ),
                },
              ]}
            />
          </div>

          {/* --- Gráfico · Leads por canal + CPL --- */}
          <Panel
            title="Leads por canal en el tiempo"
            description="Barras: leads por canal (eje izq.). Líneas: CPL de cada canal (€, eje der.). La hoja semanal no desglosa leads de ads y de mail: son el total del canal."
            action={
              <RangeFilter
                value={leadsRange}
                onChange={setLeadsRange}
                options={WEEK_OPTIONS}
              />
            }
          >
            <MultiBarLineChart
              data={leadsRows}
              bars={[
                { key: "leads_google", label: "Leads Google", color: C.googleBar },
                { key: "leads_meta", label: "Leads Meta", color: C.metaBar },
              ]}
              lines={[
                { key: "CPL_google", label: "CPL Google", color: C.googleLine },
                { key: "CPL_meta", label: "CPL Meta", color: C.metaLine },
              ]}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          {/* --- Gráfico · Ventas por canal + CAC --- */}
          <Panel
            title="Ventas por canal en el tiempo"
            description="Barras: ventas por canal (eje izq.), incluido Otros — lo que no vino de Google ni de Meta. Líneas: CAC de cada canal (€, eje der.); Otros no tiene CAC porque no tiene inversión en ads que atribuirle."
            action={
              <RangeFilter
                value={ventasRange}
                onChange={setVentasRange}
                options={WEEK_OPTIONS}
              />
            }
          >
            <MultiBarLineChart
              data={ventasRows}
              bars={[
                { key: "ventas_google", label: "Ventas Google", color: C.googleBar },
                { key: "ventas_meta", label: "Ventas Meta", color: C.metaBar },
                { key: "ventas_otros", label: "Ventas Otros", color: C.otros },
              ]}
              lines={[
                { key: "CAC_google", label: "CAC Google", color: C.googleLine },
                { key: "CAC_meta", label: "CAC Meta", color: C.metaLine },
              ]}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          {/* --- Gráfico · ARPNC, CAC y CPL --- */}
          <Panel
            title="Ticket medio nuevo, CAC y CPL"
            description="Las tres series están en € (mismo eje): ARPNC (ingresos nuevos por venta, el equivalente semanal del AOV de nuevos), coste de adquisición y coste por lead."
            action={
              <RangeFilter
                value={mixRange}
                onChange={setMixRange}
                options={WEEK_OPTIONS}
              />
            }
          >
            <MultiTrendChart
              data={mixRows}
              series={[
                /* Mismo criterio de color que Captación mensual: el ticket es
                   dinero que ENTRA (azul); CAC y CPL son categorías. */
                { key: "AOV_nuevos", label: "ARPNC", color: INGRESO.base },
                { key: "CAC", label: "CAC", color: CAT.verde },
                { key: "CPL_ads", label: "CPL total", color: CAT.oro },
              ]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
