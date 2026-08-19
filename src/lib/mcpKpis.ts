/**
 * PAYLOAD DE KPIs DEL SERVIDOR MCP — arma la respuesta de `get_kpis_negocio`.
 *
 * SOLO PARA USO EN SERVIDOR (route handler de src/app/api/mcp): lee DB_KPI vía
 * `readDBKPI` (que importa googleapis) y el recuento de DRC Gestión vía
 * `readSubscriptions` (que lleva el secreto en una cabecera).
 *
 * ═══ LÍMITE DE ALCANCE, NO NEGOCIABLE ═══
 * Este módulo lee de DOS fuentes y de ninguna más:
 *   · DB_KPI (Google Sheets)              → cifras agregadas de toda la academia
 *   · /api/external/subscriptions         → dos recuentos agregados de alumnos
 *
 * NO importa —ni debe importar nunca— `externalPayouts.ts`, `profesoresHelpers`
 * ni nada que cuelgue de /api/profesores o /api/external/payouts. Ese endpoint
 * trae `teacher_name`, facturación y margen NOMBRE POR NOMBRE, y queda fuera de
 * este MCP por decisión explícita. Si alguna vez hace falta un dato de ahí, la
 * respuesta correcta es no ponerlo, no "reusar el lector que ya existe".
 *
 * Del recuento de alumnos se exponen SOLO dos números: el total de activos y los
 * que tienen suscripción de WooCommerce. El desglose por origen (manual con su
 * plan_empresa/a_mano, Oritalk) y los descuadres se quedan fuera: son la parte
 * que empieza a describir grupos chicos de personas concretas.
 *
 * ═══ EL CERO NO ES UN DATO ═══
 * Mismo criterio que toda la app: si una fuente falla o la celda está vacía, el
 * campo va en `null` y el motivo en `avisos`. Nunca 0, nunca un valor inventado.
 * Un 0 en CAC o en MRR dibuja una caída que no pasó.
 */

import { readDBKPI } from "./kpi";
import { readSubscriptions } from "./externalSubscriptions";
import {
  apiMonthToLabel,
  getMoMAtMonth,
  getValueAtMonth,
  isApiMonth,
  monthLabelToApiMonth,
} from "./kpiHelpers";
import type { DBKpiData, MetricValue } from "@/types/kpi";

/** Importes y ratios se redondean a 2 decimales. Ver `convenciones` abajo. */
function round2(v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
}

/**
 * Las tasas viven en DB_KPI como FRACCIÓN (0,2055 = 20,55%), igual que las lee
 * el dashboard. Acá se convierten a puntos porcentuales y el campo se nombra
 * `_pct`, para que un LLM no tenga que adivinar la escala: 20.55 sólo se puede
 * leer como 20,55%, mientras que 0.2055 se lee mal la mitad de las veces.
 */
function toPct(v: MetricValue): number | null {
  if (v === null) return null;
  return round2(v * 100);
}

function num(kpi: DBKpiData, key: string, month: string): number | null {
  return round2(getValueAtMonth(kpi, key, month));
}

/** Bloque de adquisición: qué cuesta traer un cliente y por dónde entra. */
export interface KpisAdquisicion {
  cac_blended: number | null;
  cac_google: number | null;
  cac_meta: number | null;
  /** Siempre null: DB_KPI no tiene coste por el canal "otros". Ver `notas`. */
  cac_otros: number | null;
  cpl_blended: number | null;
  cpl_google: number | null;
  cpl_meta: number | null;
  /** Siempre null, por el mismo motivo que `cac_otros`. */
  cpl_otros: number | null;
  close_rate_global_pct: number | null;
  close_rate_hugo_pct: number | null;
  close_rate_martin_pct: number | null;
  gasto_ads_google: number | null;
  gasto_ads_meta: number | null;
  gasto_ads_total: number | null;
}

/** Bloque de recurrente: lo que se repite todos los meses y cuánto dura. */
export interface KpisRecurrente {
  mrr: number | null;
  churn_clientes_pct: number | null;
  churn_mrr_pct: number | null;
  ltv: number | null;
  arpc: number | null;
  permanencia_meses: number | null;
}

export interface KpisIngresos {
  ingresos_netos: number | null;
  /** Variación vs. el mes ANTERIOR CON DATO, en puntos porcentuales. */
  ingresos_netos_mom_pct: number | null;
}

/**
 * Recuento EN VIVO de alumnos. No depende del parámetro `mes` y no puede: el
 * endpoint de DRC Gestión no sabe cuántos activos había en marzo, es una foto
 * del presente. Se devuelve igual porque es el dato más pedido, pero el nombre
 * del bloque y `nota` lo dicen para que nadie lo cruce con un mes cerrado.
 */
