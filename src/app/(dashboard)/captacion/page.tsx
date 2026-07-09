"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { TrendChart } from "@/components/ui/TrendChart";
import { BarComparison } from "@/components/ui/BarComparison";
import { FunnelSteps } from "@/components/ui/FunnelSteps";
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

export default function CaptacionPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
  const [range, setRange] = useState(6);

  const kpi = data ?? { months: [], keys: [], data: {} };
  const hasAnyData = kpi.months.length > 0;

  const leadsTotales = getLatest(kpi, "leads_totales_ads");
  const cpl = getLatest(kpi, "CPL_ads");
  const cac = getLatest(kpi, "CAC");
  const cacBlended = getLatest(kpi, "CAC_blended");
  const crClientes = getLatest(kpi, "CR_clientes");
  const time2close = getLatest(kpi, "time_2_close");
  const roiCapt = getLatest(kpi, "ROI_capt");
  const roasNew = getLatest(kpi, "ROAS_new");

  const months = applyRange(kpi.months, range);

  const cplSeries = applyRange(getSeries(kpi, "CPL_ads"), range);
  const cacSeries = applyRange(getSeries(kpi, "CAC"), range);

  const canalComparison = months.map((month) => ({
    month,
    ROI_google: kpi.data[month]?.["ROI_google"] ?? null,
    ROI_meta: kpi.data[month]?.["ROI_meta"] ?? null,
  }));

  const leadsGoogle = getLatest(kpi, "leads_ads_google");
  const ventasGoogle = getLatest(kpi, "ventas_google");
  const leadsMeta = getLatest(kpi, "leads_ads_meta");
  const ventasMeta = getLatest(kpi, "ventas_meta");

  return (
    <>
      <PageHeader
        eyebrow="02 · Captación"
        title="De dónde vienen los alumnos y a qué costo"
        description="Funnel lead → venta y comparativa Google Ads vs Meta Ads."
        right={<LiveIndicator fetchedAt={fetchedAt} error={error} />}
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}
      {!loading && !hasAnyData && <EmptyState label="Sin datos de captación" />}

      {hasAnyData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Leads totales (ads)"
              value={formatNumber(leadsTotales)}
              mom={getMoM(kpi, "leads_totales_ads")}
            />
            <KpiCard
              label="CPL ads"
              value={formatCurrency(cpl)}
              mom={getMoM(kpi, "CPL_ads")}
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              label="CAC"
              value={formatCurrency(cac)}
              mom={getMoM(kpi, "CAC")}
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              label="CAC blended"
              value={formatCurrency(cacBlended)}
              mom={getMoM(kpi, "CAC_blended")}
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              label="CR a cliente"
              value={formatPercent(crClientes)}
              mom={getMoM(kpi, "CR_clientes")}
            />
            <KpiCard
              label="Tiempo a cierre"
              value={time2close !== null ? `${formatNumber(time2close)} d` : "—"}
            />
            <KpiCard
              label="ROI captación"
              value={formatPercent(roiCapt)}
              mom={getMoM(kpi, "ROI_capt")}
            />
            <KpiCard
              label="ROAS nuevos"
              value={roasNew !== null ? `${formatNumber(roasNew)}x` : "—"}
              mom={getMoM(kpi, "ROAS_new")}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Funnel Google Ads" description="Lead → venta">
              <FunnelSteps
                steps={[
                  { label: "Leads Google", value: leadsGoogle },
                  { label: "Ventas Google", value: ventasGoogle },
                ]}
              />
            </Panel>
            <Panel title="Funnel Meta Ads" description="Lead → venta">
              <FunnelSteps
                steps={[
                  { label: "Leads Meta", value: leadsMeta },
                  { label: "Ventas Meta", value: ventasMeta },
                ]}
              />
            </Panel>
          </div>

          <Panel
            title="Google vs Meta — ROI"
            description="Comparativa mensual del retorno de cada canal"
            action={<RangeFilter value={range} onChange={setRange} />}
          >
            <BarComparison
              data={canalComparison}
              series={[
                { key: "ROI_google", label: "Google", color: "#1e9e3a" },
                { key: "ROI_meta", label: "Meta", color: "#ffc400" },
              ]}
              valueFormatter={(v) => `${v}%`}
            />
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="CPL en el tiempo">
              <TrendChart
                data={cplSeries}
                color="#1e9e3a"
                valueFormatter={(v) => formatCurrency(v)}
              />
            </Panel>
            <Panel title="CAC en el tiempo">
              <TrendChart
                data={cacSeries}
                color="#d6483c"
                valueFormatter={(v) => formatCurrency(v)}
              />
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
