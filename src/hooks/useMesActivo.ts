"use client";

import { useState } from "react";
import { mesMasReciente } from "@/lib/kpiHelpers";

/**
 * MES ACTIVO del desplegable de mes de una página (`MonthSelect`).
 *
 * Devuelve `[mesActivo, elegirMes]`. Mientras el usuario no elige nada —o elige
 * un mes que deja de existir— el mes activo es el MÁS RECIENTE de `months`, y se
 * recalcula en CADA render: como `months` viene del polling de useLiveData, en
 * cuanto el Sheet estrena un mes el desplegable se mueve solo. Guardar el mes
 * por defecto en un estado inicializado al montar es justo lo que dejaba al
 * dashboard clavado en un mes viejo hasta recargar la pestaña.
 *
 * Vive en un hook y no copiado en cada página porque "el más reciente
 * disponible" tiene que significar lo mismo en Resumen, Captación, Ingresos,
 * Retención y Producto: son el mismo control repetido, no cinco criterios.
 *
 * Ojo: el desplegable del cashflow de Situación Financiera NO usa esto a
 * propósito (arranca en el último mes con el cuadro de resultados cerrado, que
 * va por detrás), y el de Profesores tampoco (sus meses salen de DRC Gestión,
 * no del Sheet).
 */
export function useMesActivo(
  months: string[]
): [string, (mes: string) => void] {
  const [elegido, setElegido] = useState<string>("");
  const activo =
    elegido && months.includes(elegido) ? elegido : mesMasReciente(months);
  return [activo, setElegido];
}
