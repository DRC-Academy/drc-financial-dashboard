import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * BASIC AUTH DE TODO EL DASHBOARD — se ejecuta antes de renderizar nada.
 *
 * ═══ POR QUÉ ESTE ARCHIVO SE LLAMA proxy.ts Y NO middleware.ts ═══
 * Next 16 renombró la convención: `middleware.ts` quedó deprecado y pasó a ser
 * `proxy.ts` (ver node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md). Un `middleware.ts` acá NO se ejecutaría, y el
 * fallo es SILENCIOSO: no hay error de build, simplemente el dashboard sigue
 * abierto al público. Si alguien renombra este archivo, verificar con un curl
 * que siga devolviendo 401 antes de dar el cambio por bueno.
 *
 * Va en src/ y no en la raíz porque la app vive en src/app: el archivo tiene que
 * quedar al mismo nivel que `app`.
 *
 * ═══ /api/mcp QUEDA EXCLUIDO ═══
 * El servidor MCP se autentica solo, con bearer token contra MCP_API_TOKEN (ver
 * lib/mcpAuth.ts). Pedirle además Basic Auth lo rompería: un cliente MCP manda
 * `Authorization: Bearer ...`, no `Basic ...`, y las dos cosas no entran en la
 * misma cabecera. La exclusión se hace ACÁ EN CÓDIGO y no sólo con el matcher a
 * propósito: el matcher es una regex fácil de romper de un tipeo, y romperla en
 * este sentido corta el MCP en producción sin que nada falle en build.
 */

/** Rutas que se saltean Basic Auth porque traen su propia autenticación. */
const RUTAS_CON_AUTH_PROPIA = ["/api/mcp"];

/**
 * Comparación en tiempo constante, sin `node:crypto` para no atar este archivo a
 * un runtime concreto. Recorre SIEMPRE el largo máximo y acumula diferencias con
 * XOR en vez de cortar en el primer carácter distinto, que es lo que dejaría
 * adivinar la contraseña de a un carácter por vez midiendo la respuesta.
 */
function comparacionSegura(a: string, b: string): boolean {
  const largo = Math.max(a.length, b.length);
  // El largo se filtra por temporización y es aceptable: lo que no se puede
  // filtrar es el contenido, que es lo que habría que adivinar.
  let dif = a.length ^ b.length;
  for (let i = 0; i < largo; i++) {
    dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return dif === 0;
}

/** 401 con el challenge que hace que el navegador muestre el diálogo de login. */
function pedirCredenciales(): NextResponse {
  return new NextResponse("Autenticación requerida.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="DRC Dashboard", charset="UTF-8"',
      // Que ningún proxy intermedio ni el CDN guarde una respuesta de una ruta
      // protegida.
      "Cache-Control": "no-store",
    },
  });
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (RUTAS_CON_AUTH_PROPIA.some((ruta) => pathname.startsWith(ruta))) {
    return NextResponse.next();
  }

  const usuarioEsperado = process.env.DASHBOARD_USER;
  const passEsperada = process.env.DASHBOARD_PASS;

  // FALTA DE CONFIGURACIÓN = DASHBOARD CERRADO, NUNCA ABIERTO.
  // Mismo criterio que lib/mcpAuth.ts con MCP_API_TOKEN. Si esto dejara pasar
  // cuando las variables no están cargadas, un deploy hecho antes de cargarlas
  // en Vercel reabriría al público exactamente el agujero que este archivo vino
  // a tapar. 503 y no 401 para poder distinguir de un vistazo "está mal
  // configurado" de "pusiste mal la contraseña".
  if (!usuarioEsperado || !passEsperada) {
    console.error(
      "[proxy] Faltan DASHBOARD_USER y/o DASHBOARD_PASS en el entorno. El dashboard rechaza TODAS las peticiones hasta que se configuren: sin credenciales no hay forma de distinguir a alguien autorizado de cualquier otro."
    );
    return new NextResponse("Dashboard sin credenciales configuradas.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const cabecera = request.headers.get("authorization");
  if (!cabecera) return pedirCredenciales();

  const [esquema, valor] = cabecera.split(" ");
  if (esquema?.toLowerCase() !== "basic" || !valor) return pedirCredenciales();

  let decodificado: string;
  try {
    // Buffer y no atob: atob devuelve una cadena binaria y rompe las
    // contraseñas con acentos o ñ. Proxy corre sobre Node.js por defecto en
    // Next 16, así que Buffer está disponible.
    decodificado = Buffer.from(valor, "base64").toString("utf8");
  } catch {
    return pedirCredenciales();
  }

  // Se parte en el PRIMER ":" nada más: el usuario no puede tener dos puntos
  // (RFC 7617) pero la contraseña sí, y partir por todos la truncaría.
  const corte = decodificado.indexOf(":");
  if (corte === -1) return pedirCredenciales();

  const usuario = decodificado.slice(0, corte);
  const pass = decodificado.slice(corte + 1);

  // Las dos comparaciones se evalúan siempre, sin cortocircuito: con && una
  // contraseña correcta sobre un usuario incorrecto ni se llegaría a comparar,
  // y esa diferencia de tiempo delata cuándo el usuario acertó.
  const usuarioOk = comparacionSegura(usuario, usuarioEsperado);
  const passOk = comparacionSegura(pass, passEsperada);
  if (!usuarioOk || !passOk) return pedirCredenciales();

  return NextResponse.next();
}

export const config = {
  /**
   * Sin matcher, proxy corre sobre CADA petición, incluidos los estáticos de
   * _next: pedirle Basic Auth al CSS y al JS de la propia página de login es
   * pedir credenciales para poder mostrar el pedido de credenciales.
   *
   * /api/mcp NO se excluye acá aunque podría: se excluye arriba en código, que
   * es más difícil de romper sin querer que esta regex.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
