"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { DonutChart } from "@/components/ui/DonutChart";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { StackedBarChart } from "@/components/ui/StackedBarChart";
import { ComposedBarLineChart } from "@/components/ui/ComposedBarLineChart";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getValueAtMonth,
  getMoMAtMonth,
  getDeltaAtMonth,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatPercent,
} from "@/lib/kpiHelpers";
import type { DBKpiData, MetricValue } from "@/types/kpi";

/** Colores de identidad por canal, alineados con Captación. */
const C = {
  google: "#1e9e3a",
  meta: "#eab308",
  otros: "#94a3b8",
  // Barras pastel del mismo hue para el gráfico de ingresos por canal.
  googleBar: "#a9d5b5",
  metaBar: "#ffe08a",
  otrosBar: "#cbd5e1",
};

/** Resta a - b tratando null como 0, salvo que AMBOS sean null → null. */
function subOrNull(a: MetricValue, b: MetricValue): MetricValue {
  if (a === null && b === null) return null;
  return (a ?? 0) - (b ?? 0);
}

export default function IngresosPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );

  const kpi = data ?? { months: [], keys: [], data: {} };
  const months = kpi.months;
  const hasAnyData = months.length > 0;

  // Desplegable de mes → controla SOLO las tarjetas (igual que Resumen/Captación).
  const [monthChoice, setMonthChoice] = useState<string>("");
  const activeMonth =
    monthChoice && months.includes(monthChoice)
      ? monthChoice
      : months[months.length - 1] ?? "";

  // Rangos independientes por gráfico.
  const [mixRange, setMixRange] = useState(0);
  const [canalRange, setCanalRange] = useState(0);
  const [pedRange, setPedRange] = useState(0);
  const [aovRange, setAovRange] = useState(0);

  // ---- Fila 1 · Ingresos netos + MRR ----
  const ingresosNetos = getValueAtMonth(kpi, "ingresos_netos", activeMonth);
  const ingresosDelta = getDeltaAtMonth(kpi, "ingresos_netos", activeMonth);
  const mrr = getValueAtMonth(kpi, "MRR", activeMonth);
  const mrrDelta = getDeltaAtMonth(kpi, "MRR", activeMonth);

  // ---- Dona · MRR como porción de ingresos_netos ----
  const otrosIngresos = subOrNull(ingresosNetos, mrr);
  const mrrSlices = [
    { name: "MRR (recurrente)", value: mrr, color: C.google },
    { name: "Otros ingresos", value: otrosIngresos, color: C.otros },
  ];

  // ---- Stripe / refunds (2 tarjetas n2) ----
  // stripe_fee viene en negativo (es un coste): mostramos su magnitud.
  const stripeFee = getValueAtMonth(kpi, "stripe_fee", activeMonth);
  const stripeFeeAbs = stripeFee === null ? null : Math.abs(stripeFee);
  const stripeFeePct = getValueAtMonth(kpi, "%_stripe_fee", activeMonth);
  const importeRefunds = getValueAtMonth(kpi, "importe_refunds", activeMonth);
  const refundsNum = getValueAtMonth(kpi, "refunds_num", activeMonth);

  // ---- Pedidos + AOV + acumulado ----
  const pedidos = getValueAtMonth(kpi, "pedidos", activeMonth);
  const aov = getValueAtMonth(kpi, "AOV", activeMonth);
  const aovNuevos = getValueAtMonth(kpi, "AOV_nuevos", activeMonth);
  const ingresosAcumulados = getValueAtMonth(
    kpi,
    "ingresos_acumulados",
    activeMonth
  );

  // ---- Gráfico · mix de ingresos por línea de negocio (apilado) ----
  const mixRows = applyRange(months, mixRange).map((month) => ({
    month,
    "B2C neto": kpi.data[month]?.["ingresos_B2C_netos"] ?? null,
    B2B: kpi.data[month]?.["ingresos_B2B"] ?? null,
    Oritalk: kpi.data[month]?.["ingresos_oritalk"] ?? null,
  }));

  // ---- Gráfico · ingresos por canal (apilado) ----
  const canalRows = applyRange(months, canalRange).map((month) => {
    const netos = kpi.data[month]?.["ingresos_netos"] ?? null;
    const g = kpi.data[month]?.["ingresos_google"] ?? null;
    const m = kpi.data[month]?.["ingresos_meta"] ?? null;
    // "ingresos_otros" no existe en DB_KPI: es el resto no atribuido a Google/Meta.
    const otros = netos === null ? null : (netos ?? 0) - (g ?? 0) - (m ?? 0);
    return {
      month,
      ingresos_google: g,
      ingresos_meta: m,
      ingresos_otros: otros,
    };
  });

  // ---- Gráfico · pedidos nuevos vs recurrentes (apilado) + recurrent_rate ----
  const pedidosRows = applyRange(months, pedRange).map((month) => ({
    month,
    pedidos_nuevos: kpi.data[month]?.["pedidos_nuevos"] ?? null,
    pedidos_recurrentes: kpi.data[month]?.["pedidos_recurrentes"] ?? null,
    recurrent_rate: kpi.data[month]?.["recurrent_rate"] ?? null,
  }));

  // ---- Gráfico · AOV vs AOV nuevos ----
  const aovRows = applyRange(months, aovRange).map((month) => ({
    month,
    AOV: kpi.data[month]?.["AOV"] ?? null,
    AOV_nuevos: kpi.data[month]?.["AOV_nuevos"] ?? null,
  }));

  return (
    <>
      <PageHeader
        eyebrow="03 · Ingresos"
        title="Cuánto entra, y de dónde"
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
      {!loading && !hasAnyData && <EmptyState label="Sin datos de ingresos" />}

      {hasAnyData && (
        <div className="space-y-6">
          {/* --- Fila 1 · Titulares (en columna) al lado de la dona --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            {/* Los dos titulares apilados uno encima del otro. */}
            <div className="flex flex-col gap-4">
              <KpiCard
                size="titular"
                label="Ingresos netos"
                value={formatCurrency(ingresosNetos)}
                mom={getMoMAtMonth(kpi, "ingresos_netos", activeMonth)}
                subValues={[
                  {
                    label: "vs. mes anterior",
                    value: formatCurrencyDelta(ingresosDelta),
                  },
                ]}
              />
              <KpiCard
                size="titular"
                label="MRR"
                value={formatCurrency(mrr)}
                mom={getMoMAtMonth(kpi, "MRR", activeMonth)}
                subValues={[
                  { label: "vs. mes anterior", value: formatCurrencyDelta(mrrDelta) },
                ]}
              />
            </div>

            {/* --- Dona · MRR como % de ingresos netos --- */}
            <Panel
              title={`MRR sobre ingresos netos — ${activeMonth}`}
              description="Qué porción de los ingresos netos del mes es recurrente (MRR) frente al resto."
            >
              <DonutChart
                data={mrrSlices}
                valueFormatter={(v) => formatCurrency(v)}
                centerLabel="ingresos"
              />
            </Panel>
          </div>

          {/* --- Fila · Stripe + refunds (2 tarjetas n2) --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard
              label="Fee de Stripe"
              value={formatCurrency(stripeFeeAbs)}
              momIsGoodWhenPositive={false}
              subValues={[
                { label: "% s/ ingresos", value: formatPercent(stripeFeePct) },
              ]}
            />
            <KpiCard
              label="Importe refunds"
              value={formatCurrency(importeRefunds)}
              momIsGoodWhenPositive={false}
              subValues={[
                { label: "Nº refunds", value: formatNumber(refundsNum) },
              ]}
            />
          </div>

          {/* --- Fila · Pedidos + AOV + acumulado --- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Pedidos"
              value={formatNumber(pedidos)}
              mom={getMoMAtMonth(kpi, "pedidos", activeMonth)}
            />
            <KpiCard
              label="AOV"
              value={formatCurrency(aov)}
              mom={getMoMAtMonth(kpi, "AOV", activeMonth)}
            />
            <KpiCard
              label="AOV nuevos"
              value={formatCurrency(aovNuevos)}
              mom={getMoMAtMonth(kpi, "AOV_nuevos", activeMonth)}
            />
            <KpiCard
              label="Ingresos acumulados"
              value={formatCurrency(ingresosAcumulados)}
            />
          </div>

          {/* --- Gráfico · mix de ingresos por línea de negocio --- */}
          <Panel
            title="Mix de ingresos por línea de negocio"
            description="Composición mensual apilada: B2C neto, B2B y Oritalk."
            action={<RangeFilter value={mixRange} onChange={setMixRange} />}
          >
            <StackedBarChart
              data={mixRows}
              keys={["B2C neto", "B2B", "Oritalk"]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          {/* --- Gráfico · ingresos por canal --- */}
          <Panel
            title="Ingresos por canal"
            description="Barras apiladas: ingresos por canal (Google, Meta y otros = resto no atribuido a Google/Meta)."
            action={<RangeFilter value={canalRange} onChange={setCanalRange} />}
          >
            <StackedBarChart
              data={canalRows}
              keys={["ingresos_google", "ingresos_meta", "ingresos_otros"]}
              colors={[C.googleBar, C.metaBar, C.otrosBar]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          {/* --- Gráfico · pedidos nuevos vs recurrentes + recurrent_rate --- */}
          <Panel
            title="Pedidos: nuevos vs. recurrentes"
            description="Pedidos nuevos + recurrentes (apilados, eje izq.) con la tasa de recurrencia como línea (%) sobre eje derecho."
            action={<RangeFilter value={pedRange} onChange={setPedRange} />}
          >
            <ComposedBarLineChart
              data={pedidosRows}
              stacked
              /* Recharts apila en orden de declaración: el primero abajo. Para
                 que "nuevos" quede ARRIBA, va declarado último. */
              bars={[
                { key: "pedidos_recurrentes", label: "Pedidos recurrentes", color: "#1e9e3a" },
                { key: "pedidos_nuevos", label: "Pedidos nuevos", color: "#ffc400" },
              ]}
              line={{ key: "recurrent_rate", label: "Tasa de recurrencia", color: "#143a24" }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatPercent(v)}
            />
          </Panel>

          {/* --- Gráfico · AOV vs AOV nuevos --- */}
          <Panel
            title="Ticket medio (AOV) vs. AOV de nuevos"
            description="Evolución mensual del ticket medio general y el de clientes nuevos, ambos en €."
            action={<RangeFilter value={aovRange} onChange={setAovRange} />}
          >
            <MultiTrendChart
              data={aovRows}
              series={[
                { key: "AOV", label: "AOV", color: "#1e9e3a" },
                { key: "AOV_nuevos", label: "AOV nuevos", color: "#ffc400" },
              ]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
