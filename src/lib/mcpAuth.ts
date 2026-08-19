/**
 * AUTENTICACIÓN DEL SERVIDOR MCP — verificación del bearer token.
 *
 * SOLO PARA USO EN SERVIDOR (route handler de src/app/api/mcp): lee el token
 * válido del entorno y usa `node:crypto`. Un import desde un componente
 * "use client" metería el secreto en el bundle del navegador.
 *
 * MCP_API_TOKEN admite VARIOS tokens separados por comas. No es un capricho: es
 * lo que permite rotar sin ventana de caída. Con un solo valor, cambiarlo deja
 * al cliente fuera hasta que alguien actualice su config; con lista se agrega el
 * nuevo, se actualiza el cliente y recién entonces se borra el viejo.
 *
 * REVOCAR = editar MCP_API_TOKEN en Vercel y redesplegar. No hay estado ni base
 * de datos de por medio a propósito: este proyecto no tiene una, y montarla
 * (Edge Config + token de escritura de la API de Vercel + página de toggle en un
 * dashboard que hoy no tiene login) sumaría una credencial más peligrosa que la
 * que estaría protegiendo.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Comparación en tiempo constante. `timingSafeEqual` EXIGE buffers del mismo
 * largo (lanza si no lo son), así que el largo se compara antes y por separado.
 *
 * Eso filtra el largo del token por temporización, y es aceptable: lo que no se
 * puede filtrar es el CONTENIDO, que es lo que haría falta adivinar. Un token de
 * 48 bytes aleatorios no se acerca por saber cuántos caracteres mide.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * ¿Es válido este bearer token? Falso ante cualquier duda: sin token, sin
 * MCP_API_TOKEN configurado, o sin coincidencia.
 *
 * Que falte MCP_API_TOKEN NO abre la puerta — cierra el servidor entero. Un
 * fallo de configuración tiene que dejar el MCP inservible, nunca público: es la
 * diferencia entre "no anda" y "lo lee cualquiera".
 */
export function isValidMcpToken(token: string | undefined): boolean {
  const raw = process.env.MCP_API_TOKEN?.trim();

  if (!raw) {
    console.error(
      "[mcpAuth] Falta MCP_API_TOKEN en el entorno. El servidor MCP rechaza TODAS las peticiones hasta que se configure: sin token válido no hay forma segura de distinguir a un cliente autorizado de cualquier otro."
    );
    return false;
  }

  if (!token) return false;

  const validos = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (validos.length === 0) return false;

  // Se recorren TODOS los tokens aunque uno ya haya coincidido: cortar en el
  // primer acierto haría que el tiempo de respuesta delatara la POSICIÓN del
  // token válido dentro de la lista.
  let ok = false;
  for (const valido of validos) {
    if (safeEqual(token, valido)) ok = true;
  }
  return ok;
}