export interface KpisAlumnosAhora {
  activos_total: number | null;
  activos_con_suscripcion_mrr: number | null;
  nota: string;
}

export interface KpisNegocio {
  /** Mes de los KPIs del Sheet, etiqueta de DB_KPI ("ago-26"). */
  mes: string;
  /** El mismo mes en ISO ("2026-08"), para no obligar a parsear "ago-26". */
  mes_iso: string | null;
  es_ultimo_mes_disponible: boolean;
  meses_disponibles: string[];
  generado_en: string;
  moneda: "EUR";
  adquisicion: KpisAdquisicion;
  recurrente: KpisRecurrente;
  ingresos: KpisIngresos;
  alumnos_ahora: KpisAlumnosAhora;
  convenciones: string[];
  /** Qué columna del Sheet hay detrás de cada campo que no es obvio. */
  fuentes: Record<string, string>;
  /** Fuentes caídas o datos que faltan. Vacío = todo llegó bien. */
  avisos: string[];
}

/** Devuelto cuando el mes pedido no existe en DB_KPI. */
export interface MesNoEncontrado {
  error: "mes_no_encontrado";
  mes_pedido: string;
  meses_disponibles: string[];
}

/**
 * Resuelve la etiqueta de mes de DB_KPI a partir de lo que pidió el cliente.
 * Acepta las dos formas que se usan en el proyecto —"ago-26" (etiqueta del
 * Sheet) y "2026-08" (ISO)— porque un cliente MCP no tiene por qué conocer el
 * formato interno de la hoja. Sin `pedido`, el último mes disponible.
 */
function resolverMes(kpi: DBKpiData, pedido?: string): string | null {
  if (!pedido || !pedido.trim()) {
    return kpi.months.length > 0 ? kpi.months[kpi.months.length - 1] : null;
  }

  const limpio = pedido.trim();
  const etiqueta = isApiMonth(limpio) ? apiMonthToLabel(limpio) : limpio;
  return kpi.months.includes(etiqueta) ? etiqueta : null;
}

/**
 * Arma el payload completo. Nunca lanza: las dos fuentes degradan a null por su
 * cuenta (readDBKPI devuelve la forma vacía, readSubscriptions devuelve null) y
 * acá eso se traduce en campos en null + un aviso que lo explica.
 *
 * Las dos lecturas van en paralelo: son independientes y encadenarlas sumaría
 * la latencia de Sheets a la del otro proyecto sin ganar nada.
 */
