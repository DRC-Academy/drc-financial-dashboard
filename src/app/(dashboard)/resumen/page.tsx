"use client";

import { useState } from "react";
import { useLiveData } from "@/hooks/useLiveData";
import { useMesActivo } from "@/hooks/useMesActivo";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { MonthSelect } from "@/components/ui/MonthSelect";
import { KpiCard } from "@/components/ui/KpiCard";
import { ParcialBadge } from "@/components/ui/ParcialBadge";
import { Panel } from "@/components/ui/Panel";
import { MultiTrendChart } from "@/components/ui/MultiTrendChart";
import { ComposedBarLineChart } from "@/components/ui/ComposedBarLineChart";
import { RangeFilter, applyRange } from "@/components/ui/RangeFilter";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getValueAtMonth,
  getMoMAtMonth,
  getDeltaAtMonth,
  getAlertaOperativa,
  getAlertaObjetivo,
  getRoiCanalLatest,
  CPL_LIMITE,
  CAC_LIMITE,
  CR_OBJETIVO,
  CR_LIMITE,
  CHURN_OBJETIVO,
  CHURN_LIMITE,
  monthLabelToApiMonth,
  formatCurrency,
  formatCurrencyDelta,
  formatNumber,
  formatNumberDelta,
  formatPercent,
  formatPointsDelta,
} from "@/lib/kpiHelpers";
import {
  avisoParcialMes,
  facturacionTotalDe,
  margenTotalDe,
} from "@/lib/profesoresHelpers";
import {
  getBlock,
  rankAtMonth,
  EMPTY_PRODUCTO_KPI,
  type ProductoKpiData,
} from "@/lib/productoKpiHelpers";
import { CAT, GASTO, INGRESO, NEUTRO } from "@/lib/chartColors";
import type { DBKpiData } from "@/types/kpi";
import type { PayoutsMonth, PayoutsSummary } from "@/types/profesores";

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
  // válida, cae al mes más reciente disponible (ver useMesActivo).
  const [activeMonth, setMonthChoice] = useMesActivo(months);

  // Rangos independientes por gráfico (no afectan las tarjetas).
  const [ingRange, setIngRange] = useState(0);
  const [pedRange, setPedRange] = useState(0);
  const [cliRange, setCliRange] = useState(0);

  /**
   * MARGEN BRUTO REAL — la única cosa de esta página que NO sale del Sheet.
   *
   * Viene del mismo endpoint que la página Profesores (`margen_total` de
   * /api/profesores?month=YYYY-MM): facturación real de los alumnos vía
   * WooCommerce menos lo que se le paga a los profesores.
   *
   * Los dos formatos de mes NO son el mismo: el desplegable de arriba habla el
   * "mmm-yy" del Sheet y el endpoint espera "YYYY-MM". El puente es
   * monthLabelToApiMonth, el mismo que ya usa el desplegable de Profesores para
   * el camino de vuelta; acá no se escribe ninguna conversión nueva.
   *
   * La serie (/api/profesores/summary) se pide sólo para saber QUÉ MESES cubre
   * DRC Gestión. Sin ella se le pediría el mes a ciegas: el Sheet arranca mucho
   * antes que las liquidaciones, así que la mayoría de los meses del desplegable
   * no tienen nada del otro lado y no vale la pena hacerle recalcular 27
   * profesores para que conteste ceros. Es la misma llamada que ya hace la
   * página Profesores, y el cache del servidor es compartido: sale gratis.
   */
  const mesApi = activeMonth ? monthLabelToApiMonth(activeMonth) : null;
  const { data: serieProfes } = useLiveData<PayoutsSummary>(
    "/api/profesores/summary",
    60_000
  );
  const mesEnProfesores =
    mesApi !== null &&
    (serieProfes?.series ?? []).some((p) => p.month_year === mesApi);

  // Con url null, useLiveData no pide nada (ni la primera vez ni en el polling).
  const { data: profesRaw } = useLiveData<PayoutsMonth>(
    mesEnProfesores ? `/api/profesores?month=${mesApi}` : null,
    60_000
  );

  /**
   * El hook conserva el último `data` que llegó, así que al cambiar de mes (o al
   * dejar de pedir, porque el mes nuevo no existe del otro lado) el payload
   * viejo sigue ahí un rato. `month_year` dice a qué mes corresponde de verdad:
   * si no es el que se está mirando, no es el dato de este mes y se descarta.
   * Sin este guardia la tarjeta enseñaría el margen de julio bajo el título de
   * agosto, que es peor que no enseñar nada.
   */
  const profesMes =
    profesRaw && profesRaw.month_year === mesApi ? profesRaw : null;

  // margen_total y facturacion_total SIEMPRE por los helpers: cuando ningún
  // alumno tiene precio resuelto el endpoint manda 0, y ese 0 significa "no lo
  // sabemos" (ver lib/profesoresHelpers).
  const margenReal = profesMes ? margenTotalDe(profesMes) : null;
  const facturacionReal = profesMes ? facturacionTotalDe(profesMes) : null;
  const avisoReal = profesMes ? avisoParcialMes(profesMes) : null;
  // Margen sobre la facturación que pasa por profesores. Es lo ÚNICO que se
  // deriva acá, y sólo con datos del propio endpoint: sirve para leer la
  // tarjeta de al lado —que está en %— sin tener que dividir a ojo.
  const margenRealPct =
    margenReal !== null && facturacionReal !== null && facturacionReal !== 0
      ? margenReal / facturacionReal
      : null;

  /**
   * POR QUÉ no hay margen real, o null si sí lo hay. Los cuatro motivos se
   * arreglan de forma distinta y no se pueden fundir en un "sin datos" genérico:
   * uno es de configuración nuestra, otro es del calendario, otro es que falta
   * cargar precios del otro lado y el último es que todavía no contestó.
   */
  const motivoSinMargenReal: string | null = !serieProfes
    ? "Sin respuesta de DRC Gestión: no hay margen real que mostrar. El resto de la página lee del Sheet y no se ve afectado."
    : !mesEnProfesores
      ? `El histórico de liquidaciones de DRC Gestión no llega a ${
          activeMonth || "este mes"
        }. No es 0 €: es un mes sin datos del otro lado.`
      : !profesMes
        ? "Pidiéndole el mes a DRC Gestión…"
        : margenReal === null
          ? "Ningún alumno con precio de plan resuelto en DRC Gestión este mes, así que no hay margen que calcular. No es 0 €: es un dato que falta."
          : null;

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

  /**
   * MARGEN BRUTO — columna "%margenbruto" (sin guion bajo tras el %), en
   * FRACCIÓN 0-1 como el resto de tasas del Sheet. No existe ninguna columna
   * "margen_bruto": lo que hay es ésta y CF_margenbruto, que es el importe en €.
   *
   * Mismo guardia que en Situación Financiera: en los meses sin cuadro de
   * resultados cargado la columna puede venir en 0 (no vacía), y sin mirar
   * CF_ingresos la tarjeta mostraría un "0%" que no es un margen del cero por
   * ciento sino un mes sin cerrar.
   */
  const cfIngresos = getValueAtMonth(kpi, "CF_ingresos", activeMonth);
  const margenBruto =
    cfIngresos === null || cfIngresos === 0
      ? null
      : getValueAtMonth(kpi, "%margenbruto", activeMonth);
  const mbObj = getValueAtMonth(kpi, "MB_obj", activeMonth);

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
            {/* "ventas" es el TOTAL del mes y cuadra con el embudo de ads
                (CAC ≈ ads_captacion/ventas, CR_clientes ≈ ventas/leads). El
                desglose por comercial (ventas_hugo + ventas_martin, que suman
                exactamente esta columna) vive en Captación, que es donde se
                mira quién cierra. */}
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
            {/* clientes_churn es una TASA (0.76 → "76%"), no un conteo.
                Umbrales fijos (> 25% peligro · 20-25% mejorable · ≤ 20% bien)
                en vez del semáforo por ratio contra churn_obj: son los del
                churn MENSUAL y no aplican al churn a 3 meses de Retención, que
                mide otra ventana y sigue sin alerta. El objetivo del hint
                (20%) sale de la columna churn_obj y coincide con el corte. */}
            <KpiCard
              className="lg:col-span-2"
              label="Clientes en churn"
              value={formatPercent(churn)}
              mom={getMoMAtMonth(kpi, "clientes_churn", activeMonth)}
              momIsGoodWhenPositive={false}
              alerta={getAlertaOperativa("clientes_churn", churn)}
              hint={
                <ObjetivoLimite
                  objetivo={
                    churnObj !== null
                      ? formatPercent(churnObj)
                      : formatPercent(CHURN_OBJETIVO)
                  }
                  limite={formatPercent(CHURN_LIMITE)}
                />
              }
            />
          </div>

          {/* --- Fila 4 · Unit economics ---
              El margen bruto salió de esta fila y tiene la suya: ahora son dos
              tarjetas que se leen juntas (Sheet y real), y como una tercera
              parte de una fila de seis no se comparan, se comparten. */}
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

          {/* --- Fila 5 · Margen bruto: el del Sheet y el real ---
              Las dos tarjetas miden lo mismo (lo que queda después del coste de
              dar el servicio) pero NO son la misma cifra ni salen de la misma
              fuente, así que van etiquetadas por origen y no se restan ni se
              comparan por código: se ponen al lado y las lee quien mira. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Margen bruto contra su objetivo del Sheet (MB_obj), mismo patrón
                que LTV: alerta por ratio real/objetivo y el objetivo en el pie.
                La comparativa va en PUNTOS porcentuales, no en % relativo — es
                un margen, igual que en Situación Financiera. */}
            <KpiCard
              label="Margen bruto (Sheet)"
              value={formatPercent(margenBruto)}
              momDelta={(() => {
                const d = getDeltaAtMonth(kpi, "%margenbruto", activeMonth);
                return d === null ? null : d * 100;
              })()}
              formatDelta={formatPointsDelta}
              alerta={getAlertaObjetivo(margenBruto, mbObj, false)}
              hint={
                <>
                  <div>
                    Columna %margenbruto del cuadro de resultados de DB_KPI, con
                    todos los costes del servicio dentro.
                  </div>
                  {mbObj !== null && <div>Objetivo: {formatPercent(mbObj)}</div>}
                </>
              }
            />

            {/*
              MARGEN BRUTO REAL — mismo mes, otra fuente (DRC Gestión).

              Sin `alerta` y con `semaforo` explícito, igual que la tarjeta
              "Margen total" de la página Profesores: acá no hay objetivo que
              cumplir, lo único que significa algo es el signo, y ése lo pone la
              propia resta.

              El ⚠ va en `action` (el sitio del chip de alerta, que esta tarjeta
              no usa) con el MISMO badge y el mismo criterio que la tabla de
              Profesores: la cifra es un mínimo, no un cierre.
            */}
            <KpiCard
              label="Margen bruto real (profesores)"
              value={formatCurrency(margenReal)}
              semaforo={
                margenReal === null ? "neutral" : margenReal >= 0 ? "green" : "red"
              }
              action={avisoReal ? <ParcialBadge aviso={avisoReal} /> : undefined}
              subValues={[
                {
                  label: "Facturación vía profesores",
                  value: formatCurrency(facturacionReal),
                },
                {
                  label: "Margen / facturación",
                  value: formatPercent(margenRealPct),
                },
              ]}
              hint={
                motivoSinMargenReal ? (
                  <div>{motivoSinMargenReal}</div>
                ) : (
                  <>
                    <div>
                      Facturación real de los alumnos (WooCommerce) − lo que se
                      paga a sus profesores, calculado por DRC Gestión. Es el
                      mismo número de la tarjeta «Margen total» de Profesores.
                    </div>
                    <div>
                      Cubre sólo lo que pasa por un profesor con alumnos
                      asignados: no es la cuenta entera de la academia, así que su
                      % no se lee contra el objetivo MB_obj de al lado.
                    </div>
                  </>
                )
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
