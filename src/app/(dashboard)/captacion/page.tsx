"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { useMesActivo } from "@/hooks/useMesActivo";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { KpiCard } from "@/components/ui/KpiCard";
import { ChannelAdsCard } from "@/components/ui/ChannelAdsCard";
import { Panel } from "@/components/ui/Panel";
import { DonutChart } from "@/components/ui/DonutChart";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { MultiBarLineChart } from "@/components/ui/MultiBarLineChart";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
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
import { CANAL, CAT, GASTO, INGRESO } from "@/lib/chartColors";
import type { DBKpiData, MetricValue } from "@/types/kpi";

/**
 * Identidad por canal (barras/dona/pestañitas), desde la paleta central.
 * Google y Meta son CATEGORÍAS, no ingresos ni gastos: van en verde/oro y dejan
 * el azul y el rojo reservados a su significado (ver src/lib/chartColors.ts).
 * En los combinados, la barra usa el tono claro y su línea el base, para que la
 * correspondencia barra↔línea del canal se lea por hue.
 */
const C = {
  google: CANAL.google,
  meta: CANAL.meta,
  otros: CANAL.otros,
  googleBar: CANAL.googleSuave,
  googleLine: CANAL.google,
  metaBar: CANAL.metaSuave,
  metaLine: CANAL.meta,
};