export async function buildKpisNegocio(
  mesPedido?: string
): Promise<KpisNegocio | MesNoEncontrado> {
  const [kpi, susc] = await Promise.all([
    readDBKPI(),
    readSubscriptions(),
  ]);

  const avisos: string[] = [];

  if (kpi.months.length === 0) {
    avisos.push(
      "No se pudo leer DB_KPI (Google Sheets): todos los KPIs del mes van en null. No son ceros, es la fuente que no respondió."
    );
  }

  const mes = resolverMes(kpi, mesPedido);

  // Mes inexistente NO se contesta con un payload de nulls: eso se lee igual que
  // "ese mes existe y está vacío". Se devuelve un error con la lista de meses
  // que sí hay, que es lo único accionable.
  if (mes === null) {
    if (mesPedido && mesPedido.trim() && kpi.months.length > 0) {
      return {
        error: "mes_no_encontrado",
        mes_pedido: mesPedido.trim(),
        meses_disponibles: kpi.months,
      };
    }
    // Sin meses en absoluto: Sheets caído. Se sigue con el payload en nulls,
    // que ya lleva su aviso, en vez de fingir que el mes pedido es el problema.
  }

  const mesEfectivo = mes ?? "";

  if (susc === null) {
    avisos.push(
      "DRC Gestión no respondió: el recuento de alumnos activos va en null. No son ceros, es un dato que falta."
    );
  } else if (susc.woocommerce.ok !== true) {
    avisos.push(
      `DRC Gestión no pudo leer WooCommerce${
        susc.woocommerce.error ? ` (${susc.woocommerce.error})` : ""
      }: el total de activos y los que tienen suscripción van en null. Los dos dependen de WooCommerce.`
    );
  }

  const adquisicion: KpisAdquisicion = {
    cac_blended: num(kpi, "CAC", mesEfectivo),
    cac_google: num(kpi, "CAC_google", mesEfectivo),
    cac_meta: num(kpi, "CAC_meta", mesEfectivo),
    cac_otros: null,
    cpl_blended: num(kpi, "CPL_ads", mesEfectivo),
    cpl_google: num(kpi, "CPL_google", mesEfectivo),
    cpl_meta: num(kpi, "CPL_meta", mesEfectivo),
    cpl_otros: null,
    close_rate_global_pct: toPct(getValueAtMonth(kpi, "CR_clientes", mesEfectivo)),
    close_rate_hugo_pct: toPct(getValueAtMonth(kpi, "CR_hugo", mesEfectivo)),
    close_rate_martin_pct: toPct(getValueAtMonth(kpi, "CR_martin", mesEfectivo)),
    gasto_ads_google: num(kpi, "ads_google", mesEfectivo),
    // ads_meta_captac y ads_captacion, NO ads_meta / ads_total: son las columnas
    // que muestra la página de Captación, y que el MCP diga otro número que el
    // dashboard para el mismo mes es peor que cualquier ventaja de las otras.
    gasto_ads_meta: num(kpi, "ads_meta_captac", mesEfectivo),
    gasto_ads_total: num(kpi, "ads_captacion", mesEfectivo),
  };

  const recurrente: KpisRecurrente = {
    mrr: num(kpi, "MRR", mesEfectivo),
    churn_clientes_pct: toPct(getValueAtMonth(kpi, "clientes_churn", mesEfectivo)),
    churn_mrr_pct: toPct(getValueAtMonth(kpi, "MRR_churn", mesEfectivo)),
    ltv: num(kpi, "LTV", mesEfectivo),
    arpc: num(kpi, "ARPC", mesEfectivo),
    permanencia_meses: num(kpi, "permanencia", mesEfectivo),
  };

  const ingresos: KpisIngresos = {
    ingresos_netos: num(kpi, "ingresos_netos", mesEfectivo),
    ingresos_netos_mom_pct: round2(
      getMoMAtMonth(kpi, "ingresos_netos", mesEfectivo)
    ),
  };

  const alumnos_ahora: KpisAlumnosAhora = {
    activos_total: susc?.alumnos.activos ?? null,
    activos_con_suscripcion_mrr: susc?.alumnos.por_origen.suscripcion ?? null,
    nota: "Foto del PRESENTE: no cambia con el parámetro `mes`. `activos_total` cuenta todas las personas con acceso hoy (suscripción de WooCommerce, activación manual u Oritalk); `activos_con_suscripcion_mrr` es el subconjunto que paga suscripción de WooCommerce y compone el MRR recurrente. La diferencia entre ambos está activa y recibe clases, pero no factura por WooCommerce.",
  };

  return {
    mes: mesEfectivo,
    mes_iso: mesEfectivo ? monthLabelToApiMonth(mesEfectivo) : null,
    es_ultimo_mes_disponible:
      kpi.months.length > 0 && mesEfectivo === kpi.months[kpi.months.length - 1],
    meses_disponibles: kpi.months,
    generado_en: new Date().toISOString(),
    moneda: "EUR",
    adquisicion,
    recurrente,
    ingresos,
    alumnos_ahora,
    convenciones: [
      "null significa SIN DATO (fuente caída o celda vacía), nunca cero. No lo interpretes como 0 ni lo promedies como 0.",
      "Los campos que terminan en _pct ya vienen en porcentaje: 20.55 es 20,55%.",
      "Importes en euros, redondeados a 2 decimales.",
      "`ingresos_netos_mom_pct` compara contra el mes anterior CON DATO, no contra el inmediatamente previo del calendario.",
      "El bloque `alumnos_ahora` es una foto del presente y no responde al parámetro `mes`.",
    ],
    fuentes: {
      cac_blended: "DB_KPI!CAC (la misma columna que muestran las tarjetas del dashboard; existe además una columna CAC_blended que NO se usa acá y da otro número)",
      gasto_ads_meta: "DB_KPI!ads_meta_captac (la que usa la página de Captación, no ads_meta)",
      gasto_ads_total: "DB_KPI!ads_captacion (la que usa la página de Captación, no ads_total)",
      cac_otros: "No existe: DB_KPI no tiene coste de adquisición para el canal 'otros'. Por eso es null y no un número calculado.",
      cpl_otros: "No existe: mismo motivo que cac_otros.",
      alumnos_ahora: "GET /api/external/subscriptions de DRC Gestión (recuento agregado). No se leen datos por profesor ni por alumno.",
      resto: "DB_KPI, columna homónima del campo (MRR, LTV, ARPC, permanencia, ingresos_netos, clientes_churn, MRR_churn, CPL_ads, CR_clientes, CR_hugo, CR_martin, CAC_google, CAC_meta, CPL_google, CPL_meta, ads_google).",
    },
    avisos,
  };
}
