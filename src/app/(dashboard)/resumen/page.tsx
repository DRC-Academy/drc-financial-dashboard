"use client";

import { useLiveData } from "@/hooks/useLiveData";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { KpiCard } from "@/components/ui/KpiCard";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getLatest,
  getMoM,
  getSemaforo,
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
  const hasAnyData = kpi.months.length > 0;

  const ingresos = getLatest(kpi, "ingresos_netos");
  const mrr = getLatest(kpi, "MRR");
  const mrrNet = getLatest(kpi, "MRR_net");
  const mrrMoM = getLatest(kpi, "MRR_MoM");
  const churn = getLatest(kpi, "clientes_churn");
  const retention = getLatest(kpi, "retention_rate");
  const ltv = getLatest(kpi, "LTV");
  const cac = getLatest(kpi, "CAC");
  const ltvCac = getLatest(kpi, "LTV_CAC");
  const roiMarketing = getLatest(kpi, "ROI_marketing");

  const cacObj = getLatest(kpi, "CAC_obj");
  const ltvObj = getLatest(kpi, "LTV_obj");
  const churnObj = getLatest(kpi, "churn_obj");

  const roiGoogle = getLatest(kpi, "ROI_google");
  const roiMeta = getLatest(kpi, "ROI_meta");

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
        description="Últimos valores disponibles en el Sheet, con variación mes a mes y semáforo contra objetivo."
        right={<LiveIndicator fetchedAt={fetchedAt} error={error} />}
      />

      {loading && !hasAnyData && (
        <div className="text-sm text-drc-ink-soft">Cargando datos del Sheet…</div>
      )}

      {!loading && !hasAnyData && (
        <EmptyState label='No se encontraron datos en la hoja "DB_KPI". Verificá el Sheet ID y las credenciales.' />
      )}

      {hasAnyData && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard
              label="Ingresos netos"
              value={formatCurrency(ingresos)}
              mom={getMoM(kpi, "ingresos_netos")}
            />
            <KpiCard label="MRR" value={formatCurrency(mrr)} mom={getMoM(kpi, "MRR")} />
            <KpiCard
              label="MRR neto"
              value={formatCurrency(mrrNet)}
              mom={getMoM(kpi, "MRR_net")}
            />
            <KpiCard
              label="MRR MoM"
              value={mrrMoM !== null ? formatPercent(mrrMoM) : "—"}
            />
            <KpiCard
              label="Clientes en churn"
              value={formatNumber(churn)}
              mom={getMoM(kpi, "clientes_churn")}
              momIsGoodWhenPositive={false}
              semaforo={getSemaforo(churn, churnObj, true)}
              hint={churnObj !== null ? `Objetivo: ${formatNumber(churnObj)}` : undefined}
            />
            <KpiCard
              label="Retención"
              value={formatPercent(retention)}
              mom={getMoM(kpi, "retention_rate")}
            />
            <KpiCard
              label="LTV"
              value={formatCurrency(ltv)}
              mom={getMoM(kpi, "LTV")}
              semaforo={getSemaforo(ltv, ltvObj, false)}
              hint={ltvObj !== null ? `Objetivo: ${formatCurrency(ltvObj)}` : undefined}
            />
            <KpiCard
              label="CAC"
              value={formatCurrency(cac)}
              mom={getMoM(kpi, "CAC")}
              momIsGoodWhenPositive={false}
              semaforo={getSemaforo(cac, cacObj, true)}
              hint={cacObj !== null ? `Objetivo: ${formatCurrency(cacObj)}` : undefined}
            />
            <KpiCard
              label="LTV : CAC"
              value={ltvCac !== null ? `${formatNumber(ltvCac)}x` : "—"}
              mom={getMoM(kpi, "LTV_CAC")}
            />
            <KpiCard
              label="ROI marketing"
              value={formatPercent(roiMarketing)}
              mom={getMoM(kpi, "ROI_marketing")}
            />
          </div>

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
