/**
 * Módulo de Estructura de Gastos — DESACOPLADO a propósito.
 *
 * Los gastos operativos generales todavía no están en Sheets (el software
 * propio de gestión está en desarrollo). Esta función devuelve datos
 * placeholder con la MISMA forma que tendrá la respuesta real, para que
 * cuando la API interna esté lista solo haya que reemplazar el cuerpo de
 * `readGastos()` por el fetch real — nada en la UI debería cambiar.
 *
 * TODO: reemplazar por fetch a la API interna cuando esté disponible.
 * Sugerencia de contrato: GET /api/internal/gastos?mes=ago-25
 *   -> { categorias: { nombre: string, monto: number }[], total: number }
 */

export interface GastoCategoria {
  nombre: string;
  monto: number;
}

export interface GastosData {
  categorias: GastoCategoria[];
  total: number;
  esPlaceholder: boolean;
}

export async function readGastos(): Promise<GastosData> {
  // Placeholder explícito — se marca esPlaceholder=true para que la UI
  // avise claramente que estos números no son reales todavía.
  const categorias: GastoCategoria[] = [
    { nombre: "Nóminas / profesores", monto: 0 },
    { nombre: "Marketing (Ads)", monto: 0 },
    { nombre: "Software / infraestructura", monto: 0 },
    { nombre: "Hosting / dominios", monto: 0 },
    { nombre: "Otros", monto: 0 },
  ];

  return {
    categorias,
    total: categorias.reduce((sum, c) => sum + c.monto, 0),
    esPlaceholder: true,
  };
}
