"use client";

import { useMemo, useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { TrendChart } from "@/components/ui/TrendChart";
import { DualAxisChart } from "@/components/ui/DualAxisChart";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  filterKpi,
  filterMonths,
  DEFAULT_FILTER,
  type DateFilter,
} from "@/lib/dateFilter";
import {
  getLatest,
  getMoM,
  getSemaforo,
  getSeries,
  getLtvCacLatest,
  getLtvCacMoM,
  formatCurrency,
  formatNumber,
} from "@/lib/kpiHelpers";
import type { DBKpiData } from "@/types/kpi";
import type { GastosData } from "@/lib/gastos";

export default function FinancieraPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
  const gastos = useLiveData<GastosData>("/api/gastos", 60_000);
  const [filter, setFilter] = useState<DateFilter>(DEFAULT_FILTER);

  const kpiAll = data ?? { months: [], keys: [], data: {} };
  const hasAnyData = kpiAll.months.length > 0;

  const visibleMonths = useMemo(
    () => filterMonths(kpiAll.months, filter),
    [kpiAll, filter]
  );
  const kpi = useMemo(
    () => filterKpi(kpiAll, visibleMonths),
    [kpiAll, visibleMonths]
  );

  const arpc = getLatest(kpi, "ARPC");
  const ltv = getLatest(kpi, "LTV");
  const cac = getLatest(kpi, "CAC");
  const ltvCac = getLtvCacLatest(kpi);
  const nmEbitda = getLatest(kpi, "NM_ebitda");
  const ingresosAcumulados = getLatest(kpi, "ingresos_acumulados");
  const clientesAcumulados = getLatest(kpi, "clientes_acumulados");

  const cacObj = getLatest(kpi, "CAC_obj");
  const ltvObj = getLatest(kpi, "LTV_obj");

  const ingresosAcumSeries = getSeries(kpi, "ingresos_acumulados");
  const clientesAcumSeries = getSeries(kpi, "clientes_acumulados");

  const acumComparado = kpi.months.map((month) => ({
    month,
    left: kpi.data[month]?.["ingresos_acumulados"] ?? null,
    right: kpi.data[month]?.["clientes_acumulados"] ?? null,
  }));

  const gastosData = gastos.data;
  const gastosTotal = gastosData?.categorias.reduce((s, c) => s + c.monto, 0) ?? 0;
  const maxGasto = Math.max(...(gastosData?.categorias.map((c) => c.monto) ?? [1]), 1);

  return (
    <>
      <PageHeader
        eyebrow="05 · Situación financiera"
        title="La foto financiera completa"
        description="Unit economics, acumulados y estructura de gastos."
        right={<LiveIndicator fetchedAt={fetchedAt} error={error} />}
        filter={
          hasAnyData ? (
            <DateRangeFilter
              months={kpiAll.months}
              filter={filter}
              onChange={setFilter}
            />
          ) : undefined
        }
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}
      {!loading && !hasAnyData && <EmptyState label="Sin datos financieros" />}

      {hasAnyData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="ARPC" value={formatCurrency(arpc)} mom={getMoM(kpi, "ARPC")} />
            <KpiCard
              label="LTV"
              value={formatCurrency(ltv)}
              mom={getMoM(kpi, "LTV")}
              semaforo={getSemaforo(ltv, ltvObj, false)}
            />
            <KpiCard
              label="CAC"
              value={formatCurrency(cac)}
              mom={getMoM(kpi, "CAC")}
              momIsGoodWhenPositive={false}
              semaforo={getSemaforo(cac, cacObj, true)}
            />
            <KpiCard
              label="LTV : CAC"
              value={ltvCac !== null ? `${formatNumber(ltvCac)}x` : "—"}
              mom={getLtvCacMoM(kpi)}
            />
            <KpiCard
              label="Margen neto (EBITDA)"
              value={nmEbitda !== null ? `${formatNumber(nmEbitda)}%` : "—"}
              mom={getMoM(kpi, "NM_ebitda")}
            />
            <KpiCard label="Ingresos acumulados" value={formatCurrency(ingresosAcumulados)} />
            <KpiCard label="Clientes acumulados" value={formatNumber(clientesAcumulados)} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Ingresos acumulados">
              <TrendChart
                data={ingresosAcumSeries}
                color="#1e9e3a"
                valueFormatter={(v) => formatCurrency(v)}
              />
            </Panel>
            <Panel title="Clientes acumulados">
              <TrendChart data={clientesAcumSeries} color="#143a24" />
            </Panel>
          </div>

          <Panel
            title="Ingresos vs. clientes acumulados"
            description="Relación entre el crecimiento de la base de clientes y los ingresos (ejes duales)."
          >
            <DualAxisChart
              data={acumComparado}
              left={{
                label: "Ingresos acumulados",
                color: "#1e9e3a",
                valueFormatter: (v) => formatCurrency(v),
              }}
              right={{
                label: "Clientes acumulados",
                color: "#143a24",
                valueFormatter: (v) => formatNumber(v),
              }}
            />
          </Panel>

          <Panel
            title="Estructura de gastos"
            description={
              gastosData?.esPlaceholder
                ? "Módulo desacoplado y listo — placeholder hasta conectar la API interna de gastos."
                : undefined
            }
          >
            {!gastosData || gastosData.categorias.length === 0 ? (
              <EmptyState label="Sin datos de gastos" />
            ) : (
              <>
                {gastosData.esPlaceholder && (
                  <div className="mb-4 rounded-lg border border-drc-yellow/40 bg-drc-yellow/10 px-3 py-2 text-xs text-drc-ink">
                    Estos valores son un placeholder (todos en 0€). Cuando el
                    software propio de gestión exponga gastos operativos, este
                    panel se conecta reemplazando <code className="tabular">readGastos()</code>{" "}
                    en <code className="tabular">src/lib/gastos.ts</code> — la UI no cambia.
                  </div>
                )}
                <div className="space-y-2.5">
                  {gastosData.categorias.map((cat) => (
                    <div key={cat.nombre}>
                      <div className="flex items-baseline justify-between text-xs mb-1">
                        <span className="text-drc-ink">{cat.nombre}</span>
                        <span className="tabular text-drc-ink-soft">
                          {formatCurrency(cat.monto)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-drc-bg overflow-hidden">
                        <div
                          className="h-full rounded-full bg-drc-green-deep"
                          style={{ width: `${(cat.monto / maxGasto) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-drc-line flex justify-between text-sm font-medium">
                    <span>Total</span>
                    <span className="tabular">{formatCurrency(gastosTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
