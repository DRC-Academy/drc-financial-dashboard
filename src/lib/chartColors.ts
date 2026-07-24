/**
 * Paleta única de los gráficos del dashboard.
 *
 * CONVENCIÓN SEMÁNTICA (la razón de que este archivo exista):
 *
 *   AZUL  → INGRESOS.  ingresos_netos, ingresos_google/meta, ingresos_B2C/B2B,
 *           MRR, AOV, ARPC, LTV, ingresos_acumulados…
 *   ROJO  → GASTOS y PÉRDIDAS.  ads_*, clientes_perdidos, suscripciones_perdidas,
 *           churn, refunds, stripe_fee, cancelaciones…
 *   VERDE / ORO / GRIS → todo lo demás (leads, ventas, pedidos, CAC, CPL,
 *           retención, permanencia, clientes…).
 *
 * Azul y rojo quedan RESERVADOS: no se usan para nada que no sea "entra dinero"
 * o "sale dinero / se pierde". Por eso las categorías neutras nunca los tocan,
 * aunque sobren tonos.
 *
 * ---------------------------------------------------------------------------
 * Validación de accesibilidad (OKLCH; validador de la skill de dataviz, modo
 * claro sobre superficie #fcfcfb — la del dashboard es #ffffff, más clara aún):
 *
 *   CATEGORIA (los 3 slots, todos los pares):
 *     banda de luminosidad PASS · piso de croma PASS · visión normal ΔE 16.7 PASS
 *     CVD ΔE 7.7 (protan) → banda de piso 6-8, admisible SÓLO con codificación
 *     secundaria: todos los gráficos llevan leyenda, y las series apiladas
 *     además van separadas por un anillo de 2px del color del panel.
 *   INGRESO fuerte/medio/suave:  visión normal ΔE 15.8 PASS · CVD ΔE 15.2 PASS
 *   GASTO   fuerte/base/suave:   visión normal ΔE 17.3 PASS · CVD ΔE 15.7 PASS
 *
 * Las rampas de un mismo tono (los azules entre sí, los rojos entre sí) se salen
 * de la banda de luminosidad en su paso más claro: es inherente a una rampa, que
 * por definición recorre la banda entera. Lo que importa en ellas —que sus pasos
 * se distingan— está verificado arriba.
 *
 * Con verde/oro/gris NO se llega a un 4º slot categórico que pase todos los
 * controles: bajo protanopia el verde y el oro colapsan salvo que se separen
 * mucho en luminosidad, y eso agota la banda. De ahí que CATEGORIA tenga 3 y no
 * más; el gris de NEUTRO es acromático a propósito ("otros" / no atribuido), no
 * una cuarta categoría compitiendo con las demás.
 * ---------------------------------------------------------------------------
 */

/** Ingresos. Rampa de azules, de más oscuro a más claro. */
export const INGRESO = {
  /** Serie de ingresos principal cuando hay varias. */
  fuerte: "#1b4fa8",
  /** Ingresos como serie única (es el --drc-blue de la marca). */
  base: "#2563c9",
  medio: "#3f82d8",
  suave: "#8db9ea",
} as const;

/** Gastos y pérdidas. Rampa de rojos, de más oscuro a más claro. */
export const GASTO = {
  fuerte: "#8f2018",
  /** Gasto/pérdida como serie única (es el --drc-red de la marca). */
  base: "#d6483c",
  suave: "#ec9990",
} as const;

/**
 * Categorías que no son ni ingreso ni gasto, EN ORDEN FIJO: el slot 1 va siempre
 * a la primera serie, el 2 a la segunda, etc. Nunca se ciclan ni se reordenan al
 * filtrar — el color sigue a la entidad, no a su posición en el ranking.
 */
export const CATEGORIA = ["#0f6135", "#d9a512", "#52b878"] as const;

/** Alias legibles de CATEGORIA, para no escribir índices en las páginas. */
export const CAT = {
  verde: CATEGORIA[0],
  oro: CATEGORIA[1],
  verdeClaro: CATEGORIA[2],
} as const;

export const NEUTRO = {
  /** "Otros" / resto no atribuido. Acromático a propósito. */
  gris: "#8f9490",
  /** Tinta de marca, para líneas de referencia sobre eje secundario. */
  ink: "#143a24",
} as const;

/**
 * Identidad de canal en Captación e Ingresos. Google y Meta NO son ingresos ni
 * gastos por sí mismos: son categorías, así que salen de CATEGORIA. Cuando lo
 * que se pinta del canal SÍ es dinero, la página usa INGRESO.* o GASTO.* y deja
 * la identidad al orden de las series y a la leyenda.
 */
export const CANAL = {
  google: CAT.verde,
  meta: CAT.oro,
  otros: NEUTRO.gris,
  /**
   * Tono claro del mismo hue, para las BARRAS del canal cuando el gráfico
   * combina barra + línea del mismo canal (leads+CPL, ventas+CAC): la barra va
   * en el tono claro y su línea en el base, así la correspondencia se lee por
   * hue y la separación por luminosidad. Barra↔barra: ΔE 15.9 visión normal /
   * 8.9 protan (PASS); línea↔línea: ΔE 34.8 / 27.6 (PASS).
   */
  googleSuave: "#63bd88",
  metaSuave: "#e0b53a",
} as const;

/**
 * Geometría compartida por todos los gráficos, para que la consistencia no sea
 * sólo de tono: mismo grosor de línea, misma opacidad de relleno de área y mismo
 * radio de barra en todos los componentes.
 */
export const CHART_STROKE_WIDTH = 2;
/** Opacidad del degradado de las áreas: arriba AREA_FILL_OPACITY → abajo 0. */
export const CHART_AREA_FILL_OPACITY = 0.28;
/** Radio de la esquina superior de las barras. */
export const CHART_BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
/**
 * Anillo del color del panel entre segmentos apilados: separa las porciones sin
 * introducir un color nuevo, y es la codificación secundaria que hace admisible
 * el ΔE de 7.7 entre los slots de CATEGORIA.
 */
export const CHART_STACK_GAP = {
  stroke: "var(--drc-card)",
  strokeWidth: 2,
} as const;
