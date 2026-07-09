"use client";

import { useMemo, useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { TrendChart } from "@/components/ui/TrendChart";
import { CohortHeatmap } from "@/components/ui/CohortHeatmap";
import { RankedBars } from "@/components/ui/RankedBars";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getLatest,
  getLatestAbs,
  getMoM,
  getMoMAbs,
  getLtvCacSeries,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/kpiHelpers";
import type { CancelacionRow, CohortData, CuponRow, DBKpiData } from "@/types/kpi";

export default function RetencionPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
  const cohortes = useLiveData<CohortData>(
    "/api/cohortes?tipo=clientes",
    60_000
  );
  const cancelaciones = useLiveData<CancelacionRow[]>(
    "/api/relaciones?tipo=cancelaciones",
    60_000
  );
  const cupones = useLiveData<CuponRow[]>("/api/relaciones?tipo=cupones", 60_000);
  const [range, setRange] = useState(6);

  const kpi = data ?? { months: [], keys: [], data: {} };
  const hasAnyData = kpi.months.length > 0;

  const clientesActivos = getLatest(kpi, "clientes_activos");
  const clientesNuevos = getLatest(kpi, "clientes_nuevos");
  const clientesPerdidos = getLatestAbs(kpi, "clientes_perdidos");
  const retention = getLatest(kpi, "retention_rate");
  const churn3m = getLatest(kpi, "clientes_churn_3m");
  const arpc = getLatest(kpi, "ARPC");
  const ltvChurn = getLatest(kpi, "LTV_churn");
  const permanencia = getLatest(kpi, "permanencia");

  const ltvCacSeries = applyRange(getLtvCacSeries(kpi), range);

  const motivos = useMemo(() => {
    const rows = cancelaciones.data ?? [];
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const key = r.motivo || "Sin especificar";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([label, value]) => ({ label, value }));
  }, [cancelaciones.data]);

  const cuponRows = cupones.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="04 · Retención"
        title="Quién se queda, quién se va, y por qué"
        description="Cohortes, motivos de cancelación e impacto de cupones de retención."
        right={<LiveIndicator fetchedAt={fetchedAt} error={error} />}
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}
      {!loading && !hasAnyData && <EmptyState label="Sin datos de retención" />}

      {hasAnyData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Clientes activos"
              value={formatNumber(clientesActivos)}
              mom={getMoM(kpi, "clientes_activos")}
            />
            <KpiCard
              label="Nuevos"
              value={formatNumber(clientesNuevos)}
              mom={getMoM(kpi, "clientes_nuevos")}
            />
            <KpiCard
              label="Perdidos"
              value={formatNumber(clientesPerdidos)}
              mom={getMoMAbs(kpi, "clientes_perdidos")}
              momIsGoodWhenPositive={false}
            />
            <KpiCard
              label="Retención"
              value={formatPercent(retention)}
              mom={getMoM(kpi, "retention_rate")}
            />
            <KpiCard
              label="Churn 3M"
              value={formatPercent(churn3m)}
              momIsGoodWhenPositive={false}
            />
            <KpiCard label="ARPC" value={formatCurrency(arpc)} mom={getMoM(kpi, "ARPC")} />
            <KpiCard label="LTV en churn" value={formatCurrency(ltvChurn)} />
            <KpiCard
              label="Permanencia media"
              value={permanencia !== null ? `${formatNumber(permanencia)} m` : "—"}
            />
          </div>

          <Panel
            title="Cohortes de clientes"
            description="Retención por cohorte a lo largo de los meses de vida"
          >
            <CohortHeatmap data={cohortes.data ?? { cohorts: [], monthsOfLife: [] }} />
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Motivos de cancelación" description="Conteo por motivo declarado">
              <RankedBars items={motivos} color="#d6483c" />
            </Panel>
            <Panel
              title="LTV : CAC en el tiempo"
              action={<RangeFilter value={range} onChange={setRange} />}
            >
              <TrendChart
                data={ltvCacSeries}
                color="#1e9e3a"
                valueFormatter={(v) => `${v}x`}
              />
            </Panel>
          </div>

          <Panel
            title="Impacto de cupones de retención"
            description="Últimos cupones aplicados en el flujo anticancelaciones"
          >
            {cuponRows.length === 0 ? (
              <EmptyState label='Sin datos en la hoja "Cupon"' />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-drc-ink-soft border-b border-drc-line">
                      <th className="py-2 pr-4 font-medium">Fecha</th>
                      <th className="py-2 pr-4 font-medium">Cupón</th>
                      <th className="py-2 pr-4 font-medium">Suscripción</th>
                      <th className="py-2 font-medium">Impacto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuponRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-drc-line/60">
                        <td className="py-2 pr-4 tabular text-drc-ink-soft">
                          {row.fecha ?? "—"}
                        </td>
                        <td className="py-2 pr-4">{row.cupon || "—"}</td>
                        <td className="py-2 pr-4 tabular">{row.suscripcion || "—"}</td>
                        <td className="py-2">{row.impacto || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
