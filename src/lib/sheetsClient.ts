import { google } from "googleapis";

/**
 * Cliente autenticado de Google Sheets usando una Service Account.
 *
 * Variables de entorno requeridas (ver .env.local.example):
 *  - GOOGLE_SHEET_ID
 *  - GOOGLE_SERVICE_ACCOUNT_EMAIL
 *  - GOOGLE_PRIVATE_KEY_B64 (recomendada) o GOOGLE_PRIVATE_KEY (cruda con \n)
 */

/**
 * Resuelve la private key de la Service Account desde el entorno.
 *
 * Prioriza GOOGLE_PRIVATE_KEY_B64 (la clave codificada en base64), que evita la
 * corrupción por \n y comillas al pegarla en paneles web como Vercel. Si no
 * existe, cae al fallback de GOOGLE_PRIVATE_KEY cruda: desescapa los \n
 * literales y saca comillas envolventes si quedaron pegadas.
 */
function resolvePrivateKey(): string | undefined {
  const b64 = process.env.GOOGLE_PRIVATE_KEY_B64;
  if (b64) {
    return Buffer.from(b64.trim(), "base64").toString("utf8");
  }

  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!rawKey) {
    return undefined;
  }

  // Sacar comillas envolventes (") si quedaron pegadas al pegar en un panel web.
  let key = rawKey.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  // En .env los saltos de línea vienen escapados como "\\n".
  return key.replace(/\\n/g, "\n");
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = resolvePrivateKey();

  if (!email || !privateKey) {
    throw new Error(
      "Faltan credenciales de Google. Configurá GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY_B64 (o GOOGLE_PRIVATE_KEY) en el entorno."
    );
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

export function getSheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error("Falta GOOGLE_SHEET_ID en el entorno.");
  }
  return id;
}

/**
 * Devuelve todos los valores de una hoja (por nombre) como matriz de strings.
 * No lanza si la hoja no existe: devuelve null para que el caller decida
 * cómo degradar (p. ej. mostrar "sin datos").
 */
export async function readSheetValues(
  sheetName: string
): Promise<string[][] | null> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = getSheetId();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    return (res.data.values as string[][]) ?? [];
  } catch (err: unknown) {
    console.error(`[sheetsClient] Error leyendo hoja "${sheetName}":`, err);
    return null;
  }
}
