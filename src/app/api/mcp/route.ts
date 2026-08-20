import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { isValidMcpToken } from "@/lib/mcpAuth";
import { buildKpisNegocio } from "@/lib/mcpKpis";

/**
 * SERVIDOR MCP REMOTO — GET/POST /api/mcp
 *
 * Expone los KPIs consolidados del negocio a un cliente MCP (Claude Code u
 * otro). Se conecta así:
 *
 *   claude mcp add --transport http drc-kpis https://<dominio>/api/mcp \
 *     --header "Authorization: Bearer <MCP_API_TOKEN>"
 *
 * Corre sobre `mcp-handler` v2 (el paquete oficial de Vercel, sucesor de
 * @vercel/mcp-adapter). La v2 es STATELESS: no necesita Redis ni almacenamiento
 * de sesión, que es lo que la hace viable acá sin montar infraestructura nueva.
 *
 * ═══ SOLO LECTURA ═══
 * Un único tool y de consulta. No hay —ni se agrega— ningún tool que escriba:
 * el dashboard entero es de lectura sobre fuentes externas, y un tool de
 * escritura acá sería una vía de mutación de Sheets o de DRC Gestión que hoy no
 * existe por ningún lado. `readOnlyHint` se lo declara además al cliente.
 *
 * ═══ QUÉ NO TOCA ═══
 * Ni /api/profesores ni /api/external/payouts, que traen el detalle NOMBRE POR
 * NOMBRE de cada profesor con su facturación y su margen. El límite se sostiene
 * en lib/mcpKpis.ts, que es el único módulo que este handler llama para armar
 * datos: ahí está documentado y ahí hay que mirarlo si alguien agrega un campo.
 *
 * ═══ UN SOLO TOOL A PROPÓSITO ═══
 * `get_kpis_negocio` devuelve TODO el panorama de una llamada. Partirlo en tools
 * granulares (get_cac, get_mrr, ...) obligaría al cliente a encadenar diez
 * llamadas para responder "cómo va el negocio", que es justo la pregunta que se
 * le va a hacer.
 */

export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_kpis_negocio",
      {
        title: "KPIs del negocio (DRC Academy)",
        description: [
          "Devuelve los KPIs consolidados de DRC Academy para un mes: adquisición (CAC y CPL blended y por canal, close rate global y por comercial, gasto en ads), recurrente (MRR, churn de clientes y de MRR, LTV, ARPC, permanencia media), ingresos netos del mes con su variación mes a mes, y el recuento en vivo de alumnos activos.",
          "",
          "Solo lectura y SOLO CIFRAS AGREGADAS de toda la academia. No expone datos personales, ni detalle por alumno, ni datos por profesor (facturación o margen individual quedan fuera de este servidor).",
          "",
          "Cómo leer la respuesta:",
          "- `null` significa SIN DATO (fuente caída o celda vacía del Sheet), NUNCA cero. No lo trates como 0.",
          "- Los campos terminados en `_pct` ya están en porcentaje: 20.55 es 20,55%.",
          "- Importes en euros con 2 decimales.",
          "- `alumnos_ahora` es una foto del PRESENTE: no cambia con el parámetro `mes`.",
          "- Revisá siempre `avisos`: ahí se explica qué fuente falló si algo vino en null.",
        ].join("\n"),
        inputSchema: z.object({
          mes: z
            .string()
            .optional()
            .describe(
              'Mes a consultar, en formato "ago-26" (etiqueta de DB_KPI) o "2026-08" (ISO). Si se omite, devuelve el mes más reciente disponible. Si el mes no existe, la respuesta lista los meses que sí hay.'
            ),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async ({ mes }) => {
        const payload = await buildKpisNegocio(mes);

        // Mes inexistente se marca como error del tool, no como payload vacío:
        // un JSON lleno de nulls se lee igual que "ese mes existe y no tiene
        // datos", que es una conclusión distinta y equivocada.
        if ("error" in payload) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `El mes "${payload.mes_pedido}" no existe en DB_KPI. Meses disponibles: ${payload.meses_disponibles.join(", ")}.`,
              },
            ],
          };
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(payload, null, 2) },
          ],
          structuredContent: payload as unknown as Record<string, unknown>,
        };
      }
    );
  },
  {
    serverInfo: {
      name: "drc-kpis",
      version: "1.0.0",
    },
  }
);

/**
 * AUTENTICACIÓN — bearer estático contra MCP_API_TOKEN (ver lib/mcpAuth.ts).
 *
 * ═══ POR QUÉ NO SE USA `withMcpAuth` ═══
 * `withMcpAuth` de mcp-handler sí comprueba el token, pero cuando lo rechaza
 * responde con un challenge de OAuth:
 *
 *   WWW-Authenticate: Bearer resource_metadata="https://<dominio>/.well-known/oauth-protected-resource"
 *
 * Acá NO hay servidor OAuth ni metadata publicada —el diseño es un token fijo en
 * una cabecera—, así que esa URL da 404. El resultado es que un cliente MCP que
 * recibe un 401 (por token mal puesto, o directamente ausente) se va a hacer
 * descubrimiento OAuth, choca contra el 404 y reporta un error de OAuth en vez
 * de "tu token no sirve", que es el problema real. Se diagnostica cualquier cosa
 * menos lo que pasa.
 *
 * Con la comprobación directa de acá, un token inválido devuelve 401 y se lee
 * como lo que es. El `WWW-Authenticate` que se manda es un `Bearer` pelado, sin
 * `resource_metadata`: anuncia que hace falta un bearer sin mandar a nadie a
 * descubrir un flujo que no existe.
 */
function noAutorizado(mensaje: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: mensaje },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="drc-kpis"',
        "Cache-Control": "no-store",
      },
    }
  );
}

/**
 * Sin token válido no se llega a ejecutar ningún tool: la comprobación va antes
 * de delegar en el handler.
 */
async function conAuth(request: Request): Promise<Response> {
  const cabecera = request.headers.get("authorization");
  const [esquema, valor] = cabecera?.split(" ") ?? [];
  const bearer = esquema?.toLowerCase() === "bearer" ? valor : undefined;

  if (!isValidMcpToken(bearer)) {
    return noAutorizado("Token inválido o ausente.");
  }

  return handler(request);
}

/**
 * DELETE va exportado además de GET y POST porque el transporte streamable HTTP
 * lo usa para cerrar la sesión. Sin exportarlo, Next devuelve 405 y el cliente
 * registra un error al desconectarse. `createMcpHandler` atiende cualquier
 * método —el ruteo es cosa del framework, no suyo—, así que alcanza con
 * exportarlo.
 */
export { conAuth as GET, conAuth as POST, conAuth as DELETE };
