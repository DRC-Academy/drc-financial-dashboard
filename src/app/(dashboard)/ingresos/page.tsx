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
import { MonthRangeSelect } from "@/components/ui/MonthRangeSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getValueAtMonth,
  getMoMAtMonth,
  getMoMAbsAtMonth,
  getDeltaAtMonth,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatPercent,
} from "@/lib/kpiHelpers";
import { CAT, INGRESO, NEUTRO } from "@/lib/chartColors";
import type { DBKpiData, MetricValue } from "@/types/kpi";

/**
 * En esta página TODO lo que se grafica es dinero que entra, así que las series
 * salen de la rampa de INGRESO (azules) en vez de los colores de canal: el canal
 * lo identifican la leyenda y el orden de apilado. Ver src/lib/chartColors.ts.
 */
const C = {
  mrr: INGRESO.base,
  otrosIngresos: INGRESO.suave,
  canalGoogle: INGRESO.fuerte,
  canalMeta: INGRESO.medio,
  canalOtros: INGRESO.suave,
};

/** Resta a - b tratando null como 0, salvo que AMBOS sean null → null. */
function subOrNull(a: MetricValue, b: MetricValue): MetricValue {
  if (a === null && b === null) return null;
  return (a ?? 0) - (b ?? 0);
}

/**
 * Mes de arranque por defecto del rango de acumulados: enero del año del ÚLTIMO
 * mes disponible ("lo que va del año"). Si ese enero no está en la serie, el
 * primer mes que sí esté de ese año; y si el dataset no llega a cubrir el año,
 * el primer mes de todos. El año sale del dato y no del reloj a propósito: si
 * el Sheet se queda atrás, el rango sigue mostrando un período con datos en vez
 * de uno vacío.
 */
