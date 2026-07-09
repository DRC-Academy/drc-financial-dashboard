"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { TrendChart } from "@/components/ui/TrendChart";
import { BarComparison } from "@/components/ui/BarComparison";
import { StackedBarChart } from "@/components/ui/StackedBarChart";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getLatest,
  getMoM,
  getSeries,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/kpiHelpers";
import type { DBKpiData } from "@/types/kpi";
import type { ProductoKpiData } from "@/lib/productoKpi";

export default function IngresosPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
  const producto = useLiveData<ProductoKpiData>("/api/producto-kpi", 60_000);
  const [range, setRange] = useState(6);

  const kpi = data ?? { months: [], keys: [], data: {} };
  const hasAnyData = kpi.months.length > 0;
  const months = applyRange(kpi.months, range);

  const ingresosNetos = getLatest(kpi, "ingresos_netos");
  const ingresosB2C = getLatest(kpi, "ingresos_B2C_netos");
  const ingresosB2B = getLatest(kpi, "ingresos_B2B");
  const ingresosNuevos = getLatest(kpi, "ingresos_nuevos");
  const ingresosAcumulados = getLatest(kpi, "ingresos_acumulados");
  const stripeFeePct = getLatest(kpi, "%_stripe_fee");
  const pedidos = getLatest(kpi, "pedidos");
  const aov = getLatest(kpi, "AOV");

  const ingresosSeries = applyRange(getSeries(kpi, "ingresos_netos"), range);
  const acumuladosSeries = applyRange(getSeries(kpi, "ingresos_acumulados"), range);

  const nuevosVsTotal = months.map((month) => ({
    month,
    ingresos_nuevos: kpi.data[month]?.["ingresos_nuevos"] ?? null,
    ingresos_netos: kpi.data[month]?.["ingresos_netos"] ?? null,
  }));

  const pedidosComparison = months.map((month) => ({
    month,
    pedidos_nuevos: kpi.data[month]?.["pedidos_nuevos"] ?? null,
    pedidos_recurrentes: kpi.data[month]?.["pedidos_recurrentes"] ?? null,
  }));

  const productoData = producto.data ?? { months: [], productos: [], data: {} };
  const productoMonths = applyRange(productoData.months, range);
  const productoRows = productoMonths.map((month) => ({
    month,
    ...(productoData.data[month] ?? {}),
  }));

  return (
    <>
      <PageHeader
        eyebrow="03 · Ingresos"
        title="Cuánto entra, y de dónde"
        description="Ingresos netos, mix de producto y composición nuevos vs. recurrentes."
        right={<LiveIndicator fetchedAt={fetchedAt} error={error} />}
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}
      {!loading && !hasAnyData && <EmptyState label="Sin datos de ingresos" />}

      {hasAnyData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Ingresos netos"
              value={formatCurrency(ingresosNetos)}
              mom={getMoM(kpi, "ingresos_netos")}
            />
            <KpiCard
              label="B2C netos"
              value={formatCurrency(ingresosB2C)}
              mom={getMoM(kpi, "ingresos_B2C_netos")}
            />
            <KpiCard
              label="B2B"
              value={formatCurrency(ingresosB2B)}
              mom={getMoM(kpi, "ingresos_B2B")}
            />
            <KpiCard
              label="Ingresos nuevos"
              value={formatCurrency(ingresosNuevos)}
              mom={getMoM(kpi, "ingresos_nuevos")}
            />
            <KpiCard
              label="Acumulado"
              value={formatCurrency(ingresosAcumulados)}
            />
            <KpiCard
              label="Fee Stripe"
              value={stripeFeePct !== null ? formatPercent(stripeFeePct) : "—"}
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              label="Pedidos"
              value={formatNumber(pedidos)}
              mom={getMoM(kpi, "pedidos")}
            />
            <KpiCard label="AOV" value={formatCurrency(aov)} mom={getMoM(kpi, "AOV")} />
          </div>

          <Panel
            title="Ingresos netos en el tiempo"
            action={<RangeFilter value={range} onChange={setRange} />}
          >
            <TrendChart
              data={ingresosSeries}
              color="#1e9e3a"
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Nuevos vs. total" description="Ingresos nuevos frente al total del mes">
              <BarComparison
                data={nuevosVsTotal}
                series={[
                  { key: "ingresos_nuevos", label: "Nuevos", color: "#ffc400" },
                  { key: "ingresos_netos", label: "Total neto", color: "#1e9e3a" },
                ]}
                valueFormatter={(v) => formatCurrency(v)}
              />
            </Panel>
            <Panel title="Pedidos: nuevos vs. recurrentes">
              <BarComparison
                data={pedidosComparison}
                series={[
                  { key: "pedidos_nuevos", label: "Nuevos", color: "#ffc400" },
                  { key: "pedidos_recurrentes", label: "Recurrentes", color: "#1e9e3a" },
                ]}
              />
            </Panel>
          </div>

          <Panel
            title="Mix de producto"
            description='Evolución mensual por plan/horas, leído de la hoja "KPI Producto"'
          >
            <StackedBarChart
              data={productoRows}
              keys={productoData.productos}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          <Panel title="Ingresos acumulados">
            <TrendChart
              data={acumuladosSeries}
              color="#143a24"
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
