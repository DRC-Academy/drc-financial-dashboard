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
  getDeltaAtMonth,
  getSemaforo,
  getAlertaOperativa,
  getAlertaObjetivo,
  getRoiCanalLatest,
  CPL_LIMITE,
  CAC_LIMITE,
  CR_OBJETIVO,
  CR_LIMITE,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatNumberDelta,
  formatPercent,
} from "@/lib/kpiHelpers";
import {
  getBlock,
  rankAtMonth,
  EMPTY_PRODUCTO_KPI,
  type ProductoKpiData,
} from "@/lib/productoKpiHelpers";
import { CAT, GASTO, INGRESO, NEUTRO } from "@/lib/chartColors";
import type { DBKpiData } from "@/types/kpi";

/**
 * Pie de las tarjetas con umbral fijo: objetivo arriba, límite debajo. El
 * objetivo puede venir del Sheet (CPL_obj/CAC_obj/CR_obj); el límite es siempre
 * una constante de negocio (ver CPL_LIMITE y compañía en kpiHelpers).
 */
function ObjetivoLimite({
  objetivo,
  limite,
}: {
  objetivo: string | null;
  limite: string;
}) {
  return (
    <>
      {objetivo && <div>Objetivo: {objetivo}</div>}
      <div>Límite: {limite}</div>
    </>
  );
}

