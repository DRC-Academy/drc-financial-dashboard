"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { ComposedBarLineChart } from "@/components/ui/ComposedBarLineChart";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getValueAtMonth,
  getMoMAtMonth,
  getSemaforo,
  getRoiCanalLatest,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/kpiHelpers";
import type { DBKpiData } from "@/types/kpi";

export default function ResumenPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );

  const kpi = data ?? { months: [], keys: [], data: {} };
  const months = kpi.months;
  const hasAnyData = months.length > 0;

  // Desplegable de mes: controla SOLO las tarjetas KPI. Si no hay elección
  // válida, cae al último mes disponible.
  const [monthChoice, setMonthChoice] = useState<string>("");
  const activeMonth =
    monthChoice && months.includes(monthChoice)
      ? monthChoice
      : months[months.length - 1] ?? "";

  // Rangos independientes por gráfico (no afectan las tarjetas).
  const [ingRange, setIngRange] = useState(0);
  const [pedRange, setPedRange] = useState(0);
  const [cliRange, setCliRange] = useState(0);

  // ---- Tarjetas destacadas ----
  const ingresos = getValueAtMonth(kpi, "ingresos_netos", activeMonth);

  const b2c = getValueAtMonth(kpi, "ingresos_B2C_netos", activeMonth);
  const b2b = getValueAtMonth(kpi, "ingresos_B2B", activeMonth);
  // "ingresos_DRC" = B2C neto + B2B. No es columna del Sheet: se suma acá.
  const drcAcademy = b2c === null && b2b === null ? null : (b2c ?? 0) + (b2b ?? 0);

  // ingresos_oritalk a veces viene como "" en el Sheet → el parser ya lo pasa a
  // null, así que formatCurrency(null) muestra "—" sin romperse.
  const oritalk = getValueAtMonth(kpi, "ingresos_oritalk", activeMonth);

  // ---- Tarjetas normales ----
  const churn = getValueAtMonth(kpi, "clientes_churn", activeMonth);
  const churnObj = getValueAtMonth(kpi, "churn_obj", activeMonth);
  const cac = getValueAtMonth(kpi, "CAC", activeMonth);
  const cacObj = getValueAtMonth(kpi, "CAC_obj", activeMonth);
  const ltv = getValueAtMonth(kpi, "LTV", activeMonth);
  const ltvObj = getValueAtMonth(kpi, "LTV_obj", activeMonth);

  // LTV:CAC del mes elegido (la columna LTV_CAC del Sheet está rota → se calcula).
  const ltvCac = ltv !== null && cac !== null && cac !== 0 ? ltv / cac : null;

  // ---- Gráficos (usan su propio rango, sobre el dataset completo) ----
  const ingresosMrrSeries = applyRange(months, ingRange).map((month) => ({
    month,
    ingresos_netos: kpi.data[month]?.["ingresos_netos"] ?? null,
    MRR: kpi.data[month]?.["MRR"] ?? null,
  }));

  const pedidosAovRows = applyRange(months, pedRange).map((month) => ({
    month,
    pedidos_nuevos: kpi.data[month]?.["pedidos_nuevos"] ?? null,
    pedidos_recurrentes: kpi.data[month]?.["pedidos_recurrentes"] ?? null,
    AOV: kpi.data[month]?.["AOV"] ?? null,
  }));

  const clientesRows = applyRange(months, cliRange).map((month) => {
    const perdidos = kpi.data[month]?.["clientes_perdidos"] ?? null;
    return {
      month,
      clientes_nuevos: kpi.data[month]?.["clientes_nuevos"] ?? null,
      clientes_recurrentes: kpi.data[month]?.["clientes_recurrentes"] ?? null,
      // clientes_perdidos viene en negativo (convención de "pérdida"): magnitud.
      clientes_perdidos: perdidos === null ? null : Math.abs(perdidos),
      retention_rate: kpi.data[month]?.["retention_rate"] ?? null,
    };
  });

  // ---- Oportunidad del mes (mejor canal por ROI del último mes) ----
  const roiGoogle = getRoiCanalLatest(kpi, "google");
  const roiMeta = getRoiCanalLatest(kpi, "meta");
  let mejorCanal: string | null = null;
  if (roiGoogle !== null && roiMeta !== null) {
    mejorCanal = roiGoogle >= roiMeta ? "Google Ads" : "Meta Ads";
  } else if (roiGoogle !== null) {
    mejorCanal = "Google Ads";
  } else if (roiMeta !== null) {
    mejorCanal = "Meta Ads";
  }

  return (
    <>
      <PageHeader
        eyebrow="01 · Resumen ejecutivo"
        title="Cómo está el negocio, de un vistazo"
        description="Elegí el mes para las tarjetas KPI; cada gráfico tiene su propio rango temporal."
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

      {!loading && !hasAnyData && (
        <EmptyState label='No se encontraron datos en la hoja "DB_KPI". Verificá el Sheet ID y las credenciales.' />
      )}

      {hasAnyData && (
        <div className="space-y-6">
          {/* Fila destacada: ingresos netos (1.5x) + DRC Academy + Oritalk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr] gap-4">
            <KpiCard
              size="lg"
              label="Ingresos netos"
              value={formatCurrency(ingresos)}
              mom={getMoMAtMonth(kpi, "ingresos_netos", activeMonth)}
            />
            <KpiCard label="DRC Academy" value={formatCurrency(drcAcademy)}>
              <div className="flex gap-4 text-[11px] text-drc-ink-soft">
                <span>
                  B2C:{" "}
                  <span className="tabular text-drc-ink font-medium">
                    {formatCurrency(b2c)}
                  </span>
                </span>
                <span>
                  B2B:{" "}
                  <span className="tabular text-drc-ink font-medium">
                    {formatCurrency(b2b)}
                  </span>
                </span>
              </div>
            </KpiCard>
            <KpiCard
              label="Oritalk"
              value={formatCurrency(oritalk)}
              mom={getMoMAtMonth(kpi, "ingresos_oritalk", activeMonth)}
            />
          </div>

          {/* Resto de tarjetas en grilla normal */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            <KpiCard
              label="MRR"
              value={formatCurrency(getValueAtMonth(kpi, "MRR", activeMonth))}
              mom={getMoMAtMonth(kpi, "MRR", activeMonth)}
            />
            <KpiCard
              label="MRR neto"
              value={formatCurrency(getValueAtMonth(kpi, "MRR_net", activeMonth))}
              mom={getMoMAtMonth(kpi, "MRR_net", activeMonth)}
            />
            <KpiCard
              label="MRR MoM"
              value={formatPercent(getValueAtMonth(kpi, "MRR_MoM", activeMonth))}
            />
            <KpiCard
              label="Suscripciones activas"
              value={formatNumber(
                getValueAtMonth(kpi, "suscripciones_activas", activeMonth)
              )}
              mom={getMoMAtMonth(kpi, "suscripciones_activas", activeMonth)}
            />
            <KpiCard
              label="Clientes en churn"
              value={formatPercent(churn)}
              mom={getMoMAtMonth(kpi, "clientes_churn", activeMonth)}
              momIsGoodWhenPositive={false}
              semaforo={getSemaforo(churn, churnObj, true)}
              hint={churnObj !== null ? `Objetivo: ${formatPercent(churnObj)}` : undefined}
            />
            <KpiCard
              label="Retención"
              value={formatPercent(getValueAtMonth(kpi, "retention_rate", activeMonth))}
              mom={getMoMAtMonth(kpi, "retention_rate", activeMonth)}
            />
            <KpiCard
              label="CPL Ads"
              value={formatCurrency(getValueAtMonth(kpi, "CPL_ads", activeMonth))}
              mom={getMoMAtMonth(kpi, "CPL_ads", activeMonth)}
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              label="CAC"
              value={formatCurrency(cac)}
              mom={getMoMAtMonth(kpi, "CAC", activeMonth)}
              momIsGoodWhenPositive={false}
              semaforo={getSemaforo(cac, cacObj, true)}
              hint={cacObj !== null ? `Objetivo: ${formatCurrency(cacObj)}` : undefined}
            />
            <KpiCard
              label="AOV nuevos"
              value={formatCurrency(getValueAtMonth(kpi, "AOV_nuevos", activeMonth))}
              mom={getMoMAtMonth(kpi, "AOV_nuevos", activeMonth)}
            />
            <KpiCard
              label="Ventas Hugo"
              value={formatNumber(getValueAtMonth(kpi, "ventas_hugo", activeMonth))}
              mom={getMoMAtMonth(kpi, "ventas_hugo", activeMonth)}
            />
            <KpiCard
              label="LTV"
              value={formatCurrency(ltv)}
              mom={getMoMAtMonth(kpi, "LTV", activeMonth)}
              semaforo={getSemaforo(ltv, ltvObj, false)}
              hint={ltvObj !== null ? `Objetivo: ${formatCurrency(ltvObj)}` : undefined}
            />
            <KpiCard
              label="LTV : CAC"
              value={ltvCac !== null ? `${formatNumber(ltvCac)}x` : "—"}
            />
            <KpiCard
              label="ROI marketing"
              value={formatPercent(getValueAtMonth(kpi, "ROI_marketing", activeMonth))}
              mom={getMoMAtMonth(kpi, "ROI_marketing", activeMonth)}
            />
          </div>

          <Panel
            title="Ingresos netos y MRR en el tiempo"
            description="Evolución conjunta sobre la misma línea temporal."
            action={<RangeFilter value={ingRange} onChange={setIngRange} />}
          >
            <MultiTrendChart
              data={ingresosMrrSeries}
              series={[
                { key: "ingresos_netos", label: "Ingresos netos", color: "#1e9e3a" },
                { key: "MRR", label: "MRR", color: "#ffc400" },
              ]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          <Panel
            title="Pedidos y ticket medio (AOV)"
            description="Pedidos nuevos + recurrentes (apilados, eje izq.) y AOV como línea sobre eje derecho en € — escalas distintas, por eso el eje dual."
            action={<RangeFilter value={pedRange} onChange={setPedRange} />}
          >
            <ComposedBarLineChart
              data={pedidosAovRows}
              stacked
              bars={[
                { key: "pedidos_nuevos", label: "Pedidos nuevos", color: "#ffc400" },
                { key: "pedidos_recurrentes", label: "Pedidos recurrentes", color: "#1e9e3a" },
              ]}
              line={{ key: "AOV", label: "AOV", color: "#143a24" }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          <Panel
            title="Movimiento de clientes y retención"
            description="Altas, recurrentes y perdidos (magnitud, eje izq.) con la tasa de retención como línea (%) sobre eje derecho."
            action={<RangeFilter value={cliRange} onChange={setCliRange} />}
          >
            <ComposedBarLineChart
              data={clientesRows}
              bars={[
                { key: "clientes_nuevos", label: "Nuevos", color: "#1e9e3a" },
                { key: "clientes_recurrentes", label: "Recurrentes", color: "#8bbf9f" },
                { key: "clientes_perdidos", label: "Perdidos", color: "#d6483c" },
              ]}
              line={{ key: "retention_rate", label: "Retención", color: "#143a24" }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatPercent(v)}
            />
          </Panel>

          <Panel
            title="Oportunidad del mes"
            description="Mejor canal de adquisición según ROI del último mes disponible."
          >
            {mejorCanal ? (
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-xs text-drc-ink-soft">Canal recomendado</div>
                  <div className="text-lg font-semibold text-drc-green">
                    {mejorCanal}
                  </div>
                </div>
                <div className="flex gap-8">
                  <div>
                    <div className="text-xs text-drc-ink-soft">ROI Google</div>
                    <div className="tabular text-sm font-medium">
                      {roiGoogle !== null ? formatPercent(roiGoogle) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-drc-ink-soft">ROI Meta</div>
                    <div className="tabular text-sm font-medium">
                      {roiMeta !== null ? formatPercent(roiMeta) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState label="Faltan ROI_google / ROI_meta en el Sheet" />
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