/** Suma dos métricas tratando null como 0, salvo que AMBAS sean null. */
function sumOrNull(a: MetricValue, b: MetricValue): MetricValue {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/**
 * Ticket medio de un canal: ingresos / ventas. Es lo único comparable que se
 * puede dar de "Otros", que no tiene inversión en ads y por lo tanto tampoco
 * CPL, CAC ni ROI.
 */
function ticketMedio(ingresos: MetricValue, ventas: MetricValue): MetricValue {
  if (ingresos === null || ventas === null || ventas === 0) return null;
  return ingresos / ventas;
}

export default function CaptacionPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );

  const kpi = data ?? { months: [], keys: [], data: {} };
  const months = kpi.months;
  const hasAnyData = months.length > 0;

  // Desplegable de mes → controla SOLO las tarjetas (igual que Resumen).
  const [activeMonth, setMonthChoice] = useMesActivo(months);

  // Rangos independientes por gráfico.
  const [leadsRange, setLeadsRange] = useState(0);
  const [ventasRange, setVentasRange] = useState(0);
  const [mixRange, setMixRange] = useState(0);

  // ---- Fila 1 · Total en Ads ----
  const adsTotal = getValueAtMonth(kpi, "ads_total", activeMonth);
  const adsCaptacion = getValueAtMonth(kpi, "ads_captacion", activeMonth);
  const roiCapt = getValueAtMonth(kpi, "ROI_capt", activeMonth);

  // ---- Dona · distribución de ventas del mes seleccionado ----
  // "Otros" NO se deriva como ventas - google - meta: DB_KPI trae la columna
  // ventas_otros ya calculada, y cuadra exacta con esa resta en los meses que
  // tienen el desglose cargado (jun-26: 42 = 22+13+7; jul-26: 32 = 9+14+9). Se
  // usa la columna para no discrepar del Sheet si el criterio de atribución
  // cambia allí.
  const ventasSlices = [
    {
      name: "Google Ads",
      value: getValueAtMonth(kpi, "ventas_google", activeMonth),
      color: C.google,
    },
    {
      name: "Meta Ads",
      value: getValueAtMonth(kpi, "ventas_meta", activeMonth),
      color: C.meta,
    },
    {
      name: "Otros",
      value: getValueAtMonth(kpi, "ventas_otros", activeMonth),
      color: C.otros,
    },
  ];

  // ---- Gráficos (dataset completo, recortado por su propio rango) ----
  const leadsRows = applyRange(months, leadsRange).map((month) => ({
    month,
    leads_google: sumOrNull(
      kpi.data[month]?.["leads_ads_google"] ?? null,
      kpi.data[month]?.["leads_m_google"] ?? null
    ),
    leads_meta: sumOrNull(
      kpi.data[month]?.["leads_ads_meta"] ?? null,
      kpi.data[month]?.["leads_m_meta"] ?? null
    ),
    CPL_google: kpi.data[month]?.["CPL_google"] ?? null,
    CPL_meta: kpi.data[month]?.["CPL_meta"] ?? null,
  }));

  const ventasRows = applyRange(months, ventasRange).map((month) => ({
    month,
    ventas_google: kpi.data[month]?.["ventas_google"] ?? null,
    ventas_meta: kpi.data[month]?.["ventas_meta"] ?? null,
    ventas_otros: kpi.data[month]?.["ventas_otros"] ?? null,
    CAC_google: kpi.data[month]?.["CAC_google"] ?? null,
    CAC_meta: kpi.data[month]?.["CAC_meta"] ?? null,
  }));

  const mixRows = applyRange(months, mixRange).map((month) => ({
    month,
    LTV: kpi.data[month]?.["LTV"] ?? null,
    AOV_nuevos: kpi.data[month]?.["AOV_nuevos"] ?? null,
    CAC: kpi.data[month]?.["CAC"] ?? null,
    CPL_ads: kpi.data[month]?.["CPL_ads"] ?? null,
  }));

  return (
    <>
      <PageHeader
        eyebrow="02 · Captación"
        title="De dónde vienen los alumnos y a qué costo"
        description="Elegí el mes para las tarjetas; cada gráfico tiene su propio rango temporal."
        right={
          <div className="flex flex-wrap items-center gap-3">
            {hasAnyData && (
              <MonthSelect
                months={months}
                value={activeMonth}
                onChange={setMonthChoice}
              />
            )}
            <LiveIndicator fetchedAt={fetchedAt} error={error} />
          </div>
        }
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}
      {!loading && !hasAnyData && <EmptyState label="Sin datos de captación" />}

      {hasAnyData && (
        <div className="space-y-6">
          {/* --- Fila 1 · Total en Ads --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Total en Ads"
              value={formatCurrency(adsTotal)}
              mom={getMoMAtMonth(kpi, "ads_total", activeMonth)}
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              className="lg:col-span-2"
              label="Ads captación"
              value={formatCurrency(adsCaptacion)}
              mom={getMoMAtMonth(kpi, "ads_captacion", activeMonth)}
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              className="lg:col-span-2"
              label="ROI captación"
              value={formatPercent(roiCapt)}
              mom={getMoMAtMonth(kpi, "ROI_capt", activeMonth)}
            />
          </div>

          {/* --- Dona · distribución de ventas del mes --- */}
          <Panel
            title={`Distribución de ventas — ${activeMonth}`}
            description="Ventas por canal en el mes seleccionado (no depende del rango de los gráficos)."
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
              gastoLabel="Inversión"
              gasto={formatCurrency(getValueAtMonth(kpi, "ads_google", activeMonth))}
              gastoMom={getMoMAtMonth(kpi, "ads_google", activeMonth)}
              gastoIsGoodWhenPositive={false}
              ingreso={{
                label: "Ingresos",
                value: formatCurrency(getValueAtMonth(kpi, "ingresos_google", activeMonth)),
                mom: getMoMAtMonth(kpi, "ingresos_google", activeMonth),
              }}
              leads={[
                {
                  label: "Leads ads",
                  value: formatNumber(getValueAtMonth(kpi, "leads_ads_google", activeMonth)),
                },
                {
                  label: "Leads mail",
                  value: formatNumber(getValueAtMonth(kpi, "leads_m_google", activeMonth)),
                },
              ]}
              metrics={[
                {
                  label: "CPL",
                  value: formatCurrency(getValueAtMonth(kpi, "CPL_google", activeMonth)),
                  alerta: getAlertaOperativa("CPL_ads", getValueAtMonth(kpi, "CPL_google", activeMonth)),
                },
                { label: "Ventas", value: formatNumber(getValueAtMonth(kpi, "ventas_google", activeMonth)) },
                {
                  label: "CAC",
                  value: formatCurrency(getValueAtMonth(kpi, "CAC_google", activeMonth)),
                  alerta: getAlertaOperativa("CAC", getValueAtMonth(kpi, "CAC_google", activeMonth)),
                },
                {
                  label: "CR",
                  value: formatPercent(getValueAtMonth(kpi, "CR_google", activeMonth)),
                  alerta: getAlertaOperativa("CR_clientes", getValueAtMonth(kpi, "CR_google", activeMonth)),
                },
                { label: "ROI", value: formatPercent(getRoiCanal(kpi, activeMonth, "google")) },
              ]}
            />
            <ChannelAdsCard
              title="Meta Ads"
              accentColor={C.meta}
              gastoLabel="Inversión"
              gasto={formatCurrency(getValueAtMonth(kpi, "ads_meta_captac", activeMonth))}
              gastoMom={getMoMAtMonth(kpi, "ads_meta_captac", activeMonth)}
              gastoIsGoodWhenPositive={false}
              ingreso={{
                label: "Ingresos",
                value: formatCurrency(getValueAtMonth(kpi, "ingresos_meta", activeMonth)),
                mom: getMoMAtMonth(kpi, "ingresos_meta", activeMonth),
              }}
              leads={[
                {
                  label: "Leads ads",
                  value: formatNumber(getValueAtMonth(kpi, "leads_ads_meta", activeMonth)),
                },
                {
                  label: "Leads mail",
                  value: formatNumber(getValueAtMonth(kpi, "leads_m_meta", activeMonth)),
                },
              ]}
              metrics={[
                {
                  label: "CPL",
                  value: formatCurrency(getValueAtMonth(kpi, "CPL_meta", activeMonth)),
                  alerta: getAlertaOperativa("CPL_ads", getValueAtMonth(kpi, "CPL_meta", activeMonth)),
                },
                { label: "Ventas", value: formatNumber(getValueAtMonth(kpi, "ventas_meta", activeMonth)) },
                {
                  label: "CAC",
                  value: formatCurrency(getValueAtMonth(kpi, "CAC_meta", activeMonth)),
                  alerta: getAlertaOperativa("CAC", getValueAtMonth(kpi, "CAC_meta", activeMonth)),
                },
                {
                  label: "CR",
                  value: formatPercent(getValueAtMonth(kpi, "CR_meta", activeMonth)),
                  alerta: getAlertaOperativa("CR_clientes", getValueAtMonth(kpi, "CR_meta", activeMonth)),
                },
                { label: "ROI", value: formatPercent(getRoiCanal(kpi, activeMonth, "meta")) },
              ]}
            />
            {/* Otros: el resto de la captación. Va a ancho completo porque tiene
                bastante menos que contar que Google y Meta — sin inversión en
                ads no hay CPL, CAC ni ROI que mostrar. */}
            <ChannelAdsCard
              className="lg:col-span-2"
              title="Otros canales"
              accentColor={C.otros}
              ingreso={{
                label: "Ingresos",
                value: formatCurrency(getValueAtMonth(kpi, "ingresos_otros", activeMonth)),
                mom: getMoMAtMonth(kpi, "ingresos_otros", activeMonth),
              }}
              leads={[]}
              metrics={[
                {
                  label: "Ventas",
                  value: formatNumber(getValueAtMonth(kpi, "ventas_otros", activeMonth)),
                },
                {
                  label: "Ticket medio",
                  value: formatCurrency(
                    ticketMedio(
                      getValueAtMonth(kpi, "ingresos_otros", activeMonth),
                      getValueAtMonth(kpi, "ventas_otros", activeMonth)
                    )
                  ),
                },
              ]}
            />
          </div>

          {/* --- Gráfico · Leads por canal + CPL --- */}
          <Panel
            title="Leads por canal en el tiempo"
            description="Barras: total de leads por canal (leads ads + leads mail, eje izq.). Líneas: CPL de cada canal (€, eje der.)."
            action={<RangeFilter value={leadsRange} onChange={setLeadsRange} />}
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
            action={<RangeFilter value={ventasRange} onChange={setVentasRange} />}
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

          {/* --- Gráfico · LTV, AOV nuevos, CAC y CPL --- */}
          {/*
            EJE ÚNICO, a propósito. El LTV es la serie más grande de las cuatro,
            pero no por un orden de magnitud: sobre el histórico completo va de
            250 € a 367 €, contra 100-255 € de AOV_nuevos y 4-200 € de CAC (sólo
            el CPL, 5-26 €, queda abajo, y ya quedaba antes). Separarlo en un eje
            propio rompería justo lo que hace útil ponerlo acá: la distancia
            vertical entre LTV y CAC ES la lectura del panel — con ejes distintos
            esa distancia deja de significar euros y se puede dibujar un LTV por
            debajo del CAC con el negocio sano, o al revés.
          */}
          <Panel
            title="LTV, ticket medio nuevo, CAC y CPL"
            description="Las cuatro series están en € sobre el MISMO eje: valor de vida del cliente, AOV de clientes nuevos, coste de adquisición y coste por lead. Así la distancia entre LTV y CAC se lee directamente en euros — es el margen que deja cada cliente captado."
            action={<RangeFilter value={mixRange} onChange={setMixRange} />}
          >
            <MultiTrendChart
              data={mixRows}
              /* La leyenda va en el orden de negocio LTV → AOV nuevos → CAC →
                 CPL (de lo que deja cada cliente a lo que cuesta traerlo), no en
                 el alfabético que recharts aplica por defecto. */
              legendInSeriesOrder
              series={[
                /* LTV y AOV nuevos son dinero que ENTRA → rampa de ingreso. CAC y
                   CPL son categorías (no gasto bruto): verde y oro. */
                { key: "LTV", label: "LTV", color: INGRESO.fuerte },
                { key: "AOV_nuevos", label: "AOV nuevos", color: INGRESO.base },
                { key: "CAC", label: "CAC", color: CAT.verde },
                { key: "CPL_ads", label: "CPL ads", color: CAT.oro },
              ]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