export default function ResumenPage() {
  const { data, loading, error, fetchedAt } = useLiveData<DBKpiData>(
    "/api/kpi",
    60_000
  );
  // Sólo para el bloque "Oportunidad del mes": el producto más vendido sale de
  // la hoja "KPI Producto" (misma fuente que la página Producto), no de DB_KPI.
  const producto = useLiveData<ProductoKpiData>("/api/producto-kpi", 60_000);

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

  // ---- Fila 1 · Ingresos ----
  const ingresos = getValueAtMonth(kpi, "ingresos_netos", activeMonth);
  const ingresosDelta = getDeltaAtMonth(kpi, "ingresos_netos", activeMonth);

  const b2c = getValueAtMonth(kpi, "ingresos_B2C_netos", activeMonth);
  const b2b = getValueAtMonth(kpi, "ingresos_B2B", activeMonth);
  // "DRC Academy" = B2C neto + B2B. No es columna del Sheet: se suma acá.
  const drcAcademy = b2c === null && b2b === null ? null : (b2c ?? 0) + (b2b ?? 0);

  // ---- Fila 2 · Pedidos ----
  const pedidos = getValueAtMonth(kpi, "pedidos", activeMonth);
  const pedidosDelta = getDeltaAtMonth(kpi, "pedidos", activeMonth);

  // ---- Fila 3 · MRR ----
  // MRR_MoM ya es la variación calculada en el Sheet, en fracción (0.053 = 5,3%)
  // igual que el resto de tasas → ×100 para el badge, que espera puntos.
  const mrrMoM = getValueAtMonth(kpi, "MRR_MoM", activeMonth);
  const suscActivas = getValueAtMonth(kpi, "suscripciones_activas", activeMonth);
  const suscActivasDelta = getDeltaAtMonth(
    kpi,
    "suscripciones_activas",
    activeMonth
  );
  const churn = getValueAtMonth(kpi, "clientes_churn", activeMonth);
  const churnObj = getValueAtMonth(kpi, "churn_obj", activeMonth);

  // ---- Fila 4 ----
  const arpc = getValueAtMonth(kpi, "ARPC", activeMonth);
  const ltv = getValueAtMonth(kpi, "LTV", activeMonth);
  const ltvObj = getValueAtMonth(kpi, "LTV_obj", activeMonth);
  const cpl = getValueAtMonth(kpi, "CPL_ads", activeMonth);
  const cplObj = getValueAtMonth(kpi, "CPL_obj", activeMonth);
  const cac = getValueAtMonth(kpi, "CAC", activeMonth);
  const cacObj = getValueAtMonth(kpi, "CAC_obj", activeMonth);
  const cr = getValueAtMonth(kpi, "CR_clientes", activeMonth);
  // CR sí tiene columna de objetivo en DB_KPI (CR_obj = 0,28), y coincide con
  // el umbral de "EN OBJETIVO" del sistema de alertas. Usamos la columna y
  // caemos a la constante sólo si el Sheet no la trae, para no inventar nada
  // ni duplicar el número.
  const crObj = getValueAtMonth(kpi, "CR_obj", activeMonth) ?? CR_OBJETIVO;

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

  // Producto más vendido = el nº 1 por INGRESOS del bloque "Ingresos" de la hoja
  // "KPI Producto" — el mismo criterio que la tarjeta "Más vendido (ingresos)"
  // de la página Producto, para que las dos no puedan discrepar. "KPI Producto"
  // tiene su propia lista de meses: si el mes elegido arriba no está en ella,
  // caemos a su mes más reciente (y no dejamos la ficha vacía por un desfase de
  // calendario entre hojas).
  const productoKpi = producto.data ?? EMPTY_PRODUCTO_KPI;
  const productoMonth = productoKpi.months.includes(activeMonth)
    ? activeMonth
    : productoKpi.months[productoKpi.months.length - 1] ?? "";
  const topProducto =
    rankAtMonth(getBlock(productoKpi, "Ingresos"), productoKpi.months, productoMonth)[0] ??
    null;

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
          {/*
            Filas 1-3 comparten una única grilla de 7 columnas para que la
            tarjeta titular (T, span 3) quede alineada a lo ancho en las tres:
            con grillas separadas los gaps distintos la desalinean unos píxeles.
          */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
            {/* --- Fila 1 · Ingresos --- */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Ingresos netos"
              value={formatCurrency(ingresos)}
              mom={getMoMAtMonth(kpi, "ingresos_netos", activeMonth)}
              subValues={[
                { label: "vs. mes anterior", value: formatCurrencyDelta(ingresosDelta) },
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
            {/* ingresos_oritalk: negocio paralelo, al lado de DRC Academy. */}
            <KpiCard
              className="lg:col-span-2"
              label="Oritalk"
              value={formatCurrency(getValueAtMonth(kpi, "ingresos_oritalk", activeMonth))}
              mom={getMoMAtMonth(kpi, "ingresos_oritalk", activeMonth)}
            />

            {/* --- Fila 2 · Pedidos --- */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="Pedidos"
              value={formatNumber(pedidos)}
              mom={getMoMAtMonth(kpi, "pedidos", activeMonth)}
              subValues={[
                { label: "vs. mes anterior", value: formatNumberDelta(pedidosDelta) },
              ]}
            />
            <KpiCard
              className="lg:col-span-2"
              label="AOV"
              value={formatCurrency(getValueAtMonth(kpi, "AOV", activeMonth))}
              mom={getMoMAtMonth(kpi, "AOV", activeMonth)}
            />
            {/* Columna "ventas": la de ventas_hugo NO existe en DB_KPI (la tarjeta
                vieja "Ventas Hugo" mostraba "—" siempre). "ventas" es la única
                columna de conteo de ventas: cuadra con el embudo de ads
                (CAC ≈ ads_captacion/ventas, CR_clientes ≈ ventas/leads). */}
            <KpiCard
              className="lg:col-span-2"
              label="Ventas"
              value={formatNumber(getValueAtMonth(kpi, "ventas", activeMonth))}
              mom={getMoMAtMonth(kpi, "ventas", activeMonth)}
            />

            {/* --- Fila 3 · MRR --- */}
            <KpiCard
              className="sm:col-span-2 lg:col-span-3"
              size="titular"
              label="MRR"
              value={formatCurrency(getValueAtMonth(kpi, "MRR", activeMonth))}
              mom={mrrMoM === null ? null : mrrMoM * 100}
              subValues={[
                {
                  label: "MRR neto",
                  value: formatCurrency(getValueAtMonth(kpi, "MRR_net", activeMonth)),
                },
              ]}
            />
            <KpiCard
              className="lg:col-span-2"
              label="Suscripciones activas"
              value={formatNumber(suscActivas)}
              mom={getMoMAtMonth(kpi, "suscripciones_activas", activeMonth)}
              subValues={[
                {
                  label: "vs. mes anterior",
                  value: formatNumberDelta(suscActivasDelta),
                },
              ]}
            />
            {/* clientes_churn es una TASA (0.76 → "76%"), no un conteo. */}
            <KpiCard
              className="lg:col-span-2"
              label="Clientes en churn"
              value={formatPercent(churn)}
              mom={getMoMAtMonth(kpi, "clientes_churn", activeMonth)}
              momIsGoodWhenPositive={false}
              semaforo={getSemaforo(churn, churnObj, true)}
              hint={churnObj !== null ? `Objetivo: ${formatPercent(churnObj)}` : undefined}
            />
          </div>

          {/* --- Fila 4 · Unit economics --- */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* ARPC abre la fila: es el ingreso por cliente del que sale el LTV.
                DB_KPI no trae columna de objetivo para ARPC, así que va sin
                alerta ni hint (mismo criterio que en Retención). */}
            <KpiCard
              label="ARPC"
              value={formatCurrency(arpc)}
              mom={getMoMAtMonth(kpi, "ARPC", activeMonth)}
            />
            <KpiCard
              label="LTV"
              value={formatCurrency(ltv)}
              mom={getMoMAtMonth(kpi, "LTV", activeMonth)}
              alerta={getAlertaObjetivo(ltv, ltvObj, false)}
              hint={ltvObj !== null ? `Objetivo: ${formatCurrency(ltvObj)}` : undefined}
            />
            <KpiCard
              label="CPL"
              value={formatCurrency(cpl)}
              mom={getMoMAtMonth(kpi, "CPL_ads", activeMonth)}
              momIsGoodWhenPositive={false}
              alerta={getAlertaOperativa("CPL_ads", cpl)}
              hint={
                <ObjetivoLimite
                  objetivo={cplObj !== null ? formatCurrency(cplObj) : null}
                  limite={formatCurrency(CPL_LIMITE)}
                />
              }
            />
            <KpiCard
              label="CAC"
              value={formatCurrency(cac)}
              mom={getMoMAtMonth(kpi, "CAC", activeMonth)}
              momIsGoodWhenPositive={false}
              alerta={getAlertaOperativa("CAC", cac)}
              hint={
                <ObjetivoLimite
                  objetivo={cacObj !== null ? formatCurrency(cacObj) : null}
                  limite={formatCurrency(CAC_LIMITE)}
                />
              }
            />
            {/* CR_clientes se compara en fracción (0-1) y se muestra en %. */}
            <KpiCard
              label="CR"
              value={formatPercent(cr)}
              mom={getMoMAtMonth(kpi, "CR_clientes", activeMonth)}
              alerta={getAlertaOperativa("CR_clientes", cr)}
              hint={
                <ObjetivoLimite
                  objetivo={formatPercent(crObj)}
                  limite={formatPercent(CR_LIMITE)}
                />
              }
            />
          </div>

          {/* Dos datos y nada más: dónde invertir y qué se está vendiendo. Los
              ROI por canal que antes vivían acá están completos en Captación.
              Va pegado a las tarjetas KPI, antes de los gráficos: es la lectura
              accionable del mes y se quiere ver sin scrollear. */}
          <Panel
            title="Oportunidad del mes"
            description="Mejor canal de adquisición según ROI del último mes disponible, y el producto que más ingresos deja."
          >
            <div className="flex flex-wrap gap-x-12 gap-y-4">
              <div>
                <div className="text-xs text-drc-ink-soft">Canal recomendado</div>
                <div className="text-lg font-semibold text-drc-green">
                  {mejorCanal ?? "Sin datos"}
                </div>
              </div>
              <div>
                <div className="text-xs text-drc-ink-soft">
                  Producto más vendido
                  {topProducto && productoMonth ? ` · ${productoMonth}` : ""}
                </div>
                <div className="text-lg font-semibold text-drc-green">
                  {topProducto?.label ?? "Sin datos"}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Ingresos netos y MRR en el tiempo"
            description="Evolución conjunta sobre la misma línea temporal."
            action={<RangeFilter value={ingRange} onChange={setIngRange} />}
          >
            <MultiTrendChart
              data={ingresosMrrSeries}
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
            action={<RangeFilter value={pedRange} onChange={setPedRange} />}
          >
            <ComposedBarLineChart
              data={pedidosAovRows}
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
            title="Movimiento de clientes y retención"
            description="Altas, recurrentes y perdidos (magnitud, eje izq.) con la tasa de retención como línea (%) sobre eje derecho."
            action={<RangeFilter value={cliRange} onChange={setCliRange} />}
          >
            <ComposedBarLineChart
              data={clientesRows}
              bars={[
                { key: "clientes_nuevos", label: "Nuevos", color: CAT.verde },
                { key: "clientes_recurrentes", label: "Recurrentes", color: CAT.verdeClaro },
                { key: "clientes_perdidos", label: "Perdidos", color: GASTO.base },
              ]}
              line={{ key: "retention_rate", label: "Retención", color: NEUTRO.ink }}
              barFormatter={(v) => formatNumber(v)}
              lineFormatter={(v) => formatPercent(v)}
            />
          </Panel>

        </div>
      )}
    </>
  );
}
