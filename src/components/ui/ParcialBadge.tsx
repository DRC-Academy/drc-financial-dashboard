/**
 * Aviso de "cifra parcial" — el ⚠ amarillo que marca un número que es un MÍNIMO
 * y no un dato cerrado.
 *
 * Vivía dentro de PayoutsTable, pegado al nombre de cada profesor. Se sacó acá
 * cuando el margen real empezó a mostrarse también en Resumen Ejecutivo: el
 * mismo aviso tiene que verse igual en los dos sitios, y dos copias del mismo
 * badge son dos sitios donde el texto y el color pueden separarse.
 *
 * Amarillo de "ojo con este número", no rojo de error: el dato no está mal,
 * está a medias.
 *
 * El texto va en `title` (tooltip nativo) y en `aria-label`, para que un lector
 * de pantalla no dependa del hover. El ⚠ es aria-hidden para no leerlo dos
 * veces.
 */
export function ParcialBadge({ aviso }: { aviso: string }) {
  return (
    <span
      title={aviso}
      aria-label={aviso}
      role="img"
      className="ml-1.5 inline-flex items-center rounded-full bg-drc-yellow/25 px-1 py-0.5 text-[10px] leading-none text-drc-yellow-deep align-middle cursor-help"
    >
      <span aria-hidden>⚠</span>
    </span>
  );
}