function inicioDelAnio(months: string[]): string {
  const ultimo = months[months.length - 1] ?? "";
  if (!ultimo) return "";
  const anio = ultimo.slice(-2);
  const delAnio = months.filter((m) => m.endsWith(`-${anio}`));
  return delAnio.find((m) => m.startsWith("ene-")) ?? delAnio[0] ?? months[0];
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
  // La tarjeta de ingresos acumulados tiene su propio rango a medida (mes de
  // inicio y mes de fin), independiente del de los gráficos y del desplegable
  // de mes de las tarjetas. "" = todavía sin elegir → se usa el rango por
  // defecto ("lo que va del año").
  const [acumFromChoice, setAcumFromChoice] = useState<string>("");
  const [acumToChoice, setAcumToChoice] = useState<string>("");

  // ---- Fila 1 · Ingresos netos + MRR ----
  const ingresosNetos = getValueAtMonth(kpi, "ingresos_netos", activeMonth);
  const ingresosDelta = getDeltaAtMonth(kpi, "ingresos_netos", activeMonth);
  const mrr = getValueAtMonth(kpi, "MRR", activeMonth);
  const mrrDelta = getDeltaAtMonth(kpi, "MRR", activeMonth);

  // ---- Dona · MRR como porción de ingresos_netos ----
  const otrosIngresos = subOrNull(ingresosNetos, mrr);
  const mrrSlices = [
    { name: "MRR (recurrente)", value: mrr, color: C.mrr },
    { name: "Otros ingresos", value: otrosIngresos, color: C.otrosIngresos },
  ];

  // ---- Stripe / refunds (2 tarjetas n2) ----
  // stripe_fee e importe_refunds vienen en NEGATIVO en el Sheet (convención de
  // coste): mostramos su magnitud, y la variación también sobre magnitudes
  // (getMoMAbsAtMonth) para que "pagar más fee" salga como subida (y en rojo).
  const stripeFee = getValueAtMonth(kpi, "stripe_fee", activeMonth);
  const stripeFeeAbs = stripeFee === null ? null : Math.abs(stripeFee);
  // %_stripe_fee es el fee sobre los ingresos B2C BRUTOS (verificado contra el
  // Sheet: ingresos_B2C_brutos × %_stripe_fee = |stripe_fee| al céntimo), no
  // sobre ingresos_netos.
  const stripeFeePct = getValueAtMonth(kpi, "%_stripe_fee", activeMonth);
  // fee_gestion / %_fee_gestion existen como columnas propias en DB_KPI (nombre
  // exacto verificado contra la cabecera), y son OTRA cosa que stripe_fee: el
  // Sheet las guarda en POSITIVO, no en negativo. El % está calculado sobre la
  // misma base que el de Stripe — ingresos_B2C_brutos × %_fee_gestion =
  // fee_gestion al céntimo (jul-26: 19.792,74 × 0,018027 = 356,80) — y por eso
  // las dos tarjetas pueden ir juntas con la misma etiqueta de sub-valor.
  const feeGestion = getValueAtMonth(kpi, "fee_gestion", activeMonth);
  const feeGestionAbs = feeGestion === null ? null : Math.abs(feeGestion);
  const feeGestionPct = getValueAtMonth(kpi, "%_fee_gestion", activeMonth);
  const importeRefundsRaw = getValueAtMonth(kpi, "importe_refunds", activeMonth);
  const importeRefunds =
    importeRefundsRaw === null ? null : Math.abs(importeRefundsRaw);
  const refundsNum = getValueAtMonth(kpi, "refunds_num", activeMonth);

  // ---- Pedidos + AOV + acumulado ----
  const pedidos = getValueAtMonth(kpi, "pedidos", activeMonth);
  const aov = getValueAtMonth(kpi, "AOV", activeMonth);
  const aovNuevos = getValueAtMonth(kpi, "AOV_nuevos", activeMonth);

  // ---- Ingresos acumulados con rango de fechas a medida ----
  // Los dos extremos son libres (no una ventana móvil contra el final de la
  // serie). Por defecto, lo que va del año: de enero del año del último mes con
  // dato hasta ese último mes.
  const acumInicio = months.includes(acumFromChoice)
    ? acumFromChoice
    : inicioDelAnio(months);
  const acumFin = months.includes(acumToChoice)
    ? acumToChoice
    : months[months.length - 1] ?? "";

  // ingresos_acumulados es un ACUMULADO CORRIDO desde el origen (verificado
  // contra el Sheet: es estrictamente creciente y cada salto mensual coincide al
  // céntimo con ingresos_B2C_netos de ese mes — ojo, con el B2C neto, NO con
  // ingresos_netos, que además incluye B2B y Oritalk). Siendo corrido, lo
  // acumulado DENTRO del rango es la resta de los dos extremos:
  //   acumulado(fin) − acumulado(mes anterior al inicio).
  const ingresosAcumulados = getValueAtMonth(kpi, "ingresos_acumulados", acumFin);
  const acumBaseMonth = months[months.indexOf(acumInicio) - 1] ?? "";
  const acumBase = acumBaseMonth
    ? getValueAtMonth(kpi, "ingresos_acumulados", acumBaseMonth)
    : 0;
  const acumEnPeriodo =
    ingresosAcumulados === null ? null : ingresosAcumulados - (acumBase ?? 0);

  // Suma de ingresos_netos del mismo rango. NO tiene por qué coincidir con el
  // acumulado de arriba y no es un error: el acumulado del Sheet sólo suma el
  // B2C neto, así que la diferencia entre ambas cifras es exactamente el B2B y
  // el Oritalk del período.
  const rangoMonths = months.slice(
    months.indexOf(acumInicio),
    months.indexOf(acumFin) + 1
  );
  const netosEnPeriodo = rangoMonths.reduce<MetricValue>((acc, m) => {
    const v = kpi.data[m]?.["ingresos_netos"] ?? null;
    if (v === null) return acc;
    return (acc ?? 0) + v;
  }, null);

  // ---- Gráfico · mix de ingresos por línea de negocio (apilado) ----
  const mixRows = applyRange(months, mixRange).map((month) => ({
    month,
    "B2C neto": kpi.data[month]?.["ingresos_B2C_netos"] ?? null,
    B2B: kpi.data[month]?.["ingresos_B2B"] ?? null,
    Oritalk: kpi.data[month]?.["ingresos_oritalk"] ?? null,
  }));

  // ---- Gráfico · ingresos por canal (apilado) ----
  // Los tres son columnas reales de DB_KPI: "ingresos_otros" es un canal de
  // captación de verdad (lo que entró sin venir de Google ni de Meta), no el
  // resto de una resta.
  //
  // El gráfico llegaba hasta los ingresos netos del mes con un cuarto tramo gris
  // ("No atribuido a captación") que era ese resto: ingresos_netos menos los
  // tres canales, o sea sobre todo ingreso RECURRENTE. No es un canal, no cabe
  // en un gráfico titulado "por canal" y se sacó: ahora la barra suma lo
  // captado, no los ingresos del mes.
  const canalRows = applyRange(months, canalRange).map((month) => ({
    month,
    ingresos_google: kpi.data[month]?.["ingresos_google"] ?? null,
    ingresos_meta: kpi.data[month]?.["ingresos_meta"] ?? null,
    ingresos_otros: kpi.data[month]?.["ingresos_otros"] ?? null,
  }));

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

          {/* --- Fila · Stripe + fee de gestión + refunds (3 tarjetas n2) --- */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Fee de Stripe"
              value={formatCurrency(stripeFeeAbs)}
              mom={getMoMAbsAtMonth(kpi, "stripe_fee", activeMonth)}
              momIsGoodWhenPositive={false}
              subValues={[
                { label: "% s/ B2C brutos", value: formatPercent(stripeFeePct) },
              ]}
            />
            <KpiCard
              label="Fee de gestión"
              value={formatCurrency(feeGestionAbs)}
              mom={getMoMAbsAtMonth(kpi, "fee_gestion", activeMonth)}
              momIsGoodWhenPositive={false}
              subValues={[
                { label: "% s/ B2C brutos", value: formatPercent(feeGestionPct) },
              ]}
            />
            <KpiCard
              label="Importe refunds"
              value={formatCurrency(importeRefunds)}
              mom={getMoMAbsAtMonth(kpi, "importe_refunds", activeMonth)}
              momIsGoodWhenPositive={false}
              subValues={[
                { label: "Nº refunds", value: formatNumber(refundsNum) },
              ]}
            />
          </div>

          {/* --- Fila · Pedidos + el par AOV / AOV nuevos --- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <KpiCard
              label="Pedidos"
              value={formatNumber(pedidos)}
              mom={getMoMAtMonth(kpi, "pedidos", activeMonth)}
            />
            {/* AOV y AOV nuevos son la misma métrica sobre dos poblaciones: van
                SIEMPRE una al lado de la otra (grid propio de 2 columnas), para
                que la comparación se lea de un vistazo también en móvil. */}
            <div className="grid grid-cols-2 gap-4 lg:col-span-2">
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
            </div>
          </div>

          {/* --- Fila · Ingresos acumulados, con su rango de fechas a medida --- */}
          <KpiCard
            label="Ingresos acumulados"
            value={formatCurrency(acumEnPeriodo)}
            action={
              <MonthRangeSelect
                months={months}
                from={acumInicio}
                to={acumFin}
                onChange={(f, t) => {
                  setAcumFromChoice(f);
                  setAcumToChoice(t);
                }}
              />
            }
            subValues={[
              {
                label: "Suma de ingresos netos",
                value: formatCurrency(netosEnPeriodo),
              },
              {
                label: `Acumulado total a ${acumFin}`,
                value: formatCurrency(ingresosAcumulados),
              },
            ]}
            hint={
              <>
                <div>
                  {acumInicio === acumFin
                    ? `Sólo ${acumFin}`
                    : `Rango ${acumInicio} → ${acumFin}`}
                  {acumBaseMonth
                    ? ` · acumulado(${acumFin}) − acumulado(${acumBaseMonth})`
                    : " · sin mes previo: incluye lo acumulado antes del Sheet"}
                </div>
                <div>
                  La columna ingresos_acumulados del Sheet suma el B2C neto; la
                  diferencia con los ingresos netos es el B2B y el Oritalk.
                </div>
              </>
            }
          />

          {/* --- Gráfico · mix de ingresos por línea de negocio --- */}
          <Panel
            title="Mix de ingresos por línea de negocio"
            description="Composición mensual apilada: B2C neto, B2B y Oritalk."
            action={<RangeFilter value={mixRange} onChange={setMixRange} />}
          >
            <StackedBarChart
              data={mixRows}
              keys={["B2C neto", "B2B", "Oritalk"]}
              colors={[INGRESO.fuerte, INGRESO.medio, INGRESO.suave]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>

          {/* --- Gráfico · ingresos por canal --- */}
          <Panel
            title="Ingresos por canal"
            description="Barras apiladas con los tres canales de captación tal como los atribuye el Sheet: Google, Meta y Otros. La barra suma lo CAPTADO en el mes, no los ingresos netos: el ingreso que no viene de captación (sobre todo recurrente) no aparece acá."
            action={<RangeFilter value={canalRange} onChange={setCanalRange} />}
          >
            <StackedBarChart
              data={canalRows}
              keys={["ingresos_google", "ingresos_meta", "ingresos_otros"]}
              colors={[C.canalGoogle, C.canalMeta, C.canalOtros]}
              labels={["Google", "Meta", "Otros"]}
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
                { key: "pedidos_recurrentes", label: "Pedidos recurrentes", color: CAT.verdeClaro },
                { key: "pedidos_nuevos", label: "Pedidos nuevos", color: CAT.oro },
              ]}
              line={{ key: "recurrent_rate", label: "Tasa de recurrencia", color: NEUTRO.ink }}
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
                { key: "AOV", label: "AOV", color: INGRESO.fuerte },
                { key: "AOV_nuevos", label: "AOV nuevos", color: INGRESO.medio },
              ]}
              valueFormatter={(v) => formatCurrency(v)}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
